import { paymentApprovalStatusLabel } from "./payment-approval-status";

/** Approval completion and invoice registration are separate facts. */
export function invoiceApprovalStatusLabel(status: unknown, invoiceId?: unknown, invoiceStatus?: unknown, syncError?: unknown, pendingReturns?: unknown) {
  const approvalStatus = String(status ?? "").trim();
  if (approvalStatus === "approved") {
    if (String(syncError ?? "").trim()) return "审批通过，回票异常";
    if (Number(pendingReturns) > 0) return "审批通过，回票待登记";
    if (invoiceId && invoiceStatus === "issued") return "审批通过已开票";
    if (invoiceId && invoiceStatus === "void") return "审批通过，发票已作废";
    return "审批通过待出票";
  }
  return paymentApprovalStatusLabel(approvalStatus) || approvalStatus;
}
