export type PaymentApprovalStatus = "pending" | "returned" | "rejected" | "canceled" | "approved" | "";

export function paymentApprovalStatusLabel(status: unknown) {
  switch (String(status ?? "").trim().toLowerCase()) {
    case "pending": return "审批中";
    case "returned": return "已退回";
    case "rejected": return "已驳回";
    case "canceled":
    case "cancelled": return "已撤回";
    case "approved": return "审批通过";
    default: return "";
  }
}

export function paymentApprovalStatusClass(status: unknown) {
  switch (String(status ?? "").trim().toLowerCase()) {
    case "pending": return "border-warning bg-warning-soft text-warning-ink";
    case "returned": return "border-warning bg-warning-soft text-warning-ink";
    case "rejected": return "border-danger-border-strong bg-danger-soft text-danger";
    case "canceled":
    case "cancelled": return "border-line bg-canvas text-ink-2";
    case "approved": return "border-success bg-success-soft text-success-dark";
    default: return "border-line bg-white text-ink-3";
  }
}
