import { describe, expect, it } from "vitest";
import { businessRate, contractTarget, financialAmounts, progressLabel, readBusinessRequest, validateAllocationTotals } from "./prepayment-finance";
describe("prepayment financial rules", () => {
  it("does not infer tax basis for existing contracts", () => {
    expect(contractTarget(106000,null,null)).toBeNull();
    expect(progressLabel(0,null,"开票")).toBe("待设置口径");
    expect(contractTarget(100000,"net",6)).toBe(106000);
    expect(contractTarget(106000,"gross",6)).toBe(106000);
    expect(() => contractTarget(106000,"gross",null)).toThrow("税率");
  });
  it("supports partial receipts and explicit zero tax without accumulating rounding errors", () => {
    expect(financialAmounts(53000,6)).toEqual({amountExcludingTax:50000,taxRate:6,taxAmount:3000,amountIncludingTax:53000});
    expect(financialAmounts(0.3,0).amountIncludingTax).toBe(0.3);
    expect(validateAllocationTotals(0.3,[{amount:0.1},{amount:0.2}])).toBe(0.3);
    expect(() => validateAllocationTotals(0.3,[{amount:0.31}])).toThrow("超过");
    expect(() => validateAllocationTotals(10,[{amount:-1}])).toThrow("非负");
  });
  it("requires an explicit exchange rate when currencies differ", () => {
    expect(businessRate("CNY","CNY",null)).toBe(1);
    expect(businessRate("USD","CNY","7.1")).toBe(7.1);
    expect(() => businessRate("USD","CNY","")).toThrow("汇率");
    expect(() => businessRate("USD","CNY","0")).toThrow("正数");
  });
  it("derives independent invoice and collection states", () => {
    expect(progressLabel(53000,106000,"开票")).toBe("部分开票");
    expect(progressLabel(30000,106000,"收款")).toBe("部分收款");
    expect(progressLabel(106000,106000,"开票")).toBe("已开票");
    expect(progressLabel(0,106000,"收款")).toBe("未收款");
  });
  it("rejects missing or malformed approval snapshots", () => {
    expect(readBusinessRequest("garbage")).toBeNull();
    expect(readBusinessRequest('{"currency":"CNY","amountIncludingTax":"0"}')).toBeNull();
    expect(readBusinessRequest({currency:"USD",amountIncludingTax:"100",businessExchangeRate:"7"})).toMatchObject({businessExchangeRate:"7"});
  });
});
