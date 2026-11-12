import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { executeInTransaction, queryRowsInTransaction, queryRowsRaw, withTransaction, type Row } from "./db";
import type { OperationActor } from "./operation-actor";
import { customerMatchReasons, nextCustomerCode, normalizeProspect, normalizeProspectCustomer, validProspectDate } from "./prospect";

export class ProspectError extends Error {
  constructor(message: string, public status = 400, public candidates: Row[] = []) { super(message); }
}
const prospectSelect = `SELECT p.*, DATE_FORMAT(p.lastFollowUpDate,'%Y-%m-%d') AS lastFollowUpDate,
 DATE_FORMAT(p.nextFollowUpDate,'%Y-%m-%d') AS nextFollowUpDate,
 DATE_FORMAT(p.convertedAt,'%Y-%m-%d %H:%i') AS convertedAt,
 c.customerCode, c.name AS customerName FROM merge_common_prospects p LEFT JOIN merge_common_customers c ON c.customerId=p.customerId`;
const customerSelect = "SELECT customerId,customerCode,name,nameCn,nameEn,shortName,taxNumber,country,status FROM merge_common_customers";
async function lockProspect(connection: PoolConnection, id: string) {
  const [row] = await queryRowsInTransaction(connection, "SELECT * FROM merge_common_prospects WHERE id=:id FOR UPDATE", { id });
  if (!row) throw new ProspectError("潜在客户不存在", 404);
  return row;
}
function assertEditable(row: Row) {
  if (row.customerId || row.status === "converted") throw new ProspectError("该潜在客户已转化，请在正式客户档案中维护资料", 409);
}
function assertVersion(row: Row, version: unknown) {
  if (!Number.isInteger(Number(version)) || Number(version) < 1 || Number(version) !== Number(row.version)) {
    throw new ProspectError("资料已被更新或缺少版本信息，请刷新后重试", 409);
  }
}
// Attachment changes share the parent lock used by conversion and deletion.
export async function withEditableProspectAttachment<T>(id: string, write: (connection: PoolConnection) => Promise<T>) {
  return withTransaction(async connection => {
    assertEditable(await lockProspect(connection, id));
    return write(connection);
  });
}
async function insert(connection: PoolConnection, table: string, values: Row) {
  const keys = Object.keys(values);
  await executeInTransaction(connection, `INSERT INTO ${table} (${keys.map(k => `\`${k}\``).join(",")}) VALUES (${keys.map(k => `:${k}`).join(",")})`, values);
}
async function audit(connection: PoolConnection, actor: OperationActor, id: string, action: string, detail: unknown) {
  await insert(connection, "merge_common_operation_logs", { logId: randomUUID(), userId: actor.userId, userName: actor.displayName, domainKey: "common", moduleKey: "prospects", action, entityType: "prospects", entityId: id, requestId: randomUUID(), detailJson: JSON.stringify(detail) });
}
export async function listProspects(params: URLSearchParams) {
  const page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(params.get("pageSize")) || 20)));
  const filters = ["1=1"], values: Row = {};
  if (params.get("keyword")?.trim()) { values.keyword = `%${params.get("keyword")!.trim().slice(0,255)}%`; filters.push("(p.name LIKE :keyword OR p.shortName LIKE :keyword OR p.contactName LIKE :keyword OR p.contactPhone LIKE :keyword OR p.ownerName LIKE :keyword OR p.country LIKE :keyword)"); }
  for (const field of ["status", "customerId"] as const) if (params.get(field)) { filters.push(`p.${field}=:${field}`); values[field] = params.get(field); }
  const where = filters.join(" AND ");
  const [items, counts] = await Promise.all([
    queryRowsRaw(`${prospectSelect} WHERE ${where} ORDER BY p.updatedAt DESC,p.internalId DESC LIMIT :limit OFFSET :offset`, { ...values, limit: pageSize, offset: (page-1)*pageSize }),
    queryRowsRaw<{ total: number }>(`SELECT COUNT(*) total FROM merge_common_prospects p WHERE ${where}`, values),
  ]);
  return { items, total: Number(counts[0].total), page, pageSize };
}
export async function getProspect(id: string) {
  const [rows, followups] = await Promise.all([
    queryRowsRaw(`${prospectSelect} WHERE p.id=:id`, { id }),
    queryRowsRaw("SELECT *,DATE_FORMAT(followedOn,'%Y-%m-%d') followedOn,DATE_FORMAT(nextFollowUpDate,'%Y-%m-%d') nextFollowUpDate FROM merge_common_prospect_followups WHERE prospectId=:id ORDER BY followedOn DESC,internalId DESC", { id }),
  ]);
  if (!rows[0]) throw new ProspectError("潜在客户不存在",404);
  return { prospect: rows[0], followups };
}
export async function saveProspect(id: string | null, input: Row, actor: OperationActor) {
  const values = normalizeProspect(input), recordId = id || randomUUID();
  await withTransaction(async connection => {
    if (id) {
      const row = await lockProspect(connection, id); assertEditable(row); assertVersion(row, input.version);
      await executeInTransaction(connection, `UPDATE merge_common_prospects SET ${Object.keys(values).map(k => `\`${k}\`=:${k}`).join(",")},version=version+1,updatedByUserId=:userId,updatedByName=:userName WHERE id=:id`, { ...values, id, userId: actor.userId, userName: actor.displayName });
    } else {
      await insert(connection,"merge_common_prospects",{ ...values, id: recordId, ownerName: values.ownerName || actor.displayName, createdByUserId: actor.userId, createdByName: actor.displayName, updatedByUserId: actor.userId, updatedByName: actor.displayName });
    }
    await audit(connection, actor, recordId, id ? "update" : "create", { name: values.name, status: values.status });
  });
  return getProspect(recordId);
}
export async function addProspectFollowup(id: string, input: Row, actor: OperationActor) {
  const content = String(input.content ?? "").trim();
  if (!content || content.length > 10000) throw new ProspectError("请填写跟进内容（最多10000字）");
  const followedOn = validProspectDate(input.followedOn); if (!followedOn) throw new ProspectError("请填写跟进日期");
  const nextDate = validProspectDate(input.nextFollowUpDate);
  await withTransaction(async connection => {
    const row = await lockProspect(connection,id); assertEditable(row); assertVersion(row,input.version);
    const status = normalizeProspect({ ...row, status: input.status || row.status, nextFollowUpDate: nextDate }).status;
    await insert(connection,"merge_common_prospect_followups",{ id:randomUUID(),prospectId:id,followedOn,content,nextFollowUpDate:nextDate,status,createdByName:actor.displayName });
    await executeInTransaction(connection,"UPDATE merge_common_prospects SET lastFollowUpDate=GREATEST(COALESCE(lastFollowUpDate,:followedOn),:followedOn),nextFollowUpDate=:nextDate,status=:status,version=version+1,updatedByUserId=:userId,updatedByName=:userName WHERE id=:id",{id,followedOn,nextDate,status,userId:actor.userId,userName:actor.displayName});
    await audit(connection,actor,id,"update",{ reason:"新增跟进记录", followedOn,status });
  });
  return getProspect(id);
}
export async function deleteProspect(id: string, actor: OperationActor) {
  await withTransaction(async connection => {
    const row=await lockProspect(connection,id);assertEditable(row);
    const attachments=await queryRowsInTransaction(connection,"SELECT attachmentId FROM merge_common_attachments WHERE ownerType='prospects' AND ownerId=:id LIMIT 1",{id});
    if(attachments.length)throw new ProspectError("请先在详情页删除附件，再删除潜在客户");
    await executeInTransaction(connection,"DELETE FROM merge_common_prospect_followups WHERE prospectId=:id",{id});
    await executeInTransaction(connection,"DELETE FROM merge_common_prospects WHERE id=:id",{id});
    await audit(connection,actor,id,"delete",{name:row.name});
  });
}
export async function prospectCustomerMatches(id: string, input: Row) {
  const {prospect}=await getProspect(id);
  const customers=await queryRowsRaw(customerSelect);
  const draft={...prospect,...input};
  const keyword=String(input.keyword ?? "").trim().toLowerCase();
  return { candidates:customers.filter(c=>customerMatchReasons(draft,c).length || (keyword && [c.name,c.nameEn,c.shortName,c.customerCode,c.taxNumber].some(v=>String(v??"").toLowerCase().includes(keyword)))).slice(0,50).map(c=>({...c,matchReasons:customerMatchReasons(draft,c)})) };
}
export async function convertProspect(id: string, input: Row, actor: OperationActor) {
  if(input.mode!=="create" && input.mode!=="link")throw new ProspectError("请选择新建客户或关联已有客户");
  try {
    return await withTransaction(async connection => {
      // Serialize conversions across prospects as well as repeated submits for one prospect.
      const locks=await queryRowsInTransaction(connection,"SELECT id FROM merge_common_prospect_conversion_lock WHERE id='customers' FOR UPDATE");
      if(!locks.length)throw new ProspectError("请先执行潜在客户数据库迁移");
      const prospect=await lockProspect(connection,id);
      if(prospect.customerId) return { customerId:String(prospect.customerId),alreadyConverted:true };
      assertEditable(prospect); assertVersion(prospect,input.version);
      if(prospect.status==='closed')throw new ProspectError("请先将已终止的潜在客户恢复为跟进中");
      let customerId:string;
      if(input.mode==='link'){
        const [existing]=await queryRowsInTransaction(connection,customerSelect+" WHERE customerId=:customerId FOR UPDATE",{customerId:String(input.customerId??'')});
        if(!existing)throw new ProspectError("请选择有效的已有客户");
        if(existing.status!=='active')throw new ProspectError("该客户已停用，请先在客户档案中启用");
        customerId=String(existing.customerId);
      }else{
        const values=normalizeProspectCustomer(input.customer && typeof input.customer==='object' ? input.customer as unknown as Row : {},prospect);
        const customers=await queryRowsInTransaction(connection,customerSelect);
        const duplicates=customers.map(c=>({...c,matchReasons:customerMatchReasons(values,c)})).filter(c=>c.matchReasons.length);
        if(duplicates.length)throw new ProspectError("已有同税号或同名客户，请核对后关联已有客户",409,duplicates);
        customerId=randomUUID();const customerCode=nextCustomerCode(customers.map(c=>c.customerCode));
        await insert(connection,"merge_common_customers",{customerId,customerCode,...values});
        if(values.contactName||values.contactPhone||values.contactEmail)await insert(connection,"merge_common_customer_contacts",{contactId:randomUUID(),customerId,name:values.contactName,phone:values.contactPhone,email:values.contactEmail,isPrimary:1});
      }
      await executeInTransaction(connection,"UPDATE merge_common_prospects SET status='converted',customerId=:customerId,convertedAt=CURRENT_TIMESTAMP,convertedByName=:userName,version=version+1,updatedByUserId=:userId,updatedByName=:userName WHERE id=:id",{id,customerId,userId:actor.userId,userName:actor.displayName});
      await audit(connection,actor,id,"confirm",{mode:input.mode,customerId,reason:"转为客户"});
      return {customerId,alreadyConverted:false};
    });
  }catch(error){
    if((error as {code?:string}).code==='ER_DUP_ENTRY')throw new ProspectError("客户名称或编码已存在，请刷新后核对已有客户",409);
    throw error;
  }
}
