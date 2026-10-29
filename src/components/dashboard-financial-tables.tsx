import { Fragment } from "react";
import type { CloudMonthlyAmounts, DashboardServiceFeeSummary, buildCloudFinancialView, buildServiceFeeView } from "@/lib/dashboard-workflow";
import { formatMoneyValue } from "@/lib/display-format";
import { TableStateContent } from "./table-state";

const cellClass = "whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right tabular-nums";
const headerClass = "whitespace-nowrap border-b border-r border-line-soft px-3 py-2 font-medium";

export function serviceFeeText(value: Pick<DashboardServiceFeeSummary, "serviceFeeTotal" | "status"> | null) {
  if (!value) return "—";
  if (value.status === "missing_rate") return "待维护汇率";
  if (value.status === "missing_fee") return "待完成核算";
  return value.serviceFeeTotal === null ? "—" : formatMoneyValue(value.serviceFeeTotal);
}

export function cloudAmountText(value: CloudMonthlyAmounts | null, metric: keyof CloudMonthlyAmounts) {
  if (!value) return "—";
  return value[metric] === null ? "待补全" : formatMoneyValue(value[metric]);
}

export function ServiceFeeMatrix({ view, loading }: { view: ReturnType<typeof buildServiceFeeView>; loading: boolean }) {
  const brMonths = view.rows.filter((row) => row.countryCode === "BR").flatMap((row) => row.values).filter((value): value is DashboardServiceFeeSummary => value !== null);
  const pending = view.rows.some((row) => row.total.status !== "ready");
  return (
    <>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3" aria-label="服务费分币种合计">
        {view.totalsByCurrency.map((total) => <span key={total.currency}>近 3 个月合计 · {total.currency}：<strong className="font-medium text-ink">{serviceFeeText(total)}</strong></span>)}
      </div>
      {pending ? <p className="mb-2 text-xs text-amber-700">存在待维护汇率或待完成核算的账期，对应月及合计暂不显示完整金额。</p> : null}
      <div className="overflow-x-auto border border-line-soft">
        <table aria-label="近三个月服务费" className="min-w-full border-collapse text-xs">
          <thead className="bg-canvas text-ink"><tr>
            <th className={`${headerClass} text-left`} scope="col">国家 / 币种</th>
            {view.months.map((month) => <th className={`${headerClass} text-right`} scope="col" key={month}>{month}</th>)}
            <th className={`${headerClass} text-right`} scope="col">合计</th>
          </tr></thead>
          <tbody>
            {view.rows.map((row) => <tr className="hover:bg-surface-2" key={row.key}>
              <th scope="row" className={`${headerClass} text-left`}>{row.countryCode} / {row.currency}</th>
              {row.values.map((value, index) => <td className={cellClass} key={view.months[index]}>{serviceFeeText(value)}</td>)}
              <td className={`${cellClass} font-medium`}>{serviceFeeText(row.total)}</td>
            </tr>)}
            {!view.rows.length ? <tr><td className="py-8 text-center text-ink-3" colSpan={view.months.length + 2}><TableStateContent empty="暂无服务费数据" loading={loading} /></td></tr> : null}
          </tbody>
        </table>
      </div>
      {brMonths.length ? <details className="mt-3 text-xs text-ink-3">
        <summary className="cursor-pointer text-primary">BR 折算明细</summary>
        <p className="my-2">CNY 服务费按账期汇率折成 USD，再与原 USD 服务费合计。当月未维护时沿用之前最近汇率。</p>
        <div className="overflow-x-auto border border-line-soft">
          <table aria-label="BR 服务费折算明细" className="min-w-full border-collapse text-xs">
            <thead className="bg-canvas"><tr>{["月份", "CNY 服务费", "1 USD = CNY", "原 USD 服务费", "合计 USD"].map((title) => <th className={headerClass} scope="col" key={title}>{title}</th>)}</tr></thead>
            <tbody>{brMonths.map((row) => {
              const cny = row.conversion?.find((source) => source.currency === "CNY");
              const usd = row.conversion?.find((source) => source.currency === "USD");
              const others = row.conversion?.filter((source) => !["CNY", "USD"].includes(source.currency)) ?? [];
              return <Fragment key={row.month}>
                <tr>
                  <th scope="row" className={`${headerClass} text-left`}>{row.month}</th>
                  <td className={cellClass}>{!cny ? "—" : cny.amount === null ? "待完成核算" : formatMoneyValue(cny.amount)}</td>
                  <td className={cellClass}>{!cny ? "—" : cny.rateToUsd ? (1 / cny.rateToUsd).toLocaleString("en-US", { maximumFractionDigits: 6 }) : "待维护汇率"}</td>
                  <td className={cellClass}>{!usd ? "—" : usd.amount === null ? "待完成核算" : formatMoneyValue(usd.amount)}</td>
                  <td className={cellClass}>{serviceFeeText(row)}</td>
                </tr>
                {others.map((source) => <tr key={source.currency}><td className={`${cellClass} !text-left`} colSpan={5}>另含 {source.currency}：{source.amount === null ? "待完成核算" : formatMoneyValue(source.amount)} · 折算率 {source.rateToUsd ?? "待维护汇率"} USD / {source.currency}</td></tr>)}
              </Fragment>;
            })}</tbody>
          </table>
        </div>
      </details> : null}
    </>
  );
}

export function CloudFinancialTable({ view, loading, onCustomerSelect }: {
  view: ReturnType<typeof buildCloudFinancialView>;
  loading: boolean;
  onCustomerSelect: (key: string) => void;
}) {
  const groups = [...view.months, "合计"];
  const metricCells = (value: CloudMonthlyAmounts | null, key: string) => (
    <Fragment key={key}>
      <td className={cellClass}>{cloudAmountText(value, "receivableNet")}</td>
      <td className={`${cellClass} ${(value?.profitNet ?? 0) < 0 ? "text-red-600" : ""}`}>{cloudAmountText(value, "profitNet")}</td>
    </Fragment>
  );
  return (
    <div className="overflow-x-auto border border-line-soft">
      <table aria-label="华为云客户月度营收和毛利" className="min-w-full border-collapse text-xs">
        <thead className="bg-canvas text-ink">
          <tr>
            <th className={`${headerClass} sticky left-0 z-10 bg-canvas text-left`} rowSpan={2} scope="col">客户</th>
            {groups.map((month) => <th className={`${headerClass} text-center`} colSpan={2} scope="colgroup" key={month}>{month}</th>)}
          </tr>
          <tr>{groups.map((month) => <Fragment key={month}>
            <th className={`${headerClass} text-right`} scope="col">营收（未税）</th>
            <th className={`${headerClass} text-right`} scope="col">毛利（未税）</th>
          </Fragment>)}</tr>
        </thead>
        <tbody>
          {view.rows.map((row) => <tr className="hover:bg-surface-2" key={row.key}>
            <th scope="row" className={`${headerClass} sticky left-0 z-10 max-w-[160px] truncate bg-white text-left`}>
              <button className="text-primary hover:underline" onClick={() => onCustomerSelect(row.key)} title={row.customer} type="button">{row.customer}</button>
            </th>
            {row.values.map((value, index) => metricCells(value, view.months[index]))}
            {metricCells(row.total, "total")}
          </tr>)}
          {!view.rows.length ? <tr><td className="py-8 text-center text-ink-3" colSpan={groups.length * 2 + 1}><TableStateContent empty="所选范围暂无华为云对账数据" loading={loading} /></td></tr> : null}
        </tbody>
        {view.rows.length ? <tfoot className="bg-surface-2 font-medium text-ink"><tr>
          <th scope="row" className={`${headerClass} sticky left-0 z-10 bg-surface-2 text-left`}>合计</th>
          {view.monthTotals.map((value, index) => metricCells(value, view.months[index]))}
          {metricCells(view.total, "total")}
        </tr></tfoot> : null}
      </table>
    </div>
  );
}
