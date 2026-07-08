export type DashboardServiceFeeSource = {
  writeOffMonth: string;
  countryCode?: string | null;
  currency?: string | null;
  billingCurrency?: string | null;
  prepaymentCurrency?: string | null;
  serviceFeeAmount?: number | string | null;
};

export type DashboardNewInstanceSource = {
  monthSource: string;
  countryCode?: string | null;
  quantity?: number | string | null;
};

export type DashboardServiceFeeSummary = {
  countryCode: string;
  month: string;
  currency: string;
  serviceFeeTotal: number;
};

export type DashboardNewInstanceSummary = {
  countryCode: string;
  month: string;
  instanceQuantity: number;
};

export type ServiceFeeChartSeries = {
  key: string;
  label: string;
  values: Array<number | null>;
};

export type ServiceFeeChartData = {
  months: string[];
  series: ServiceFeeChartSeries[];
};

export function aggregateServiceFeesByCountryMonthCurrency(
  rows: DashboardServiceFeeSource[],
): DashboardServiceFeeSummary[] {
  const summaries = new Map<string, DashboardServiceFeeSummary>();

  for (const row of rows) {
    const countryCode = normalizeText(row.countryCode) || "未填写";
    const month = getMonth(row.writeOffMonth);
    const currency = normalizeText(row.currency) || normalizeText(row.billingCurrency) || normalizeText(row.prepaymentCurrency) || "未填写";
    const key = [countryCode, month, currency].join("::");
    const current = summaries.get(key) ?? { countryCode, month, currency, serviceFeeTotal: 0 };
    current.serviceFeeTotal = roundMoney(current.serviceFeeTotal + toNumber(row.serviceFeeAmount));
    summaries.set(key, current);
  }

  return Array.from(summaries.values()).sort(compareCountryMonthCurrency);
}

export function aggregateNewInstancesByCountryMonth(
  rows: DashboardNewInstanceSource[],
): DashboardNewInstanceSummary[] {
  const summaries = new Map<string, DashboardNewInstanceSummary>();

  for (const row of rows) {
    const countryCode = normalizeText(row.countryCode) || "未填写";
    const month = getMonth(row.monthSource);
    const key = [countryCode, month].join("::");
    const current = summaries.get(key) ?? { countryCode, month, instanceQuantity: 0 };
    current.instanceQuantity += toNumber(row.quantity);
    summaries.set(key, current);
  }

  return Array.from(summaries.values()).sort((left, right) =>
    left.countryCode.localeCompare(right.countryCode) || left.month.localeCompare(right.month),
  );
}

export function buildServiceFeeChartSeries(rows: DashboardServiceFeeSummary[]): ServiceFeeChartData {
  const months = Array.from(new Set(rows.map((row) => row.month))).sort();
  const rowBySeriesMonth = new Map<string, DashboardServiceFeeSummary>();
  const seriesKeys = new Map<string, { countryCode: string; currency: string }>();

  for (const row of rows) {
    const key = `${row.countryCode}-${row.currency}`;
    seriesKeys.set(key, { countryCode: row.countryCode, currency: row.currency });
    rowBySeriesMonth.set(`${key}::${row.month}`, row);
  }

  const series = Array.from(seriesKeys.entries())
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, meta]) => ({
      key,
      label: `${meta.countryCode} / ${meta.currency}`,
      values: months.map((month) => rowBySeriesMonth.get(`${key}::${month}`)?.serviceFeeTotal ?? null),
    }));

  return { months, series };
}

function compareCountryMonthCurrency(left: DashboardServiceFeeSummary, right: DashboardServiceFeeSummary) {
  return (
    left.countryCode.localeCompare(right.countryCode) ||
    left.month.localeCompare(right.month) ||
    left.currency.localeCompare(right.currency)
  );
}

function getMonth(value: string) {
  return String(value ?? "").slice(0, 7) || "未填写";
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
