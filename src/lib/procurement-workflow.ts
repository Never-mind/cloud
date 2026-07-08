type QuantityRow = {
  quantity: number | null;
};

type RequestDetail = {
  id: string;
};

type ShipmentLine = {
  purchaseOrderItemId: string;
  deviceCode: string | null;
  nameEn: string | null;
};

export type PurchaseDraft = {
  order: {
    poNo: string;
    requestNo: string;
    status: string;
    currency: string;
    usdRate: number;
  };
  items: Array<{
    id: string;
    poNo: string;
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

export function buildPurchaseDraft({
  poNo,
  requestNo,
  details,
}: {
  poNo: string;
  requestNo: string;
  details: RequestDetail[];
}): PurchaseDraft {
  return {
    order: {
      poNo,
      requestNo,
      status: "草稿",
      currency: "USD",
      usdRate: 1,
    },
    items: details.map((detail, index) => ({
      id: `POI-${poNo}-${String(index + 1).padStart(3, "0")}`,
      poNo,
      requestItemId: detail.id,
      unitPrice: 0,
      hardwareCoefficient: 1,
      softwareCoefficient: 0,
      totalCoefficient: 1,
    })),
  };
}

export function buildShipmentDraft(poNo: string): ShipmentDraft;
export function buildShipmentDraft(poNo: string, lines: ShipmentLine[]): ShipmentDraft[];
export function buildShipmentDraft(poNo: string, lines?: ShipmentLine[]): ShipmentDraft | ShipmentDraft[] {
  if (lines) {
    return lines.map((line, index) => ({
      ...buildBaseShipmentDraft(`SHP-${poNo}-${String(index + 1).padStart(3, "0")}`, poNo),
      purchaseOrderItemId: line.purchaseOrderItemId,
      deviceCode: line.deviceCode ?? "",
      nameEn: line.nameEn ?? "",
    }));
  }

  return buildBaseShipmentDraft(`SHP-${poNo}`, poNo);
}

type ShipmentDraft = ReturnType<typeof buildBaseShipmentDraft> & {
  purchaseOrderItemId?: string;
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
