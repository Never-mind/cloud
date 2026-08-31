import { describe, expect, it } from "vitest";
import { summarizeSettlementEntries } from "./settlement-entry-summary";

describe("settlement expense and sales summaries", () => {
  it("groups original amounts by currency and calculates USD totals independently", () => {
    const summary = summarizeSettlementEntries(
      [
        { amount: 100, currency: "USD", priceType: "tax_excluded", taxRate: 16 },
        { amount: 226, currency: "CNY", priceType: "tax_included", taxRate: 13 },
      ],
      { exchangeRateUsd: 6.5, exchangeRateMxn: 0.06 },
    );

    expect(summary).toEqual({
      amountTotalsByCurrency: { USD: 100, CNY: 226 },
      taxExcludedUsd: 130.7692,
      taxIncludedUsd: 150.7692,
    });
  });
});
