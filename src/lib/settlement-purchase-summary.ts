export type SettlementPurchaseSummaryItem = {
  plannedQty: number;
  purchaseQty: number;
  purchaseUnitPrice: number;
  currency: string;
  priceType: string;
  taxRate: number;
};

export type SettlementPurchaseExchangeRates = {
  exchangeRateUsd: number;
  exchangeRateMxn: number;
};

export type SettlementPurchaseAmounts = {
  purchaseTotal: number;
  taxExcludedUsd: number;
  taxIncludedUsd: number;
};

export type SettlementPurchaseSummary = {
  plannedQty: number;
  purchaseQty: number;
  purchaseTotalsByCurrency: Record<string, number>;
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

function convertToUsd(amount: number, currency: string, exchangeRates: SettlementPurchaseExchangeRates) {
  if (currency === "USD") return amount;
  if (currency === "MXN") return exchangeRates.exchangeRateMxn ? amount * exchangeRates.exchangeRateMxn : 0;
  return exchangeRates.exchangeRateUsd ? amount / exchangeRates.exchangeRateUsd : 0;
}

export function calculateSettlementPurchaseAmounts(
  item: SettlementPurchaseSummaryItem,
  exchangeRates: SettlementPurchaseExchangeRates,
): SettlementPurchaseAmounts {
  const purchaseTotal = roundMoney(numberValue(item.purchaseQty) * numberValue(item.purchaseUnitPrice));
  const taxRate = numberValue(item.taxRate) / 100;
  const taxIncluded = item.priceType === "tax_included" ? purchaseTotal : purchaseTotal * (1 + taxRate);
  const taxExcluded = item.priceType === "tax_included" ? purchaseTotal / (1 + taxRate || 1) : purchaseTotal;

  return {
    purchaseTotal,
    taxExcludedUsd: roundMoney(convertToUsd(taxExcluded, item.currency || "USD", exchangeRates)),
    taxIncludedUsd: roundMoney(convertToUsd(taxIncluded, item.currency || "USD", exchangeRates)),
  };
}

export function summarizeSettlementPurchases(
  items: SettlementPurchaseSummaryItem[],
  exchangeRates: SettlementPurchaseExchangeRates,
): SettlementPurchaseSummary {
  return items.reduce<SettlementPurchaseSummary>(
    (summary, item) => {
      const amounts = calculateSettlementPurchaseAmounts(item, exchangeRates);
      const currency = item.currency || "USD";
      summary.plannedQty = roundMoney(summary.plannedQty + numberValue(item.plannedQty));
      summary.purchaseQty = roundMoney(summary.purchaseQty + numberValue(item.purchaseQty));
      summary.purchaseTotalsByCurrency[currency] = roundMoney(
        numberValue(summary.purchaseTotalsByCurrency[currency]) + amounts.purchaseTotal,
      );
      summary.taxExcludedUsd = roundMoney(summary.taxExcludedUsd + amounts.taxExcludedUsd);
      summary.taxIncludedUsd = roundMoney(summary.taxIncludedUsd + amounts.taxIncludedUsd);
      return summary;
    },
    {
      plannedQty: 0,
      purchaseQty: 0,
      purchaseTotalsByCurrency: {},
      taxExcludedUsd: 0,
      taxIncludedUsd: 0,
    },
  );
}
