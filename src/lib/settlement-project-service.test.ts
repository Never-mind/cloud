import { describe, expect, it } from "vitest";
import { normalizeSettlementStatus, settlementAmounts } from "./settlement-project-service";

describe("项目结算金额", () => {
  it("含税金额同时生成含税和未税 USD 金额", () => {
    expect(settlementAmounts(
      { amount: 113, currency: "CNY", priceType: "tax_included", taxRate: 13 },
      { exchangeRateUsd: 6.5, exchangeRateMxn: 0.38 },
    )).toEqual({ taxIncludedUsd: 17.3846, taxExcludedUsd: 15.3846 });
  });

  it("未税金额按税率补出含税金额", () => {
    expect(settlementAmounts(
      { amount: 100, currency: "USD", priceType: "tax_excluded", taxRate: 13 },
      { exchangeRateUsd: 7, exchangeRateMxn: 0.4 },
    )).toEqual({ taxIncludedUsd: 113, taxExcludedUsd: 100 });
  });
});

describe("项目结算状态", () => {
  it("兼容旧状态并将未知状态收敛到采购中", () => {
    expect(normalizeSettlementStatus("open")).toBe("purchasing");
    expect(normalizeSettlementStatus("completed")).toBe("closed");
    expect(normalizeSettlementStatus("unexpected")).toBe("purchasing");
  });
});
