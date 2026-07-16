export type BillingStatementSourceRow = {
  id?: string | null;
  countryCode?: string | null;
  instanceContractNo?: string | null;
  nameEn?: string | null;
  quantity?: number | string | null;
  currency?: string | null;
  monthlyAmount?: number | string | null;
  writeOffMonth?: string | null;
  vatRate?: number | string | null;
};

export type BillingStatementRow = {
  countryCode: string;
  currency: string;
  instanceContractNo: string;
  productType: string;
  unitPriceVatExcluded: number;
  vatRate: number;
  unitPriceVatIncluded: number;
  quantity: number;
  amount: number;
  startTime: string;
  endTime: string;
  sourceIds: string;
};

export type BillingStatementCurrencyGroup = {
  currency: string;
  rows: BillingStatementRow[];
  totalQuantity: number;
  totalAmount: number;
};

type Bucket = BillingStatementRow & {
  sourceIds: string;
};

const VAT_RATES: Record<string, number> = {
  MX: 0.16,
  CL: 0.19,
  BR: 0.029,
};

export function getVatRate(countryCode: string) {
  return VAT_RATES[String(countryCode ?? "").trim().toUpperCase()] ?? 0;
}

export function buildBillingStatementRows({
  endDate,
  rows,
  startDate,
}: {
  rows: BillingStatementSourceRow[];
  startDate: string;
  endDate: string;
}): BillingStatementRow[] {
  const buckets = new Map<string, Bucket>();

  for (const source of rows) {
    const countryCode = normalizeText(source.countryCode);
    const currency = normalizeText(source.currency);
    const instanceContractNo = normalizeText(source.instanceContractNo);
    const productType = normalizeText(source.nameEn);
    const unitPriceVatIncluded = roundMoney(toNumber(source.monthlyAmount));
    const vatRate = source.vatRate === null || source.vatRate === undefined || source.vatRate === ""
      ? getVatRate(countryCode)
      : toNumber(source.vatRate);
    const key = [countryCode, currency, instanceContractNo, productType, unitPriceVatIncluded].join("::");
    const quantity = toNumber(source.quantity);
    const sourceId = normalizeText(source.id);
    const bucket =
      buckets.get(key) ??
      ({
        countryCode,
        currency,
        instanceContractNo,
        productType,
        unitPriceVatExcluded: roundMoney(unitPriceVatIncluded / (1 + vatRate)),
        vatRate,
        unitPriceVatIncluded,
        quantity: 0,
        amount: 0,
        startTime: startDate,
        endTime: endDate,
        sourceIds: "",
      } satisfies Bucket);

    bucket.quantity = roundQuantity(bucket.quantity + quantity);
    bucket.amount = roundMoney(bucket.amount + unitPriceVatIncluded * quantity);
    bucket.sourceIds = [bucket.sourceIds, sourceId].filter(Boolean).join(",");
    buckets.set(key, bucket);
  }

  return Array.from(buckets.values()).sort((left, right) =>
    [
      left.countryCode.localeCompare(right.countryCode),
      left.currency.localeCompare(right.currency),
      left.instanceContractNo.localeCompare(right.instanceContractNo),
      left.productType.localeCompare(right.productType),
    ].find((result) => result !== 0) ?? 0,
  );
}

export function groupBillingStatementRowsByCurrency(rows: BillingStatementRow[]): BillingStatementCurrencyGroup[] {
  const groups = new Map<string, BillingStatementRow[]>();
  for (const row of rows) {
    groups.set(row.currency, [...(groups.get(row.currency) ?? []), row]);
  }

  return Array.from(groups.entries())
    .map(([currency, groupRows]) => ({
      currency,
      rows: groupRows,
      totalQuantity: roundQuantity(groupRows.reduce((sum, row) => sum + row.quantity, 0)),
      totalAmount: roundMoney(groupRows.reduce((sum, row) => sum + row.amount, 0)),
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
