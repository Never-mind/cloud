import { createHash, randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { queryRowsRaw, queryRowsInTransaction, executeInTransaction, withTransaction, type Row } from "./db";
import { isStatementInvoiceSource, refreshStatementInvoiceSummary, removeStatementInvoiceAttachment } from "./statement-invoice-ledger";

const text = (value: unknown) => String(value ?? "").trim();
export type InvoiceRemovalContext = { sourceType: string; sourceId: string };
export type InvoiceRemovalPreview = {
  id: string; invoiceNo: string; mode: "delete" | "void"; revision: string;
  currency: string; total: string; fileName: string;
  sources: Array<{ sourceId: string; sourceNo: string; period: string; amountIncludingTax: string }>;
};

async function readRemoval(id: string, context: InvoiceRemovalContext, connection?: PoolConnection) {
  const query = (sql: string, values: Row) => connection ? queryRowsInTransaction<Row>(connection, sql, values) : queryRowsRaw<Row>(sql, values);
  const lock = connection ? " FOR UPDATE" : "";
  const [invoice] = await query(`SELECT * FROM merge_common_invoices WHERE id=:id${lock}`, { id });
  if (!invoice || invoice.status !== "issued") throw new Error("该发票已移除或状态发生变化，请刷新列表");
  const sourceType = text(invoice.sourceType);
  if (!isStatementInvoiceSource(sourceType) || sourceType !== context.sourceType) throw new Error("该发票不属于当前账单类型");
  const allocations = await query(`SELECT sourceType,sourceId,sourceNo,period,currency,amountExcludingTax,taxRate,taxAmount,amountIncludingTax
    FROM merge_common_invoice_allocations WHERE invoiceId=:id ORDER BY sourceId${lock}`, { id });
  const sources = (allocations.length ? allocations : [invoice]).map(row => ({
    sourceId: text(row.sourceId), sourceNo: text(row.sourceNo) || text(row.sourceId),
    period: text(row.period), amountIncludingTax: text(row.amountIncludingTax),
  }));
  if (!sources.some(row => row.sourceId === context.sourceId)) throw new Error("该发票未关联当前账期，请刷新后核对");
  // Retain approval-linked records so polling cannot import the removed invoice again.
  const approvals = await query(`SELECT instanceCode FROM merge_common_feishu_approvals WHERE invoiceId=:id${lock}`, { id });
  const returnFiles = await query(`SELECT id FROM merge_common_invoice_approval_files WHERE invoiceId=:id${lock}`, { id });
  const mode = invoice.source === "external" && !invoice.approvalInstanceCode && !approvals.length && !returnFiles.length ? "delete" : "void";
  const revision = createHash("sha256").update(JSON.stringify([invoice.id, invoice.invoiceNo, invoice.updatedAt, invoice.status,
    invoice.currency, invoice.amountExcludingTax, invoice.amountIncludingTax, invoice.sourceAttachmentId, allocations, mode])).digest("hex");
  const preview: InvoiceRemovalPreview = { id, invoiceNo: text(invoice.invoiceNo), mode, revision,
    currency: text(invoice.currency), total: text(invoice.amountIncludingTax), fileName: text(invoice.fileName), sources };
  return { invoice, sourceType, preview };
}

export async function previewStatementInvoiceRemoval(id: string, context: InvoiceRemovalContext) {
  return (await readRemoval(id, context)).preview;
}

/** Delete mistaken manual registrations; void issued/approval records. All months change atomically. */
export async function removeStatementInvoiceRegistration(id: string, context: InvoiceRemovalContext & { revision: string },
  actor: { userId?: string | null; name?: string | null } = {}, authorize: (mode: "delete" | "void") => void) {
  return withTransaction(async connection => {
    const { invoice, sourceType, preview } = await readRemoval(id, context, connection);
    authorize(preview.mode);
    if (!context.revision || context.revision !== preview.revision) throw new Error("发票或分摊已变化，请重新打开删除确认，核对受影响账期");
    const ids = [...new Set([text(invoice.sourceId), ...preview.sources.map(row => row.sourceId)])].filter(Boolean).sort();
    for (const sourceId of ids) {
      await queryRowsInTransaction(connection, sourceType === "cloud_row"
        ? "SELECT id FROM merge_cloud_rows WHERE id=:sourceId FOR UPDATE"
        : "SELECT snapshotNo FROM merge_power_servicefeesnapshots WHERE snapshotNo=:sourceId FOR UPDATE", { sourceId });
    }
    if (preview.mode === "delete") {
      await executeInTransaction(connection, "DELETE FROM merge_common_invoice_items WHERE invoiceId=:id", { id });
      await executeInTransaction(connection, "DELETE FROM merge_common_invoice_allocations WHERE invoiceId=:id", { id });
      await executeInTransaction(connection, "DELETE FROM merge_common_invoices WHERE id=:id", { id });
    } else {
      await executeInTransaction(connection, `UPDATE merge_common_invoices SET status='void',voidedAt=NOW(),
        voidReason='账单页面作废登记',sourceAttachmentId=NULL,updatedByUserId=:userId,updatedByName=:userName WHERE id=:id`,
        { id, userId: actor.userId || null, userName: actor.name || null });
    }
    for (const sourceId of ids) {
      await removeStatementInvoiceAttachment(sourceType, invoice, sourceId, connection);
      await refreshStatementInvoiceSummary(sourceType, sourceId, connection);
    }
    // Keep an audit snapshot, including the original object key; do not delete potentially shared file objects.
    await executeInTransaction(connection, `INSERT INTO merge_common_operation_logs
      (logId,userId,userName,domainKey,moduleKey,action,entityType,entityId,requestId,detailJson)
      VALUES (:logId,:userId,:userName,'common','invoices',:action,'invoice',:id,:requestId,:detailJson)`,
      { logId: randomUUID(), userId: actor.userId || null, userName: actor.name || null, action: preview.mode === "delete" ? "delete" : "status_change",
        id, requestId: randomUUID(), detailJson: JSON.stringify({ operation: "remove_statement_registration", ...preview,
          sourceType, customerId: invoice.customerId, undertakingUnitId: invoice.undertakingUnitId, amountExcludingTax: invoice.amountExcludingTax,
          taxAmount: invoice.taxAmount, invoiceDate: invoice.invoiceDate, storageKey: invoice.storageKey, fileProvider: invoice.fileProvider }) });
    return { mode: preview.mode, invoiceNo: preview.invoiceNo, affectedCount: ids.length };
  });
}
