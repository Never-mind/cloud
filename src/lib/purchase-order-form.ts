export type PurchaseDetailDraft = {
  requestNo?: string;
  requestItemId: string;
  unitPrice: number;
  hardwareCoefficient: number;
  softwareCoefficient: number;
};

export const PURCHASE_CURRENCY_OPTIONS = ["CNY", "MXN", "CLP", "USD", "BRL"];

export function buildPurchaseOrderItemRows({
  details,
  purchaseOrderId,
  poNo,
}: {
  details: PurchaseDetailDraft[];
  purchaseOrderId: string;
  poNo: string;
}) {
  return details.map((detail, index) => {
    const totalCoefficient = Number(detail.hardwareCoefficient || 0) + Number(detail.softwareCoefficient || 0);

    return {
      id: `POI-${purchaseOrderId}-${String(index + 1).padStart(3, "0")}`,
      purchaseOrderId,
      poNo,
      requestNo: detail.requestNo ?? "",
      requestItemId: detail.requestItemId,
      unitPrice: detail.unitPrice,
      hardwareCoefficient: detail.hardwareCoefficient,
      softwareCoefficient: detail.softwareCoefficient,
      totalCoefficient,
    };
  });
}
