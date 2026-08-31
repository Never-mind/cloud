export type QuotationCalculationParams = {
  exchangeRateUsd?: number | null;
  exchangeRateMxn?: number | null;
  capitalCostRate?: number | null;
  accountPeriod?: number | null;
  badDebtRate?: number | null;
  customsFeeRate?: number | null;
  vatOverseas?: number | null;
  markupRate?: number | null;
  seaFreightRate?: number | null;
  airFreightRate?: number | null;
  nomFee?: number | null;
  customsMiscFee?: number | null;
  lastMileFee?: number | null;
  storageOperationFee?: number | null;
  implementationFee?: number | null;
};

export type QuotationProductSnapshot = {
  productMasterId?: string | null;
  productCode?: string | null;
  productName?: string | null;
  brand?: string | null;
  specification?: string | null;
  category?: string | null;
  unit?: string | null;
  suggestedPurchaseUnitPrice?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  grossWeight?: number | null;
  tariffRate?: number | null;
  needNom?: number | boolean | null;
};

export type QuotationCalculationInput = {
  id?: string | null;
  lineNo?: number | null;
  productCode?: string | null;
  productName?: string | null;
  brand?: string | null;
  productMasterId?: string | null;
  productModelId?: string | null;
  productSpecId?: string | null;
  quantity?: number | null;
  purchaseCurrency?: string | null;
  purchaseUnitPrice?: number | null;
  targetUnitPrice?: number | null;
  currency?: string | null;
  transportType?: string | null;
  isCustomsClearance?: number | boolean | null;
  enableNom?: number | boolean | null;
  ddpQuoteUnitUsd?: number | null;
  markupRate?: number | null;
  remark?: string | null;
  historicalDdpQuoteUsd?: number | null;
  product?: QuotationProductSnapshot | null;
};

export type CalculatedQuotationItem = QuotationCalculationInput & {
  productCode: string;
  productName: string;
  brand: string;
  quantity: number;
  purchaseCurrency: string;
  purchaseUnitPrice: number;
  purchaseTotalOriginal: number;
  purchaseTotalUsd: number;
  transportType: "air" | "sea" | "none";
  isCustomsClearance: boolean;
  firstMileFreightUsd: number;
  cifUsd: number;
  tariffRate: number;
  tariffUsd: number;
  capitalCostUsd: number;
  customsFeeUsd: number;
  nomFeeUsd: number;
  publicFeeAllocationUsd: number;
  ddpTotalUsd: number;
  ddpUnitPriceUsd: number;
  ddpQuoteUnitUsd: number | null;
  unitPrice: number;
  amount: number;
  revenueUsd: number;
  operatingProfitUsd: number;
  grossMarginRate: number;
  markupRate: number;
  enableNom: boolean;
  currency: string;
};

export type CalculatedQuotation = {
  publicFeeTotal: number;
  totalCifUsd: number;
  totalDdpUsd: number;
  totalRevenueUsd: number;
  totalProfitUsd: number;
  grossMarginRate: number;
  items: CalculatedQuotationItem[];
};

export function calculateQuotation(
  params: QuotationCalculationParams,
  inputs: QuotationCalculationInput[],
): CalculatedQuotation {
  const publicFeeTotal = round(
    number(params.customsMiscFee)
      + number(params.lastMileFee)
      + number(params.storageOperationFee)
      + number(params.implementationFee),
  );
  const baseItems = inputs.map((input) => calculateBaseItem(params, input));
  const totalCifUsd = baseItems.reduce((sum, item) => sum + item.cifUsd, 0);
  const items = baseItems.map((item) => {
    const allocation = totalCifUsd > 0 ? publicFeeTotal * item.cifUsd / totalCifUsd : 0;
    const ddpTotalUsd = item.baseDdpTotalUsd + allocation;
    const ddpUnitPriceUsd = safeDivide(ddpTotalUsd, item.quantity);
    const manualQuote = optionalNumber(item.input.ddpQuoteUnitUsd);
    const markupRate = manualQuote === undefined
      ? number(item.input.markupRate ?? params.markupRate)
      : ddpUnitPriceUsd > 0 ? (manualQuote / ddpUnitPriceUsd - 1) * 100 : 0;
    const unitPrice = manualQuote ?? ddpUnitPriceUsd * (1 + markupRate / 100);
    const revenueUsd = unitPrice * item.quantity;
    const operatingProfitUsd = revenueUsd - ddpTotalUsd;
    return roundObject({
      ...item.input,
      id: item.input.id ?? null,
      lineNo: number(item.input.lineNo),
      productCode: item.productCode,
      productName: item.productName,
      brand: item.brand,
      productMasterId: item.input.productMasterId ?? item.input.product?.productMasterId ?? null,
      quantity: item.quantity,
      purchaseCurrency: item.purchaseCurrency,
      purchaseUnitPrice: item.purchaseUnitPrice,
      purchaseTotalOriginal: item.purchaseTotalOriginal,
      purchaseTotalUsd: item.purchaseTotalUsd,
      transportType: item.transportType,
      isCustomsClearance: item.isCustomsClearance,
      firstMileFreightUsd: item.firstMileFreightUsd,
      cifUsd: item.cifUsd,
      tariffRate: item.tariffRate,
      tariffUsd: item.tariffUsd,
      capitalCostUsd: item.capitalCostUsd,
      customsFeeUsd: item.customsFeeUsd,
      nomFeeUsd: item.nomFeeUsd,
      publicFeeAllocationUsd: allocation,
      ddpTotalUsd,
      ddpUnitPriceUsd,
      ddpQuoteUnitUsd: manualQuote ?? null,
      unitPrice,
      amount: revenueUsd,
      revenueUsd,
      operatingProfitUsd,
      grossMarginRate: revenueUsd > 0 ? operatingProfitUsd / revenueUsd : 0,
      markupRate,
      enableNom: item.enableNom,
      currency: item.input.currency ?? "USD",
    }) as CalculatedQuotationItem;
  });
  const totalDdpUsd = items.reduce((sum, item) => sum + item.ddpTotalUsd, 0);
  const totalRevenueUsd = items.reduce((sum, item) => sum + item.revenueUsd, 0);
  const totalProfitUsd = items.reduce((sum, item) => sum + item.operatingProfitUsd, 0);
  return {
    publicFeeTotal,
    totalCifUsd: round(totalCifUsd),
    totalDdpUsd: round(totalDdpUsd),
    totalRevenueUsd: round(totalRevenueUsd),
    totalProfitUsd: round(totalProfitUsd),
    grossMarginRate: totalRevenueUsd > 0 ? round(totalProfitUsd / totalRevenueUsd) : 0,
    items,
  };
}

function calculateBaseItem(params: QuotationCalculationParams, input: QuotationCalculationInput) {
  const product = input.product ?? {};
  const quantity = number(input.quantity);
  const purchaseCurrency = String(input.purchaseCurrency ?? input.currency ?? "CNY").trim().toUpperCase() || "CNY";
  const purchaseUnitPrice = number(input.purchaseUnitPrice ?? input.targetUnitPrice ?? product.suggestedPurchaseUnitPrice);
  const purchaseTotalOriginal = quantity * purchaseUnitPrice;
  const purchaseTotalUsd = convertToUsd(purchaseTotalOriginal, purchaseCurrency, params);
  const length = number(product.length);
  const width = number(product.width);
  const height = number(product.height);
  const grossWeight = number(product.grossWeight);
  const volumetricWeight = length * width * height / 6000;
  const chargeableWeight = Math.max(volumetricWeight, grossWeight);
  const transportType = normalizeTransport(input.transportType);
  const firstMileFreightCny = transportType === "air"
    ? chargeableWeight * number(params.airFreightRate) * quantity
    : transportType === "sea"
      ? length * width * height / 1_000_000 * number(params.seaFreightRate) * quantity
      : 0;
  const firstMileFreightUsd = safeDivide(firstMileFreightCny, number(params.exchangeRateUsd));
  const cifUsd = purchaseTotalUsd + firstMileFreightUsd;
  const isCustomsClearance = asBoolean(input.isCustomsClearance);
  const tariffRate = isCustomsClearance ? number(input.product?.tariffRate) : 0;
  const tariffUsd = cifUsd * tariffRate / 100;
  const capitalCostUsd = cifUsd * number(params.capitalCostRate) / 100 * number(params.accountPeriod) / 12;
  const customsFeeUsd = isCustomsClearance ? cifUsd * number(params.customsFeeRate) / 100 : 0;
  const enableNom = asBoolean(input.enableNom ?? product.needNom);
  const nomFeeUsd = enableNom && isCustomsClearance ? number(params.nomFee) : 0;
  return {
    input,
    productCode: String(input.productCode ?? product.productCode ?? "").trim(),
    productName: String(product.productName ?? input.productName ?? "").trim(),
    brand: String(product.brand ?? input.brand ?? "").trim(),
    quantity,
    purchaseCurrency,
    purchaseUnitPrice,
    purchaseTotalOriginal,
    purchaseTotalUsd,
    transportType,
    isCustomsClearance,
    firstMileFreightUsd,
    cifUsd,
    tariffRate,
    tariffUsd,
    capitalCostUsd,
    customsFeeUsd,
    nomFeeUsd,
    enableNom,
    baseDdpTotalUsd: cifUsd + tariffUsd + capitalCostUsd + customsFeeUsd + nomFeeUsd,
  };
}

function normalizeTransport(value: unknown): "air" | "sea" | "none" {
  const text = String(value ?? "sea").trim().toLowerCase();
  return text === "air" || text === "none" ? text : "sea";
}

function convertToUsd(value: number, currency: string, params: QuotationCalculationParams) {
  if (currency === "USD") return value;
  if (currency === "MXN") return value * number(params.exchangeRateMxn);
  return safeDivide(value, number(params.exchangeRateUsd));
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes" || text === "是";
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeDivide(value: number, divisor: number) {
  return divisor ? value / divisor : 0;
}

function round(value: number) {
  return Number(value.toFixed(4));
}

function roundObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, typeof entry === "number" ? round(entry) : entry])) as T;
}
