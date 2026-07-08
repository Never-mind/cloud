import { describe, expect, it } from "vitest";
import { getOrderCreateRoute, getOrderDetailRoute } from "./order-routes";

describe("order detail routes", () => {
  it("builds request detail route from request number", () => {
    expect(getOrderDetailRoute("requests", "REQ-2026-001")).toBe(
      "/requests/orders/REQ-2026-001",
    );
  });

  it("builds purchase detail route from purchase order number", () => {
    expect(getOrderDetailRoute("purchase", "PO-2026-001")).toBe(
      "/purchase/orders/PO-2026-001",
    );
  });

  it("builds purchase create route", () => {
    expect(getOrderCreateRoute("purchase")).toBe("/purchase/orders/new");
  });
});
