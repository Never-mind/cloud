import { readInvoiceAllocationPlan } from "./invoice-allocation";
import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { queryRowsRaw, queryRowsInTransaction, executeInTransaction, type Row } from "./db";

const text = (value: unknown) => String(value ?? "").trim();
const cents = (value: unknown) => Math.round(Number(value ?? 0) * 100);
const date = (value: unknown) => value instanceof Date
  ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
  : text(value).slice(0, 10);

/** Only the allocation belongs to a month, never both the allocation and the whole invoice. */
export type StatementInvoiceSource = "service_fee" | "cloud_row";
export const isStatementInvoiceSource = (type: string): type is StatementInvoiceSource => type === "service_fee" || type === "cloud_row";
const sourceTables = { service_fee: ["merge_power_servicefeesnapshots", "snapshotNo"], cloud_row: ["merge_cloud_rows", "id"] } as const;

export async function statementInvoiceEntries(sourceType: StatementInvoiceSource, ids: string[], connection?: PoolConnection): Promise<Row[]> {
  if (!ids.length) return [];
  const sql = `SELECT i.id, i.invoiceNo, i.customerId, i.customerName, i.undertakingUnitId, i.sellerName,
      i.invoiceDate, i.dueDate, i.source, i.approvalInstanceCode, i.exchangeRate, i.allocationPlanJson, COALESCE(a.sourceId, i.sourceId) AS sourceId,
      COALESCE(a.currency, i.currency) AS currency, COALESCE(a.amountExcludingTax, i.amountExcludingTax) AS amountExcludingTax,
      COALESCE(a.taxAmount, i.taxAmount) AS taxAmount, COALESCE(a.taxRate, i.taxRate) AS taxRate,
      COALESCE(a.amountIncludingTax, i.amountIncludingTax) AS amountIncludingTax
    FROM merge_common_invoices i LEFT JOIN merge_common_invoice_allocations a ON a.invoiceId=i.id
    WHERE i.status='issued' AND i.sourceType=:sourceType
      AND ((a.sourceType=:sourceType AND a.sourceId IN (:ids)) OR (a.id IS NULL AND i.sourceId IN (:ids)))
    ORDER BY i.invoiceDate, i.id${connection ? " FOR UPDATE" : ""}`;
  const rows = await (connection ? queryRowsInTransaction<Row>(connection, sql, { ids, sourceType }) : queryRowsRaw<Row>(sql, { ids, sourceType }));
  return rows.map(row => {
    const allocation = readInvoiceAllocationPlan(row.allocationPlanJson)?.allocations.find(item => item.sourceId === row.sourceId);
    const { allocationPlanJson: _plan, ...entry } = row;
    return { ...entry, exchangeRate: allocation ? (allocation.sourceCurrency === "USD" ? allocation.exchangeRate : allocation.invoiceUsdRate) : row.exchangeRate };
  });
}

export function summarizeStatementInvoices(entries: Row[]) {
  const unique = (key: string) => [...new Set(entries.map(row => text(row[key])).filter(Boolean))];
  const currencies = unique("currency").map(value => value.toUpperCase());
  if (new Set(currencies).size > 1) throw new Error("同一账期的发票币种必须一致，不能直接累加不同币种的金额");
  const net = entries.reduce((sum, row) => sum + cents(row.amountExcludingTax), 0);
  const total = entries.reduce((sum, row) => sum + cents(row.amountIncludingTax), 0);
  const rates = unique("taxRate");
  const invoiceDates = entries.map(row => date(row.invoiceDate)).filter(Boolean).sort();
  const dueDates = entries.map(row => date(row.dueDate)).filter(Boolean).sort();
  return {
    invoiceNo: entries.length > 1 ? `共 ${entries.length} 张发票` : text(entries[0]?.invoiceNo) || null,
    currency: currencies[0] || null,
    net: entries.length ? (net / 100).toFixed(2) : null,
    total: entries.length ? (total / 100).toFixed(2) : null,
    taxAmount: entries.length ? ((total - net) / 100).toFixed(2) : null,
    taxRate: !entries.length ? null : rates.length === 1 ? String(Number(rates[0]) / 100) : net ? String(Number(((total - net) / net).toFixed(6))) : null,
    invoiceDate: invoiceDates.at(-1) || null,
    dueDate: dueDates[0] || null,
    unitId: unique("undertakingUnitId").length === 1 ? unique("undertakingUnitId")[0] : null,
    customerId: unique("customerId").length === 1 ? unique("customerId")[0] : null,
    invoiceStatus: entries.length ? "已开票" : "未开票",
  };
}

/** Call inside the invoice transaction, after its allocations/status have been written. */
export async function refreshStatementInvoiceSummary(sourceType: StatementInvoiceSource, sourceId: string, connection: PoolConnection) {
  const [table, key] = sourceTables[sourceType];
  const [source] = await queryRowsInTransaction<Row>(connection, `SELECT * FROM ${table} WHERE ${key}=:sourceId FOR UPDATE`, { sourceId });
  const entries = await statementInvoiceEntries(sourceType, [sourceId], connection);
  const summary = summarizeStatementInvoices(entries);
  if (sourceType === "cloud_row") {
    // The displayed rate must preserve the sum of each invoice's USD conversion.
    const exchangeRate = aggregateInvoiceExchangeRate(entries);
    await executeInTransaction(connection, `UPDATE merge_cloud_rows SET invoiceNo=:invoiceNo, invoiceCurrency=:currency,
      invoiceNetAmount=:net, invoiceTaxAmount=:taxAmount, invoiceTotalAmount=:total, invoiceTaxRate=:taxRate,
      invoiceDate=:invoiceDate, receivableDate=:dueDate, invoiceExchangeRate=:exchangeRate,
      invoicePayeeUndertakingUnitId=:unitId, invoicePayerCustomerId=:customerId,
      collectionInvoice=:collectionInvoice, updatedAt=NOW() WHERE id=:sourceId`,
      { sourceId, ...summary, exchangeRate: exchangeRate ?? (entries.length === 1 && text(source?.invoiceCurrency).toUpperCase() === summary.currency ? source?.invoiceExchangeRate ?? null : null),
        collectionInvoice: entries.length ? "issued" : "not_issued" });
    return;
  }
  await executeInTransaction(connection, `UPDATE merge_power_servicefeesnapshots
    SET invoiceNo=:invoiceNo, invoiceCurrency=:currency, invoiceAmountExcludingTax=:net,
      invoiceAmountIncludingTax=:total, invoiceVatRate=:taxRate, invoiceDate=:invoiceDate,
      receivableDate=:dueDate, invoiceReceivingUnitId=:unitId, invoicePayerCustomerId=:customerId,
      invoiceStatus=:invoiceStatus, updatedAt=NOW() WHERE snapshotNo=:sourceId`,
    { sourceId, ...summary });
}

export function aggregateInvoiceExchangeRate(entries: Row[]) {
  if (!entries.length) return null;
  if (entries.every(row => text(row.currency).toUpperCase() === "USD")) return "1";
  const amounts = entries.filter(row => cents(row.amountIncludingTax) !== 0);
  if (!amounts.length || amounts.some(row => !Number.isFinite(Number(row.exchangeRate)) || Number(row.exchangeRate) <= 0)) return null;
  const total = amounts.reduce((sum, row) => sum + cents(row.amountIncludingTax), 0);
  const usd = amounts.reduce((sum, row) => sum + cents(row.amountIncludingTax) / Number(row.exchangeRate), 0);
  return total > 0 && usd > 0 ? (total / usd).toFixed(8) : null;
}

/** Stable per invoice AND month; different invoices may have exactly the same file name. */
export function statementInvoiceAttachmentId(sourceType: StatementInvoiceSource, invoiceId: string, sourceId: string) {
  const hex = createHash("sha256").update(JSON.stringify([sourceType === "service_fee" ? "service_fee_invoice" : "invoice", invoiceId, sourceId])).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

export async function removeStatementInvoiceAttachment(sourceType: StatementInvoiceSource, invoice: Row, sourceId: string, connection: PoolConnection) {
  const attachmentId = statementInvoiceAttachmentId(sourceType, text(invoice.id), sourceId);
  const ownerType = sourceType === "service_fee" ? "service_fee_invoice" : "invoice";
  const exact = await queryRowsInTransaction(connection, "SELECT id FROM merge_cloud_attachments WHERE id=:id AND ownerType=:ownerType AND ownerId=:sourceId", { id: attachmentId, ownerType, sourceId });
  if (exact.length) {
    await executeInTransaction(connection, "DELETE FROM merge_cloud_attachments WHERE id=:attachmentId AND ownerType=:ownerType AND ownerId=:sourceId", { attachmentId, ownerType, sourceId });
    return;
  }
  await executeInTransaction(connection, `DELETE FROM merge_cloud_attachments WHERE ownerType=:ownerType AND ownerId=:sourceId
    AND (id=:attachmentId OR id=:legacyId OR (fileName=:fileName AND
      ((:storageKey IS NOT NULL AND storageKey=:storageKey) OR (:fileContent IS NOT NULL AND dataUrl=:fileContent))))`,
    { sourceId, ownerType: sourceType === "service_fee" ? "service_fee_invoice" : "invoice", attachmentId: statementInvoiceAttachmentId(sourceType, text(invoice.id), sourceId), legacyId: text(invoice.sourceAttachmentId) || null,
      fileName: text(invoice.fileName), storageKey: text(invoice.storageKey) || null, fileContent: text(invoice.fileContent) || null });
}

export async function validateStatementInvoiceAppend(sourceType: StatementInvoiceSource, sourceId: string, invoice: { invoiceNo: string; currency: string }, connection: PoolConnection) {
  const [table, key] = sourceTables[sourceType];
  const [source] = await queryRowsInTransaction<Row>(connection, `SELECT * FROM ${table} WHERE ${key}=:sourceId FOR UPDATE`, { sourceId });
  if (!source) throw new Error("来源账单不存在");
  const entries = await statementInvoiceEntries(sourceType, [sourceId], connection);
  if (entries.some(row => text(row.currency).toUpperCase() !== invoice.currency.toUpperCase())) {
    throw new Error("该账期已有其他币种的发票，请核对币种，不能直接累加");
  }
  if (!entries.length && text(source.invoiceNo) && text(source.invoiceNo) !== invoice.invoiceNo) {
    throw new Error(`账单已有手工登记的发票 ${text(source.invoiceNo)}，请先上传并登记该原票，再追加新发票，以免丢失原金额`);
  }
  if (entries.length) {
    const summary = summarizeStatementInvoices(entries);
    if (cents(sourceType === "cloud_row" ? source.invoiceNetAmount : source.invoiceAmountExcludingTax) !== cents(summary.net) || cents(sourceType === "cloud_row" ? source.invoiceTotalAmount : source.invoiceAmountIncludingTax) !== cents(summary.total)) {
      throw new Error("账单开票金额曾手工调整，与已登记发票不一致，请先核对原发票及分摊后再追加");
    }
  }
}
