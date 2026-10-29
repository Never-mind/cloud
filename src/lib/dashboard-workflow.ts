export type DashboardServiceFeeSource = {
  writeOffMonth: string;
  countryCode?: string | null;
  currency?: string | null;
  billingCurrency?: string | null;
  prepaymentCurrency?: string | null;
  serviceFeeCurrency?: string | null;
  serviceFeeAmount?: number | string | null;
  fxStatus?: string | null;
};

type ServiceFeeTotal = {
  serviceFeeTotal: number | null;
  status: "ready" | "missing_rate" | "missing_fee";
};

export type DashboardServiceFeeSummary = ServiceFeeTotal & {
  countryCode: string;
  month: string;
  currency: string;
  /** BR 原币服务费及本次看板折算率；不修改已保存的核算快照。 */
  conversion?: Array<{ currency: string; amount: number | null; rateToUsd: number | null }>;
};

export type DashboardNewInstanceSource = {
  monthSource: string;
  countryCode?: string | null;
  quantity?: number | string | null;
};

export type DashboardCloudSource = {
  period?: string | null;
  customerId?: string | null;
  customer?: string | null;
  customerReceivableNetAmount?: number | string | null;
  customerReceivable?: number | string | null;
  settlementGrossProfit?: number | string | null;
  grossProfit?: number | string | null;
};

export type CloudMonthlyAmounts = { receivableNet: number | null; profitNet: number | null };
export type DashboardCloudFinancials = {
  months: string[];
  byCustomer: Array<{ key: string; customer: string; values: Array<CloudMonthlyAmounts | null> }>;
};

/** 接受账期 YYYYMM、YYYY-MM 及日期；非法账期不进入图表。 */
export function normalizeDashboardMonth(value: unknown) {
  const text = String(value ?? "").trim();
  const match = /^(\d{4})(?:[-/.](\d{1,2})(?=$|[-/.T\s])|(\d{2})$)/.exec(text);
  if (!match) return "";
  const month = Number(match[2] || match[3]);
  if (Number(match[1]) < 1 || month < 1 || month > 12) return "";
  return match[1] + "-" + String(month).padStart(2, "0");
}

function monthIndex(month: string) {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
}

function monthAt(index: number) {
  return String(Math.floor(index / 12)).padStart(4, "0") + "-" + String(index % 12 + 1).padStart(2, "0");
}

function monthRange(start: string, end: string) {
  return Array.from({ length: monthIndex(end) - monthIndex(start) + 1 }, (_, index) => monthAt(monthIndex(start) + index));
}

/** 以最新有数据的账期为终点，取连续自然月，空月保留。 */
export function recentDashboardMonths(values: string[], count = 3) {
  const months = values.map(normalizeDashboardMonth).filter(Boolean).sort();
  if (!months.length) return [];
  const end = months[months.length - 1];
  return monthRange(count > 0 ? monthAt(Math.max(12, monthIndex(end) - count + 1)) : months[0], end);
}

export function aggregateServiceFeesByCountryMonthCurrency(
  rows: DashboardServiceFeeSource[],
  resolveRate: (month: string, source: string, target: string) => number | null = () => null,
): DashboardServiceFeeSummary[] {
  const buckets = new Map<string, { countryCode: string; month: string; currency: string; rows: DashboardServiceFeeSource[] }>();
  for (const row of rows) {
    const month = normalizeDashboardMonth(row.writeOffMonth);
    if (!month) continue;
    const countryCode = normalizeText(row.countryCode).toUpperCase() || "未填写";
    const currency = countryCode === "BR" ? "USD" : serviceFeeCurrency(row);
    const key = [countryCode, month, currency].join("::");
    const bucket = buckets.get(key) ?? { countryCode, month, currency, rows: [] };
    bucket.rows.push(row);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].map(({ rows: items, ...meta }) => {
    let total = 0;
    let status: ServiceFeeTotal["status"] = "ready";
    const sources = new Map<string, { currency: string; amount: number | null; rateToUsd: number | null }>();
    for (const row of items) {
      const source = serviceFeeCurrency(row);
      const amount = row.fxStatus === "missing" ? null : nullableNumber(row.serviceFeeAmount);
      const rate = meta.countryCode === "BR" && source !== "USD" ? resolveRate(meta.month, source, "USD") : 1;
      const validRate = rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null;
      if (amount === null) status = "missing_fee";
      else if (validRate === null && status === "ready") status = "missing_rate";
      if (amount !== null && validRate !== null) total += amount * validRate;
      const previous = sources.get(source);
      sources.set(source, {
        currency: source,
        amount: amount === null || previous?.amount === null ? null : (previous?.amount ?? 0) + amount,
        rateToUsd: validRate,
      });
    }
    return {
      ...meta,
      serviceFeeTotal: status === "ready" ? roundMoney(total) : null,
      status,
      ...(meta.countryCode === "BR" ? { conversion: [...sources.values()].map((source) => ({ ...source, amount: source.amount === null ? null : roundMoney(source.amount) })) } : {}),
    };
  }).sort((left, right) => left.countryCode.localeCompare(right.countryCode) || left.month.localeCompare(right.month) || left.currency.localeCompare(right.currency));
}

function serviceFeeCurrency(row: DashboardServiceFeeSource) {
  // serviceFeeAmount 已经按核算币种算好，不能按原预付款币种再次换算。
  return (normalizeText(row.serviceFeeCurrency) || normalizeText(row.billingCurrency) || normalizeText(row.currency) || normalizeText(row.prepaymentCurrency) || "未填写").toUpperCase();
}

function sumServiceFees(rows: DashboardServiceFeeSummary[]): ServiceFeeTotal {
  const status = rows.some((row) => row.status === "missing_fee") ? "missing_fee" : rows.some((row) => row.status === "missing_rate") ? "missing_rate" : "ready";
  return { status, serviceFeeTotal: !rows.length || status !== "ready" || rows.some((row) => row.serviceFeeTotal === null) ? null : roundMoney(rows.reduce((sum, row) => sum + (row.serviceFeeTotal ?? 0), 0)) };
}

export function buildServiceFeeView(rows: DashboardServiceFeeSummary[], monthLimit = 3) {
  const months = recentDashboardMonths(rows.map((row) => row.month), monthLimit);
  const visible = rows.filter((row) => months.includes(row.month));
  const groups = new Map<string, DashboardServiceFeeSummary[]>();
  for (const row of visible) {
    const key = row.countryCode + "-" + row.currency;
    const entries = groups.get(key) ?? [];
    entries.push(row);
    groups.set(key, entries);
  }
  return {
    months,
    rows: [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, entries]) => ({
      key,
      countryCode: entries[0].countryCode,
      currency: entries[0].currency,
      values: months.map((month) => entries.find((row) => row.month === month) ?? null),
      total: sumServiceFees(entries),
    })),
    totalsByCurrency: [...new Set(visible.map((row) => row.currency))].sort().map((currency) => ({ currency, ...sumServiceFees(visible.filter((row) => row.currency === currency)) })),
  };
}

export function buildServiceFeeChartSeries(rows: DashboardServiceFeeSummary[], monthLimit = 3) {
  const view = buildServiceFeeView(rows, monthLimit);
  return {
    months: view.months,
    series: view.rows.map((row) => ({ key: row.key, label: row.countryCode + " / " + row.currency, values: row.values.map((cell) => cell?.serviceFeeTotal ?? null) })),
  };
}

/** null 月份表示没有账单；已有账单缺金额则保留 null 指标，不冒充零。 */
export function sumCloudAmounts(values: Array<CloudMonthlyAmounts | null>): CloudMonthlyAmounts | null {
  const present = values.filter((value): value is CloudMonthlyAmounts => value !== null);
  if (!present.length) return null;
  const sum = (field: keyof CloudMonthlyAmounts) => present.some((value) => value[field] === null) ? null : roundMoney(present.reduce((total, value) => total + (value[field] ?? 0), 0));
  return { receivableNet: sum("receivableNet"), profitNet: sum("profitNet") };
}

export function aggregateCloudFinancials(rows: DashboardCloudSource[]): DashboardCloudFinancials {
  const buckets = new Map<string, { key: string; customer: string; byMonth: Map<string, CloudMonthlyAmounts> }>();
  const sourceMonths: string[] = [];
  for (const row of rows) {
    const month = normalizeDashboardMonth(row.period);
    if (!month) continue;
    sourceMonths.push(month);
    const customer = normalizeText(row.customer) || normalizeText(row.customerId) || "（未填客户）";
    const key = normalizeText(row.customerId) ? "id:" + normalizeText(row.customerId) : "name:" + customer;
    const bucket = buckets.get(key) ?? { key, customer, byMonth: new Map<string, CloudMonthlyAmounts>() };
    const amount = {
      receivableNet: nullableNumber(row.customerReceivableNetAmount) ?? nullableNumber(row.customerReceivable),
      // 读取保存的结算毛利，保留手工调整；不在首页重新核算。
      profitNet: nullableNumber(row.settlementGrossProfit) ?? nullableNumber(row.grossProfit),
    };
    bucket.byMonth.set(month, sumCloudAmounts([bucket.byMonth.get(month) ?? null, amount])!);
    buckets.set(key, bucket);
  }
  const allMonths = recentDashboardMonths(sourceMonths, 0);
  const recent = recentDashboardMonths(sourceMonths);
  const months = allMonths.length ? monthRange([allMonths[0], recent[0]].sort()[0], allMonths[allMonths.length - 1]) : [];
  return {
    months,
    byCustomer: [...buckets.values()].map((bucket) => ({ key: bucket.key, customer: bucket.customer, values: months.map((month) => bucket.byMonth.get(month) ?? null) })).sort((a, b) => a.customer.localeCompare(b.customer)),
  };
}

export function buildCloudFinancialView(financials?: DashboardCloudFinancials, start = "", end = "", customerKey = "") {
  const available = financials?.months ?? [];
  const defaults = recentDashboardMonths(available);
  const bounds = [available.includes(start) ? start : defaults[0], available.includes(end) ? end : defaults[defaults.length - 1]].sort();
  const months = available.filter((month) => month >= bounds[0] && month <= bounds[1]);
  const indexes = months.map((month) => available.indexOf(month));
  const rows = (financials?.byCustomer ?? []).filter((row) => !customerKey || row.key === customerKey).map((row) => {
    const values = indexes.map((index) => row.values[index] ?? null);
    return { key: row.key, customer: row.customer, values, total: sumCloudAmounts(values) };
  }).filter((row) => row.values.some((value) => value !== null)).sort((a, b) => (b.total?.receivableNet ?? -Infinity) - (a.total?.receivableNet ?? -Infinity) || a.customer.localeCompare(b.customer));
  const monthTotals = months.map((_, index) => sumCloudAmounts(rows.map((row) => row.values[index])));
  return { months, rows, monthTotals, total: sumCloudAmounts(monthTotals) };
}

export function aggregateNewInstancesByCountryMonth(rows: DashboardNewInstanceSource[]) {
  const summaries = new Map<string, { countryCode: string; month: string; instanceQuantity: number }>();
  for (const row of rows) {
    const countryCode = normalizeText(row.countryCode) || "未填写";
    const month = normalizeDashboardMonth(row.monthSource);
    if (!month) continue;
    const key = [countryCode, month].join("::");
    const current = summaries.get(key) ?? { countryCode, month, instanceQuantity: 0 };
    current.instanceQuantity += nullableNumber(row.quantity) ?? 0;
    summaries.set(key, current);
  }
  return [...summaries.values()].sort((left, right) => left.countryCode.localeCompare(right.countryCode) || left.month.localeCompare(right.month));
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || normalizeText(value) === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
