"use client";

import { useEffect, useId, useRef, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { formatDisplayValue } from "@/lib/display-format";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import { NumberInput } from "./number-input";
import { TableStateContent } from "./table-state";
import { Button, Input, Panel, Select, Textarea } from "./ui";
import { Modal } from "./modal";
import { confirmDialog } from "./app-dialog";

type Amount = number | string | null;
type JcRow = {
  id: string;
  ledgerId: string;
  batchName: string | null;
  deviceCode: string | null;
  countryCode: string | null;
  currency: string;
  reportingCurrency: string;
  exchangeRate: Amount;
  adjustmentNo: string;
  itemId: string;
  effectiveMonth: string;
  endMonth: string | null;
  ruleTotal: Amount;
  ruleTotalReporting: Amount;
  baselineRuleTotal: Amount;
  approvedTotal: Amount;
  approvedTotalReporting: Amount;
  fixedAdjustment: Amount;
  fixedAdjustmentReporting: Amount;
  registeredAmount: Amount;
  registeredAmountReporting: Amount;
  remainingAmount: Amount;
  remainingAmountReporting: Amount;
  unallocatedAmount: Amount;
  unallocatedAmountReporting: Amount;
  reason: string | null;
  version: number;
  confirmedAt: string | null;
  confirmedBy: string | null;
  resumeMonth: string | null;
  postingMonth: string | null;
  issue?: string;
  status: string;
};
type JcMonth = { month: string; amount: Amount; reportingAmount: Amount; locked: boolean; source: string };
type JcCalculation = { component: JcRow; months: JcMonth[]; revision: string };
type JcDetail = JcCalculation & {
  audit: Array<{
    action: string;
    createdAt: string;
    actor: string;
    reason: string;
    approvedTotal: Amount;
    baselineRuleTotal: Amount;
    fixedAdjustment: Amount;
  }>;
};
type JcList = { rows: JcRow[]; total: number; page: number; pageSize: number };
type AdjustmentInput = {
  id: string;
  revision: string;
  approvedTotal?: number;
  approvedTotalReporting?: number;
  reason: string;
  resumeMonth: string;
  postingMonth?: string;
};
type HistoryInput = { id: string; revision: string; month: string; amount: number; reason: string };
type RollbackInput = { id: string; revision: string; reason: string };
type AdjustmentDraft = { approvedTotal: string; reason: string; resumeMonth: string; postingMonth: string };
type HistoryDraft = { month: string; amount: string; reason: string };
type Action = "preview" | "confirm" | "history" | "rollback";

const endpoint = "/api/internal-service-fees/adjustments/jc";
const cellClass = "whitespace-nowrap border-b border-r border-line-soft px-3 py-3";
const headClass = `${cellClass} text-left font-medium`;
const metrics = [
  ["ruleTotal", "当前规则总额"],
  ["approvedTotal", "全周期核定总额"],
  ["baselineRuleTotal", "确认时规则总额"],
  ["fixedAdjustment", "固定历史差额"],
  ["registeredAmount", "已登记总额"],
  ["remainingAmount", "余额"],
  ["unallocatedAmount", "未分配金额"],
] as const;
const listMetrics = metrics.filter(([key]) => key !== "baselineRuleTotal");

function monthValue(value: string | null) {
  return value?.slice(0, 7) ?? "";
}

function validMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) > 0;
}

function validAmount(value: string) {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

function money(value: Amount, currency: string) {
  return `${formatDisplayValue(value, "money")} ${currency || "（币种未提供）"}`;
}

function bothCurrencies(value: Amount, reportingValue: Amount, sourceCurrency: string, reportingCurrency: string) {
  return `${money(value, sourceCurrency)} / ${money(reportingValue, reportingCurrency)}`;
}

class JcRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function requestJson<T>(url: string, signal: AbortSignal, body?: AdjustmentInput | HistoryInput | RollbackInput): Promise<T> {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new JcRequestError(typeof data?.error === "string" ? data.error : `JC请求失败（${response.status}），请重试。`, response.status);
  }
  return data as T;
}

function isCalculation(data: JcCalculation | null, id: string): data is JcCalculation {
  return Boolean(data?.component?.id === id && Array.isArray(data.months) && typeof data.revision === "string" && data.revision);
}

function JcTotals({ component }: { component: JcRow }) {
  return <dl className="grid gap-3 rounded border border-line-soft bg-surface-2 p-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
    {metrics.map(([key, label]) => {
      const reportingKey = `${key}Reporting`;
      return <div key={key}>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-1 font-medium tabular-nums text-ink">{component.reportingCurrency && component.reportingCurrency !== component.currency && reportingKey in component
        ? bothCurrencies(component[key], component[reportingKey as keyof JcRow] as Amount, component.currency, component.reportingCurrency)
        : money(component[key], component.currency)}</dd>
    </div>;
    })}
    <div><dt className="text-xs text-ink-3">原合同结束月</dt><dd className="mt-1 font-medium text-ink">{monthValue(component.endMonth) || "—"}</dd></div>
  </dl>;
}

function JcMonths({ months, currency, reportingCurrency, caption }: { months: JcMonth[]; currency: string; reportingCurrency: string; caption: string }) {
  return <div className="table-scroll max-h-80 overflow-auto rounded border border-line-soft">
    <table className="w-full min-w-[560px] border-collapse text-sm">
      <caption className="sr-only">{caption}（{currency}）</caption>
      <thead className="sticky top-0 bg-canvas text-ink"><tr>
        {["月份", `金额（${currency}）`, `报告金额（${reportingCurrency}）`, "状态", "来源"].map((label, index) => <th scope="col" className={headClass} key={`${label}-${index}`}>{label}</th>)}
      </tr></thead>
      <tbody>
        {months.map((entry, index) => <tr key={`${entry.month}-${index}`} className="hover:bg-surface-2">
          <td className={cellClass}>{monthValue(entry.month)}</td>
          <td className={`${cellClass} text-right tabular-nums`}>{money(entry.amount, currency)}</td>
          <td className={`${cellClass} text-right tabular-nums`}>{formatDisplayValue(entry.reportingAmount, "money")}</td>
          <td className={cellClass}>{entry.locked ? "已锁定 · 只读" : "未锁定"}</td>
          <td className={cellClass}>{{history:"历史登记",auto:"自动分摊",settlement:"到期结清"}[entry.source] || entry.source || "—"}</td>
        </tr>)}
        {!months.length && <tr><td className="p-6 text-center text-ink-3" colSpan={5}>暂无月度分配记录</td></tr>}
      </tbody>
    </table>
  </div>;
}

function JcEditor({ id, detailId, onClose, onSaved, onBusyChange }: {
  id: string;
  detailId: string;
  onClose: () => void;
  onSaved: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const fieldId = useId();
  const [detail, setDetail] = useState<JcDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [needsReload, setNeedsReload] = useState(false);
  const [rollbackReason, setRollbackReason] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [draft, setDraft] = useState<AdjustmentDraft>({ approvedTotal: "", reason: "", resumeMonth: "", postingMonth: "" });
  const [history, setHistory] = useState<HistoryDraft>({ month: "", amount: "", reason: "" });
  const [preview, setPreview] = useState<(JcCalculation & { request: AdjustmentInput }) | null>(null);
  const actionRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setDetail(null);
    setPreview(null);
    setError("");
    void (async () => {
      try {
        const data = await requestJson<JcDetail>(`${endpoint}?${new URLSearchParams({ id })}`, controller.signal);
        if (controller.signal.aborted) return;
        if (!isCalculation(data, id) || !Array.isArray(data.audit)) throw new Error("JC详情响应不完整，请重新加载。");
        setDetail(data);
        setDraft({
          approvedTotal: String(
            data.component.reportingCurrency !== data.component.currency
              ? data.component.approvedTotalReporting ?? data.component.ruleTotalReporting ?? ""
              : data.component.approvedTotal ?? data.component.ruleTotal ?? "",
          ),
          reason: data.component.reason ?? "",
          // Only restore explicitly saved months; there is no implicit history cutoff.
          resumeMonth: monthValue(data.component.resumeMonth),
          postingMonth: monthValue(data.component.postingMonth),
        });
        setHistory({ month: "", amount: "", reason: "" });
        setNeedsReload(false);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "JC详情加载失败");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [id, reload]);

  useEffect(() => () => { actionRequest.current?.abort(); }, []);

  function changeDraft(next: Partial<AdjustmentDraft>) {
    setDraft((current) => ({ ...current, ...next }));
    setPreview(null);
    setError("");
    setNotice("");
  }

  function changeHistory(next: Partial<HistoryDraft>) {
    setHistory((current) => ({ ...current, ...next }));
    setPreview(null);
    setError("");
    setNotice("");
  }

  async function submit(kind: Action) {
    // The ref closes the gap before React renders disabled buttons after a click.
    if (!detail || loading || needsReload || actionRequest.current) return;
    let payload: AdjustmentInput | HistoryInput | RollbackInput;
    if (kind === "rollback") {
      if (!rollbackReason.trim()) return setError("请填写退回原因。");
      if (!await confirmDialog("确认退回这条JC管理费调整？原合同价格不变，已登记及已对账月份保留；固定差额暂时停止生效，未锁定月份按规则余额重算，重新确认后再生效。")) return;
      if (actionRequest.current) return;
      payload = {id,revision:detail.revision,reason:rollbackReason.trim()};
    } else if (kind === "confirm") {
      if (!preview) return;
      payload = preview.request;
    } else if (kind === "preview") {
      if (!validAmount(draft.approvedTotal)) return setError("请填写有效的全周期核定总额，允许 0 和负数。");
      if (!draft.reason.trim()) return setError("请填写调整原因。");
      if (!validMonth(draft.resumeMonth)) return setError("请选择恢复分摊月份（YYYY-MM）。");
      if (draft.postingMonth && !validMonth(draft.postingMonth)) return setError("一次性入账月份格式应为 YYYY-MM。");
      payload = {
        id, revision: detail.revision,
        ...(detail.component.reportingCurrency !== detail.component.currency
          ? { approvedTotalReporting: Number(draft.approvedTotal) }
          : { approvedTotal: Number(draft.approvedTotal) }),
        reason: draft.reason.trim(), resumeMonth: draft.resumeMonth,
        ...(draft.postingMonth ? { postingMonth: draft.postingMonth } : {}),
      };
    } else {
      if (!validMonth(history.month)) return setError("请选择要登记的单个历史月份（YYYY-MM）。");
      if (detail.months.some((entry) => monthValue(entry.month) === history.month && entry.locked)) return setError("该历史月份已锁定，仅可查看。");
      if (!validAmount(history.amount)) return setError("请填写有效的历史金额，允许 0 和负数。");
      if (!history.reason.trim()) return setError("请填写历史登记原因。");
      payload = { id, revision: detail.revision, month: history.month, amount: Number(history.amount), reason: history.reason.trim() };
    }

    const controller = new AbortController();
    actionRequest.current = controller;
    setAction(kind);
    onBusyChange(true);
    setError("");
    setNotice("");
    setPreview(null);
    try {
      const data = await requestJson<JcCalculation>(`${endpoint}/${kind}`, controller.signal, payload);
      if (controller.signal.aborted) return;
      if (kind === "preview") {
        if (!isCalculation(data, id)) throw new Error("计算预览响应不完整，请重新计算。");
        setPreview({ ...data, request: { ...payload as AdjustmentInput, revision: data.revision } });
      } else {
        setNotice(kind === "confirm" ? "JC固定差额已确认。" : kind === "rollback" ? "已退回待核定，核定总额和分摊月份已保留，可修改后重新预览确认。" : `已登记并锁定 ${history.month}；其他月份未被锁定。`);
        setRollbackReason("");
        setDetail(null);
        setLoading(true);
        setReload((value) => value + 1);
        onSaved();
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      const message = cause instanceof Error ? cause.message : "JC操作失败";
      // A failed write may have reached the server. Refresh its revision before retrying.
      const mustReload = kind !== "preview" || (cause instanceof JcRequestError && cause.status === 409);
      setNeedsReload(mustReload);
      setError(mustReload ? `${message} 请重新加载详情核实最新状态后再操作。` : message);
    } finally {
      if (!controller.signal.aborted) {
        actionRequest.current = null;
        setAction(null);
        onBusyChange(false);
      }
    }
  }

  const busy = action !== null;
  const lockedMonth = detail?.months.find((entry) => monthValue(entry.month) === history.month && entry.locked);
  const component = detail?.component;

  return <Modal title="JC管理费查看／调整" description="核定管理费总额，不修改实例合同价格。先计算预览，再确认；已确认的记录可以退回。" widthClass="max-w-6xl" onClose={() => { if (!busy) onClose(); }} footer={<>
    <Button type="button" disabled={busy} onClick={onClose}>关闭</Button>
    {component?.confirmedAt ? <Button type="button" tone="warning" disabled={busy || loading || needsReload} onClick={() => void submit("rollback")}>{action === "rollback" ? "正在退回…" : "退回待核定"}</Button> : <>
      <Button type="button" tone="secondary" disabled={!component || busy || loading || needsReload} onClick={() => void submit("preview")}>{action === "preview" ? "正在计算…" : "计算预览"}</Button>
      <Button type="button" tone="primary" disabled={!preview || busy || loading || needsReload} onClick={() => void submit("confirm")}>{action === "confirm" ? "正在确认…" : "确认管理费调整"}</Button>
    </>}
  </>}><section id={detailId} aria-labelledby={`${fieldId}-heading`} aria-busy={loading || busy} className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id={`${fieldId}-heading`} className="font-medium text-ink">JC调整详情{component ? ` · ${component.adjustmentNo} · ${component.deviceCode || component.batchName || "—"}` : ""}</h3>
      <div className="flex gap-2">
        <Button type="button" disabled={busy || loading} onClick={() => { setNotice(""); setReload((value) => value + 1); }}>重新加载详情</Button>
      </div>
    </div>
    {error && <p role="alert" className="rounded border border-danger-border bg-danger-soft p-3 text-sm text-danger">{error}</p>}
    {notice && <p role="status" className="rounded bg-success-soft p-3 text-sm text-success">{notice}</p>}
    {loading && <p role="status" className="py-6 text-center text-sm text-ink-3">正在加载JC详情…</p>}
    {component && detail && <>
      <p className="text-sm text-ink-3">批次：{component.batchName || "—"} · 实例：{component.deviceCode || "—"} · 国家：{component.countryCode || "—"} · 原币：{component.currency || "未提供"} · 报告币种：{component.reportingCurrency || component.currency || "未提供"} · 折算汇率：{component.exchangeRate || 1} · 生效月：{monthValue(component.effectiveMonth) || "—"} · 版本：{component.version}</p>
      <JcTotals component={component} />
      {component.issue && <p role="alert" className="text-sm text-danger">{component.issue}</p>}
      <p className="text-sm text-ink-2">管理费核定状态：{component.status} · 来源合同价格调整单：{component.adjustmentNo}</p>
      <p className="text-xs text-ink-3">确认人：{component.confirmedBy || "—"} · 确认时间：{formatDisplayValue(component.confirmedAt, "datetime")}</p>
      {component.confirmedAt && <div className="space-y-2 rounded border border-line-soft p-3">
        <label className="block text-sm text-ink-2" htmlFor={`${fieldId}-rollback`}>退回原因</label>
        <Input id={`${fieldId}-rollback`} className="w-full" disabled={busy || needsReload} placeholder="填写需要重新核定的原因" value={rollbackReason} onChange={event=>setRollbackReason(event.target.value)} />
      </div>}

      <form noValidate onSubmit={(event) => { event.preventDefault(); void submit("preview"); }}>
        <fieldset disabled={busy || needsReload || Boolean(component.confirmedAt)} className="space-y-3">
          <legend className="mb-3 text-sm font-medium text-ink">全周期固定差额调整</legend>
          <p className="text-sm text-ink-3">确认时固定差额＝全周期核定总额－确认时规则总额；后续规则重算保留该固定差额。恢复分摊月份由你指定，历史月份需逐月登记。</p>
          {component.confirmedAt && <p className="text-sm text-ink-2">当前核定已确认。需要修改总额或分摊月份时，请先填写退回原因并点击“退回待核定”。</p>}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <label className="block text-sm text-ink-2" htmlFor={`${fieldId}-total`}>全周期核定总额（{component.reportingCurrency || component.currency}，必填）</label>
              <NumberInput id={`${fieldId}-total`} className="w-full" step="0.01" aria-required="true" aria-describedby={`${fieldId}-total-help`} placeholder={validAmount(draft.approvedTotal) && Number(draft.approvedTotal) === 0 ? "0.00" : "允许 0 或负数"} value={draft.approvedTotal} onChange={(approvedTotal) => changeDraft({ approvedTotal })} />
              <p id={`${fieldId}-total-help`} className="text-xs text-ink-3">{validAmount(draft.approvedTotal) ? `当前输入：${money(draft.approvedTotal, component.reportingCurrency || component.currency)}${component.reportingCurrency !== component.currency ? `；约合 ${money(Number(draft.approvedTotal) * Number(component.exchangeRate), component.currency)}` : ""}；允许 0 和负数。` : "请显式填写金额，允许 0 和负数。"}</p>
            </div>
            <div className="space-y-1">
              <label className="block text-sm text-ink-2" htmlFor={`${fieldId}-resume`}>恢复分摊月份（必填）</label>
              <Input id={`${fieldId}-resume`} className="w-full" type="month" required value={draft.resumeMonth} onChange={(event) => changeDraft({ resumeMonth: event.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="block text-sm text-ink-2" htmlFor={`${fieldId}-posting`}>已结束合同一次性入账月份（选填）</label>
              <Input id={`${fieldId}-posting`} className="w-full" type="month" aria-describedby={`${fieldId}-posting-help`} value={draft.postingMonth} onChange={(event) => changeDraft({ postingMonth: event.target.value })} />
              <p id={`${fieldId}-posting-help`} className="text-xs text-ink-3">合同已结束且无可分摊月份时，可指定余额一次性入账月份；留空请检查预览中的未分配金额。</p>
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm text-ink-2" htmlFor={`${fieldId}-reason`}>调整原因（必填）</label>
            <Textarea id={`${fieldId}-reason`} className="w-full" required value={draft.reason} onChange={(event) => changeDraft({ reason: event.target.value })} />
          </div>
        </fieldset>
      </form>

      {preview ? <section aria-labelledby={`${fieldId}-preview`} className="space-y-3 rounded border border-primary/30 bg-info-soft p-4">
        <h4 id={`${fieldId}-preview`} className="font-medium text-ink">计算预览（尚未确认）</h4>
        <JcTotals component={preview.component} />
        <p className="text-sm text-ink-2">恢复分摊：{preview.request.resumeMonth} · 一次性入账：{preview.request.postingMonth || "未指定"}</p>
        <p className="whitespace-pre-wrap break-words text-sm text-ink-2">调整原因：{preview.request.reason}</p>
        {Number(preview.component.unallocatedAmount) !== 0 && <p role="status" className="rounded bg-warning-soft p-3 text-sm text-warning-ink">仍有未分配金额 {money(preview.component.unallocatedAmount, component.currency)}。请核对可分摊月份；已结束合同可填写一次性入账月份后重新预览。</p>}
        <JcMonths months={preview.months} currency={preview.component.currency} reportingCurrency={preview.component.reportingCurrency} caption="JC计算预览月度分配" />
        <p className="text-xs text-ink-3">确认将保存以上预览。修改输入或登记历史后，需要重新计算。</p>
      </section> : <p role="status" className="text-sm text-ink-3">{action === "confirm" ? "正在确认固定差额…" : "请先计算并核对预览，再确认固定差额。"}</p>}

      <section aria-labelledby={`${fieldId}-history`} className="space-y-3 border-t border-line-soft pt-4">
        <h4 id={`${fieldId}-history`} className="font-medium text-ink">逐月历史登记</h4>
        <p id={`${fieldId}-history-help`} className="text-sm text-ink-3">仅登记并锁定所选月份；已锁定的历史金额只读。选择恢复月份不会自动锁定此前月份。</p>
        <JcMonths months={detail.months} currency={component.currency} reportingCurrency={component.reportingCurrency} caption="JC现有月度记录" />
        <form noValidate onSubmit={(event) => { event.preventDefault(); void submit("history"); }}>
          <fieldset disabled={busy || needsReload} className="space-y-3" aria-describedby={`${fieldId}-history-help`}>
            <legend className="sr-only">登记单个历史月份</legend>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-sm text-ink-2" htmlFor={`${fieldId}-history-month`}>历史月份（必填）</label>
                <Input id={`${fieldId}-history-month`} className="w-full" type="month" required value={history.month} onChange={(event) => changeHistory({ month: event.target.value, amount: "", reason: "" })} />
              </div>
              <div className="space-y-1">
                <label className="block text-sm text-ink-2" htmlFor={`${fieldId}-history-amount`}>该月金额（{component.currency}，必填）</label>
                <NumberInput id={`${fieldId}-history-amount`} className="w-full" step="0.01" aria-required="true" aria-describedby={`${fieldId}-history-amount-help`} placeholder="允许 0 或负数" readOnly={Boolean(lockedMonth)} value={lockedMonth ? lockedMonth.amount : history.amount} onChange={(amount) => changeHistory({ amount })} />
                <p id={`${fieldId}-history-amount-help`} className="text-xs text-ink-3">{lockedMonth ? `已锁定金额：${money(lockedMonth.amount, component.currency)}（只读）` : validAmount(history.amount) ? `当前输入：${money(history.amount, component.currency)}` : "请显式填写该月金额，允许 0 和负数。"}</p>
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-sm text-ink-2" htmlFor={`${fieldId}-history-reason`}>历史登记原因（必填）</label>
              <Textarea id={`${fieldId}-history-reason`} className="w-full" required readOnly={Boolean(lockedMonth)} value={history.reason} onChange={(event) => changeHistory({ reason: event.target.value })} />
            </div>
            {lockedMonth && <p role="status" className="text-sm text-ink-3">该月份已锁定，不能修改；可选择其他未锁定月份。</p>}
            <Button type="submit" tone="secondary" disabled={Boolean(lockedMonth)}>{action === "history" ? "正在登记…" : "登记并锁定该月"}</Button>
          </fieldset>
        </form>
      </section>

      <section aria-labelledby={`${fieldId}-audit`} className="space-y-3 border-t border-line-soft pt-4">
        <h4 id={`${fieldId}-audit`} className="font-medium text-ink">调整记录</h4>
        <div className="table-scroll max-h-80 overflow-auto rounded border border-line-soft">
          <table className="w-full min-w-[850px] border-collapse text-sm">
            <caption className="sr-only">JC调整记录（{component.currency}）</caption>
            <thead className="sticky top-0 bg-canvas text-ink"><tr>{["时间", "操作", "操作人", `全周期核定总额（${component.currency}）`, `确认时规则总额（${component.currency}）`, `固定差额（${component.currency}）`, "原因"].map((label) => <th scope="col" className={headClass} key={label}>{label}</th>)}</tr></thead>
            <tbody>
              {detail.audit.map((entry, index) => <tr key={`${entry.createdAt}-${index}`} className="hover:bg-surface-2">
                <td className={cellClass}>{formatDisplayValue(entry.createdAt, "datetime")}</td>
                <td className={cellClass}>{{confirm:"确认核定",history:"登记历史",rollback:"退回待核定"}[entry.action] || entry.action}</td>
                <td className={cellClass}>{entry.actor || "—"}</td>
                <td className={`${cellClass} text-right tabular-nums`}>{money(entry.approvedTotal, component.currency)}</td>
                <td className={`${cellClass} text-right tabular-nums`}>{money(entry.baselineRuleTotal, component.currency)}</td>
                <td className={`${cellClass} text-right tabular-nums`}>{money(entry.fixedAdjustment, component.currency)}</td>
                <td className="min-w-60 whitespace-pre-wrap break-words border-b border-line-soft px-3 py-3">{entry.reason || "—"}</td>
              </tr>)}
              {!detail.audit.length && <tr><td className="p-6 text-center text-ink-3" colSpan={7}>暂无调整记录</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>}
  </section></Modal>;
}

export function InternalServiceFeeJcPanel() {
  const fieldId = useId();
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState({ keyword: "", page: 1, pageSize: DEFAULT_PAGE_SIZE });
  const [list, setList] = useState<JcList>({ rows: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE });
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const params = new URLSearchParams({ keyword: query.keyword, page: String(query.page), pageSize: String(query.pageSize) });
        const data = await requestJson<JcList>(`${endpoint}?${params}`, controller.signal);
        if (controller.signal.aborted) return;
        if (!data || !Array.isArray(data.rows) || !Number.isFinite(data.total) || !(data.page > 0) || !(data.pageSize > 0)) throw new Error("JC列表响应不完整，请重试。");
        // Candidates include unconfirmed rows; never filter by confirmedAt or version.
        setList(data);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "JC列表加载失败");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [query, reload]);

  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  return <Panel>
    <section aria-labelledby={`${fieldId}-heading`}>
      <div className="space-y-2 border-b border-line-soft p-4">
        <h2 id={`${fieldId}-heading`} className="font-medium text-ink">JC管理费核定与历史差额调整</h2>
        <p className="text-sm text-ink-3">列表由已确认的实例合同价格调整单产生，待核定记录仅为计算候选，并不代表已确认管理费。点击“查看／调整”登记历史并核定总额；金额按原合同币种展示。</p>
      </div>
      <form className="flex flex-wrap items-end gap-2 border-b border-line-soft p-4" onSubmit={(event) => { event.preventDefault(); setQuery((current) => ({ ...current, keyword: keyword.trim(), page: 1 })); }}>
        <div className="min-w-0 space-y-1">
          <label htmlFor={`${fieldId}-search`} className="block text-xs text-ink-3">搜索JC记录</label>
          <Input id={`${fieldId}-search`} className="w-80" placeholder="调整单、批次或实例编码" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
        </div>
        <Button type="submit" tone="secondary" disabled={loading}><Search size={15} aria-hidden="true" />查询</Button>
        <Button type="button" disabled={loading} onClick={() => setReload((value) => value + 1)}><RefreshCw size={15} aria-hidden="true" />刷新</Button>
      </form>
      {error && <p role="alert" className="m-4 rounded border border-danger-border bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      {loading && <p role="status" className="px-4 py-2 text-sm text-ink-3">正在加载JC列表…</p>}
      <div className="table-scroll max-h-[480px] overflow-auto" aria-busy={loading}>
        <table className="w-full min-w-[1700px] border-collapse text-sm">
          <caption className="sr-only">JC候选及已确认记录，金额按行标明币种</caption>
          <thead className="sticky top-0 bg-canvas text-ink"><tr>
            {["来源合同调价单号", "原批次", "实例编码", "国家", "币种", ...listMetrics.map(([, label]) => label), "原合同结束月", "管理费核定状态", "操作"].map((label) => <th scope="col" className={`${headClass} ${label === "操作" ? "sticky right-0 bg-canvas" : ""}`} key={label}>{label}</th>)}
          </tr></thead>
          <tbody>
            {list.rows.map((row) => <tr className={selectedId === row.id ? "bg-info-soft" : "hover:bg-surface-2"} key={row.id}>
              <td className={cellClass}>{row.adjustmentNo}</td>
              <td className={cellClass}>{row.batchName || "—"}</td>
              <td className={cellClass}>{row.deviceCode || "—"}</td>
              <td className={cellClass}>{row.countryCode || "—"}</td>
              <td className={cellClass}>{row.currency || "未提供"}</td>
              {listMetrics.map(([key]) => <td className={`${cellClass} text-right tabular-nums`} key={key}>{money(row[key], row.currency)}</td>)}
              <td className={cellClass}>{monthValue(row.endMonth) || "—"}</td>
              <td className={cellClass}>{row.status}{Number(row.unallocatedAmount) !== 0 ? " · 待指定结清月" : ""}</td>
              <td className={`${cellClass} sticky right-0 bg-white`}><Button type="button" size="sm" tone="secondary" disabled={editorBusy || loading} aria-label={`查看或调整 ${row.adjustmentNo} ${row.deviceCode || row.batchName || row.id}`} aria-haspopup="dialog" aria-expanded={selectedId === row.id} aria-controls={selectedId === row.id ? `${fieldId}-detail` : undefined} onClick={() => setSelectedId(row.id)}>查看 / 调整</Button></td>
            </tr>)}
            {!list.rows.length && <tr><td className="py-12 text-center text-ink-3" colSpan={14}><TableStateContent loading={loading} empty={error ? "JC列表暂时无法加载" : "暂无匹配的JC记录"} hint={error ? "请点击刷新重试。" : "可修改关键词后查询。"} /></td></tr>}
          </tbody>
        </table>
      </div>
      <nav aria-label="JC记录分页" className="flex flex-wrap items-center gap-2 border-t border-line-soft p-4 text-sm text-ink-2">
        <span>共 {list.total} 条 · 第 {list.page} / {totalPages} 页</span>
        <label htmlFor={`${fieldId}-page-size`}>每页条数</label>
        <Select id={`${fieldId}-page-size`} disabled={loading} value={query.pageSize} onChange={(event) => setQuery((current) => ({ ...current, page: 1, pageSize: Number(event.target.value) }))}>
          {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
        </Select>
        <Button type="button" disabled={loading || list.page <= 1} onClick={() => setQuery((current) => ({ ...current, page: list.page - 1 }))}>上一页</Button>
        <Button type="button" disabled={loading || list.page >= totalPages} onClick={() => setQuery((current) => ({ ...current, page: list.page + 1 }))}>下一页</Button>
      </nav>
      {selectedId && <JcEditor key={selectedId} id={selectedId} detailId={`${fieldId}-detail`} onClose={() => setSelectedId(null)} onSaved={() => setReload((value) => value + 1)} onBusyChange={setEditorBusy} />}
    </section>
  </Panel>;
}
