import { createHash, randomUUID } from "node:crypto";
import { createConnection } from "mysql2/promise";
import { buildDbConfig, queryRows, withTransaction, queryRowsInTransaction as txRows, executeInTransaction as txWrite, type Row } from "./db";
import { assertSameCloudPaymentGroup, invoiceAllocationAmounts, parseCloudPaymentPlan, paymentCents, paymentTaxAmounts, type CloudPaymentAllocationPlan } from "./cloud-payment-allocation";
import type { CostPaymentEntryInput } from "./cost-payment-approval-service";
import type { OperationActor } from "./operation-actor";
import { normalizeDateOnlyValue } from "./date-only";

export const cloudPaymentOwnerId = (row: Row) => `${row.period}::${row.supplierId}`;
export const cloudPaymentAttachmentIds = (row: Row) => [String(row.id), cloudPaymentOwnerId(row), `supplier-payment:${row.period}:id:${row.supplierId}`, `supplier-payment:${row.period}:${row.supplierId}`];

export async function loadCloudPaymentSources(ids: string[]) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 120 || ids.some(id=>typeof id!=="string"||!id.trim()) || new Set(ids).size !== ids.length) throw new Error("请选择1—120个不重复的账期");
  const rows = await queryRows("SELECT * FROM merge_cloud_supplier_payments WHERE id IN (:ids) OR CONCAT(period, '::', supplierId) IN (:ids) ORDER BY period,id", { ids });
  if (rows.length !== ids.length) throw new Error("部分账期已不存在或重复，请刷新后重新选择");
  assertSameCloudPaymentGroup(rows);
  return rows;
}

/** Serialize submissions and invoice allocations for the same supplier across app servers. */
export async function withCloudPaymentSources<T>(ids: string[], work: (rows: Row[]) => Promise<T>) {
  const initial = await loadCloudPaymentSources(ids);
  const { host,port,user,password,database,charset } = buildDbConfig(process.env);
  const connection = await createConnection({ host,port,user,password,database,charset,namedPlaceholders:true,connectTimeout:10000 });
  const key = "cloud-payment:" + createHash("sha256").update(String(initial[0].supplierId)).digest("hex").slice(0,40);
  let locked = false;
  try {
    const [result] = await connection.query("SELECT GET_LOCK(:key, 0) AS acquired", { key });
    locked = Number((result as Row[])[0]?.acquired) === 1;
    if (!locked) throw new Error("该供应商正在办理付款或发票分摊，请稍后重试");
    const rows = await loadCloudPaymentSources(ids);
    if (rows[0].supplierId !== initial[0].supplierId) throw new Error("供应商已变更，请刷新");
    return await work(rows);
  } finally {
    try { if (locked) await connection.query("SELECT RELEASE_LOCK(:key)", { key }); }
    finally { await connection.end(); }
  }
}

export async function prepareCloudPaymentPlan(rows: Row[], entries: CostPaymentEntryInput[]) {
  const ownerIds = rows.flatMap(row => [String(row.id), cloudPaymentOwnerId(row)]);
  const approvals = await queryRows("SELECT id,ownerId,allocationSourceIds FROM merge_common_feishu_approvals WHERE ownerType='cloud_supplier_payment' AND status IN ('pending','returned','approved') AND (ownerId IN (:ownerIds) OR allocationSourceIds IS NOT NULL)", { ownerIds });
  if (approvals.some(approval => [String(approval.ownerId), ...String(approval.allocationSourceIds ?? "").split(",")].some(id => ownerIds.includes(id)))) throw new Error("所选账期已有进行中或已通过的付款审批，不能重复申请");
  if (rows.some(row => Number(row.paid) === 1)) throw new Error("所选账期已付款，请先核对付款记录");
  const normalized = entries.map(entry => {
    const row = rows.find(row => row.id === entry.ownerId || cloudPaymentOwnerId(row) === entry.ownerId);
    if (!row) throw new Error("付款账期不匹配");
    return { ...entry, ownerId: cloudPaymentOwnerId(row), ownerNo: String(row.period), period: String(row.period), supplierId: String(row.supplierId), attachmentOwnerId: String(row.id) };
  });
  for (const [field,label] of [["currency","付款币种"],["payee","收款单位"],["bankAccount","收款账户"],["bankName","开户行"],["swiftCode","SWIFT"],["companyKey","付款单位"]] as const) {
    if (new Set(normalized.map(entry => String(entry[field] ?? "").trim().toUpperCase())).size !== 1) throw new Error(`合并付款的${label}必须一致`);
  }
  const plan: CloudPaymentAllocationPlan = { kind: "cloud_supplier_payment", version: 1, total: 0, entries: normalized.map(entry => {
    const row = rows.find(row => row.id === entry.attachmentOwnerId)!;
    const currency = entry.currency.trim().toUpperCase();
    const exchangeRate = currency === row.supplierPayableCurrency ? 1 : Number(entry.paymentExchangeRate);
    if (!(exchangeRate > 0) || !Number.isFinite(exchangeRate)) throw new Error(`${row.period}：付款币种与应付币种不一致，请填写业务汇率`);
    return { ownerId: entry.ownerId, paymentRecordId: String(row.id), period: String(row.period), supplierId: String(row.supplierId), payerUnitId: String(row.payerUnitId), currency, exchangeRate, ...paymentTaxAmounts(entry.amount, entry.paymentTaxRate ?? row.supplierTaxRate) };
  }) };
  plan.total = plan.entries.reduce((sum,entry) => sum+paymentCents(entry.amount),0)/100;
  normalized.forEach((entry,index) => { entry.amount=plan.entries[index].amount; });
  parseCloudPaymentPlan(plan);
  return { entries: normalized, plan };
}

/** Confirmation and the applied marker commit together; subsequent polls never overwrite edits. */
export async function applyCloudPaymentAllocation(approvalId: string, paidDate: string) {
  if (!paidDate) return;
  await withTransaction(async connection => {
    const [approval] = await txRows(connection, "SELECT * FROM merge_common_feishu_approvals WHERE id=:approvalId FOR UPDATE", { approvalId });
    const plan = parseCloudPaymentPlan(approval?.allocationPlanJson);
    if (!plan || plan.appliedAt) return;
    const ids = plan.entries.map(entry => entry.paymentRecordId);
    const records = await txRows(connection,"SELECT * FROM merge_cloud_supplier_payments WHERE id IN (:ids) ORDER BY id FOR UPDATE",{ ids });
    for (const entry of plan.entries) {
      const row = records.find(row => row.id === entry.paymentRecordId);
      if (!row || row.paymentApprovalId !== approvalId || row.supplierId !== entry.supplierId || row.period !== entry.period) throw new Error("付款来源已变更，停止自动回写，请核对");
      await txWrite(connection, `UPDATE merge_cloud_supplier_payments SET currency=:currency,paymentExchangeRate=:exchangeRate,
        paymentNetAmount=:netAmount,paymentTaxRate=:taxRate,paymentTaxAmount=:taxAmount,paymentTotalAmount=:amount,
        paymentDate=:paidDate,paid=1,paymentRegisteredAt=COALESCE(paymentRegisteredAt,CURRENT_TIMESTAMP),updatedAt=CURRENT_TIMESTAMP
        WHERE id=:paymentRecordId`, { ...entry, paidDate });
    }
    plan.appliedAt = new Date().toISOString();
    await txWrite(connection,"UPDATE merge_common_feishu_approvals SET allocationPlanJson=:plan WHERE id=:approvalId",{ approvalId,plan:JSON.stringify(plan) });
  });
}

export async function loadSupplierInvoiceAllocation(ids: string[]) {
  const rows = await loadCloudPaymentSources(ids);
  const ownerIds = rows.flatMap(cloudPaymentAttachmentIds);
  const attachments = await queryRows("SELECT id,ownerId,fileName,fileType,fileSize FROM merge_cloud_attachments WHERE ownerType='supplier_payment' AND ownerId IN (:ownerIds) ORDER BY uploadedAt DESC",{ ownerIds });
  return { rows:rows.map(row=>({ ...row,invoiceDate:normalizeDateOnlyValue(row.invoiceDate),paymentDate:normalizeDateOnlyValue(row.paymentDate),receivableDate:normalizeDateOnlyValue(row.receivableDate) })), attachments };
}

export type SupplierInvoiceAllocationInput = {
  ownerIds: string[]; invoiceNo: string; currency: string; totalAmount: number; taxRate: number; exchangeRate: number; invoiceDate: string;
  allocations: Array<{ ownerId: string; amount: number }>;
  attachmentId?: string; file?: { fileName: string; dataUrl: string };
};

export async function saveSupplierInvoiceAllocation(input: SupplierInvoiceAllocationInput, actor: OperationActor) {
  const invoiceNo = String(input.invoiceNo ?? "").trim(), currency = String(input.currency ?? "").trim().toUpperCase();
  if (!invoiceNo || invoiceNo.length > 100 || !/^[A-Z]{3}$/.test(currency)) throw new Error("请填写有效的发票号和币种");
  const date = new Date(input.invoiceDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== input.invoiceDate) throw new Error("开票日期无效");
  if (!(input.exchangeRate > 0) || !Number.isFinite(input.exchangeRate)) throw new Error("请填写有效汇率");
  if (!Array.isArray(input.ownerIds) || !Array.isArray(input.allocations) || input.allocations.length !== input.ownerIds.length || new Set(input.allocations.map(a => a.ownerId)).size !== input.ownerIds.length) throw new Error("账期分摊明细不完整或重复");
  const amounts = invoiceAllocationAmounts(input.totalAmount,input.taxRate,input.allocations.map(a => a.amount));
  return withCloudPaymentSources(input.ownerIds, async initial => withTransaction(async connection => {
    const ids = initial.map(row => row.id), supplierId = initial[0].supplierId;
    // Lock all rows for this supplier so another invoice cannot be silently replaced.
    const allRows = await txRows(connection,"SELECT * FROM merge_cloud_supplier_payments WHERE supplierId=:supplierId OR invoiceSupplierId=:supplierId ORDER BY id FOR UPDATE",{ supplierId });
    const rows = allRows.filter(row => ids.includes(row.id));
    assertSameCloudPaymentGroup(rows);
    if (rows.length !== ids.length) throw new Error("账期已变更，请刷新");
    const allocatedIds = input.allocations.map(allocation => rows.find(row => row.id === allocation.ownerId || cloudPaymentOwnerId(row) === allocation.ownerId)?.id);
    if (allocatedIds.some(id => !id) || new Set(allocatedIds).size !== rows.length) throw new Error("分摊账期重复或缺失，请重新选择");
    const [outside] = await txRows(connection,"SELECT id FROM merge_cloud_supplier_payments WHERE COALESCE(NULLIF(invoiceSupplierId,''),supplierId)=:supplierId AND invoiceNo=:invoiceNo AND id NOT IN (:ids) LIMIT 1 FOR UPDATE",{ supplierId,invoiceNo,ids });
    if (outside) throw new Error("该发票已在其他账期登记，请一并选择已有账期后重新分摊，不能重复登记整票");
    for (const row of rows) {
      if (row.invoiceSupplierId && row.invoiceSupplierId !== supplierId) throw new Error(`${row.period}：实际开票供应商不同，请单独处理`);
      if (row.invoiceNo && row.invoiceNo !== invoiceNo) throw new Error(`${row.period}：已有其他发票，不能覆盖`);
    }
    const ownerIds = rows.flatMap(cloudPaymentAttachmentIds);
    let attachment: Row | undefined;
    if (input.attachmentId) {
      [attachment] = await txRows(connection,"SELECT * FROM merge_cloud_attachments WHERE id=:id AND ownerType='supplier_payment' AND ownerId IN (:ownerIds)",{ id:input.attachmentId,ownerIds });
      if (!attachment) throw new Error("发票附件不属于所选账期");
    } else if (input.file) {
      const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(input.file.dataUrl);
      if (!match || !input.file.fileName || Buffer.from(match[2],"base64").length > 20*1024*1024) throw new Error("发票附件格式无效或超过20MB");
      attachment = { fileName:input.file.fileName.slice(0,255),fileType:match[1],fileSize:Buffer.from(match[2],"base64").length,dataUrl:input.file.dataUrl,storageProvider:"db",storageKey:null,storageUrl:null };
    }
    if (!attachment) throw new Error("请选择或上传共用发票附件");
    const [supplier] = await txRows(connection,"SELECT COALESCE(NULLIF(nameCn,''),NULLIF(nameEn,''),shortName) AS name FROM merge_common_suppliers WHERE supplierId=:supplierId",{ supplierId });
    for (const [index,allocation] of input.allocations.entries()) {
      const row = rows.find(row => row.id === allocation.ownerId || cloudPaymentOwnerId(row) === allocation.ownerId);
      if (!row) throw new Error("分摊账期与所选账期不一致");
      await txWrite(connection,`UPDATE merge_cloud_supplier_payments SET invoiceNo=:invoiceNo,invoiceCurrency=:currency,
        invoiceExchangeRate=:exchangeRate,invoiceNetAmount=:netAmount,invoiceTaxRate=:taxRate,invoiceTaxAmount=:taxAmount,
        invoiceTotalAmount=:amount,invoiceDate=:invoiceDate,invoiceStatus='issued',invoiceSupplierId=:supplierId,
        invoiceSupplierName=:supplierName,updatedByUserId=:userId,updatedByName=:userName,updatedAt=CURRENT_TIMESTAMP WHERE id=:id`,
      { ...amounts[index], invoiceNo,currency,exchangeRate:input.exchangeRate,invoiceDate:input.invoiceDate,supplierId,supplierName:supplier?.name || row.supplierName,userId:actor.userId,userName:actor.displayName,id:row.id });
      const attachmentOwnerIds = cloudPaymentAttachmentIds(row);
      const [existing] = await txRows(connection,"SELECT id FROM merge_cloud_attachments WHERE ownerType='supplier_payment' AND ownerId IN (:ownerIds) AND fileName=:fileName AND fileSize=:fileSize AND (storageKey <=> :storageKey) AND (dataUrl <=> :dataUrl) LIMIT 1",{ ownerIds:attachmentOwnerIds,fileName:attachment.fileName,fileSize:attachment.fileSize,storageKey:attachment.storageKey ?? null,dataUrl:attachment.dataUrl ?? null });
      if (!existing) await txWrite(connection,`INSERT INTO merge_cloud_attachments
        (id,ownerType,ownerId,fileName,fileType,fileSize,dataUrl,storageProvider,storageKey,storageUrl,uploadedByUserId,uploadedByName,uploadedAt)
        VALUES (:id,'supplier_payment',:ownerId,:fileName,:fileType,:fileSize,:dataUrl,:storageProvider,:storageKey,:storageUrl,:userId,:userName,CURRENT_TIMESTAMP)`,
      { id:randomUUID(),ownerId:cloudPaymentOwnerId(row),fileName:attachment.fileName,fileType:attachment.fileType,fileSize:attachment.fileSize,dataUrl:attachment.dataUrl ?? null,storageProvider:attachment.storageProvider || "db",storageKey:attachment.storageKey ?? null,storageUrl:attachment.storageUrl ?? null,userId:actor.userId,userName:actor.displayName });
    }
    return { count:rows.length,invoiceNo,currency,totalAmount:paymentCents(input.totalAmount)/100 };
  }));
}
