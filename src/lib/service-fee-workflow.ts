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

export function summarizeServiceFeeRows(
  rows: Array<
    Pick<ServiceFeeRow, "billingAmount" | "prepaymentAmount" | "serviceFeeAmount" | "lineType">
    & Partial<Pick<ServiceFeeRow, "serviceFeeAmountExcludingTax">>
  >,
): ServiceFeeSummary {
  return rows.reduce<ServiceFeeSummary>(
    (summary, row) => ({
      billingTotal: roundMoney(summary.billingTotal + Number(row.billingAmount ?? 0)),
      prepaymentTotal: roundMoney(summary.prepaymentTotal + Number(row.prepaymentAmount ?? 0)),
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
