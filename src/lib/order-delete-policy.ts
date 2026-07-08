export type OrderDeleteUsageCounts = {
  billingLedgerCount: number;
  monthlyBillingCount: number;
  prepaymentContractItemCount: number;
  monthlyPrepaymentCount: number;
};

export function getOrderDeleteBlockReason(counts: OrderDeleteUsageCounts) {
  if (counts.billingLedgerCount > 0 || counts.monthlyBillingCount > 0) {
    return "该单据已生成月账单，不能删除";
  }
  if (counts.prepaymentContractItemCount > 0 || counts.monthlyPrepaymentCount > 0) {
    return "该单据已生成预付款，不能删除";
  }
  return null;
}
