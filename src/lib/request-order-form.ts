export type RequestDetailDraft = {
  deviceCode: string;
  supplierId: string;
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
    requestedAt,
    quantity: detail.quantity,
  }));
}
