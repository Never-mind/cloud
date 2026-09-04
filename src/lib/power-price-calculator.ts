export type PowerPriceInputs = {
  capexWithoutVatCny: number;
  onsiteRmaRate: number;
  fundingAnnualRate: number;
  fundingMonths: number;
  transportClearanceRate: number;
  handlingRate: number;
  otherTaxRate: number;
  exchangeRate: number;
  serviceVatRate: number;
  benchmarkCapexCny: number;
  first24BaseFeeCny: number;
  next36BaseFeeCny: number;
};

export type PowerPriceContext = {
  countryCode: string;
  b6Type?: string;
  deviceCode: string;
  purchaseCurrency: string;
  taxExcludedUnitPrice: number;
  taxSurcharge: number;
  exchangeRate?: number;
};

export type PowerPriceDefaults = {
  countryCode: string;
  countryName: string;
  autoCapexSupported: boolean;
  conversionHint: string;
  inputs: PowerPriceInputs;
};

export type PowerPriceCalculation = {
  fundingCostCny: number;
  capexTotalCny: number;
  ddpPriceCny: number;
  opexCny: number;
  first24NoVatCny: number;
  next36NoVatCny: number;
  first24NoVatContract: number;
  next36NoVatContract: number;
  first24VatIncluded: number;
  next36VatIncluded: number;
};

export type PowerPricingSnapshot = {
  formulaVersion: "power-service-v1";
  countryCode: string;
  deviceCode: string;
  b6Type: string;
  purchaseCurrency: string;
  contractCurrency: "USD";
  inputs: PowerPriceInputs;
  manualInputKeys: Array<keyof PowerPriceInputs>;
  manualPrices: {
    first24VatIncluded?: number;
    next36VatIncluded?: number;
  };
  result: PowerPriceCalculation;
};

type CountryTemplate = Omit<PowerPriceInputs, "capexWithoutVatCny" | "onsiteRmaRate" | "fundingAnnualRate" | "fundingMonths" | "exchangeRate"> & {
  countryName: string;
};

const DEFAULT_EXCHANGE_RATE = 0.1476642241;

const COUNTRY_TEMPLATES: Record<string, CountryTemplate> = {
  MX: {
    countryName: "墨西哥",
    transportClearanceRate: 0.02,
    handlingRate: 0,
    otherTaxRate: 0,
    serviceVatRate: 0.16,
    benchmarkCapexCny: 88496,
    first24BaseFeeCny: 3978.4,
    next36BaseFeeCny: 24.8,
  },
  CL: {
    countryName: "智利",
    transportClearanceRate: 0.02,
    handlingRate: 0,
    otherTaxRate: 0,
    serviceVatRate: 0.19,
    benchmarkCapexCny: 88496,
    first24BaseFeeCny: 3978.4,
    next36BaseFeeCny: 24.8,
  },
  BR: {
    countryName: "巴西",
    transportClearanceRate: 0.16,
    handlingRate: 0.09,
    otherTaxRate: 0.57,
    serviceVatRate: 0,
    benchmarkCapexCny: 88496,
    first24BaseFeeCny: 3978.4,
    next36BaseFeeCny: 24.8,
  },
};

const COUNTRY_NAMES: Record<string, string> = {
  MX: "墨西哥",
  CL: "智利",
  BR: "巴西",
};

export const POWER_PRICE_INPUT_KEYS = [
  "capexWithoutVatCny",
  "onsiteRmaRate",
  "fundingAnnualRate",
  "fundingMonths",
  "transportClearanceRate",
  "handlingRate",
  "otherTaxRate",
  "exchangeRate",
  "serviceVatRate",
  "benchmarkCapexCny",
  "first24BaseFeeCny",
  "next36BaseFeeCny",
] as const satisfies ReadonlyArray<keyof PowerPriceInputs>;

export function normalizePowerCountryCode(value: unknown) {
  const source = String(value ?? "").trim().toUpperCase();
  if (source === "墨西哥") return "MX";
  if (source === "智利") return "CL";
  if (source === "巴西") return "BR";
  return source.split("-")[0] || source;
}

export function getPowerPriceDefaults(context: PowerPriceContext): PowerPriceDefaults {
  const countryCode = normalizePowerCountryCode(context.countryCode);
  const template = COUNTRY_TEMPLATES[countryCode] ?? COUNTRY_TEMPLATES.MX;
  const exchangeRate = positiveNumber(context.exchangeRate) || DEFAULT_EXCHANGE_RATE;
  const purchaseCurrency = String(context.purchaseCurrency ?? "").trim().toUpperCase();
  const purchaseTotal = numberValue(context.taxExcludedUnitPrice) + numberValue(context.taxSurcharge);
  const autoCapexSupported = purchaseCurrency === "CNY" || purchaseCurrency === "USD";
  const capexWithoutVatCny = purchaseCurrency === "USD"
    ? purchaseTotal / exchangeRate
    : purchaseCurrency === "CNY"
      ? purchaseTotal
      : 0;
  const b6Type = String(context.b6Type ?? "").trim().toUpperCase();
  const onsiteRmaRate = b6Type === "B61" ? 0.0433 : 0;
  const fundingMonths = b6Type === "B62-A7" || b6Type === "B63" ? 0 : 2;
  const conversionHint = purchaseCurrency === "USD"
    ? `USD ${formatNumber(purchaseTotal, 4)} ÷ ${formatNumber(exchangeRate, 6)} = CNY ${formatNumber(capexWithoutVatCny, 4)}`
    : purchaseCurrency === "CNY"
      ? `CNY ${formatNumber(purchaseTotal, 4)} 直接作为 CAPEX（不含 VAT）`
      : `采购币种 ${purchaseCurrency || "未填写"} 暂不支持自动换算，请手工填写 CAPEX（不含 VAT，CNY）。`;

  return {
    countryCode,
    countryName: COUNTRY_NAMES[countryCode] ?? (String(context.countryCode ?? "") || "未匹配国家"),
    autoCapexSupported,
    conversionHint,
    inputs: {
      ...template,
      capexWithoutVatCny,
      onsiteRmaRate,
      fundingAnnualRate: 0.04,
      fundingMonths,
      exchangeRate,
    },
  };
}

export function calculatePowerServicePrice(input: PowerPriceInputs): PowerPriceCalculation {
  const capexWithoutVatCny = numberValue(input.capexWithoutVatCny);
  const fundingCostCny = capexWithoutVatCny * numberValue(input.fundingAnnualRate) * Math.max(0, Math.trunc(numberValue(input.fundingMonths))) / 12;
  const capexTotalCny = capexWithoutVatCny * (1 + numberValue(input.onsiteRmaRate)) + fundingCostCny;
  const ddpPriceCny = capexTotalCny * (1 + numberValue(input.transportClearanceRate)) * (1 + numberValue(input.handlingRate) + numberValue(input.otherTaxRate));
  const opexCny = ddpPriceCny - capexTotalCny;
  const benchmarkCapexCny = numberValue(input.benchmarkCapexCny);
  const first24NoVatCny = benchmarkCapexCny > 0
    ? capexTotalCny / benchmarkCapexCny * numberValue(input.first24BaseFeeCny) + opexCny / 24
    : 0;
  const next36NoVatCny = benchmarkCapexCny > 0
    ? capexTotalCny / benchmarkCapexCny * numberValue(input.next36BaseFeeCny)
    : 0;
  const exchangeRate = numberValue(input.exchangeRate);
  const first24NoVatContractRaw = first24NoVatCny * exchangeRate;
  const next36NoVatContractRaw = next36NoVatCny * exchangeRate;

  return {
    fundingCostCny: round(fundingCostCny, 4),
    capexTotalCny: round(capexTotalCny, 4),
    ddpPriceCny: round(ddpPriceCny, 4),
    opexCny: round(opexCny, 4),
    first24NoVatCny: round(first24NoVatCny, 4),
    next36NoVatCny: round(next36NoVatCny, 4),
    first24NoVatContract: round(first24NoVatContractRaw, 2),
    next36NoVatContract: round(next36NoVatContractRaw, 2),
    first24VatIncluded: round(first24NoVatContractRaw * (1 + numberValue(input.serviceVatRate)), 2),
    next36VatIncluded: round(next36NoVatContractRaw * (1 + numberValue(input.serviceVatRate)), 2),
  };
}

export function buildPowerPricingSnapshot(
  context: PowerPriceContext,
  options: {
    manualInputKeys?: Array<keyof PowerPriceInputs>;
    manualInputs?: Partial<PowerPriceInputs>;
    manualPrices?: PowerPricingSnapshot["manualPrices"];
  } = {},
): PowerPricingSnapshot {
  const defaults = getPowerPriceDefaults(context);
  const manualInputKeys = uniqueInputKeys(options.manualInputKeys ?? []);
  const inputs = { ...defaults.inputs };
  for (const key of manualInputKeys) {
    const manualValue = options.manualInputs?.[key];
    if (manualValue !== undefined && Number.isFinite(Number(manualValue))) inputs[key] = Number(manualValue);
  }
  const calculated = calculatePowerServicePrice(inputs);
  const manualPrices = normalizeManualPrices(options.manualPrices);

  return {
    formulaVersion: "power-service-v1",
    countryCode: defaults.countryCode,
    deviceCode: String(context.deviceCode ?? "").trim(),
    b6Type: String(context.b6Type ?? "").trim(),
    purchaseCurrency: String(context.purchaseCurrency ?? "").trim().toUpperCase(),
    contractCurrency: "USD",
    inputs,
    manualInputKeys,
    manualPrices,
    result: {
      ...calculated,
      first24VatIncluded: manualPrices.first24VatIncluded ?? calculated.first24VatIncluded,
      next36VatIncluded: manualPrices.next36VatIncluded ?? calculated.next36VatIncluded,
    },
  };
}

export function refreshPowerPricingSnapshot(context: PowerPriceContext, value: unknown) {
  const existing = parsePowerPricingSnapshot(value);
  if (!existing) return buildPowerPricingSnapshot(context);
  return buildPowerPricingSnapshot(context, {
    manualInputKeys: existing.manualInputKeys,
    manualInputs: existing.inputs,
    manualPrices: existing.manualPrices,
  });
}

export function parsePowerPricingSnapshot(value: unknown): PowerPricingSnapshot | null {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  if (!record.inputs || typeof record.inputs !== "object") return null;
  const sourceInputs = record.inputs as Record<string, unknown>;
  const inputs = {} as PowerPriceInputs;
  for (const key of POWER_PRICE_INPUT_KEYS) inputs[key] = numberValue(sourceInputs[key]);
  const calculated = calculatePowerServicePrice(inputs);
  const sourceResult = record.result && typeof record.result === "object" ? record.result as Record<string, unknown> : {};
  const manualPrices = normalizeManualPrices(record.manualPrices);
  const manualInputKeys = uniqueInputKeys(Array.isArray(record.manualInputKeys) ? record.manualInputKeys as string[] : []);

  return {
    formulaVersion: "power-service-v1",
    countryCode: normalizePowerCountryCode(record.countryCode),
    deviceCode: String(record.deviceCode ?? ""),
    b6Type: String(record.b6Type ?? ""),
    purchaseCurrency: String(record.purchaseCurrency ?? ""),
    contractCurrency: "USD",
    inputs,
    manualInputKeys,
    manualPrices,
    result: {
      ...calculated,
      ...Object.fromEntries(Object.keys(calculated).map((key) => [key, numberValue(sourceResult[key])])),
      first24VatIncluded: manualPrices.first24VatIncluded ?? numberValue(sourceResult.first24VatIncluded, calculated.first24VatIncluded),
      next36VatIncluded: manualPrices.next36VatIncluded ?? numberValue(sourceResult.next36VatIncluded, calculated.next36VatIncluded),
    } as PowerPriceCalculation,
  };
}

export function serializePowerPricingSnapshot(snapshot: PowerPricingSnapshot) {
  return JSON.stringify(snapshot);
}

function uniqueInputKeys(values: readonly string[]) {
  return Array.from(new Set(values.filter((value): value is keyof PowerPriceInputs => POWER_PRICE_INPUT_KEYS.includes(value as keyof PowerPriceInputs))));
}

function normalizeManualPrices(value: unknown): PowerPricingSnapshot["manualPrices"] {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const first24VatIncluded = optionalNumber(source.first24VatIncluded);
  const next36VatIncluded = optionalNumber(source.next36VatIncluded);
  return {
    ...(first24VatIncluded === undefined ? {} : { first24VatIncluded }),
    ...(next36VatIncluded === undefined ? {} : { next36VatIncluded }),
  };
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function positiveNumber(value: unknown) {
  const parsed = numberValue(value);
  return parsed > 0 ? parsed : 0;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function formatNumber(value: number, digits: number) {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
