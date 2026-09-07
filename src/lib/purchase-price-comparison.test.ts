import { describe, expect, it } from "vitest";
import { buildPurchasePriceComparison, getPurchasePriceComparison, getPurchasePriceReferenceKey } from "./purchase-price-comparison";

describe("采购算力服务价格对比", () => {
  it("marks prices higher, lower, or equal to the latest contract", () => {
    expect(getPurchasePriceComparison(110, 100)).toEqual({ difference: 10, relation: "higher" });
    expect(getPurchasePriceComparison(90, 100)).toEqual({ difference: -10, relation: "lower" });
    expect(getPurchasePriceComparison(100, 100)).toEqual({ difference: 0, relation: "same" });
    expect(getPurchasePriceComparison(100, null).relation).toBe("unavailable");
  });

  it("builds the comparison fields from the latest contract reference", () => {
    expect(buildPurchasePriceComparison(110.126, 9.874, {
      contractNo: "IC-001",
      dateSigned: "2026-08-01",
      first24MonthPriceUSD: 100,
      next36MonthPriceUSD: 10,
    })).toEqual({
      latestInstanceContractNo: "IC-001",
      latestInstanceContractDateSigned: "2026-08-01",
      first24PriceDifference: 10.13,
      next36PriceDifference: -0.13,
    });
  });

  it("normalizes country and device keys for reference lookups", () => {
    expect(getPurchasePriceReferenceKey("mx-墨西哥", " DEV-001 ")).toBe("MX::DEV-001");
  });
});
