import { describe, expect, it } from "vitest";
import { summarizeQuotationDetails } from "./quotation-detail-summary";

describe("quotation detail summaries", () => {
  it("sums quantities, groups original purchase totals by currency, and sums USD amounts", () => {
    const summary = summarizeQuotationDetails([
      { quantity: 2, purchaseCurrency: "CNY", purchaseTotalOriginal: 1300, purchaseTotalUsd: 200, cifUsd: 220, amount: 300, operatingProfitUsd: 80 },
      { quantity: 3, purchaseCurrency: "USD", purchaseTotalOriginal: 500, purchaseTotalUsd: 500, cifUsd: 510, amount: 650, operatingProfitUsd: 140 },
    ]);

    expect(summary).toEqual({
      quantity: 5,
      purchaseTotalOriginalByCurrency: { CNY: 1300, USD: 500 },
      totals: { purchaseTotalUsd: 700, cifUsd: 730, amount: 950, operatingProfitUsd: 220 },
    });
  });
});
