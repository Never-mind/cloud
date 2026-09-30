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
  collected: number;
  collectionTotalAmount: unknown;
  suggested: boolean;
};

type LinkedInvoice = { invoiceNo: string; amount: number; rows: Array<{ rowId: string; period: string; account: string; amount: number }> };

type Plan = {
  receipt: Row;
  allocations: Row[];
  candidates: Candidate[];
  linkedInvoices: LinkedInvoice[];
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
 * 回款分摊：一笔回款覆盖多张发票/多个月时，按各行开票金额（拿不到就用客户应收）
 * 把实收金额拆到对应账期月，避免整笔写在一行导致实收合计不对。
 */
export function CrmReceiptAllocationModal({
  crmReceiptId,
  onClose,
  onSaved,
}: {
  crmReceiptId: number | string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const receiptAmount = toAmount(plan?.receipt?.receiptAmount);
  const selected = useMemo(() => (plan?.candidates ?? []).filter((item) => checked[item.rowId]), [plan, checked]);
  const selectedTotal = useMemo(() => round2(selected.reduce((sum, item) => sum + toAmount(amounts[item.rowId]), 0)), [selected, amounts]);
  const difference = round2(selectedTotal - receiptAmount);

  /** 权重：有关联发票的行用开票金额，其余用客户应收。 */
  const weightOf = useCallback((candidate: Candidate) => {
    const invoiceAmount = toAmount(candidate.invoiceTotalAmount);
    return invoiceAmount > 0 ? invoiceAmount : Math.max(0, candidate.receivableAmount);
  }, []);

  const distribute = useCallback((candidates: Candidate[], total: number) => {
    const weights = candidates.map((item) => weightOf(item));
    const weightTotal = weights.reduce((sum, value) => sum + value, 0);
    const shares = candidates.map((_, index) => round2(total * (weightTotal > 0 ? weights[index] / weightTotal : 1 / candidates.length)));
    const remainder = round2(total - shares.reduce((sum, value) => sum + value, 0));
    if (Math.abs(remainder) >= 0.01 && shares.length) {
      const maxIndex = shares.indexOf(Math.max(...shares));
      shares[maxIndex] = round2(shares[maxIndex] + remainder);
    }
    return Object.fromEntries(candidates.map((item, index) => [item.rowId, shares[index].toFixed(2)]));
  }, [weightOf]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/cloud/crm-invoices/receipt-allocation?crmReceiptId=${encodeURIComponent(String(crmReceiptId))}`);
      const data = (await response.json()) as Plan & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "回款分摊方案加载失败");
      setPlan(data);
      const existing = data.allocations ?? [];
      const initial = existing.length
        ? existing.map((item) => String(item.rowId))
        : (data.suggestionRowIds ?? []);
      setChecked(Object.fromEntries(initial.map((rowId) => [rowId, true])));
      if (existing.length) {
        setAmounts(Object.fromEntries(existing.map((item) => [String(item.rowId), Number(item.amount ?? 0).toFixed(2)])));
      } else {
        const initialCandidates = data.candidates.filter((item) => initial.includes(item.rowId));
        setAmounts(initialCandidates.length ? distribute(initialCandidates, toAmount(data.receipt?.receiptAmount)) : {});
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "回款分摊方案加载失败");
    } finally {
      setLoading(false);
    }
  }, [crmReceiptId, distribute]);

  useEffect(() => { void load(); }, [load]);

  function toggle(candidate: Candidate, next: boolean) {
    if (!plan) return;
    const nextChecked = { ...checked };
    if (next) nextChecked[candidate.rowId] = true;
    else delete nextChecked[candidate.rowId];
    setChecked(nextChecked);
    const nextSelected = plan.candidates.filter((item) => nextChecked[item.rowId]);
    if (!nextSelected.length) { setAmounts({}); return; }
    setAmounts(distribute(nextSelected, receiptAmount));
  }

  function editAmount(candidate: Candidate, input: string) {
    if (!plan) return;
    const nextValue = Math.max(0, toAmount(input));
    const others = plan.candidates.filter((item) => item.rowId !== candidate.rowId && checked[item.rowId]);
    const nextAmounts = { ...amounts, [candidate.rowId]: input };
    if (!others.length) { setAmounts(nextAmounts); return; }
    const restTotal = round2(Math.max(0, receiptAmount - nextValue));
    const weights = others.map((item) => weightOf(item));
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
    if (Math.abs(difference) >= 0.01) { notify(`分摊合计与回款金额不一致（差 ${difference.toFixed(2)}），请调整`, "info"); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/cloud/crm-invoices/receipt-allocation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "allocate",
          crmReceiptId,
          allocations: selected.map((item) => ({ rowId: item.rowId, amount: toAmount(amounts[item.rowId]) })),
        }),
      });
      const data = (await response.json()) as { error?: string; allocations?: Row[]; skipped?: Array<{ reason: string }> };
      if (!response.ok) throw new Error(data.error ?? "回款分摊失败");
      notify(`已把实收分摊到 ${data.allocations?.length ?? 0} 行${data.skipped?.length ? `；${data.skipped.length} 行被跳过` : ""}`, "success");
      onSaved?.();
      onClose();
    } catch (saveError) {
      notify(saveError instanceof Error ? saveError.message : "回款分摊失败", "info");
    } finally {
      setBusy(false);
    }
  }

  async function clearAllocation() {
    if (!await confirmDialog("确认取消这笔回款的分摊吗？会把本笔写进各行「客户实收」的金额清回未收款（金额被手工改过的行不动）。")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/cloud/crm-invoices/receipt-allocation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear", crmReceiptId }),
      });
      const data = (await response.json()) as { error?: string; clearedRows?: number };
      if (!response.ok) throw new Error(data.error ?? "取消分摊失败");
      notify(`已取消分摊，清理 ${data.clearedRows ?? 0} 行实收`, "success");
      onSaved?.();
      onClose();
    } catch (clearError) {
      notify(clearError instanceof Error ? clearError.message : "取消分摊失败", "info");
    } finally {
      setBusy(false);
    }
  }

  const hasAllocation = Number(plan?.receipt?.allocationCount ?? 0) > 0 || (plan?.allocations?.length ?? 0) > 0;

  return (
    <Modal
      description="一笔回款覆盖多张发票/多个月时，按各行的开票金额（没有开票金额就用客户应收）把实收金额拆到对应账期；合计必须等于回款金额。"
      footer={<>
        <Button onClick={onClose}>取消</Button>
        {hasAllocation ? <Button disabled={busy} onClick={() => void clearAllocation()}>取消分摊</Button> : null}
        <Button disabled={busy || loading || Math.abs(difference) >= 0.01 || !selected.length} onClick={() => void save()} tone="primary">保存分摊</Button>
      </>}
      onClose={onClose}
      title="回款分摊到账期"
      widthClass="max-w-4xl"
    >
      {loading ? <div className="py-10 text-center text-sm text-ink-3">加载中…</div> : null}
      {error ? <div className="rounded border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div> : null}
      {plan && !loading ? (
        <>
          <div className="flex flex-wrap items-center gap-4 border-b border-line-soft pb-3 text-sm">
            <span>到账月份 <b>{String(plan.receipt.arrivalMonth ?? "-")}</b></span>
            <span className="text-ink-3">CRM 客户 {String(plan.receipt.customerShortName ?? "-")} · 本地客户 {String(plan.receipt.customerName ?? "未匹配")}</span>
            <span>回款金额 <b>{formatMoneyValue(plan.receipt.receiptAmount)}</b> {String(plan.receipt.currency ?? "")}</span>
            <span className="text-ink-3">银行流水 {String(plan.receipt.bankSerialNo ?? "-")}</span>
            <span className="text-ink-3">收款日 {formatDisplayValue(plan.receipt.arrivalMonth ? `${String(plan.receipt.arrivalMonth)}-01` : null)}（按到账月首日预估）</span>
          </div>
          <div className="mt-3 text-xs text-ink-3">
            关联发票：{plan.linkedInvoices.length
              ? plan.linkedInvoices.map((item) => `${item.invoiceNo}（${formatMoneyValue(item.amount)} → ${item.rows.map((row) => row.period).join("/")}）`).join("、")
              : "（CRM 未给出本地已有的发票号，或这些发票还没同步到本地）"}
          </div>
          {plan.suggestionRowIds.length && !hasAllocation ? (
            <div className="mt-3 flex items-center gap-2 rounded border border-info-border bg-info-soft px-3 py-2 text-xs text-primary">
              <AlertTriangle size={14} />系统根据关联发票/应收金额给出了建议分摊（已自动勾选），确认后保存即可。
            </div>
          ) : null}
          <div className="mt-3 max-h-[46vh] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-canvas">
                <tr>
                  {["选", "账期", "华为账号", "客户应收（含税）", "该行开票金额", "分摊比例", "实收金额", "说明"].map((label) => (
                    <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-left font-medium" key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.candidates.map((candidate) => {
                  const isChecked = Boolean(checked[candidate.rowId]);
                  const ratio = isChecked && receiptAmount > 0 ? toAmount(amounts[candidate.rowId]) / receiptAmount : 0;
                  return (
                    <tr className={isChecked ? "bg-surface-2" : undefined} key={candidate.rowId}>
                      <td className="border-b border-r border-line-soft px-3 py-2">
                        <input checked={isChecked} onChange={(event) => toggle(candidate, event.target.checked)} type="checkbox" />
                      </td>
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{candidate.period}</td>
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{candidate.account}</td>
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right">{formatMoneyValue(candidate.receivableAmount)}</td>
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right">{formatMoneyValue(candidate.invoiceTotalAmount)}</td>
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right">{isChecked ? `${(ratio * 100).toFixed(2)}%` : "-"}</td>
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right">
                        {isChecked
                          ? <Input className="w-[120px] text-right" value={amounts[candidate.rowId] ?? ""} onChange={(event) => editAmount(candidate, event.target.value)} />
                          : <span className="text-ink-4">-</span>}
                      </td>
                      <td className="whitespace-nowrap border-b border-line-soft px-3 py-2 text-xs">
                        {candidate.suggested ? <span className="text-primary">系统建议</span> : candidate.invoiceNo ? <span className="text-success">开票 {candidate.invoiceNo}</span> : <span className="text-ink-4">未开票</span>}
                      </td>
                    </tr>
                  );
                })}
                {!plan.candidates.length ? <tr><td className="py-8 text-center text-ink-3" colSpan={8}>该客户没有可分摊的对账行（可能都已被其它回款收过款）</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-3 text-sm">
            <span>
              已选 {selected.length} 行 · 分摊合计 <b>{formatMoneyValue(selectedTotal)}</b> / 回款金额 {formatMoneyValue(receiptAmount)}{" "}
              {Math.abs(difference) < 0.01
                ? <span className="ml-1 rounded bg-success-soft px-1.5 py-0.5 text-xs text-success">已对平</span>
                : <span className="ml-1 rounded bg-danger-soft px-1.5 py-0.5 text-xs text-danger">差 {difference.toFixed(2)}</span>}
            </span>
            <Button disabled={!selected.length} onClick={() => setAmounts(distribute(selected, receiptAmount))}>
              <Calculator size={14} />按开票/应收比例重算
            </Button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}
