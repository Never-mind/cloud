import { describe, expect, it } from "vitest";
import { normalizeSettlementStatus, settlementAmounts, settlementInvoiceDraftDefaults } from "./settlement-project-service";

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

describe("集采开票金额默认值", () => {
  it("没开过票时按全额预计收入打底", () => {
    expect(settlementInvoiceDraftDefaults({ revenueNet: 1000, issuedNet: 0, previousTaxRate: null }))
      .toEqual({ revenueNet: 1000, issuedNet: 0, remainingNet: 1000, netAmount: 1000, taxRate: 16, invoiceTotal: 1160 });
  });

  it("部分开票时按未开票余额打底，并沿用上一张票的税率", () => {
    expect(settlementInvoiceDraftDefaults({ revenueNet: 1000, issuedNet: 400, previousTaxRate: 8 }))
      .toEqual({ revenueNet: 1000, issuedNet: 400, remainingNet: 600, netAmount: 600, taxRate: 8, invoiceTotal: 648 });
  });

  it("已开满时回到全额预计收入，金额按分保留", () => {
    expect(settlementInvoiceDraftDefaults({ revenueNet: 865.48, issuedNet: 865.83, previousTaxRate: 16 }))
      .toEqual({ revenueNet: 865.48, issuedNet: 865.83, remainingNet: -0.35, netAmount: 865.48, taxRate: 16, invoiceTotal: 1003.96 });
  });
});
