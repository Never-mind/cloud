export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startInvoiceApprovalAutoSync } = await import("./lib/invoice-approval-auto-sync");
    startInvoiceApprovalAutoSync();
    const { startCostPaymentAutoSync } = await import("./lib/cost-payment-auto-sync");
    startCostPaymentAutoSync();
    const { startFrappeDemandAutoSync } = await import("./lib/frappe-demand-auto-sync");
    startFrappeDemandAutoSync();
  }
}
