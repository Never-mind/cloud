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
      requestNos: ["REQ-2026-001"],
      purchaseOrderId: "PO-SYS-20260710-0001",
      poNo: "PO-MANUAL-001",
      details: [
        { id: "RI-001", requestNo: "REQ-2026-001" },
        { id: "RI-002", requestNo: "REQ-2026-001" },
      ],
    });

    expect(draft.order).toMatchObject({
      purchaseOrderId: "PO-SYS-20260710-0001",
      poNo: "PO-MANUAL-001",
      requestNo: "REQ-2026-001",
      sourceRequestNos: "REQ-2026-001",
      status: "草稿",
      currency: "USD",
    });
    expect(draft.items).toEqual([
      {
        id: "POI-PO-SYS-20260710-0001-001",
        purchaseOrderId: "PO-SYS-20260710-0001",
        poNo: "PO-MANUAL-001",
        requestNo: "REQ-2026-001",
        requestItemId: "RI-001",
        unitPrice: 0,
        hardwareCoefficient: 1,
        softwareCoefficient: 0,
        totalCoefficient: 1,
      },
      {
        id: "POI-PO-SYS-20260710-0001-002",
        purchaseOrderId: "PO-SYS-20260710-0001",
        poNo: "PO-MANUAL-001",
        requestNo: "REQ-2026-001",
        requestItemId: "RI-002",
        unitPrice: 0,
        hardwareCoefficient: 1,
        softwareCoefficient: 0,
        totalCoefficient: 1,
      },
    ]);
  });

  it("builds a draft purchase order from multiple request numbers", () => {
    const draft = buildPurchaseDraft({
      purchaseOrderId: "PO-SYS-20260710-0002",
      poNo: "PO-MERGED-001",
      requestNo: "REQ-A,REQ-B",
      requestNos: ["REQ-A", "REQ-B"],
      details: [
        { id: "RI-A1", requestNo: "REQ-A" },
        { id: "RI-B1", requestNo: "REQ-B" },
      ],
    });

    expect(draft.order.requestNo).toBe("REQ-A,REQ-B");
    expect(draft.order.sourceRequestNos).toBe("REQ-A,REQ-B");
    expect(draft.items.map((item) => item.requestNo)).toEqual(["REQ-A", "REQ-B"]);
    expect(draft.items.every((item) => item.poNo === "PO-MERGED-001")).toBe(true);
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
          batchName: "Batch A",
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
        batchName: "Batch A",
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
