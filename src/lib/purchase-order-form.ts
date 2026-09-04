export type PurchaseDetailDraft = {
  requestNo?: string;
  requestType?: string;
  requestItemId: string;
  taxExcludedUnitPrice?: number;
  taxSurcharge?: number;
  unitPrice: number;
  capexUnitPrice?: number;
  opexUnitPrice?: number;
  hardwareCoefficient: number;
  softwareCoefficient: number;
  powerPricingJson?: string;
  powerFirst24VatIncluded?: number;
  powerNext36VatIncluded?: number;
  powerFirst24Manual?: boolean;
  powerNext36Manual?: boolean;
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
    const taxSurcharge = Number(detail.taxSurcharge ?? 0);
    const hasTaxExcludedUnitPrice = detail.taxExcludedUnitPrice !== undefined && detail.taxExcludedUnitPrice !== null;
    const taxExcludedUnitPrice = hasTaxExcludedUnitPrice
      ? Number(detail.taxExcludedUnitPrice)
      : Number(detail.unitPrice ?? 0) - taxSurcharge;
    const unitPrice = hasTaxExcludedUnitPrice
      ? taxExcludedUnitPrice + taxSurcharge
      : Number(detail.unitPrice ?? 0);

    const powerPricingFields = detail.powerPricingJson
      ? {
          powerPricingJson: detail.powerPricingJson,
          powerFirst24VatIncluded: detail.powerFirst24VatIncluded ?? 0,
          powerNext36VatIncluded: detail.powerNext36VatIncluded ?? 0,
          powerFirst24Manual: detail.powerFirst24Manual ?? false,
          powerNext36Manual: detail.powerNext36Manual ?? false,
        }
      : {};

    return {
      id: `POI-${purchaseOrderId}-${String(index + 1).padStart(3, "0")}`,
      purchaseOrderId,
      poNo,
      requestNo: detail.requestNo ?? "",
      requestItemId: detail.requestItemId,
      requestType: detail.requestType ?? "整机",
      taxExcludedUnitPrice,
      taxSurcharge,
      unitPrice,
      capexUnitPrice: detail.capexUnitPrice ?? 0,
      opexUnitPrice: detail.opexUnitPrice ?? 0,
      hardwareCoefficient: detail.hardwareCoefficient,
      softwareCoefficient: detail.softwareCoefficient,
      totalCoefficient,
      ...powerPricingFields,
    };
  });
}
