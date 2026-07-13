type QuantityRow = {
  quantity: number | null;
};

type RequestDetail = {
  id: string;
  requestNo?: string | null;
};

type ShipmentLine = {
  purchaseOrderItemId: string;
  batchName?: string | null;
  deviceCode: string | null;
  nameEn: string | null;
};

export type PurchaseDraft = {
  order: {
    purchaseOrderId: string;
    poNo: string;
    requestNo: string;
    sourceRequestNos: string;
    status: string;
    currency: string;
    usdRate: number;
  };
  items: Array<{
    id: string;
    purchaseOrderId: string;
    poNo: string;
    requestNo: string;
    requestItemId: string;
    unitPrice: number;
    hardwareCoefficient: number;
    softwareCoefficient: number;
    totalCoefficient: number;
  }>;
};

export function summarizeOrderQuantity(details: QuantityRow[]) {
  return details.reduce((total, detail) => total + (detail.quantity ?? 0), 0);
}

export function buildAutoPurchaseOrderNo(requestNo: string) {
  const normalizedRequestNo = requestNo.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `PO-${normalizedRequestNo}`;
}

export function buildAutoPurchaseOrderId(seed = new Date()) {
  const year = seed.getFullYear();
  const month = String(seed.getMonth() + 1).padStart(2, "0");
  const day = String(seed.getDate()).padStart(2, "0");
  const time = `${String(seed.getHours()).padStart(2, "0")}${String(seed.getMinutes()).padStart(2, "0")}${String(seed.getSeconds()).padStart(2, "0")}`;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PO-SYS-${year}${month}${day}-${time}-${suffix}`;
}

export function buildPurchaseDraft({
  purchaseOrderId,
  poNo,
  requestNo,
  requestNos,
  details,
}: {
  purchaseOrderId?: string;
  poNo: string;
  requestNo: string;
  requestNos?: string[];
  details: RequestDetail[];
}): PurchaseDraft {
  const internalId = purchaseOrderId?.trim() || buildAutoPurchaseOrderId();
  const sourceRequestNos = normalizeRequestNos(requestNos?.length ? requestNos : [requestNo]);

  return {
    order: {
      purchaseOrderId: internalId,
      poNo,
      requestNo,
      sourceRequestNos,
      status: "草稿",
      currency: "USD",
      usdRate: 1,
    },
    items: details.map((detail, index) => ({
      id: `POI-${internalId}-${String(index + 1).padStart(3, "0")}`,
      purchaseOrderId: internalId,
      poNo,
      requestNo: detail.requestNo ?? requestNo,
      requestItemId: detail.id,
      unitPrice: 0,
      hardwareCoefficient: 1,
      softwareCoefficient: 0,
      totalCoefficient: 1,
    })),
  };
}

export function normalizeRequestNos(requestNos: string[]) {
  return Array.from(new Set(requestNos.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean))).join(",");
}

export function buildShipmentDraft(poNo: string): ShipmentDraft;
export function buildShipmentDraft(poNo: string, lines: ShipmentLine[]): ShipmentDraft[];
export function buildShipmentDraft(poNo: string, lines?: ShipmentLine[]): ShipmentDraft | ShipmentDraft[] {
  if (lines) {
    return lines.map((line, index) => ({
      ...buildBaseShipmentDraft(`SHP-${poNo}-${String(index + 1).padStart(3, "0")}`, poNo),
      purchaseOrderItemId: line.purchaseOrderItemId,
      batchName: line.batchName ?? "",
      deviceCode: line.deviceCode ?? "",
      nameEn: line.nameEn ?? "",
    }));
  }

  return buildBaseShipmentDraft(`SHP-${poNo}`, poNo);
}

type ShipmentDraft = ReturnType<typeof buildBaseShipmentDraft> & {
  purchaseOrderItemId?: string;
  batchName?: string;
  deviceCode?: string;
  nameEn?: string;
};

function buildBaseShipmentDraft(shipmentId: string, poNo: string) {
  return {
    shipmentId,
    poNo,
    destinationLocationId: "待补充",
    recipientContactId: "待补充",
    snapshotDestinationAddress: "待补充",
    snapshotRecipientName: "待补充",
    snapshotRecipientPhone: "待补充",
    transportMode: "待安排",
    isReceived: false,
  };
}
