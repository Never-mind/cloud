/** Compatibility exports for the service-fee module; both statement types share one ledger. */
import type { PoolConnection } from "mysql2/promise";
import type { Row } from "./db";
import { statementInvoiceEntries, refreshStatementInvoiceSummary, statementInvoiceAttachmentId, removeStatementInvoiceAttachment, validateStatementInvoiceAppend } from "./statement-invoice-ledger";
export { summarizeStatementInvoices as summarizeServiceFeeInvoices } from "./statement-invoice-ledger";
export const serviceFeeInvoiceEntries = (ids: string[], connection?: PoolConnection) => statementInvoiceEntries("service_fee", ids, connection);
export const refreshServiceFeeInvoiceSummary = (id: string, connection: PoolConnection) => refreshStatementInvoiceSummary("service_fee", id, connection);
export const serviceFeeInvoiceAttachmentId = (invoiceId: string, sourceId: string) => statementInvoiceAttachmentId("service_fee", invoiceId, sourceId);
export const removeServiceFeeInvoiceAttachment = (invoice: Row, id: string, connection: PoolConnection) => removeStatementInvoiceAttachment("service_fee", invoice, id, connection);
export const validateServiceFeeInvoiceAppend = (id: string, invoice: { invoiceNo: string; currency: string }, connection: PoolConnection) => validateStatementInvoiceAppend("service_fee", id, invoice, connection);
