import type { PoolConnection } from "mysql2/promise";
import { queryRowsInTransaction, type Row } from "./db";
import { groupReturnedInvoices, type ReturnFileSummary } from "./invoice-approval-returns";
import { matchReturnedInvoiceAllocations } from "./invoice-approval-return-allocation";
import { moneyCents, readInvoiceAllocationPlan, type InvoiceAllocationPlan } from "./invoice-allocation";
import type { InvoiceDraftInput } from "./invoice-service";

export async function lockedReturnGroups(connection: PoolConnection, instanceCode: string) {
  const rows = await queryRowsInTransaction<Row>(connection, "SELECT * FROM merge_common_invoice_approval_files WHERE instanceCode=:code ORDER BY id FOR UPDATE", { code: instanceCode });
  return groupReturnedInvoices(rows.map(row => ({ ...row, id: String(row.id), fileName: String(row.fileName), invoiceIdentity: String(row.invoiceIdentity || ""), invoiceNo: String(row.invoiceNo || ""), invoiceId: String(row.invoiceId || ""), recognition: row.recognitionJson ? JSON.parse(String(row.recognitionJson)) : null, recognitionError: String(row.recognitionError || "") } as ReturnFileSummary)));
}

/** Recompute the match under the approval lock; never trust a caller-provided subset. */
export async function validateMatchedReturn(connection: PoolConnection, approval: Row, input: InvoiceDraftInput, plan: InvoiceAllocationPlan | null, returned: { instanceCode: string; fileId: string; relatedFileIds: string[] }) {
  const groups = await lockedReturnGroups(connection, returned.instanceCode);
  if (groups.length < 2) throw new Error("多张回票校验失败，请刷新核对");
  const expected = matchReturnedInvoiceAllocations(groups, readInvoiceAllocationPlan(approval.allocationPlanJson));
  const group = groups.find(item => item.files.some(file => file.id === returned.fileId));
  if (!group || group.registered) throw new Error("回票已登记或不存在，请刷新");
  if ([...returned.relatedFileIds].sort().join(",") !== group.files.map(file => file.id).sort().join(",")) throw new Error("回票附件归组已变化，请重新同步");
  const assigned = expected.get(group.key)!;
  const row = plan?.allocations[0], original = assigned.allocations[0];
  if (!plan || plan.allocations.length !== 1 || plan.currency !== assigned.currency || plan.sourceType !== assigned.sourceType || row?.sourceId !== original.sourceId) throw new Error("回票与审批账期分摊不一致");
  const approvedIds = String(approval.allocationSourceIds || "").split(",").filter(Boolean);
  if (!approvedIds.includes(original.sourceId) || !approvedIds.includes(String(approval.ownerId))) throw new Error("回票不属于已批准的账期");
  for (const field of ["amountExcludingTax", "taxAmount", "amountIncludingTax"] as const) {
    if (moneyCents(row[field]) !== moneyCents(original[field]) || moneyCents(input[field]) !== moneyCents(original[field])) throw new Error("回票金额与批准的分摊不同");
  }
  if (Number(row.taxRate) !== Number(original.taxRate) || Number(row.exchangeRate) !== Number(original.exchangeRate)) throw new Error("回票税率或折算汇率与批准的分摊不同");
  const recognition = group.primary.recognition!;
  if (input.invoiceNo !== recognition.facts!.invoiceNo || input.invoiceDate !== recognition.facts!.invoiceDate || input.customerId !== recognition.matches?.receiverCustomerId || input.undertakingUnitId !== recognition.matches?.issuerUnitId) throw new Error("登记信息与已识别的回票不一致");
  const previous = await queryRowsInTransaction<Row>(connection, `SELECT i.id FROM merge_common_invoices i
    LEFT JOIN merge_common_invoice_allocations a ON a.invoiceId=i.id
    WHERE i.approvalInstanceCode=:code AND (i.sourceId=:sourceId OR a.sourceId=:sourceId) LIMIT 1 FOR UPDATE`, { code: returned.instanceCode, sourceId: original.sourceId });
  if (previous.length) throw new Error("该审批账期已有发票，请核对已有记录，不能重复登记");
}
