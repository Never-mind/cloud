import { describe, expect, it } from "vitest";
import { getEmbeddedCookiePath } from "./embedded-workspace";

describe("embedded workspace cookie scope", () => {
  it("keeps all routes in one top-level module embedded", () => {
    expect(getEmbeddedCookiePath("/finance/prepayment-writeoff-adjustments/new")).toBe("/finance");
    expect(getEmbeddedCookiePath("/finance/billing-adjustments/ADJ-001")).toBe("/finance");
    expect(getEmbeddedCookiePath("/requests/orders/REQ-001")).toBe("/requests");
    expect(getEmbeddedCookiePath("/purchase/orders/PO-001")).toBe("/purchase");
  });

  it("uses the root path for the home route", () => {
    expect(getEmbeddedCookiePath("/")).toBe("/");
  });
});
