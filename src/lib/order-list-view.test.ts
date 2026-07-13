import { describe, expect, it } from "vitest";
import { getOrderListColumnKeys, shouldShowPurchaseSourceGenerator } from "./order-list-view";

describe("order list view", () => {
  it("shows country and batch fields in request order list", () => {
    expect(getOrderListColumnKeys("requests")).toEqual([
      "id",
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

  it("keeps both system purchase id and manual PO number in purchase order list", () => {
    expect(getOrderListColumnKeys("purchase").slice(0, 2)).toEqual(["purchaseOrderId", "poNo"]);
  });
});
