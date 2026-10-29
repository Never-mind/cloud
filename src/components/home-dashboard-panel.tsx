"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { buildServiceFeeChartSeries, buildServiceFeeView, buildCloudFinancialView, recentDashboardMonths, type DashboardServiceFeeSummary, type DashboardCloudFinancials } from "@/lib/dashboard-workflow";
import { CloudFinancialTable, ServiceFeeMatrix, cloudAmountText } from "./dashboard-financial-tables";
import { formatDisplayValue, formatMoneyValue } from "@/lib/display-format";
import { Button, Panel, Select } from "./ui";
import { postWorkspaceMessage } from "@/lib/tab-workspace";

type NewInstanceSummary = {
  countryCode: string;
  month: string;
  instanceQuantity: number;
};

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
    /** 售前三个环节的当前数量与金额（客户询价中 / 报价中 / 报价确认待立项）。 */
    pipeline?: {
      customerPoDraft: number;
      quotationDraft: number;
      quotationDraftAmount: number;
      quotationPendingProject: number;
      quotationPendingProjectAmount: number;
      quotationConfirmed: number;
    };
    byCustomer: Array<{ customer: string; projectCount: number; quotedUsd: number; receivedUsd: number }>;
    quotedUsdTotal: number;
    receivedUsdTotal: number;
  };
  cloud: {
    cloudRowCount: number;
    receivableUsd: number;
    payableUsd: number;
    financials: DashboardCloudFinancials;
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

const CLOUD_METRICS = [
  { metric: "receivableNet", label: "客户营收（未税）" },
  { metric: "profitNet", label: "毛利（未税）" },
] as const;

type DashboardData = {
  countries: string[];
  serviceFees: DashboardServiceFeeSummary[];
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
  const [loadError, setLoadError] = useState("");
  const requestVersion = useRef(0);
  // 华为云营收与毛利共用客户、账期筛选。
  const [cloudMode, setCloudMode] = useState<"all" | "one">("all");
  const [cloudCustomer, setCloudCustomer] = useState("");
  // 默认最近 3 个连续自然月，保留历史范围选择。
  const [cloudStart, setCloudStart] = useState("");
  const [cloudEnd, setCloudEnd] = useState("");

  async function loadData(nextCountryCode = countryCode) {
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadError("");
    const params = new URLSearchParams();
    if (nextCountryCode) params.set("countryCode", nextCountryCode);
    try {
      const response = await fetch(`/api/dashboard/overview?${params.toString()}`);
      if (!response.ok) throw new Error("经营数据加载失败，请刷新重试");
      const nextData = (await response.json()) as DashboardData;
      if (version !== requestVersion.current) return;
      setData({
        countries: nextData.countries ?? [],
        serviceFees: nextData.serviceFees ?? [],
        newInstances: nextData.newInstances ?? [],
        instanceReceipt: nextData.instanceReceipt ?? [],
        portfolio: nextData.portfolio ?? null,
      });
    } catch {
      if (version === requestVersion.current) {
        setData((previous) => ({ ...emptyData, countries: previous.countries }));
        setLoadError("经营数据加载失败，请刷新重试");
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }

  /** 快捷选「最近 N 个月」：把账期范围设成末尾 N 个月。 */
  function applyRecentMonths(count: number) {
    const months = financials?.months ?? [];
    if (!months.length) return;
    const recent = recentDashboardMonths(months, count);
    setCloudStart(recent[0] < months[0] ? months[0] : recent[0]);
    setCloudEnd(months[months.length - 1]);
  }

  useEffect(() => {
    void loadData("");
  }, []);

  const serviceFeeChart = useMemo(
    () => buildServiceFeeChartSeries(data.serviceFees),
    [data.serviceFees],
  );
  const serviceFeeView = useMemo(() => buildServiceFeeView(data.serviceFees), [data.serviceFees]);
  const financials = data.portfolio?.cloud.financials;
  const selectedCustomer = financials?.byCustomer.find((row) => row.key === cloudCustomer) ?? financials?.byCustomer[0];
  const cloudView = useMemo(
    () => buildCloudFinancialView(financials, cloudStart, cloudEnd, cloudMode === "one" ? selectedCustomer?.key : ""),
    [financials, cloudStart, cloudEnd, cloudMode, selectedCustomer?.key],
  );
  const cloudChart = {
    months: cloudView.months,
    series: CLOUD_METRICS.map(({ metric, label }) => ({
      key: metric,
      label,
      values: cloudView.monthTotals.map((value) => value?.[metric] ?? null),
    })),
  };

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
          <p className="mt-1 text-xs text-ink-3">查看算力服务费、集采项目及华为云客户营收和毛利。</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select
            aria-label="算力国家"
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

      {loadError ? <p className="px-4 py-3 text-sm text-red-600" role="alert">{loadError}</p> : null}
      <DomainCard accent="#409eff" hint="服务费 · 最近 3 个月" title="算力系统">
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="font-medium text-ink">每月服务费合计</div>
            <div className="text-xs text-ink-3">{serviceFeeChart.months.length ? serviceFeeChart.months[0] + " ~ " + serviceFeeChart.months[serviceFeeChart.months.length - 1] : "最近 3 个月"} · BR 统一 USD</div>
          </div>
          <ServiceFeeLineChart chart={serviceFeeChart} loading={loading} label="每月服务费趋势图" />
          <ServiceFeeMatrix view={serviceFeeView} loading={loading} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-medium text-ink">设备签收情况</div>
            <div className="text-xs text-ink-3">全部历史 · 已生成物流 · 仅设备类型</div>
          </div>
          {/* 已签收 / 未签收上下摆放 */}
          <div className="grid gap-4">
            <CountryDonut color="#409eff" emptyText="暂无已签收设备" pie={receiptPies.received} title="已签收设备" />
            <CountryDonut color="#f56c6c" emptyText="暂无未签收设备" pie={receiptPies.unreceived} title="未签收设备" />
          </div>
          <p className="mt-2 text-xs text-ink-3">按需求明细的设备台数统计；物流派送时间有值为已签收，未填为未签收。尚未生成物流的待下单设备不计入。</p>
        </div>
      </div>
      </DomainCard>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <DomainCard
          accent="#67c23a"
          className="lg:col-span-2"
          title="集采系统"
          hint={data.portfolio ? `客户PO ${data.portfolio.po.customerPoCount} · 报价单 ${data.portfolio.po.quotationCount} · 项目结算 ${data.portfolio.po.settlementProjectCount}` : "加载中…"}
        >
          <div className="p-4">
            <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-3">
              <span>项目数 <b className="text-ink">{data.portfolio?.po.settlementProjectCount ?? 0}</b></span>
              <span>报价收入（USD） <b className="text-ink">{formatMoneyValue(data.portfolio?.po.quotedUsdTotal ?? 0)}</b></span>
              <span>已确认收入（USD） <b className="text-ink">{formatMoneyValue(data.portfolio?.po.receivedUsdTotal ?? 0)}</b></span>
            </div>
            {/*
              集采流水线：8 个环节排成一排（存量口径 —— 每格是「当前停在这个状态的数量」，互不重叠）。
              售前用绿色顶边、交付用蓝色顶边；整块可点，落到对应列表并带上筛选。
            */}
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-3">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-success-strong" />售前：客户PO / 报价单</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary" />交付：项目结算</span>
              <span className="ml-auto">点卡片跳到对应列表</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
              <PipelineStage
                hint="客户PO 草稿"
                href="/customer-pos?status=draft"
                label="客户询价中"
                tone="pre"
                value={data.portfolio?.po.pipeline?.customerPoDraft ?? 0}
              />
              <PipelineStage
                hint={`${formatCompactNumber(data.portfolio?.po.pipeline?.quotationDraftAmount ?? 0)} USD`}
                href="/quotation/list?status=draft"
                label="报价中"
                tone="pre"
                value={data.portfolio?.po.pipeline?.quotationDraft ?? 0}
              />
              <PipelineStage
                hint={`待立项 · ${formatCompactNumber(data.portfolio?.po.pipeline?.quotationPendingProjectAmount ?? 0)} USD`}
                href="/quotation/list?status=confirmed&projectStatus=pending"
                label="报价确认"
                tone="pre"
                value={data.portfolio?.po.pipeline?.quotationPendingProject ?? 0}
              />
              {SETTLEMENT_STATUS_LABELS.map(([status, label]) => (
                <PipelineStage
                  hint={`${formatCompactNumber(data.portfolio?.po.statusAmounts?.[status] ?? 0)} USD`}
                  href={`/po/settlement-projects?status=${encodeURIComponent(status)}`}
                  key={status}
                  label={label}
                  tone="dev"
                  value={data.portfolio?.po.statusCounts?.[status] ?? 0}
                />
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
        hint="客户营收（未税） / 毛利（未税） · USD"
      >
        <div className="min-w-0 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink">客户月度经营情况</span>
            <div className="ml-auto flex max-w-full flex-wrap items-center gap-2">
              <Button onClick={() => setCloudMode("all")} tone={cloudMode === "all" ? "primary" : "default"}>全部客户</Button>
              <Button onClick={() => setCloudMode("one")} tone={cloudMode === "one" ? "primary" : "default"}>单个客户</Button>
              {cloudMode === "one" && financials?.byCustomer.length ? (
                <Select aria-label="华为云客户" className="max-w-full" value={selectedCustomer?.key ?? ""} onChange={(event) => setCloudCustomer(event.target.value)}>
                  {financials.byCustomer.map((row) => <option key={row.key} value={row.key}>{row.customer}</option>)}
                </Select>
              ) : null}
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-3">账期</span>
            <Select aria-label="华为云开始月份" className="w-[108px]" value={cloudView.months[0] ?? ""} onChange={(event) => {
              setCloudStart(event.target.value);
              if (event.target.value > (cloudView.months[cloudView.months.length - 1] ?? "")) setCloudEnd(event.target.value);
            }}>
              {(financials?.months ?? []).map((month) => <option key={month} value={month}>{month}</option>)}
            </Select>
            <span className="text-xs text-ink-3">~</span>
            <Select aria-label="华为云结束月份" className="w-[108px]" value={cloudView.months[cloudView.months.length - 1] ?? ""} onChange={(event) => {
              setCloudEnd(event.target.value);
              if (event.target.value < (cloudView.months[0] ?? "")) setCloudStart(event.target.value);
            }}>
              {(financials?.months ?? []).map((month) => <option key={month} value={month}>{month}</option>)}
            </Select>
            {[3, 6, 12].map((count) => <Button key={count} onClick={() => applyRecentMonths(count)}>最近 {count} 个月</Button>)}
          </div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-ink">营收与毛利趋势 · {cloudMode === "one" ? selectedCustomer?.customer ?? "客户" : "全部客户"}</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
              {CLOUD_METRICS.map(({ metric, label }) => (
                <span key={metric}>{label}合计：<strong className="font-medium text-ink">{cloudAmountText(cloudView.total, metric)}</strong> USD</span>
              ))}
            </div>
          </div>
          <ServiceFeeLineChart chart={cloudChart} loading={loading} label="华为云营收与毛利（未税）趋势图" />
          <p className="mb-2 text-xs text-ink-3">
            {cloudView.months.length ? cloudView.months[0] + " ~ " + cloudView.months[cloudView.months.length - 1] + " · " : ""}
            单位：USD · 点击客户名可查看该客户 · 无账单显示“—”
          </p>
          <CloudFinancialTable view={cloudView} loading={loading} onCustomerSelect={(key) => { setCloudCustomer(key); setCloudMode("one"); }} />
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
  className = "",
}: {
  title: string;
  hint: string;
  accent: string;
  metrics?: Array<{ label: string; value: number; unit: string; money?: boolean }>;
  children?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className={`min-w-0 rounded-lg border border-line-soft bg-surface ${className}`}>
      <button className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left" onClick={() => setOpen((value) => !value)} type="button">
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
  label,
}: {
  chart: ReturnType<typeof buildServiceFeeChartSeries>;
  loading: boolean;
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.floor(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const height = 260;
  const padding = { top: 20, right: 24, bottom: 42, left: width < 400 ? 46 : 64 };
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

  const yTicks = [...new Set([maxValue, minValue + span / 2, minValue])];

  /**
   * x 轴标签防重叠：
   *   - 单年数据用「09月」，跨年用「25-12」，比完整 YYYY-MM 短一半；
   *   - 按画布宽度算最多能放几个标签，放不下就隔几个显示一个（并且保证最后一个一定有标签）。
   */
  const sameYear = new Set(chart.months.map((month) => month.slice(0, 4))).size <= 1;
  const maxTicks = Math.max(2, Math.floor(plotWidth / 62));
  const tickStep = Math.max(1, Math.ceil(chart.months.length / maxTicks));
  const tickOffset = chart.months.length ? (chart.months.length - 1) % tickStep : 0;
  const axisTicks = chart.months
    .map((month, index) => ({ month, index }))
    .filter(({ index }) => index % tickStep === tickOffset);
  const formatAxisMonth = (month: string) => {
    const [year, mm] = month.split("-");
    if (!year || !mm) return month;
    return sameYear ? `${mm}月` : `${year.slice(2)}-${mm}`;
  };

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
      <div className="min-w-0" ref={containerRef}>
        <svg aria-label={label} className="block w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
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
              {axisTicks.map(({ month, index }) => (
                <text fill="#909399" fontSize="11" key={month} textAnchor="middle" x={x(index)} y={height - 16}>
                  {formatAxisMonth(month)}
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
                        <title>{chart.months[pointIndex]} · {line.label}：{formatMoneyValue(value)}</title>
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
                            {`${chart.months[pointIndex]} · ${line.label}`}
                          </text>
                          <text fill="#fff" fontSize="11" x={tooltipX(pointIndex) + 8} y={tipY + 29}>
                            {formatMoneyValue(value)}
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
              {loading ? "加载中…" : "暂无可展示的趋势数据"}
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}

/**
 * 集采流水线的单个环节卡片：整块可点，在工作区里新开一个标签并带上筛选。
 * 数量为 0 时数字用浅灰，避免抢视觉。
 */
function PipelineStage({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  href: string;
  tone: "pre" | "dev";
}) {
  return (
    <button
      className={`group relative flex flex-col rounded border border-line-soft border-t-[3px] bg-surface-2 px-2.5 py-2 text-left transition-colors hover:border-primary hover:bg-white ${
        tone === "pre" ? "border-t-success-strong" : "border-t-primary"
      }`}
      onClick={() => postWorkspaceMessage({ type: "cloud-power:open-tab", route: href, title: label })}
      title={`${label}：${value} 个`}
      type="button"
    >
      <span className="truncate pr-4 text-xs text-ink-3">{label}</span>
      <span className={`mt-0.5 text-lg font-semibold leading-tight ${value ? "text-ink" : "text-ink-4"}`}>
        {formatNumber(value)}
        <span className="ml-0.5 text-[11px] font-normal text-ink-3">个</span>
      </span>
      <span className="truncate text-[11px] text-ink-4" title={hint}>{hint}</span>
      <ArrowUpRight className="absolute right-2 top-2 text-ink-4 transition-colors group-hover:text-primary" size={12} />
    </button>
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

function formatNumber(value: number) {
  return formatDisplayValue(value, "number");
}

function formatCompactNumber(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return formatNumber(value);
}
