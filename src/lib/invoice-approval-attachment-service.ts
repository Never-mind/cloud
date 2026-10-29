import { queryRows, type Row } from "./db";
import type { InvoiceSourceType } from "./invoice-service";
import { readFile } from "./file-storage-service";
import { INVOICE_ATTACHMENT_LIMITS as LIMITS, parseInvoiceAttachmentSelection, type InvoiceAttachmentOption, type InvoiceAttachmentSelection, type InvoiceAttachmentSource } from "./invoice-approval-attachments";

type Context = { sourceType: InvoiceSourceType; sourceId?: string | null; sourceIds?: string[] | null; customerId: string; sourceCustomerId?: string };
type Scope = { source: InvoiceAttachmentSource; label: string; table: string; id: string; where: string; values: Row };
async function scopes(context: Context): Promise<Scope[]> {
  const result: Scope[] = [];
  const sourceId = String(context.sourceId ?? "").trim();
  const ids = [...new Set((context.sourceIds?.length ? context.sourceIds : [sourceId]).map(id => id.trim()).filter(Boolean))];
  if (context.sourceType === "cloud_row") {
    if (!ids.length || (sourceId && !ids.includes(sourceId))) throw new Error("来源账期不在所选账单中，请重新选择");
    const rows = await queryRows<Row>(`SELECT r.id,
        COALESCE(c.customerId, NULLIF(r.invoicePayerCustomerId, ''), r.customerId) AS customerId,
        c.customerCode
      FROM merge_cloud_rows r
      LEFT JOIN merge_common_customers c
        ON c.customerId = COALESCE(NULLIF(r.invoicePayerCustomerId, ''), r.customerId)
        OR c.customerCode = COALESCE(NULLIF(r.invoicePayerCustomerId, ''), r.customerId)
      WHERE r.id IN (:ids)`, { ids });
    if (rows.length !== ids.length) throw new Error("选中的账单行已不存在，请重新选择");
    const sourceCustomerId = context.sourceCustomerId ?? context.customerId;
    if (rows.some(row => String(row.customerId ?? "") !== sourceCustomerId && (!row.customerCode || String(row.customerCode) !== sourceCustomerId))) throw new Error("所选账期的开票客户不一致，请按客户分别申请");
  } else if(context.sourceType==="service_fee"&&context.sourceIds?.length) {
    if(!ids.includes(sourceId))throw new Error("来源账期不在所选账单中，请重新选择");
    const rows=await queryRows<Row>(`SELECT r.snapshotNo,COALESCE(c.customerId,k.defaultCustomerId) AS customerId
      FROM merge_power_servicefeesnapshots r LEFT JOIN merge_power_countries k ON k.code=r.countryCode
      LEFT JOIN merge_common_customers c ON c.customerId=k.defaultCustomerId OR c.customerCode=k.defaultCustomerId WHERE r.snapshotNo IN (:ids)`,{ids});
    if(rows.length!==ids.length)throw new Error("所选服务费账单已不存在");
    if(new Set(rows.map(row=>String(row.customerId??""))).size!==1)throw new Error("所选服务费账单的业务客户不一致");
  } else {
    if (context.sourceIds?.length) throw new Error("当前来源不支持合并账期，请重新选择");
    const tables: Partial<Record<InvoiceSourceType, [string, string]>> = {
      billing_statement: ["merge_power_billingstatementsnapshots", "snapshotNo"],
      service_fee: ["merge_power_servicefeesnapshots", "snapshotNo"],
      settlement_invoice: ["merge_po_settlement_invoices", "id"],
    };
    const target = tables[context.sourceType];
    if (!sourceId || !target) throw new Error("缺少有效的审批来源单据");
    if (!(await queryRows<Row>(`SELECT ${target[1]} FROM ${target[0]} WHERE ${target[1]} = :sourceId LIMIT 1`, { sourceId })).length) throw new Error("来源单据不存在，请刷新重试");
  }
  if (context.customerId) result.push({ source: "customer", label: "客户档案", table: "merge_common_attachments", id: "attachmentId", where: "ownerType = 'customers' AND ownerId = :customerId", values: { customerId: context.customerId } });
  if (context.sourceType === "cloud_row") result.push({ source: "cloud_row", label: "华为云账期账单", table: "merge_cloud_attachments", id: "id", where: "ownerType IN ('reconciliation', 'invoice', 'collection') AND ownerId IN (:ids)", values: { ids } });
  if (context.sourceType === "billing_statement") result.push({ source: "billing_statement", label: "算力月账单", table: "merge_power_billingstatement_attachments", id: "id", where: "snapshotNo = :sourceId", values: { sourceId } });
  if (context.sourceType === "service_fee") result.push({ source: "service_fee", label: "服务费对账单", table: "merge_cloud_attachments", id: "id", where: ids.length>1?"ownerType = 'service_fee_invoice' AND ownerId IN (:ids)":"ownerType = 'service_fee_invoice' AND ownerId = :sourceId", values: ids.length>1?{ids}:{sourceId} });
  if (context.sourceType === "settlement_invoice") {
    result.push({ source: "settlement_invoice", label: "项目结算单据", table: "merge_po_settlement_attachments", id: "id", where: "invoiceId = :sourceId", values: { sourceId } });
    result.push({ source: "settlement_project", label: "项目附件", table: "merge_po_settlement_attachments", id: "id", where: "invoiceId IS NULL AND projectId IN (SELECT projectId FROM merge_po_settlement_invoices WHERE id = :sourceId)", values: { sourceId } });
  }
  return result;
}

export async function listInvoiceApprovalAttachments(context: Context): Promise<InvoiceAttachmentOption[]> {
  const result: InvoiceAttachmentOption[] = [];
  for (const scope of await scopes(context)) {
    const rows = await queryRows<Row>(`SELECT ${scope.id} AS attachmentId, fileName, fileSize, uploadedAt FROM ${scope.table} WHERE ${scope.where} ORDER BY uploadedAt DESC`, scope.values);
    for (const row of rows) result.push({ source: scope.source, attachmentId: String(row.attachmentId), fileName: String(row.fileName), fileSize: Number(row.fileSize) || 0, uploadedAt: String(row.uploadedAt ?? ""), sourceLabel: scope.label });
  }
  return result;
}

// Resolve every file before uploading any material, so stale or foreign references fail together.
export async function prepareInvoiceApprovalAttachments(context: Context, input: InvoiceAttachmentSelection, requireCsf = false) {
  const selection = parseInvoiceAttachmentSelection(input);
  if (requireCsf && ![...selection.attachmentRefs, ...selection.attachments].some(file => file.isCsf === true)) throw new Error("请至少标记一份客户 CSF 附件");
  const available = await scopes(context);
  const files: Array<{ fileName: string; bytes: Buffer }> = [];
  let total = 0;
  const add = (file: { fileName: string; bytes: Buffer }) => {
    if (!file.bytes.length) throw new Error(`附件内容为空：${file.fileName}`);
    if (file.bytes.length > LIMITS.fileBytes) throw new Error("单个审批附件不能超过 10 MB");
    total += file.bytes.length;
    if (total > LIMITS.totalBytes) throw new Error("审批附件总大小不能超过 30 MB");
    files.push(file);
  };
  for (const ref of selection.attachmentRefs) {
    const scope = available.find(item => item.source === ref.source);
    if (!scope) throw new Error("附件不属于当前单据或客户");
    const [row] = await queryRows<Row>(`SELECT fileName, fileType, fileSize, dataUrl, storageProvider, storageKey FROM ${scope.table} WHERE ${scope.id} = :attachmentId AND ${scope.where} LIMIT 1`, { ...scope.values, attachmentId: ref.attachmentId });
    if (!row) throw new Error("附件不存在、已删除或不属于当前单据或客户");
    if (Number(row.fileSize) > LIMITS.fileBytes) throw new Error("单个审批附件不能超过 10 MB");
    const file = await readFile(row);
    if (!file) throw new Error(`附件内容读取失败：${row.fileName}`);
    add({ fileName: String(row.fileName), bytes: file.bytes });
  }
  for (const upload of selection.attachments) {
    const comma = upload.dataUrl.indexOf(",");
    const header = upload.dataUrl.slice(0, comma), content = upload.dataUrl.slice(comma + 1);
    if (!/^data:([^;,]+)?;base64$/.test(header) || content.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) throw new Error(`附件内容格式不正确：${upload.fileName}`);
    const bytes = Buffer.from(content, "base64");
    if (bytes.toString("base64") !== content) throw new Error(`附件内容格式不正确：${upload.fileName}`);
    add({ fileName: upload.fileName.trim(), bytes });
  }
  return files;
}
