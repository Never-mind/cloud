export type CloudCollectionRow = Record<string, unknown>;

export function collectionCurrency(row: CloudCollectionRow) {
  return String(row.collectionCurrency || "USD").trim().toUpperCase() || "USD";
}

export function collectionAmount(row: CloudCollectionRow) {
  return Number(row.collectionTotalAmount ?? 0) || 0;
}

/**
 * 收款金额折合 USD。
 * collectionExchangeRate 的口径是「1 USD = X 收款币种」，所以非 USD 要除以汇率。
 * 没有汇率时返回 null，不能用 1 假装成 USD。
 */
export function collectionUsdAmount(row: CloudCollectionRow): number | null {
  const currency = collectionCurrency(row);
  const amount = collectionAmount(row);
  if (currency === "USD") return amount;
  const rate = Number(row.collectionExchangeRate ?? 0);
  return rate > 0 ? amount / rate : null;
}

export function collectionStatus(row: CloudCollectionRow): "paid" | "partial" | "open" {
  if (Number(row.collected) === 1) return "paid";
  const receivable = Number(row.customerReceivableTotalAmount ?? row.customerReceivable ?? 0) || 0;
  const collectedUsd = collectionUsdAmount(row);
  if (collectedUsd !== null && receivable > 0 && collectedUsd >= receivable - 0.01) return "paid";
  return collectionAmount(row) > 0 ? "partial" : "open";
}
