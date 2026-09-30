"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calculator } from "lucide-react";
import { Button, Input } from "./ui";
import { Modal } from "./modal";
import { confirmDialog, notify } from "./app-dialog";
import { formatDisplayValue, formatMoneyValue } from "@/lib/display-format";

type Row = Record<string, unknown>;

type Candidate = {
  rowId: string;
  period: string;
  account: string;
  customer: string;
  receivableAmount: number;
  invoiceNo: string;
  invoiceTotalAmount: unknown;
  invoiceDate: unknown;
  suggested: boolean;
};

type Plan = {
  invoice: Row;
  allocations: Row[];
  candidates: Candidate[];
  suggestionRowIds: string[];
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toAmount(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * 合并发票分摊：一张发票覆盖多个月 / 同一账期多个华为账号时，
 * 按各行「客户应收（含税）」比例把发票金额拆到对应账期，也可以手工改分摊金额。
 */
export function CrmInvoiceAllocationModal({
  crmInvoiceId,
  focusRowId,
  onClose,
  onSaved,
}: {
  crmInvoiceId: number | string;
  focusRowId?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const invoiceAmount = toAmount(plan?.invoice?.amountTaxIncluded);
  const selected = useMemo(() => (plan?.candidates ?? []).filter((item) => checked[item.rowId]), [plan, checked]);
  const selectedTotal = useMemo(() => round2(selected.reduce((sum, item) => sum + toAmount(amounts[item.rowId]), 0)), [selected, amounts]);
  const difference = round2(selectedTotal - invoiceAmount);

  /** 按各行应收比例把金额铺到当前勾选的行上。 */
  const distributeByReceivable = useCallback((candidates: Candidate[], total: number) => {
    const weights = candidates.map((item) => Math.max(0, item.receivableAmount));
    const weightTotal = weights.reduce((sum, value) => sum + value, 0);
    const shares = candidates.map((_, index) => round2(total * (weightTotal > 0 ? weights[index] / weightTotal : 1 / candidates.length)));
    const remainder = round2(total - shares.reduce((sum, value) => sum + value, 0));
    if (Math.abs(remainder) >= 0.01 && shares.length) {
      const maxIndex = shares.indexOf(Math.max(...shares));
      shares[maxIndex] = round2(shares[maxIndex] + remainder);
    }
    return Object.fromEntries(candidates.map((item, index) => [item.rowId, shares[index].toFixed(2)]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/cloud/crm-invoices?view=allocation-plan&crmInvoiceId=${encodeURIComponent(String(crmInvoiceId))}`);
      const data = (await response.json()) as Plan & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "分摊方案加载失败");
      setPlan(data);
      const existing = data.allocations ?? [];
      const initial = existing.length
        ? existing.map((item) => String(item.rowId))
        : data.suggestionRowIds?.length
          ? data.suggestionRowIds
          : focusRowId && data.candidates.some((item) => item.rowId === focusRowId)
            ? [focusRowId]
            : [];
      setChecked(Object.fromEntries(initial.map((rowId) => [rowId, true])));
      const initialCandidates = data.candidates.filter((item) => initial.includes(item.rowId));
      if (existing.length) {
        setAmounts(Object.fromEntries(existing.map((item) => [String(item.rowId), Number(item.amountTaxIncluded ?? 0).toFixed(2)])));
      } else if (initialCandidates.length) {
        setAmounts(initialCandidates.length === 1
          ? { [initialCandidates[0].rowId]: toAmount(data.invoice?.amountTaxIncluded).toFixed(2) }
          : distributeByReceivable(initialCandidates, toAmount(data.invoice?.amountTaxIncluded)));
      } else {
        setAmounts({});
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "分摊方案加载失败");
    } finally {
      setLoading(false);
    }
  }, [crmInvoiceId, distributeByReceivable, focusRowId]);

  useEffect(() => { void load(); }, [load]);

  function toggle(candidate: Candidate, next: boolean) {
    if (!plan) return;
    const nextChecked = { ...checked };
    if (next) nextChecked[candidate.rowId] = true;
    else delete nextChecked[candidate.rowId];
    setChecked(nextChecked);
    const nextSelected = plan.candidates.filter((item) => nextChecked[item.rowId]);
    if (!nextSelected.length) { setAmounts({}); return; }
    // 勾选变化后按当前勾选行的应收比例重算一遍（之后仍可逐行手工调整）
    setAmounts(distributeByReceivable(nextSelected, invoiceAmount));
  }

  /** 改某一行金额时，把差额按应收比例摊到其它已勾选行。 */
  function editAmount(candidate: Candidate, input: string) {
    if (!plan) return;
    const nextValue = Math.max(0, toAmount(input));
    const others = plan.candidates.filter((item) => item.rowId !== candidate.rowId && checked[item.rowId]);
    const restTotal = round2(Math.max(0, invoiceAmount - nextValue));
    const nextAmounts = { ...amounts, [candidate.rowId]: input };
    if (!others.length) { setAmounts(nextAmounts); return; }
    const weights = others.map((item) => Math.max(0, item.receivableAmount));
    const weightTotal = weights.reduce((sum, value) => sum + value, 0);
    const shares = others.map((_, index) => round2(restTotal * (weightTotal > 0 ? weights[index] / weightTotal : 1 / others.length)));
    const remainder = round2(restTotal - shares.reduce((sum, value) => sum + value, 0));
    if (Math.abs(remainder) >= 0.01) {
      const maxIndex = shares.indexOf(Math.max(...shares));
      shares[maxIndex] = round2(shares[maxIndex] + remainder);
    }
    others.forEach((item, index) => { nextAmounts[item.rowId] = shares[index].toFixed(2); });
    setAmounts(nextAmounts);
  }

  async function save() {
    if (!plan) return;
    if (!selected.length) { notify("请至少勾选一个账期/明细行", "info"); return; }
    if (Math.abs(difference) >= 0.01) { notify(`分摊合计与发票金额不一致（差 ${difference.toFixed(2)}），请调整`, "info"); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/cloud/crm-invoices/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crmInvoiceId,
          allocations: selected.map((item) => ({ rowId: item.rowId, amountTaxIncluded: toAmount(amounts[item.rowId]) })),
        }),
      });
      const data = (await response.json()) as { error?: string; allocations?: Row[]; skipped?: Array<{ period: string; account: string; reason: string }>; attachmentLinked?: number };
      if (!response.ok) throw new Error(data.error ?? "分摊失败");
      const skipped = data.skipped ?? [];
      notify(`已分摊到 ${data.allocations?.length ?? 0} 行${data.attachmentLinked ? `，附件挂到 ${data.attachmentLinked} 行` : ""}${skipped.length ? `；${skipped.length} 行已开其它发票被跳过` : ""}`, skipped.length ? "info" : "success");
      onSaved?.();
      onClose();
    } catch (saveError) {
      notify(saveError instanceof Error ? saveError.message : "分摊失败", "info");
    } finally {
      setBusy(false);
    }
  }

  async function clearAllocation() {
    if (!plan) return;
    if (!await confirmDialog("确认取消这张发票的分摊吗？会把本票写进各行「客户开票」的字段清回未开票，并删除挂到明细上的发票附件（人工自己填的数据不动）。")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/cloud/crm-invoices/unallocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crmInvoiceId }),
      });
      const data = (await response.json()) as { error?: string; clearedRows?: number };
      if (!response.ok) throw new Error(data.error ?? "取消分摊失败");
      notify(`已取消分摊，清理 ${data.clearedRows ?? 0} 行的开票信息`, "success");
      onSaved?.();
      onClose();
    } catch (clearError) {
      notify(clearError instanceof Error ? clearError.message : "取消分摊失败", "info");
    } finally {
      setBusy(false);
    }
  }

  const hasAllocation = Number(plan?.invoice?.allocationCount ?? 0) > 0 || (plan?.allocations?.length ?? 0) > 0;

  return (
    <Modal
      description="一张发票覆盖多个月（或同一账期多个华为账号）时，按各行客户应收比例把金额拆到对应账期；金额可以手工调整，合计必须等于发票金额。"
      footer={<>
        <Button onClick={onClose}>取消</Button>
        {hasAllocation ? <Button disabled={busy} onClick={() => void clearAllocation()}>取消分摊</Button> : null}
        <Button disabled={busy || loading || Math.abs(difference) >= 0.01 || !selected.length} onClick={() => void save()} tone="primary">保存分摊</Button>
      </>}
      onClose={onClose}
      title="发票分摊到账期"
      widthClass="max-w-4xl"
    >
      {loading ? <div className="py-10 text-center text-sm text-ink-3">加载中…</div> : null}
      {error ? <div className="rounded border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div> : null}
      {plan && !loading ? (
        <>
          <div className="flex flex-wrap items-center gap-4 border-b border-line-soft pb-3 text-sm">
            <span>发票号 <b>{String(plan.invoice.invoiceNo ?? "-")}</b></span>
            <span className="text-ink-3">归属月份 {String(plan.invoice.belongMonth ?? "-")} · 开票日期 {formatDisplayValue(plan.invoice.invoiceDate as string | null | undefined)} · {String(plan.invoice.currency ?? "-")}</span>
            <span>含税 <b>{formatMoneyValue(plan.invoice.amountTaxIncluded)}</b></span>
            <span className="text-ink-3">未税 {formatMoneyValue(plan.invoice.amountTaxExcluded)} · 税金 {formatMoneyValue(plan.invoice.taxAmount)}</span>
            <span className="text-ink-3">本地客户 {String(plan.invoice.customerName ?? "未匹配")}</span>
          </div>
          {plan.suggestionRowIds.length && !hasAllocation ? (
            <div className="mt-3 flex items-center gap-2 rounded border border-info-border bg-info-soft px-3 py-2 text-xs text-primary">
              <AlertTriangle size={14} />系统检测到 {plan.suggestionRowIds.length} 行的应收合计 ≈ 本张发票金额，已自动勾选，确认后保存即可。
            </div>
          ) : null}
          <div className="mt-3 max-h-[46vh] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-canvas">
                <tr>
                  {["选", "账期", "华为账号", "客户应收（含税）", "分摊比例", "分摊金额（含税）", "说明"].map((label) => (
                    <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-left font-medium" key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.candidates.map((candidate) => {
                  const isChecked = Boolean(checked[candidate.rowId]);
                  const blocked = Boolean(candidate.invoiceNo) && candidate.invoiceNo !== String(plan.invoice.invoiceNo ?? "");
                  const ratio = isChecked && invoiceAmount > 0 ? toAmount(amounts[candidate.rowId]) / invoiceAmount : 0;
                  return (
                    <tr className={isChecked ? "bg-surface-2" : undefined} key={candidate.rowId}>
                      <td className="border-b border-r border-line-soft px-3 py-2">
                        <input
                          checked={isChecked}
                          disabled={blocked}
                          onChange={(event) => toggle(candidate, event.target.checked)}
                          type="checkbox"
                        />
                      </td>
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{candidate.period}</td>
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{candidate.account}</td>
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right">{formatMoneyValue(candidate.receivableAmount)}</td>
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right">{isChecked ? `${(ratio * 100).toFixed(2)}%` : "-"}</td>
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right">
                        {isChecked
                          ? <Input className="w-[120px] text-right" value={amounts[candidate.rowId] ?? ""} onChange={(event) => editAmount(candidate, event.target.value)} />
                          : <span className="text-ink-4">-</span>}
                      </td>
                      <td className="whitespace-nowrap border-b border-line-soft px-3 py-2 text-xs">
                        {blocked
                          ? <span className="text-warning">本地已开 {candidate.invoiceNo}，不参与</span>
                          : candidate.invoiceNo === String(plan.invoice.invoiceNo ?? "")
                            ? <span className="text-success">本票已分摊</span>
                            : candidate.suggested ? <span className="text-primary">系统建议</span> : <span className="text-ink-4">未开票</span>}
                      </td>
                    </tr>
                  );
                })}
                {!plan.candidates.length ? <tr><td className="py-8 text-center text-ink-3" colSpan={7}>该客户在该币种下没有可分摊的对账行</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-3 text-sm">
            <span>
              已选 {selected.length} 行 · 分摊合计 <b>{formatMoneyValue(selectedTotal)}</b> / 发票金额 {formatMoneyValue(invoiceAmount)}{" "}
              {Math.abs(difference) < 0.01
                ? <span className="ml-1 rounded bg-success-soft px-1.5 py-0.5 text-xs text-success">已对平</span>
                : <span className="ml-1 rounded bg-danger-soft px-1.5 py-0.5 text-xs text-danger">差 {difference.toFixed(2)}</span>}
            </span>
            <Button disabled={!selected.length} onClick={() => setAmounts({ ...amounts, ...distributeByReceivable(selected, invoiceAmount) })}>
              <Calculator size={14} />按应收比例重算
            </Button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}
