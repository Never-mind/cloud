import { describe, expect, it } from "vitest";
import { getChildGroupKey, isGroupOpen, toggleGroup } from "./nav-utils";

describe("sidebar group state", () => {
  it("keeps menu groups hidden by default", () => {
    expect(isGroupOpen({}, "基础信息")).toBe(false);
  });

  it("toggles a first-level group without changing other groups", () => {
    const state = toggleGroup({ 基础信息: false, 采购管理: false }, "基础信息");

    expect(state).toEqual({ 基础信息: true, 采购管理: false });
    expect(isGroupOpen(state, "基础信息")).toBe(true);
    expect(isGroupOpen(state, "采购管理")).toBe(false);
  });

  it("toggles child groups with a parent scoped key", () => {
    const childKey = getChildGroupKey("财务管理", "月账单管理");
    const state = toggleGroup({}, childKey);

    expect(childKey).toBe("财务管理::月账单管理");
    expect(isGroupOpen(state, childKey)).toBe(true);
    expect(isGroupOpen(state, getChildGroupKey("合同管理", "月账单管理"))).toBe(false);
  });
});
