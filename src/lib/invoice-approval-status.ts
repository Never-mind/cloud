import { paymentApprovalStatusLabel } from "./payment-approval-status";

/** Approval completion and invoice registration are separate facts. */
export function invoiceApprovalStatusLabel(status: unknown, invoiceId?: unknown, invoiceStatus?: unknown) {
  const approvalStatus = String(status ?? "").trim();
  if (approvalStatus === "approved") {
    if (invoiceId && invoiceStatus === "issued") return "审批通过已开票";
    if (invoiceId && invoiceStatus === "void") return "审批通过，发票已作废";
    return "审批通过待出票";
  }
  return paymentApprovalStatusLabel(approvalStatus) || approvalStatus;
}
