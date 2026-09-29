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

export type PurchaseOrderCascadeUsage = {
  poNo: string;
  /** 采购订单是否已确认。 */
  confirmed: boolean;
  /** 已录入价格（含税单价/未税单价/CAPEX/OPEX/算力服务价格任一非空）的明细行数。 */
  pricedItemCount: number;
  /** 该采购订单下的物流单数量。 */
  shipmentCount: number;
};

/**
 * 删除需求单时会连带删除它的采购订单。采购订单上"人录进去过"的数据
 * （价格、物流快照、确认状态）一旦被连带删掉就找不回来了 ——
 * 历史上就出现过删除需求单再重新拉取、结果采购价格全丢的情况。
 * 这里规定：只有"未确认、没录价格、没有物流单"的采购草稿才允许被连带删除。
 */
export function getPurchaseOrderCascadeBlockReason(usage: PurchaseOrderCascadeUsage) {
  if (usage.confirmed) {
    return `采购订单 ${usage.poNo} 已确认，不能随需求单一起删除；请先在采购订单里退回或删除该单`;
  }
  if (usage.pricedItemCount > 0) {
    return `采购订单 ${usage.poNo} 已录入价格，不能随需求单一起删除；请先确认价格不再需要，再手工删除该采购单`;
  }
  if (usage.shipmentCount > 0) {
    return `采购订单 ${usage.poNo} 已生成物流单，不能随需求单一起删除；请先处理物流后重新确认`;
  }
  return null;
}
