export type PurchaseDetailDraft = {
  requestItemId: string;
  unitPrice: number;
  hardwareCoefficient: number;
  softwareCoefficient: number;
};

export const PURCHASE_CURRENCY_OPTIONS = ["CNY", "MXN", "CLP", "USD", "BRL"];

export function buildPurchaseOrderItemRows({
  details,
  poNo,
}: {
  details: PurchaseDetailDraft[];
  poNo: string;
}) {
  return details.map((detail, index) => {
    const totalCoefficient = Number(detail.hardwareCoefficient || 0) + Number(detail.softwareCoefficient || 0);

    return {
      id: `POI-${poNo}-${String(index + 1).padStart(3, "0")}`,
      poNo,
      requestItemId: detail.requestItemId,
      unitPrice: detail.unitPrice,
      hardwareCoefficient: detail.hardwareCoefficient,
      softwareCoefficient: detail.softwareCoefficient,
      totalCoefficient,
    };
  });
}
