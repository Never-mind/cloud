export type PurchasePriceReference = {
  countryCode?: string | null;
  deviceCode?: string | null;
  contractNo: string;
  dateSigned?: string | null;
  currency?: string | null;
  first24MonthPriceUSD?: number | string | null;
  next36MonthPriceUSD?: number | string | null;
};

export type PurchasePriceComparisonFields = {
  latestInstanceContractNo: string;
  latestInstanceContractDateSigned: string | null;
  first24PriceDifference: number | null;
  next36PriceDifference: number | null;
};

export type PurchasePriceComparison = {
  difference: number | null;
  relation: "higher" | "lower" | "same" | "unavailable";
};

export function comparePurchasePrices(
  current: unknown,
  benchmark: unknown,
) {
  const currentValue = numberValue(current);
  const benchmarkValue = optionalNumber(benchmark);
  if (benchmarkValue === null) return null;
  return round(currentValue - benchmarkValue, 2);
}

export function getPurchasePriceComparison(current: unknown, benchmark: unknown): PurchasePriceComparison {
  const difference = comparePurchasePrices(current, benchmark);
  if (difference === null) return { difference: null, relation: "unavailable" };
  return {
    difference,
    relation: difference > 0 ? "higher" : difference < 0 ? "lower" : "same",
  };
}

export function buildPurchasePriceComparison(
  currentFirst24: unknown,
  currentNext36: unknown,
  reference?: PurchasePriceReference | null,
): PurchasePriceComparisonFields | null {
  if (!reference) return null;
  return {
    latestInstanceContractNo: String(reference.contractNo ?? ""),
    latestInstanceContractDateSigned: reference.dateSigned ? String(reference.dateSigned) : null,
    first24PriceDifference: comparePurchasePrices(currentFirst24, reference.first24MonthPriceUSD),
    next36PriceDifference: comparePurchasePrices(currentNext36, reference.next36MonthPriceUSD),
  };
}

export function getPurchasePriceReferenceKey(countryCode: unknown, deviceCode: unknown) {
  return `${normalizeCountryCode(countryCode)}::${String(deviceCode ?? "").trim()}`;
}

function normalizeCountryCode(value: unknown) {
  const source = String(value ?? "").trim().toUpperCase();
  if (source === "墨西哥") return "MX";
  if (source === "智利") return "CL";
  if (source === "巴西") return "BR";
  return source.split("-")[0];
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
