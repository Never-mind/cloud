export type RequestDetailDraft = {
  deviceCode: string;
  supplierId: string;
  undertakingUnitId: string;
  customerId: string;
  quantity: number;
};

export function buildRequestItemRows({
  details,
  requestedAt,
  requestNo,
  requestType = "整机",
}: {
  details: RequestDetailDraft[];
  requestedAt: string;
  requestNo: string;
  requestType?: string;
}) {
  return details.map((detail, index) => ({
    id: `RI-${requestNo}-${String(index + 1).padStart(3, "0")}`,
    requestNo,
    deviceCode: detail.deviceCode,
    requestType,
    supplierId: detail.supplierId,
    undertakingUnitId: detail.undertakingUnitId,
    customerId: detail.customerId,
    requestedAt,
    quantity: detail.quantity,
  }));
}
