"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { buildServiceFeeChartSeries } from "@/lib/dashboard-workflow";
import { formatDisplayValue, formatMoneyValue } from "@/lib/display-format";
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

/** 首页饼图数据：按国家 × 签收状态的设备台数（全部历史、仅设备类型） */
type InstanceReceipt = {
  countryCode: string;
  receiptStatus: "received" | "unreceived";
  devices: number;
};

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
  instanceReceipt: InstanceReceipt[];
  portfolio: DomainPortfolio | null;
};

const emptyData: DashboardData = {
  countries: [],
  serviceFees: [],
  newInstances: [],
  instanceReceipt: [],
  portfolio: null,
};

export function HomeDashboardPanel() {
  const [countryCode, setCountryCode] = useState("");
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(false);
  // 华为云毛利趋势：全部客户 / 单个客户
  const [grossProfitMode, setGrossProfitMode] = useState<"all" | "one">("all");
  const [grossProfitCustomer, setGrossProfitCustomer] = useState("");
  // 华为云账期范围（默认最近 6 个月；可下拉选起止月份或用快捷按钮）
  const [grossProfitStart, setGrossProfitStart] = useState("");
  const [grossProfitEnd, setGrossProfitEnd] = useState("");

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
      instanceReceipt: nextData.instanceReceipt ?? [],
      portfolio: nextData.portfolio ?? null,
    });
    setLoading(false);
  }

  /** 快捷选「最近 N 个月」：把账期范围设成末尾 N 个月。 */
  function applyRecentMonths(count: number) {
    const months = grossProfit?.months ?? [];
    if (!months.length) return;
    setGrossProfitStart(months[Math.max(0, months.length - count)]);
    setGrossProfitEnd(months[months.length - 1]);
  }

  useEffect(() => {
    void loadData("");
  }, []);

  const totalServiceFee = useMemo(
    () => data.serviceFees.reduce((total, row) => total + Number(row.serviceFeeTotal ?? 0), 0),
    [data.serviceFees],
  );

  const serviceFeeChart = useMemo(
    () => buildServiceFeeChartSeries(data.serviceFees),
    [data.serviceFees],
  );
  const grossProfit = data.portfolio?.cloud.grossProfit;
  // 复用服务费那张折线图：全部客户用月度合计，单个客户取该客户的月度序列。
  const grossProfitRange = useMemo(() => {
    const months = grossProfit?.months ?? [];
    if (!months.length) return { months: [] as string[], from: 0, to: -1 };
    const startIndex = grossProfitStart ? months.indexOf(grossProfitStart) : Math.max(0, months.length - 6);
    const endIndex = grossProfitEnd ? months.indexOf(grossProfitEnd) : months.length - 1;
    const from = Math.min(startIndex < 0 ? 0 : startIndex, endIndex < 0 ? months.length - 1 : endIndex);
    const to = Math.max(startIndex < 0 ? 0 : startIndex, endIndex < 0 ? months.length - 1 : endIndex);
    return { months: months.slice(from, to + 1), from, to };
  }, [grossProfit, grossProfitStart, grossProfitEnd]);

  const grossProfitChart = useMemo(() => {
    if (!grossProfit) return { months: [] as string[], series: [] as Array<{ key: string; label: string; values: number[] }> };
    const { months, from, to } = grossProfitRange;
    const row = grossProfit.byCustomer.find((entry) => entry.customer === grossProfitCustomer) ?? grossProfit.byCustomer[0];
    const series = grossProfitMode === "all"
      ? [{ key: "all", label: "全部客户合计", values: grossProfit.totals.slice(from, to + 1) }]
      : row ? [{ key: row.customer, label: row.customer, values: row.values.slice(from, to + 1) }] : [];
    return { months, series };
  }, [grossProfit, grossProfitCustomer, grossProfitMode, grossProfitRange]);

  /** 客户 × 账期的毛利表（按所选账期切片，按区间合计倒序）。 */
  const grossProfitTable = useMemo(() => {
    if (!grossProfit) return null;
    const { months, from, to } = grossProfitRange;
    const rows = grossProfit.byCustomer.map((entry) => {
      const values = entry.values.slice(from, to + 1);
      return { customer: entry.customer, values, total: values.reduce((sum, value) => sum + Number(value ?? 0), 0) };
    }).sort((left, right) => right.total - left.total);
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    const monthTotals = months.map((_, index) => rows.reduce((sum, row) => sum + Number(row.values[index] ?? 0), 0));
    return { months, rows, total, monthTotals };
  }, [grossProfit, grossProfitRange]);

  /** 服务费表只显示最近一个月（各国一行）。 */
  const latestServiceFee = useMemo(() => {
    const months = data.serviceFees.map((row) => String(row.month ?? "")).filter(Boolean).sort();
    const latest = months.length ? months[months.length - 1] : "";
    return { month: latest, rows: data.serviceFees.filter((row) => String(row.month ?? "") === latest) };
  }, [data.serviceFees]);

  /** 饼图：已签收 / 未签收，按国家统计设备台数（全部历史、仅设备类型）。 */
  const receiptPies = useMemo(() => {
    const build = (status: "received" | "unreceived") => {
      const byCountry = new Map<string, number>();
      for (const row of data.instanceReceipt) {
        if (row.receiptStatus !== status) continue;
        const key = String(row.countryCode ?? "").trim() || "未分配国家";
        byCountry.set(key, (byCountry.get(key) ?? 0) + Number(row.devices ?? 0));
      }
      const entries = [...byCountry.entries()].filter(([code]) => code !== "未分配国家").sort((left, right) => right[1] - left[1]);
      const total = [...byCountry.values()].reduce((sum, value) => sum + value, 0);
      return { total, entries, unassigned: byCountry.get("未分配国家") ?? 0 };
    };
    return { received: build("received"), unreceived: build("unreceived") };
  }, [data.instanceReceipt]);

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
            <div className="text-xs text-ink-3">当前合计：{formatMoneyValue(totalServiceFee)}</div>
          </div>
          <ServiceFeeLineChart chart={serviceFeeChart} loading={loading} />
          <div className="mb-1 text-xs text-ink-3">最近一个月（{latestServiceFee.month || "-"}）各国服务费</div>
          <SummaryTable
            columns={[
              { key: "countryCode", label: "国家" },
              { key: "month", label: "月份" },
              { key: "currency", label: "币种" },
              { key: "serviceFeeTotal", label: "服务费合计", type: "number" },
            ]}
            emptyText=<TableStateContent empty="暂无服务费数据" loading={loading} />
            rows={latestServiceFee.rows}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-medium text-ink">设备签收情况</div>
            <div className="text-xs text-ink-3">全部历史 · 仅设备类型 · 按国家/台数</div>
          </div>
          {/* 已签收 / 未签收上下摆放 */}
          <div className="grid gap-4">
            <CountryDonut color="#409eff" emptyText="暂无已签收设备" pie={receiptPies.received} title="已签收设备" />
            <CountryDonut color="#f56c6c" emptyText="暂无未签收设备" pie={receiptPies.unreceived} title="未签收设备" />
          </div>
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
              <span>报价收入（USD） <b className="text-ink">{formatMoneyValue(data.portfolio?.po.quotedUsdTotal ?? 0)}</b></span>
              <span>已确认收入（USD） <b className="text-ink">{formatMoneyValue(data.portfolio?.po.receivedUsdTotal ?? 0)}</b></span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {SETTLEMENT_STATUS_LABELS.map(([status, label]) => (
                <div className="rounded-md border border-line-soft bg-surface-2 px-3 py-2" key={status}>
                  <div className="text-xs text-ink-3">{label}</div>
                  <div className="mt-0.5 text-lg font-semibold text-ink">
                    {data.portfolio?.po.statusCounts?.[status] ?? 0}
                    <span className="ml-1 text-xs font-normal text-ink-3">个</span>
                  </div>
                  <div className="text-[11px] text-ink-4">报价 {formatMoneyValue(data.portfolio?.po.statusAmounts?.[status] ?? 0)} USD</div>
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
                      <span className="text-right font-medium tabular-nums text-ink">{formatMoneyValue(row.quotedUsd)}</span>
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
        hint={data.portfolio ? `共 ${data.portfolio.cloud.cloudRowCount} 条对账 · 应收 ${formatMoneyValue(data.portfolio.cloud.receivableUsd)} USD · 应付 ${formatMoneyValue(data.portfolio.cloud.payableUsd)} USD` : "加载中…"}
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
              <span className="ml-2 text-xs text-ink-3">账期</span>
              <Select className="w-[104px]" value={grossProfitStart || (grossProfitRange.months[0] ?? "")} onChange={(event) => setGrossProfitStart(event.target.value)}>
                {(grossProfit?.months ?? []).map((month) => <option key={month} value={month}>{month}</option>)}
              </Select>
              <span className="text-xs text-ink-3">~</span>
              <Select className="w-[104px]" value={grossProfitEnd || (grossProfitRange.months[grossProfitRange.months.length - 1] ?? "")} onChange={(event) => setGrossProfitEnd(event.target.value)}>
                {(grossProfit?.months ?? []).map((month) => <option key={month} value={month}>{month}</option>)}
              </Select>
              <Button onClick={() => applyRecentMonths(3)}>最近 3 个月</Button>
              <Button onClick={() => applyRecentMonths(6)}>最近 6 个月</Button>
              <Button onClick={() => applyRecentMonths(12)}>最近 12 个月</Button>
            </div>
          </div>
          <ServiceFeeLineChart chart={grossProfitChart} loading={loading} />
          {grossProfitTable && grossProfitTable.rows.length ? (
            <div className="mt-4 border-t border-dashed border-line-soft pt-3">
              <div className="mb-2 text-xs text-ink-3">
                各客户毛利（USD）· {grossProfitTable.months[0]} ~ {grossProfitTable.months[grossProfitTable.months.length - 1]}
                ，点击客户名可切换上方折线
              </div>
              <div className="overflow-x-auto border border-line-soft">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-canvas text-ink">
                    <tr>
                      <th className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-line-soft bg-canvas px-3 py-2 text-left font-medium">客户</th>
                      {grossProfitTable.months.map((month) => (
                        <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right font-medium" key={month}>{month}</th>
                      ))}
                      <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right font-medium">合计</th>
                      <th className="whitespace-nowrap border-b border-line-soft px-3 py-2 text-right font-medium">占比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grossProfitTable.rows.map((row) => (
                      <tr className="hover:bg-surface-2" key={row.customer}>
                        <td className="sticky left-0 z-10 max-w-[180px] truncate whitespace-nowrap border-b border-r border-line-soft bg-white px-3 py-2">
                          <button className="text-primary hover:underline" onClick={() => { setGrossProfitCustomer(row.customer); setGrossProfitMode("one"); }} title={row.customer} type="button">{row.customer}</button>
                        </td>
                        {row.values.map((value, index) => (
                          <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right tabular-nums" key={index}>{formatMoneyValue(Number(value ?? 0))}</td>
                        ))}
                        <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right font-medium tabular-nums text-ink">{formatMoneyValue(row.total)}</td>
                        <td className="whitespace-nowrap border-b border-line-soft px-3 py-2 text-right tabular-nums text-ink-3">{grossProfitTable.total ? ((row.total / grossProfitTable.total) * 100).toFixed(1) + "%" : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-surface-2 font-medium text-ink">
                    <tr>
                      <td className="sticky left-0 z-10 whitespace-nowrap border-r border-t border-line-soft bg-surface-2 px-3 py-2">合计</td>
                      {grossProfitTable.monthTotals.map((value, index) => (
                        <td className="whitespace-nowrap border-r border-t border-line-soft px-3 py-2 text-right tabular-nums" key={index}>{formatMoneyValue(value)}</td>
                      ))}
                      <td className="whitespace-nowrap border-r border-t border-line-soft px-3 py-2 text-right tabular-nums">{formatMoneyValue(grossProfitTable.total)}</td>
                      <td className="whitespace-nowrap border-t border-line-soft px-3 py-2 text-right">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
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

  /** 悬浮提示框的横向位置：贴住节点，但不超出画布。 */
  function tooltipX(index: number) {
    return Math.min(Math.max(x(index) - 84, 4), width - 176);
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
                  {line.values.map((value, pointIndex) => {
                    if (value === null) return null;
                    // 节点悬浮显示金额：外层 group 控制 hover，透明大圆扩大命中区域，提示框贴住节点
                    const tipY = Math.max(4, y(value) - 46);
                    return (
                      <g className="group" key={`${line.key}-${chart.months[pointIndex]}`}>
                        <circle cx={x(pointIndex)} cy={y(value)} fill="transparent" r="12" />
                        <circle
                          cx={x(pointIndex)}
                          cy={y(value)}
                          fill="#fff"
                          r="3.5"
                          stroke={colors[index % colors.length]}
                          strokeWidth="2"
                        />
                        <g className="pointer-events-none opacity-0 transition-opacity group-hover:opacity-100">
                          <rect fill="#303133" height="36" rx="4" width="172" x={tooltipX(pointIndex)} y={tipY} />
                          <text fill="#fff" fontSize="11" x={tooltipX(pointIndex) + 8} y={tipY + 14}>
                            {chart.months[pointIndex]}
                          </text>
                          <text fill="#fff" fontSize="11" x={tooltipX(pointIndex) + 8} y={tipY + 29}>
                            {`${line.label} ${formatMoneyValue(value)}`}
                          </text>
                        </g>
                      </g>
                    );
                  })}
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

/** 国家占比环形图：饼图按国家切片，中心显示总台数，右侧图例给出台数与占比。 */
function CountryDonut({
  title,
  pie,
  color,
  emptyText,
}: {
  title: string;
  pie: { total: number; entries: Array<[string, number]>; unassigned: number };
  color: string;
  emptyText: string;
}) {
  const palette = [color, "#13ce66", "#ffba00", "#7c3aed", "#00a6a6", "#f56c6c"];
  const circumference = 2 * Math.PI * 15.9155;
  let offset = 0;
  const segments = pie.entries.map(([code, devices], index) => {
    const ratio = pie.total > 0 ? devices / pie.total : 0;
    const length = ratio * circumference;
    const segment = { code, devices, ratio, length, offset, color: palette[index % palette.length] };
    offset += length;
    return segment;
  });
  const percent = (value: number) => (pie.total > 0 ? ((value / pie.total) * 100).toFixed(1) + "%" : "0%");
  return (
    <div className="rounded border border-line-soft p-3">
      <div className="mb-2 text-sm font-medium text-ink">
        {title}
        <span className="ml-2 text-xs font-normal text-ink-3">{formatNumber(pie.total)} 台</span>
      </div>
      {pie.total ? (
        <div className="flex items-center gap-4">
          <svg aria-label={`${title}占比`} className="h-[118px] w-[118px] shrink-0" viewBox="0 0 42 42">
            <circle cx="21" cy="21" fill="none" r="15.9155" stroke="#eef1f5" strokeWidth="7" />
            {segments.map((segment) => (
              <circle
                cx="21"
                cy="21"
                fill="none"
                key={segment.code}
                r="15.9155"
                stroke={segment.color}
                strokeDasharray={`${segment.length} ${circumference - segment.length}`}
                strokeDashoffset={-segment.offset}
                strokeWidth="7"
              />
            ))}
            <text textAnchor="middle" x="21" y="21.6" style={{ fontSize: "6.5px", fontWeight: 600 }}>
              {formatCompactNumber(pie.total)}
            </text>
          </svg>
          <div className="min-w-0 flex-1 text-xs text-ink-2">
            {segments.map((segment) => (
              <div className="flex items-center gap-1.5 py-0.5" key={segment.code}>
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: segment.color }} />
                <span className="truncate" title={segment.code}>{segment.code}</span>
                <span className="ml-auto tabular-nums text-ink">{formatNumber(segment.devices)} 台</span>
                <span className="w-12 text-right tabular-nums text-ink-3">{percent(segment.devices)}</span>
              </div>
            ))}
            {pie.unassigned ? (
              <div className="pt-0.5 text-[11px] text-ink-3">另有 {formatNumber(pie.unassigned)} 台未分配国家（不计入占比）</div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-ink-3">{emptyText}</div>
      )}
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
