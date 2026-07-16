import { describe, expect, it } from "vitest";
import {
  getOrderListColumnKeys,
  getOrderListPrimaryDisplayValue,
  shouldShowPurchaseSourceGenerator,
} from "./order-list-view";

describe("order list view", () => {
  it("shows country and batch fields in request order list", () => {
    expect(getOrderListColumnKeys("requests")).toEqual([
      "requestNo",
      "countryCode",
      "batchName",
      "status",
      "totalQuantity",
      "plannedDeliveryDate",
      "createdAt",
      "updatedAt",
      "actions",
    ]);
  });

  it("removes purchase source generator controls from purchase order list", () => {
    expect(shouldShowPurchaseSourceGenerator("purchase")).toBe(false);
  });

  it("uses the manual PO number instead of the internal purchase ID in purchase order list", () => {
    expect(getOrderListColumnKeys("purchase")).not.toContain("purchaseOrderId");
    expect(getOrderListColumnKeys("purchase")[0]).toBe("poNo");
  });

  it("displays the manual PO number as the purchase order link text", () => {
    expect(
      getOrderListPrimaryDisplayValue("purchase", {
        purchaseOrderId: "PO-SYS-20260714-0001",
        poNo: "PO-BR-001",
      }),
    ).toBe("PO-BR-001");
  });

  it("displays the request number as the request order link text", () => {
    expect(
      getOrderListPrimaryDisplayValue("requests", {
        requestNo: "REQ-BR-001",
        id: "legacy-id",
      }),
    ).toBe("REQ-BR-001");
  });
});
