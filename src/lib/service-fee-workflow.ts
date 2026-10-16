import { lookupExchangeRate, toPeriodMonth, type ExchangeRateMap } from "./exchange-rate-service";

export type ServiceFeeBillingRow = {
  id: string;
  writeOffMonth: string;
  countryCode?: string | null;
  batchName?: string | null;
  requestNo?: string | null;
  poNo?: string | null;
  deviceCode?: string | null;
  requestType?: string | null;
  modelCode?: string | null;
  nameEn?: string | null;
  supplierId?: string | null;
  undertakingUnitId?: string | null;
  customerId?: string | null;
  quantity?: number | string | null;
  currency?: string | null;
  vatRate?: number | string | null;
  monthlyAmount?: number | string | null;
  monthlyTotalAmount?: number | string | null;
  ledgerId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ServiceFeePrepaymentRow = {
  id: string;
  writeOffMonth: string;
  countryCode?: string | null;
  batchName?: string | null;
  requestNo?: string | null;
  poNo?: string | null;
  deviceCode?: string | null;
  requestType?: string | null;
  modelCode?: string | null;
  nameEn?: string | null;
  supplierId?: string | null;
  undertakingUnitId?: string | null;
  customerId?: string | null;
  quantity?: number | string | null;
  currency?: string | null;
  vatRate?: number | string | null;
  monthlyAmount?: number | string | null;
  contractNo?: string | null;
  contractLineId?: string | null;
  lineType?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

/** 跨币种折算状态：same=同币种直接相减，converted=已按当月汇率折算，missing=缺汇率未折算。 */
export type ServiceFeeFxStatus = "same" | "converted" | "missing";

export type ServiceFeeRow = {
  id: string;
  writeOffMonth: string;
  countryCode: string;
  batchName: string;
  requestNo: string;
  poNo: string;
  deviceCode: string;
  requestType: string;
  modelCode: string;
  nameEn: string;
  supplierId: string;
  undertakingUnitId: string;
  customerId: string;
  quantity: number;
  currency: string;
  vatRate: number;
  billingCurrency: string;
  prepaymentCurrency: string;
  lineType: "instance" | "fee";
  billingAmount: number;
  prepaymentAmount: number;
  serviceFeeAmount: number;
  serviceFeeAmountExcludingTax: number;
  /** 折算用的汇率（1 预付款币种 = 汇率 × 月账单币种）；同币种或缺失时为 null。 */
  exchangeRate: number | null;
  /** 折算到月账单币种后的预付款核销金额。 */
  prepaymentAmountConverted: number;
  /** 月度服务费的币种（跨币种折算后统一落在月账单币种）。 */
  serviceFeeCurrency: string;
  fxStatus: ServiceFeeFxStatus;
  createdAt?: string | null;
  updatedAt?: string | null;
  billingSourceIds: string;
  prepaymentSourceIds: string;
  prepaymentContractNos: string;
  sourceNote: string;
};

export type ServiceFeeSummary = {
  billingTotal: number;
  prepaymentTotal: number;
  serviceFeeTotal: number;
  serviceFeeTotalExcludingTax: number;
  instanceServiceFeeTotal: number;
  feeServiceFeeTotal: number;
};

type Bucket = {
  key: string;
  billingRows: ServiceFeeBillingRow[];
  prepaymentRows: ServiceFeePrepaymentRow[];
};

export function buildServiceFeeRows({
  billingRows,
  prepaymentRows,
}: {
  billingRows: ServiceFeeBillingRow[];
  prepaymentRows: ServiceFeePrepaymentRow[];
}): ServiceFeeRow[] {
  const buckets = new Map<string, Bucket>();

  for (const row of billingRows) {
    const key = getBillingKey(row);
    const bucket = getBucket(buckets, key);
    bucket.billingRows.push(row);
  }

  for (const row of prepaymentRows) {
    const key = getPrepaymentKey(row);
    const bucket = getBucket(buckets, key);
    bucket.prepaymentRows.push(row);
  }

  return Array.from(buckets.values())
    .map(buildServiceFeeRow)
    .sort((left, right) =>
      [
        left.writeOffMonth.localeCompare(right.writeOffMonth),
        left.countryCode.localeCompare(right.countryCode),
        left.batchName.localeCompare(right.batchName),
        left.requestNo.localeCompare(right.requestNo),
        left.poNo.localeCompare(right.poNo),
        left.deviceCode.localeCompare(right.deviceCode),
        left.nameEn.localeCompare(right.nameEn),
      ].find((result) => result !== 0) ?? 0,
    );
}

/**
 * 跨币种折算：月账单与预付款币种不同时，按**该核销月份**维护的汇率把预付款折算成
 * 月账单币种后再算服务费。找不到汇率时**不按 1:1 硬算**，整行标成 `missing`
 * 并把服务费留 0，由页面提示「待维护汇率」、确认对账单时拦住。
 *
 * 同币种（含只有单边数据的行）保持原来的直接相减，不受影响。
 */
export function applyExchangeRateConversion(rows: ServiceFeeRow[], rates: ExchangeRateMap): ServiceFeeRow[] {
  return rows.map((row) => {
    const billingCurrency = normalizeText(row.billingCurrency).toUpperCase();
    const prepaymentCurrency = normalizeText(row.prepaymentCurrency).toUpperCase();
    const billingAmount = toNumber(row.billingAmount);
    const prepaymentAmount = toNumber(row.prepaymentAmount);
    const withDefaults: ServiceFeeRow = {
      ...row,
      exchangeRate: null,
      prepaymentAmountConverted: prepaymentAmount,
      serviceFeeCurrency: billingCurrency || prepaymentCurrency || normalizeText(row.currency).toUpperCase(),
      fxStatus: "same",
    };
    if (!billingCurrency || !prepaymentCurrency || billingCurrency === prepaymentCurrency) return withDefaults;

    const period = toPeriodMonth(row.writeOffMonth);
    const rate = period ? lookupExchangeRate(rates, period, prepaymentCurrency, billingCurrency) : null;
    if (!rate) {
      return {
        ...withDefaults,
        prepaymentAmountConverted: 0,
        serviceFeeAmount: 0,
        serviceFeeAmountExcludingTax: 0,
        fxStatus: "missing",
      };
    }

    const prepaymentAmountConverted = roundMoney(prepaymentAmount * rate);
    const serviceFeeAmount = roundMoney(billingAmount - prepaymentAmountConverted);
    const vatRate = toNumber(row.vatRate);
    return {
      ...withDefaults,
      exchangeRate: rate,
      prepaymentAmountConverted,
      serviceFeeAmount,
      serviceFeeAmountExcludingTax: roundMoney(serviceFeeAmount / (1 + vatRate)),
      fxStatus: "converted",
    };
  });
}

export function summarizeServiceFeeRows(
  rows: Array<
    Pick<ServiceFeeRow, "billingAmount" | "prepaymentAmount" | "serviceFeeAmount" | "lineType">
    & Partial<Pick<ServiceFeeRow, "serviceFeeAmountExcludingTax" | "prepaymentAmountConverted" | "fxStatus" | "serviceFeeCurrency">>
  >,
): ServiceFeeSummary {
  /**
   * 缺汇率的行不参与合计：它的月账单是 CNY、预付款是 USD，混进任何一个币种的合计
   * 都会让合计对不上明细，所以整行排除，页面单独提示「X 行待维护汇率」。
   */
  const summedRows = rows.filter((row) => row.fxStatus !== "missing");
  return summedRows.reduce<ServiceFeeSummary>(
    (summary, row) => ({
      billingTotal: roundMoney(summary.billingTotal + Number(row.billingAmount ?? 0)),
      prepaymentTotal: roundMoney(
        summary.prepaymentTotal + Number(row.prepaymentAmountConverted ?? row.prepaymentAmount ?? 0),
      ),
      serviceFeeTotal: roundMoney(summary.serviceFeeTotal + Number(row.serviceFeeAmount ?? 0)),
      serviceFeeTotalExcludingTax: roundMoney(
        summary.serviceFeeTotalExcludingTax + Number(row.serviceFeeAmountExcludingTax ?? 0),
      ),
      instanceServiceFeeTotal: roundMoney(
        summary.instanceServiceFeeTotal + (row.lineType === "instance" ? Number(row.serviceFeeAmount ?? 0) : 0),
      ),
      feeServiceFeeTotal: roundMoney(summary.feeServiceFeeTotal + (row.lineType === "fee" ? Number(row.serviceFeeAmount ?? 0) : 0)),
    }),
    {
      billingTotal: 0,
      prepaymentTotal: 0,
      serviceFeeTotal: 0,
      serviceFeeTotalExcludingTax: 0,
      instanceServiceFeeTotal: 0,
      feeServiceFeeTotal: 0,
    },
  );
}

/** 缺汇率、未参与合计的行数（页面上要提示「待维护汇率」）。 */
export function countUnconvertedServiceFeeRows(rows: Array<Pick<ServiceFeeRow, "fxStatus">>) {
  return rows.filter((row) => row.fxStatus === "missing").length;
}

function buildServiceFeeRow(bucket: Bucket): ServiceFeeRow {
  const billing = bucket.billingRows[0];
  const prepayment = bucket.prepaymentRows[0];
  const source = billing ?? prepayment;
  const lineType = normalizeLineType(prepayment?.lineType);
  const billingAmount = roundMoney(bucket.billingRows.reduce((sum, row) => sum + getBillingTotalAmount(row), 0));
  const prepaymentAmount = roundMoney(bucket.prepaymentRows.reduce((sum, row) => sum + toNumber(row.monthlyAmount), 0));
  const serviceFeeAmount = roundMoney(billingAmount - prepaymentAmount);
  const vatRate = toNumber(billing?.vatRate ?? prepayment?.vatRate);
  const serviceFeeAmountExcludingTax = roundMoney(serviceFeeAmount / (1 + vatRate));

  return {
    id: `SFC-${bucket.key}`,
    writeOffMonth: normalizeText(source?.writeOffMonth),
    countryCode: normalizeText(source?.countryCode),
    batchName: normalizeText(source?.batchName),
    requestNo: normalizeText(source?.requestNo),
    poNo: normalizeText(source?.poNo),
    deviceCode: normalizeText(source?.deviceCode),
    requestType: normalizeText(billing?.requestType ?? prepayment?.requestType) || (lineType === "fee" ? "费用" : "整机"),
    modelCode: normalizeText(source?.modelCode),
    nameEn: normalizeText(source?.nameEn),
    supplierId: normalizeText(billing?.supplierId ?? prepayment?.supplierId),
    undertakingUnitId: normalizeText(billing?.undertakingUnitId ?? prepayment?.undertakingUnitId),
    customerId: normalizeText(billing?.customerId ?? prepayment?.customerId),
    quantity: toNumber(source?.quantity),
    currency: normalizeText(source?.currency),
    vatRate,
    billingCurrency: normalizeText(billing?.currency),
    prepaymentCurrency: normalizeText(prepayment?.currency),
    lineType,
    billingAmount,
    prepaymentAmount,
    serviceFeeAmount,
    serviceFeeAmountExcludingTax,
    exchangeRate: null,
    prepaymentAmountConverted: prepaymentAmount,
    serviceFeeCurrency: normalizeText(billing?.currency ?? prepayment?.currency),
    fxStatus: "same",
    createdAt: billing?.createdAt ?? prepayment?.createdAt ?? null,
    updatedAt: billing?.updatedAt ?? prepayment?.updatedAt ?? null,
    billingSourceIds: bucket.billingRows.map((row) => normalizeText(row.id)).filter(Boolean).join(","),
    prepaymentSourceIds: bucket.prepaymentRows.map((row) => normalizeText(row.id)).filter(Boolean).join(","),
    prepaymentContractNos: Array.from(new Set(bucket.prepaymentRows.map((row) => normalizeText(row.contractNo)).filter(Boolean))).join(","),
    sourceNote: buildSourceNote(bucket),
  };
}

function getBillingKey(row: ServiceFeeBillingRow) {
  return joinKey([row.writeOffMonth, row.countryCode, row.batchName, row.requestNo, row.poNo, row.deviceCode, "instance"]);
}

function getPrepaymentKey(row: ServiceFeePrepaymentRow) {
  const lineType = normalizeLineType(row.lineType);
  if (lineType === "fee") {
    return joinKey([row.writeOffMonth, row.countryCode, row.batchName, row.requestNo, row.poNo, row.contractNo, row.contractLineId || row.id, "fee"]);
  }
  return joinKey([row.writeOffMonth, row.countryCode, row.batchName, row.requestNo, row.poNo, row.deviceCode, "instance"]);
}

function getBucket(buckets: Map<string, Bucket>, key: string) {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { key, billingRows: [], prepaymentRows: [] };
    buckets.set(key, bucket);
  }
  return bucket;
}

function normalizeLineType(value: unknown): "instance" | "fee" {
  return String(value ?? "instance") === "fee" ? "fee" : "instance";
}

function joinKey(values: unknown[]) {
  return values.map((value) => normalizeText(value)).join("::");
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function getBillingTotalAmount(row: ServiceFeeBillingRow) {
  if (row.monthlyTotalAmount !== null && row.monthlyTotalAmount !== undefined && row.monthlyTotalAmount !== "") {
    return toNumber(row.monthlyTotalAmount);
  }
  return toNumber(row.quantity) * toNumber(row.monthlyAmount);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function buildSourceNote(bucket: Bucket) {
  if (bucket.billingRows.length && bucket.prepaymentRows.length) return "月账单与预付款均存在";
  if (bucket.billingRows.length) return "仅月账单存在";
  return "仅预付款存在，月账单金额按0显示";
}
