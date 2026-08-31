export type QuotationDetailSummaryRow = Record<string, unknown>;

export type QuotationDetailSummary = {
  quantity: number;
  purchaseTotalOriginalByCurrency: Record<string, number>;
  totals: Record<string, number>;
};

const usdAmountFields = [
  "purchaseTotalUsd",
  "firstMileFreightUsd",
  "cifUsd",
  "tariffUsd",
  "capitalCostUsd",
  "customsFeeUsd",
  "nomFeeUsd",
  "publicFeeAllocationUsd",
  "ddpTotalUsd",
  "amount",
  "operatingProfitUsd",
];

function numberValue(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundValue(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

export function summarizeQuotationDetails(rows: QuotationDetailSummaryRow[]): QuotationDetailSummary {
  return rows.reduce<QuotationDetailSummary>(
    (summary, row) => {
      summary.quantity = roundValue(summary.quantity + numberValue(row.quantity));

      const currency = String(row.purchaseCurrency ?? "").trim() || "USD";
      summary.purchaseTotalOriginalByCurrency[currency] = roundValue(
        numberValue(summary.purchaseTotalOriginalByCurrency[currency]) + numberValue(row.purchaseTotalOriginal),
      );

      for (const field of usdAmountFields) {
        if (row[field] !== null && row[field] !== undefined && String(row[field]).trim() !== "") {
          summary.totals[field] = roundValue(numberValue(summary.totals[field]) + numberValue(row[field]));
        }
      }
      return summary;
    },
    { quantity: 0, purchaseTotalOriginalByCurrency: {}, totals: {} },
  );
}
