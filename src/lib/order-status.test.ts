import { describe, expect, it } from "vitest";
import { countOrderStatusTabs, isConfirmedOrderStatus } from "./order-status";

describe("order status tabs", () => {
  it("treats request pending-order and ordered statuses as confirmed tab", () => {
    expect(isConfirmedOrderStatus("requests", "草稿")).toBe(false);
    expect(isConfirmedOrderStatus("requests", "待下单")).toBe(true);
    expect(isConfirmedOrderStatus("requests", "已下单")).toBe(true);
  });

  it("treats purchase confirmed status as confirmed tab", () => {
    expect(isConfirmedOrderStatus("purchase", "草稿")).toBe(false);
    expect(isConfirmedOrderStatus("purchase", "已确认")).toBe(true);
  });

  it("keeps legacy encoded statuses compatible", () => {
    expect(isConfirmedOrderStatus("requests", "寰呬笅鍗?")).toBe(true);
    expect(isConfirmedOrderStatus("requests", "宸蹭笅鍗?")).toBe(true);
    expect(isConfirmedOrderStatus("purchase", "宸茬‘璁?")).toBe(true);
  });

  it("counts draft and confirmed tabs by mode", () => {
    expect(
      countOrderStatusTabs("requests", [
        { status: "草稿" },
        { status: "待下单" },
        { status: "已下单" },
      ]),
    ).toEqual({ draft: 1, confirmed: 2 });
  });
});
