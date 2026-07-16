import { describe, expect, it } from "vitest";
import { PURCHASE_CURRENCY_OPTIONS, buildPurchaseOrderItemRows } from "./purchase-order-form";

describe("purchase order form", () => {
  it("offers only supported purchase currencies", () => {
    expect(PURCHASE_CURRENCY_OPTIONS).toEqual(["CNY", "MXN", "CLP", "USD", "BRL"]);
  });

  it("fills purchase item rows from selected request details", () => {
    expect(
      buildPurchaseOrderItemRows({
        purchaseOrderId: "PO-SYS-001",
        poNo: "PO-NEW-001",
        details: [
          {
            requestNo: "REQ-001",
            requestItemId: "RI-001",
            unitPrice: 1200,
            hardwareCoefficient: 1,
            softwareCoefficient: 0.2,
          },
          {
            requestNo: "REQ-002",
            requestItemId: "RI-002",
            unitPrice: 1800,
            hardwareCoefficient: 1.1,
            softwareCoefficient: 0.3,
          },
        ],
      }),
    ).toEqual([
      {
        id: "POI-PO-SYS-001-001",
        purchaseOrderId: "PO-SYS-001",
        poNo: "PO-NEW-001",
        requestNo: "REQ-001",
        requestItemId: "RI-001",
        taxExcludedUnitPrice: 1200,
        taxSurcharge: 0,
        unitPrice: 1200,
        hardwareCoefficient: 1,
        softwareCoefficient: 0.2,
        totalCoefficient: 1.2,
      },
      {
        id: "POI-PO-SYS-001-002",
        purchaseOrderId: "PO-SYS-001",
        poNo: "PO-NEW-001",
        requestNo: "REQ-002",
        requestItemId: "RI-002",
        taxExcludedUnitPrice: 1800,
        taxSurcharge: 0,
        unitPrice: 1800,
        hardwareCoefficient: 1.1,
        softwareCoefficient: 0.3,
        totalCoefficient: 1.4000000000000001,
      },
    ]);
  });
});
