import { describe, expect, it } from "vitest";
import {
  buildAutoPurchaseOrderNo,
  buildPurchaseDraft,
  buildShipmentDraft,
  summarizeOrderQuantity,
} from "./procurement-workflow";

describe("procurement workflow", () => {
  it("summarizes order quantity from detail rows", () => {
    expect(
      summarizeOrderQuantity([
        { quantity: 3 },
        { quantity: 7 },
        { quantity: null },
      ]),
    ).toBe(10);
  });

  it("builds a draft purchase order from request details", () => {
    const draft = buildPurchaseDraft({
      requestNo: "REQ-2026-001",
      poNo: "PO-MANUAL-001",
      details: [
        { id: "RI-001" },
        { id: "RI-002" },
      ],
    });

    expect(draft.order).toMatchObject({
      poNo: "PO-MANUAL-001",
      requestNo: "REQ-2026-001",
      status: "草稿",
      currency: "USD",
    });
    expect(draft.items).toEqual([
      {
        id: "POI-PO-MANUAL-001-001",
        poNo: "PO-MANUAL-001",
        requestItemId: "RI-001",
        unitPrice: 0,
        hardwareCoefficient: 1,
        softwareCoefficient: 0,
        totalCoefficient: 1,
      },
      {
        id: "POI-PO-MANUAL-001-002",
        poNo: "PO-MANUAL-001",
        requestItemId: "RI-002",
        unitPrice: 0,
        hardwareCoefficient: 1,
        softwareCoefficient: 0,
        totalCoefficient: 1,
      },
    ]);
  });

  it("builds an automatic purchase order number from request number", () => {
    expect(buildAutoPurchaseOrderNo("REQ-2026-001")).toBe("PO-REQ-2026-001");
    expect(buildAutoPurchaseOrderNo("  REQ A/1  ")).toBe("PO-REQ-A-1");
  });

  it("builds a shipment draft when purchase order is confirmed", () => {
    expect(buildShipmentDraft("PO-REQ-2026-001")).toMatchObject({
      shipmentId: "SHP-PO-REQ-2026-001",
      poNo: "PO-REQ-2026-001",
      destinationLocationId: "待补充",
      recipientContactId: "待补充",
      snapshotDestinationAddress: "待补充",
      snapshotRecipientName: "待补充",
      snapshotRecipientPhone: "待补充",
      transportMode: "待安排",
      isReceived: false,
    });
  });

  it("builds one shipment draft per purchased instance line", () => {
    expect(
      buildShipmentDraft("PO-REQ-2026-001", [
        {
          purchaseOrderItemId: "POI-001",
          deviceCode: "DEV-A",
          nameEn: "Compute A",
        },
        {
          purchaseOrderItemId: "POI-002",
          deviceCode: "DEV-B",
          nameEn: "Compute B",
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        shipmentId: "SHP-PO-REQ-2026-001-001",
        poNo: "PO-REQ-2026-001",
        purchaseOrderItemId: "POI-001",
        deviceCode: "DEV-A",
        nameEn: "Compute A",
      }),
      expect.objectContaining({
        shipmentId: "SHP-PO-REQ-2026-001-002",
        poNo: "PO-REQ-2026-001",
        purchaseOrderItemId: "POI-002",
        deviceCode: "DEV-B",
        nameEn: "Compute B",
      }),
    ]);
  });
});
