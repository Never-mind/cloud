import { describe, expect, it } from "vitest";
import { getPurchaseOrderForDetailLines } from "./order-detail-view";

describe("order detail view", () => {
  it("uses draft purchase order currency for detail line display while editing", () => {
    const order = getPurchaseOrderForDetailLines(
      { poNo: "PO-1", currency: "USD" },
      { poNo: "PO-1", currency: "CNY" },
      true,
    );

    expect(order.currency).toBe("CNY");
  });
});
