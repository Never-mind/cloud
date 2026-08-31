import { describe, expect, it } from "vitest";
import { summarizeSettlementPurchases } from "./settlement-purchase-summary";

describe("settlement purchase summaries", () => {
  it("keeps original-currency purchase totals separate and sums tax-exclusive and tax-inclusive USD independently", () => {
    const summary = summarizeSettlementPurchases(
      [
        { plannedQty: 1, purchaseQty: 1, purchaseUnitPrice: 100, currency: "USD", priceType: "tax_excluded", taxRate: 16 },
        { plannedQty: 2, purchaseQty: 2, purchaseUnitPrice: 113, currency: "CNY", priceType: "tax_included", taxRate: 13 },
      ],
      { exchangeRateUsd: 6.5, exchangeRateMxn: 0.06 },
    );

    expect(summary).toEqual({
      plannedQty: 3,
      purchaseQty: 3,
      purchaseTotalsByCurrency: { USD: 100, CNY: 226 },
      taxExcludedUsd: 130.7692,
      taxIncludedUsd: 150.7692,
    });
  });
});
