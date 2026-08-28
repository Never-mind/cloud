import { describe, expect, it } from "vitest";
import { getEntityConfig, navGroups } from "./modules";

describe("prepayment adjustment module configuration", () => {
  it("registers prepayment write-off adjustments under finance management", () => {
    const config = getEntityConfig("prepayment-writeoff-adjustments");
    const financeGroup = navGroups.find((group) => group.title === "算力系统")?.children?.find((child) => child.title === "财务管理");

    expect(config).toBeDefined();
    expect(config?.route).toBe("/finance/prepayment-writeoff-adjustments");
    expect(financeGroup?.children?.flatMap((child) => child.items.map((item) => item.key))).toContain("prepayment-writeoff-adjustments");
  });

  it("shows adjustment source fields on monthly prepayment write-offs", () => {
    const config = getEntityConfig("monthly-prepayment-writeoffs");
    const keys = config?.listFields.map((field) => field.key);

    expect(keys).toContain("sourceType");
    expect(keys).toContain("adjustmentNo");
  });
});
