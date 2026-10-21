import { describe, expect, it } from "vitest";
import { deriveInvoiceTaxAmounts, validateInvoiceTaxAmounts } from "./invoice-tax";

describe("发票税额口径", () => {
  it("未税金额 + 税率推导税金和含税金额", () => {
    expect(deriveInvoiceTaxAmounts({
      netAmount: 1000,
      taxRate: 13,
      taxAmount: null,
      grossAmount: null,
    })).toEqual({ netAmount: 1000, taxRate: 13, taxAmount: 130, grossAmount: 1130 });
  });

  it("未税金额 + 税金推导含税金额和税率", () => {
    expect(deriveInvoiceTaxAmounts({
      netAmount: 1000,
      taxRate: null,
      taxAmount: 130,
      grossAmount: null,
    })).toEqual({ netAmount: 1000, taxRate: 13, taxAmount: 130, grossAmount: 1130 });
  });

  it("含税金额 + 税金反推未税金额和税率", () => {
    expect(deriveInvoiceTaxAmounts({
      netAmount: null,
      taxRate: null,
      taxAmount: 130,
      grossAmount: 1130,
    })).toEqual({ netAmount: 1000, taxRate: 13, taxAmount: 130, grossAmount: 1130 });
  });

  it("四项齐全时保留票面值，不强行改写", () => {
    expect(deriveInvoiceTaxAmounts({
      netAmount: 123893.81,
      taxRate: 13,
      taxAmount: 16106.19,
      grossAmount: 140000,
    })).toEqual({
      netAmount: 123893.81,
      taxRate: 13,
      taxAmount: 16106.19,
      grossAmount: 140000,
    });
  });

  it("未税 + 税金与含税不一致超过 0.01 时拦截", () => {
    expect(validateInvoiceTaxAmounts({
      netAmount: 1000,
      taxRate: 13,
      taxAmount: 130,
      grossAmount: 1130.02,
    })).toContain("不一致");
    expect(validateInvoiceTaxAmounts({
      netAmount: 1000,
      taxRate: 13,
      taxAmount: 130,
      grossAmount: 1130.01,
    })).toBe("");
  });

  it("税率超出 0-100 时拦截", () => {
    expect(validateInvoiceTaxAmounts({
      netAmount: 1000,
      taxRate: 101,
      taxAmount: null,
      grossAmount: null,
    })).toContain("0% 到 100%");
  });
});
