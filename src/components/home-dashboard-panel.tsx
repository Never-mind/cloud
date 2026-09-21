"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { buildServiceFeeChartSeries } from "@/lib/dashboard-workflow";
import { formatDisplayValue } from "@/lib/display-format";
import { Button, Panel, Select } from "./ui";
import { TableStateContent } from "./table-state";

type ServiceFeeSummary = {
  countryCode: string;
  month: string;
  currency: string;
  serviceFeeTotal: number;
};

type NewInstanceSummary = {
  countryCode: string;
  month: string;
  instanceQuantity: number;
};

type GrossProfitSeries = { customer: string; values: number[]; total: number };

type DomainPortfolio = {
  po: {
    customerPoCount: number;
    quotationCount: number;
    settlementProjectCount: number;
    statusCounts: Record<string, number>;
    statusAmounts: Record<string, number>;
    byCustomer: Array<{ customer: string; projectCount: number; quotedUsd: number; receivedUsd: number }>;
    quotedUsdTotal: number;
    receivedUsdTotal: number;
  };
  cloud: {
    cloudRowCount: number;
    receivableUsd: number;
    payableUsd: number;
    grossProfit: { months: string[]; totals: number[]; byCustomer: GrossProfitSeries[] };
  };
};

/** 项目结算五个阶段，按流程顺序展示（与 settlement-project-service 的状态码一致）。 */
const SETTLEMENT_STATUS_LABELS: Array<[string, string]> = [
  ["purchasing", "采购中"],
  ["procurement_completed", "采购完成"],
  ["accepting", "验收中"],
  ["acceptance_completed", "验收完成"],
  ["closed", "已完结"],
];

type DashboardData = {
  countries: string[];
  serviceFees: ServiceFeeSummary[];
  newInstances: NewInstanceSummary[];
  portfolio: DomainPortfolio | null;
};

const emptyData: DashboardData = {
  countries: [],
  serviceFees: [],
  newInstances: [],
  portfolio: null,
};

export function HomeDashboardPanel() {
  const [countryCode, setCountryCode] = useState("");
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(false);
  // 华为云毛利趋势：全部客户 / 单个客户
  const [grossProfitMode, setGrossProfitMode] = useState<"all" | "one">("all");
  const [grossProfitCustomer, setGrossProfitCustomer] = useState("");

  async function loadData(nextCountryCode = countryCode) {
    setLoading(true);
    const params = new URLSearchParams();
    if (nextCountryCode) params.set("countryCode", nextCountryCode);
    const response = await fetch(`/api/dashboard/overview?${params.toString()}`);
    const nextData = (await response.json()) as DashboardData;
    setData({
      countries: nextData.countries ?? [],
      serviceFees: nextData.serviceFees ?? [],
      newInstances: nextData.newInstances ?? [],
      portfolio: nextData.portfolio ?? null,
    });
    setLoading(false);
  }

  useEffect(() => {
    void loadData("");
  }, []);

  const totalServiceFee = useMemo(
    () => data.serviceFees.reduce((total, row) => total + Number(row.serviceFeeTotal ?? 0), 0),
    [data.serviceFees],
  );
  const totalInstances = useMemo(
    () => data.newInstances.reduce((total, row) => total + Number(row.instanceQuantity ?? 0), 0),
    [data.newInstances],
  );
  const serviceFeeChart = useMemo(
    () => buildServiceFeeChartSeries(data.serviceFees),
    [data.serviceFees],
  );
  const grossProfit = data.portfolio?.cloud.grossProfit;
  // 复用服务费那张折线图：全部客户用月度合计，单个客户取该客户的月度序列。
  const grossProfitChart = useMemo(() => {
    if (!grossProfit) return { months: [] as string[], series: [] as Array<{ key: string; label: string; values: number[] }> };
    const row = grossProfit.byCustomer.find((entry) => entry.customer === grossProfitCustomer) ?? grossProfit.byCustomer[0];
    const series = grossProfitMode === "all"
      ? [{ key: "all", label: "全部客户合计", values: grossProfit.totals }]
      : row ? [{ key: row.customer, label: row.customer, values: row.values }] : [];
    return { months: grossProfit.months, series };
  }, [grossProfit, grossProfitCustomer, grossProfitMode]);

  return (
    <Panel className="mb-5">
      <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-4 py-3">
        <div>
          <h2 className="text-base font-medium text-ink">经营汇总面板</h2>
          <p className="mt-1 text-xs text-ink-3">按国家、月份查看服务费合计和新增实例数量。</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select
            value={countryCode}
            onChange={(event) => {
              setCountryCode(event.target.value);
              void loadData(event.target.value);
            }}
          >
            <option value="">全部国家</option>
            {data.countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </Select>
          <Button disabled={loading} onClick={() => void loadData()}>
            <RefreshCw size={15} />
            {loading ? "刷新中" : "刷新"}
          </Button>
        </div>
      </div>

      <DomainCard accent="#409eff" hint="服务费、新增实例" title="算力系统">
      <div className="grid gap-4 p-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-medium text-ink">每月服务费合计</div>
            <div className="text-xs text-ink-3">当前合计：{formatNumber(totalServiceFee)}</div>
          </div>
          <ServiceFeeLineChart chart={serviceFeeChart} loading={loading} />
          <SummaryTable
            columns={[
              { key: "countryCode", label: "国家" },
              { key: "month", label: "月份" },
              { key: "currency", label: "币种" },
              { key: "serviceFeeTotal", label: "服务费合计", type: "number" },
            ]}
            emptyText=<TableStateContent empty="暂无服务费数据" loading={loading} />
            rows={data.serviceFees}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-medium text-ink">每月新增实例数量</div>
            <div className="text-xs text-ink-3">当前合计：{formatNumber(totalInstances)}</div>
          </div>
          <SummaryTable
            columns={[
              { key: "countryCode", label: "国家" },
              { key: "month", label: "月份" },
              { key: "instanceQuantity", label: "新增实例数量", type: "number" },
            ]}
            emptyText=<TableStateContent empty="暂无新增实例数据" loading={loading} />
            rows={data.newInstances}
          />
        </div>
      </div>
      </DomainCard>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <DomainCard
          accent="#67c23a"
          title="集采系统"
          hint={data.portfolio ? `客户PO ${data.portfolio.po.customerPoCount} · 报价单 ${data.portfolio.po.quotationCount} · 项目结算 ${data.portfolio.po.settlementProjectCount}` : "加载中…"}
        >
          <div className="p-4">
            <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-3">
              <span>项目数 <b className="text-ink">{data.portfolio?.po.settlementProjectCount ?? 0}</b></span>
              <span>报价收入（USD） <b className="text-ink">{formatNumber(data.portfolio?.po.quotedUsdTotal ?? 0)}</b></span>
              <span>已确认收入（USD） <b className="text-ink">{formatNumber(data.portfolio?.po.receivedUsdTotal ?? 0)}</b></span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {SETTLEMENT_STATUS_LABELS.map(([status, label]) => (
                <div className="rounded-md border border-line-soft bg-surface-2 px-3 py-2" key={status}>
                  <div className="text-xs text-ink-3">{label}</div>
                  <div className="mt-0.5 text-lg font-semibold text-ink">
                    {data.portfolio?.po.statusCounts?.[status] ?? 0}
                    <span className="ml-1 text-xs font-normal text-ink-3">个</span>
                  </div>
                  <div className="text-[11px] text-ink-4">报价 {formatNumber(data.portfolio?.po.statusAmounts?.[status] ?? 0)} USD</div>
                </div>
              ))}
            </div>
            {data.portfolio?.po.byCustomer.length ? (
              <div className="mt-4 border-t border-dashed border-line-soft pt-3">
                <div className="mb-2 text-xs text-ink-3">客户项目金额排名（报价收入 USD）</div>
                {data.portfolio.po.byCustomer.map((row) => {
                  const top = Math.max(1, ...data.portfolio!.po.byCustomer.map((entry) => entry.quotedUsd));
                  return (
                    <div className="grid grid-cols-[160px_1fr_120px] items-center gap-2.5 py-1 text-xs" key={row.customer}>
                      <span className="truncate text-ink-2" title={row.customer}>{row.customer}</span>
                      <span className="h-3 overflow-hidden rounded bg-canvas-deep">
                        <span className="block h-full rounded bg-[#67c23a]" style={{ width: `${Math.max(1, Math.round((row.quotedUsd / top) * 100))}%` }} />
                      </span>
                      <span className="text-right font-medium tabular-nums text-ink">{formatNumber(row.quotedUsd)}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </DomainCard>
      </div>

      <DomainCard
        accent="#7c5cff"
        title="华为云业务"
        hint={data.portfolio ? `共 ${data.portfolio.cloud.cloudRowCount} 条对账 · 应收 ${formatNumber(data.portfolio.cloud.receivableUsd)} USD · 应付 ${formatNumber(data.portfolio.cloud.payableUsd)} USD` : "加载中…"}
      >
        <div className="p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink">结算毛利 · 按月</span>
            <span className="text-xs text-ink-3">数据源 settlementGrossProfit</span>
            <div className="ml-auto flex items-center gap-2">
              <Button
                onClick={() => setGrossProfitMode("all")}
                tone={grossProfitMode === "all" ? "primary" : "default"}
              >
                全部客户
              </Button>
              <Button
                onClick={() => setGrossProfitMode("one")}
                tone={grossProfitMode === "one" ? "primary" : "default"}
              >
                单个客户
              </Button>
              {grossProfitMode === "one" && grossProfit?.byCustomer.length ? (
                <Select value={grossProfitCustomer || grossProfit.byCustomer[0].customer} onChange={(event) => setGrossProfitCustomer(event.target.value)}>
                  {grossProfit.byCustomer.map((row) => (
                    <option key={row.customer} value={row.customer}>{row.customer}</option>
                  ))}
                </Select>
              ) : null}
            </div>
          </div>
          <ServiceFeeLineChart chart={grossProfitChart} loading={loading} />
          {grossProfit?.byCustomer.length ? (
            <div className="mt-4 border-t border-dashed border-line-soft pt-3">
              <div className="mb-2 text-xs text-ink-3">
                {grossProfit.months[grossProfit.months.length - 1]} 各客户结算毛利（点击切换上方折线）
              </div>
              {grossProfit.byCustomer.map((row) => {
                const latest = Number(row.values[row.values.length - 1] ?? 0);
                const top = Math.max(1, ...grossProfit.byCustomer.map((entry) => Number(entry.values[entry.values.length - 1] ?? 0)));
                return (
                  <button
                    className={`grid w-full grid-cols-[160px_1fr_110px] items-center gap-2.5 rounded px-1 py-1 text-left text-xs hover:bg-surface-2 ${grossProfitMode === "one" && grossProfitCustomer === row.customer ? "bg-info-soft" : ""}`}
                    key={row.customer}
                    onClick={() => { setGrossProfitCustomer(row.customer); setGrossProfitMode("one"); }}
                    type="button"
                  >
                    <span className="truncate text-ink-2" title={row.customer}>{row.customer}</span>
                    <span className="h-3 overflow-hidden rounded bg-canvas-deep">
                      <span className="block h-full rounded bg-[#7c5cff]" style={{ width: `${Math.max(1, Math.round((latest / top) * 100))}%` }} />
                    </span>
                    <span className="text-right font-medium tabular-nums text-ink">{formatNumber(latest)}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </DomainCard>
    </Panel>
  );
}

/** 首页分域指标卡：集采与华为云各一块，口径与对应模块列表一致。 */
function DomainCard({
  title,
  hint,
  accent,
  metrics,
  children,
}: {
  title: string;
  hint: string;
  accent: string;
  metrics?: Array<{ label: string; value: number; unit: string; money?: boolean }>;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded-lg border border-line-soft bg-surface">
      <button className="flex w-full items-center gap-2 px-4 py-3 text-left" onClick={() => setOpen((value) => !value)} type="button">
        <span className="h-2 w-2 flex-none rounded-full" style={{ background: accent }} />
        <h2 className="text-sm font-medium text-ink">{title}</h2>
        <span className="text-xs text-ink-3">{hint}</span>
        <span className="ml-auto text-xs text-ink-3">{open ? "▾" : "▸"}</span>
      </button>
      {open ? <div className="border-t border-line-soft">{children ?? <div className="grid gap-3 p-4 sm:grid-cols-2">
        {metrics?.map((metric) => (
          <div className="rounded-md border border-line-soft bg-surface-2 px-3 py-2.5" key={metric.label}>
            <div className="text-xs text-ink-3">{metric.label}</div>
            <div className="mt-1 text-xl font-semibold text-ink">
              {metric.money ? metric.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : metric.value}
              <span className="ml-1 text-xs font-normal text-ink-3">{metric.unit}</span>
            </div>
          </div>
        ))}</div>}
      </div> : null}
    </section>
  );
}

function ServiceFeeLineChart({
  chart,
  loading,
}: {
  chart: ReturnType<typeof buildServiceFeeChartSeries>;
  loading: boolean;
}) {
  const width = 760;
  const height = 260;
  const padding = { top: 20, right: 24, bottom: 42, left: 70 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = chart.series.flatMap((line) => line.values).filter((value): value is number => value !== null);
  const minValue = values.length ? Math.min(0, ...values) : 0;
  const maxValue = values.length ? Math.max(0, ...values) : 0;
  const span = maxValue === minValue ? 1 : maxValue - minValue;
  const colors = ["#1890ff", "#13ce66", "#ffba00", "#f56c6c", "#7c3aed", "#00a6a6"];

  function x(index: number) {
    if (chart.months.length <= 1) return padding.left + plotWidth / 2;
    return padding.left + (index / (chart.months.length - 1)) * plotWidth;
  }

  function y(value: number) {
    return padding.top + (1 - (value - minValue) / span) * plotHeight;
  }

  function buildPath(valuesForLine: Array<number | null>) {
    return valuesForLine
      .map((value, index) => (value === null ? "" : `${index === 0 || valuesForLine[index - 1] === null ? "M" : "L"} ${x(index)} ${y(value)}`))
      .filter(Boolean)
      .join(" ");
  }

  const yTicks = [maxValue, minValue + span / 2, minValue];

  return (
    <div className="mb-3 border border-line-soft bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-ink-2">
        {chart.series.map((line, index) => (
          <span className="inline-flex items-center gap-1" key={line.key}>
            <span className="h-2 w-5" style={{ backgroundColor: colors[index % colors.length] }} />
            {line.label}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <svg aria-label="每月服务费趋势图" className="min-w-[640px] w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
          <rect fill="#fff" height={height} width={width} />
          {values.length ? (
            <>
              {yTicks.map((tick, index) => (
                <g key={`${tick}-${index}`}>
                  <line stroke="#ebeef5" x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} />
                  <text fill="#909399" fontSize="11" textAnchor="end" x={padding.left - 8} y={y(tick) + 4}>
                    {formatCompactNumber(tick)}
                  </text>
                </g>
              ))}
              {chart.months.map((month, index) => (
                <text fill="#909399" fontSize="11" key={month} textAnchor="middle" x={x(index)} y={height - 16}>
                  {month}
                </text>
              ))}
              <line stroke="#dcdfe6" x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} />
              <line stroke="#dcdfe6" x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} />
              {chart.series.map((line, index) => (
                <g key={line.key}>
                  <path d={buildPath(line.values)} fill="none" stroke={colors[index % colors.length]} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                  {line.values.map((value, pointIndex) =>
                    value === null ? null : (
                      <circle
                        cx={x(pointIndex)}
                        cy={y(value)}
                        fill="#fff"
                        key={`${line.key}-${chart.months[pointIndex]}`}
                        r="3.5"
                        stroke={colors[index % colors.length]}
                        strokeWidth="2"
                      >
                        <title>{`${line.label} ${chart.months[pointIndex]}：${formatNumber(value)}`}</title>
                      </circle>
                    ),
                  )}
                </g>
              ))}
            </>
          ) : (
            <text fill="#909399" fontSize="14" textAnchor="middle" x={width / 2} y={height / 2}>
              <TableStateContent empty="暂无服务费趋势数据" loading={loading} />
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}

function SummaryTable({
  columns,
  emptyText,
  rows,
}: {
  columns: Array<{ key: string; label: string; type?: string }>;
  emptyText: ReactNode;
  rows: Array<Record<string, string | number>>;
}) {
  return (
    <div className="max-h-[320px] overflow-auto border border-line-soft">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-canvas text-ink">
          <tr>
            {columns.map((column) => (
              <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3 text-left font-medium" key={column.key}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr className="hover:bg-surface-2" key={`${row.countryCode}-${row.month}-${row.currency ?? ""}-${index}`}>
              {columns.map((column) => (
                <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2" key={column.key}>
                  {formatDisplayValue(row[column.key], column.type)}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td className="py-10 text-center text-ink-3" colSpan={columns.length}>
                {emptyText}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function formatNumber(value: number) {
  return formatDisplayValue(value, "number");
}

function formatCompactNumber(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return formatNumber(value);
}
