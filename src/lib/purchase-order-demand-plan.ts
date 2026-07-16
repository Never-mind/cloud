export type DemandPlanKind = "sn" | "plan";

export type DemandPlanImportColumn = {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "date";
};

const snColumns: DemandPlanImportColumn[] = [
  { key: "poNo", label: "PO订单号", required: true },
  { key: "purchaseOrderItemId", label: "采购明细ID" },
  { key: "requestNo", label: "要货需求单号" },
  { key: "shippingBatch", label: "发货批次" },
  { key: "deviceVendor", label: "设备厂商" },
  { key: "finalParentSn", label: "最终父项SN" },
  { key: "finalParentPn", label: "甲方最终父项PN" },
  { key: "finalParentPnDescription", label: "最终父项PN描述" },
  { key: "supplierFinalParentCode", label: "供应商最终父项编码" },
  { key: "finalParentCode", label: "甲方最终父项编码" },
  { key: "level", label: "层级" },
  { key: "supplierParentCode", label: "供应商父项编码" },
  { key: "supplierParentSn", label: "供应商父项SN" },
  { key: "parentCode", label: "甲方父项编码" },
  { key: "componentCategory", label: "部件类别" },
  { key: "sn", label: "供应商子项部件SN", required: true },
  { key: "fixedAssetCode", label: "固定资产编码" },
  { key: "materialDescription", label: "物料描述" },
  { key: "parentAssetNo", label: "甲方父项固资号" },
  { key: "packingListNo", label: "箱单号" },
  { key: "supplierChildComponentCode", label: "供应商子项部件编码" },
  { key: "customerChildComponentCode", label: "甲方子项部件编码" },
  { key: "supplierChildComponentDescription", label: "供应商子项部件描述" },
  { key: "childComponentOriginalPn", label: "子项部件原厂PN" },
  { key: "childComponentOriginalSn", label: "子项部件原厂SN" },
  { key: "rackUnit", label: "U位" },
  { key: "site", label: "站点" },
  { key: "contactPhone", label: "联系人/电话" },
];

const planColumns: DemandPlanImportColumn[] = [
  { key: "poNo", label: "PO订单号", required: true },
  { key: "purchaseOrderItemId", label: "采购明细ID" },
  { key: "requestNo", label: "需求单号" },
  { key: "sourcePlanId", label: "要货计划子ID" },
  { key: "quoteReceivedAt", label: "算力供应商收到CEG报价时间", type: "date" },
  { key: "poIssuedAt", label: "算力PO下发时间", type: "date" },
  { key: "receiptProofUploadedAt", label: "签收证明上传时间", type: "date" },
  { key: "logisticsReceivedAt", label: "物流签收时间", type: "date" },
  { key: "ataAt", label: "ATA时间", type: "date" },
  { key: "ata", label: "ATA" },
  { key: "supplierCpd", label: "供应商反馈CPD", type: "date" },
  { key: "material", label: "物料" },
];

export function getDemandPlanImportColumns(kind: DemandPlanKind) {
  return kind === "sn" ? snColumns : planColumns;
}

export function buildPurchaseOrderDetailHref(purchaseOrderId: string) {
  return `/purchase/orders/${encodeURIComponent(purchaseOrderId)}`;
}

type DemandPlanPurchaseOrder = { purchaseOrderId: string; poNo: string };
type DemandPlanPurchaseOrderItem = { id: string; purchaseOrderId: string; requestNo?: string | null };

export function resolveDemandPlanImportRow(
  row: Record<string, unknown>,
  purchaseOrders: DemandPlanPurchaseOrder[],
  purchaseOrderItems: DemandPlanPurchaseOrderItem[],
) {
  const poNo = String(row.poNo ?? row.purchaseOrderNo ?? "").trim();
  const requestNo = String(row.requestNo ?? "").trim();
  const matchingItems = purchaseOrderItems.filter(
    (item) =>
      (!poNo || purchaseOrders.find((order) => order.poNo === poNo)?.purchaseOrderId === item.purchaseOrderId) &&
      (!requestNo || String(item.requestNo ?? "") === requestNo),
  );
  const matchedPurchaseOrderId = poNo
    ? purchaseOrders.find((item) => item.poNo === poNo)?.purchaseOrderId
    : matchingItems.length === 1
      ? matchingItems[0].purchaseOrderId
      : "";
  const purchaseOrder = purchaseOrders.find((item) => item.purchaseOrderId === matchedPurchaseOrderId);
  const purchaseOrderItemId = String(row.purchaseOrderItemId ?? "").trim() || (matchingItems.length === 1 ? matchingItems[0].id : "");

  return {
    ...row,
    purchaseOrderId: String(row.purchaseOrderId ?? "").trim() || purchaseOrder?.purchaseOrderId || "",
    purchaseOrderItemId,
    poNo: poNo || purchaseOrder?.poNo || "",
  };
}
