export type SettlementEntrySummaryItem = {
  amount: number;
  currency: string;
  priceType: string;
  taxRate: number;
};

export type SettlementEntryExchangeRates = {
  exchangeRateUsd: number;
  exchangeRateMxn: number;
};

export type SettlementEntryAmounts = {
  taxExcludedUsd: number;
  taxIncludedUsd: number;
};

export type SettlementEntrySummary = {
  amountTotalsByCurrency: Record<string, number>;
  taxExcludedUsd: number;
  taxIncludedUsd: number;
};

function numberValue(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundMoney(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function convertToUsd(amount: number, currency: string, exchangeRates: SettlementEntryExchangeRates) {
  if (currency === "USD") return amount;
  if (currency === "MXN") return exchangeRates.exchangeRateMxn ? amount * exchangeRates.exchangeRateMxn : 0;
  return exchangeRates.exchangeRateUsd ? amount / exchangeRates.exchangeRateUsd : 0;
}

export function calculateSettlementEntryAmounts(
  item: SettlementEntrySummaryItem,
  exchangeRates: SettlementEntryExchangeRates,
): SettlementEntryAmounts {
  const amount = numberValue(item.amount);
  const taxRate = numberValue(item.taxRate) / 100;
  const taxIncluded = item.priceType === "tax_included" ? amount : amount * (1 + taxRate);
  const taxExcluded = item.priceType === "tax_included" ? amount / (1 + taxRate || 1) : amount;

  return {
    taxExcludedUsd: roundMoney(convertToUsd(taxExcluded, item.currency || "USD", exchangeRates)),
    taxIncludedUsd: roundMoney(convertToUsd(taxIncluded, item.currency || "USD", exchangeRates)),
  };
}

export function summarizeSettlementEntries(
  items: SettlementEntrySummaryItem[],
  exchangeRates: SettlementEntryExchangeRates,
): SettlementEntrySummary {
  return items.reduce<SettlementEntrySummary>(
    (summary, item) => {
      const currency = item.currency || "USD";
      const amounts = calculateSettlementEntryAmounts(item, exchangeRates);
      summary.amountTotalsByCurrency[currency] = roundMoney(
        numberValue(summary.amountTotalsByCurrency[currency]) + numberValue(item.amount),
      );
      summary.taxExcludedUsd = roundMoney(summary.taxExcludedUsd + amounts.taxExcludedUsd);
      summary.taxIncludedUsd = roundMoney(summary.taxIncludedUsd + amounts.taxIncludedUsd);
      return summary;
    },
    {
      amountTotalsByCurrency: {},
      taxExcludedUsd: 0,
      taxIncludedUsd: 0,
    },
  );
}
