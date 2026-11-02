"use client";
import { useEffect, useState } from "react";
import { InvoiceAllocationAdjustModal } from "./invoice-allocation-adjust-modal";
import { StatementInvoiceRemoveModal } from "./statement-invoice-remove-modal";
import { Button } from "./ui";
import { formatDisplayValue } from "@/lib/display-format";

type Entry = Record<string, unknown>;
export function StatementInvoiceList({ sourceId, sourceType = "service_fee", entries, refreshToken = 0, onChanged, disabled = false, onBusyChange }: {
  sourceId: string; sourceType?: "service_fee" | "cloud_row"; entries?: Entry[]; refreshToken?: number; onChanged?: () => void; disabled?: boolean; onBusyChange?: (busy: boolean) => void;
}) {
  const [rows, setRows] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [adjust, setAdjust] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  useEffect(() => {
    if (entries) { setRows(entries); return; }
    let cancelled = false;
    setLoading(true); setError("");
    void (async () => {
      try {
        const response = await fetch(`/api/invoices?sourceType=${sourceType}&sourceId=${encodeURIComponent(sourceId)}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "发票加载失败");
        if (!cancelled) setRows(data.rows || []);
      } catch (error) { if (!cancelled) setError(error instanceof Error ? error.message : "发票加载失败"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [sourceId, sourceType, entries, refreshToken, revision]);
  const visibleRows = rows.filter(row => !removedIds.includes(String(row.id)));
  const money = (value: unknown) => Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <section aria-label="本账期已登记发票" className="rounded border border-line-soft bg-white p-3">
    <h3 className="text-sm font-medium">本账期已登记发票（{visibleRows.length} 张）</h3>
    <p className="mt-1 text-xs text-ink-3">每张发票独立保留，金额按本账期分摊累计。多张时账单展示最近开票日期、最早应收日期及综合税率；各张详情如下。</p>
    {loading ? <p className="py-2 text-sm">正在加载…</p> : error ? <p role="alert" className="py-2 text-danger">{error}</p> : !visibleRows.length ? <p className="py-2 text-sm text-ink-3">暂无已登记发票，可上传第一张。</p> : <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs">
      <thead><tr>{["发票号", "币种", "本期未税", "本期税金", "本期含税", "开票日期", "应收日期", "操作"].map(label => <th className="whitespace-nowrap px-2 py-2 font-medium" key={label}>{label}</th>)}</tr></thead>
      <tbody>{visibleRows.map(row => <tr className="border-t border-line-soft" key={String(row.id)}>
        <td className="px-2 py-2" title={`${row.sellerName || ""} → ${row.customerName || ""}`}>{String(row.invoiceNo)}</td>
        <td className="px-2">{String(row.currency)}</td>
        {["amountExcludingTax", "taxAmount", "amountIncludingTax"].map(key => <td className="whitespace-nowrap px-2 tabular-nums" key={key}>{money(row[key])}</td>)}
        {["invoiceDate", "dueDate"].map(key => <td className="whitespace-nowrap px-2" key={key}>{formatDisplayValue(String(row[key] || ""), "date")}</td>)}
        <td className="whitespace-nowrap px-2"><a className="text-primary" href={`/api/invoices/${encodeURIComponent(String(row.id))}/file`} target="_blank" rel="noreferrer">查看原件</a>{row.source === "external" ? <Button size="sm" disabled={disabled} onClick={() => setAdjust(String(row.id))}>调整分摊</Button> : null}<Button size="sm" tone="danger" disabled={disabled} onClick={() => setRemoveId(String(row.id))}>{row.source === "external" && !row.approvalInstanceCode ? "删除登记" : "作废登记"}</Button></td>
      </tr>)}</tbody>
      <tfoot><tr className="border-t border-line-soft font-medium"><td className="px-2 py-2" colSpan={2}>本账期合计 {String(visibleRows[0].currency)}</td>{["amountExcludingTax", "taxAmount", "amountIncludingTax"].map(key => <td className="whitespace-nowrap px-2" key={key}>{money(visibleRows.reduce((sum, row) => sum + Math.round(Number(row[key] || 0) * 100), 0) / 100)}</td>)}</tr></tfoot>
    </table></div>}
    {adjust ? <InvoiceAllocationAdjustModal invoiceId={adjust} onClose={() => setAdjust(null)} onSaved={() => { setAdjust(null); setRevision(value => value + 1); onChanged?.(); }} /> : null}
    {removeId ? <StatementInvoiceRemoveModal invoiceId={removeId} sourceId={sourceId} sourceType={sourceType} onBusyChange={onBusyChange} onClose={() => setRemoveId(null)} onRemoved={() => { setRemovedIds(ids => [...ids, removeId]); setRemoveId(null); setRevision(value => value + 1); onChanged?.(); }} /> : null}
  </section>;
}
