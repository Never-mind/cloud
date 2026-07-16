export type RequestDetailDraft = {
  deviceCode: string;
  supplierId: string;
  undertakingUnitId: string;
  quantity: number;
};

export function buildRequestItemRows({
  details,
  requestedAt,
  requestNo,
}: {
  details: RequestDetailDraft[];
  requestedAt: string;
  requestNo: string;
}) {
  return details.map((detail, index) => ({
    id: `RI-${requestNo}-${String(index + 1).padStart(3, "0")}`,
    requestNo,
    deviceCode: detail.deviceCode,
    supplierId: detail.supplierId,
    undertakingUnitId: detail.undertakingUnitId,
    requestedAt,
    quantity: detail.quantity,
  }));
}
