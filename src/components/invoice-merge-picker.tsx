"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Input } from "./ui";
import { Modal } from "./modal";
import { EmptyState, LoadingBlock } from "./table-state";
import { notify } from "./app-dialog";

type MergeRow = {
  id: string;
  period: string;
  account: string;
  customer: string;
  currency: string;
  amountExcludingTax: number;
  taxRate: number;
  amountIncludingTax: number;
};

function money(value: number) {
  return Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * 合并多账期：勾选若干条未开票的对账行，确定后由开票弹层按这些行生成明细与金额。
 * 只列同一客户的行（票只能开给一个客户），币种也固定成当前这张票的币种。
 */
export function InvoiceMergePicker({
  customerId,
  currency,
  onApply,
  onClose,
}: {
  customerId: string;
  currency: string;
  onApply: (sourceIds: string[]) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<MergeRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (customerId) params.set("customerId", customerId);
      if (currency) params.set("currency", currency);
      if (from.trim()) params.set("from", from.trim());
      if (to.trim()) params.set("to", to.trim());
      const response = await fetch(`/api/invoices/merge-candidates?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "候选账单行加载失败");
      setRows((data.rows ?? []) as MergeRow[]);
      setSelected((current) => new Set([...current].filter((id) => (data.rows ?? []).some((row: MergeRow) => row.id === id))));
    } catch (error) {
      notify(error instanceof Error ? error.message : "候选账单行加载失败", "error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [currency, customerId, from, to]);

  useEffect(() => { void load(); }, [load]);

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const totals = rows.filter((row) => selected.has(row.id)).reduce(
    (sum, row) => ({
      net: sum.net + Number(row.amountExcludingTax ?? 0),
      gross: sum.gross + Number(row.amountIncludingTax ?? 0),
    }),
    { net: 0, gross: 0 },
  );

  return (
    <Modal
      description={`客户 ${customerId ? "已按当前客户过滤" : "未指定"}${currency ? ` · 币种 ${currency}` : ""} · 已开票的行不会出现`}
      footer={<>
        <span className="mr-auto text-xs text-ink-3">
          已选 <b>{selected.size}</b> 行 · 未税合计 <b>{money(totals.net)}</b> · 含税合计 <b>{money(totals.gross)}</b>
        </span>
        <Button onClick={onClose}>取消</Button>
        <Button
          disabled={!selected.size}
          onClick={() => onApply([...selected])}
          tone="primary"
        >
          确定，生成明细行（{selected.size}）
        </Button>
      </>}
      onClose={onClose}
      title="选择要合并开票的账单行"
      widthClass="max-w-4xl"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">账期起</span>
            <Input className="w-[130px]" onChange={(event) => setFrom(event.target.value)} placeholder="202601" value={from} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">账期止</span>
            <Input className="w-[130px]" onChange={(event) => setTo(event.target.value)} placeholder="202612" value={to} />
          </label>
          <Button onClick={() => void load()}>查询</Button>
          <span className="ml-auto text-xs text-ink-3">只列「未开票 + 有客户应收」的对账行</span>
        </div>
        {loading ? <LoadingBlock /> : (
          <div className="overflow-hidden rounded border border-line-soft">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-canvas">
                <tr>
                  <th className="w-9 border-b border-r border-line-soft px-3 py-2" />
                  {["账期", "客户", "华为ID", "未税", "税率", "含税"].map((label) => (
                    <th className="border-b border-r border-line-soft px-3 py-2 text-left font-medium text-ink-2" key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className={selected.has(row.id) ? "bg-info-soft" : undefined} key={row.id}>
                    <td className="border-b border-r border-line-soft px-3 py-2">
                      <input checked={selected.has(row.id)} onChange={() => toggle(row.id)} type="checkbox" />
                    </td>
                    <td className="border-b border-r border-line-soft px-3 py-2 font-medium">{row.period}</td>
                    <td className="border-b border-r border-line-soft px-3 py-2">{row.customer}</td>
                    <td className="border-b border-r border-line-soft px-3 py-2 text-xs text-ink-3">{row.account}</td>
                    <td className="border-b border-r border-line-soft px-3 py-2 text-right">{money(row.amountExcludingTax)}</td>
                    <td className="border-b border-r border-line-soft px-3 py-2 text-right">{row.taxRate ? `${row.taxRate}%` : "-"}</td>
                    <td className="border-b border-r border-line-soft px-3 py-2 text-right font-medium">{money(row.amountIncludingTax)}</td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr><td colSpan={7} className="py-10 text-center">
                    <EmptyState hint="可能这些账期已经开过票，或者该客户本月没有应收" title="没有可合并的账单行" />
                  </td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
