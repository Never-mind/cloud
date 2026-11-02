"use client";
import { useEffect, useRef, useState } from "react";
import type { InvoiceRemovalPreview } from "@/lib/statement-invoice-removal";
import { Modal } from "./modal";
import { Button } from "./ui";
import { notify } from "./app-dialog";

export function StatementInvoiceRemoveModal({ invoiceId, sourceId, sourceType, onClose, onRemoved, onBusyChange }: {
  invoiceId: string; sourceId: string; sourceType: "cloud_row" | "service_fee";
  onClose: () => void; onRemoved: () => void; onBusyChange?: (busy: boolean) => void;
}) {
  const [preview, setPreview] = useState<InvoiceRemovalPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const endpoint = `/api/invoices/${encodeURIComponent(invoiceId)}/registration`;
  useEffect(() => {
    let canceled = false;
    setPreview(null); setError("");
    void (async () => {
      try {
        const response = await fetch(`${endpoint}?${new URLSearchParams({ sourceType, sourceId })}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "加载失败");
        if (!canceled) setPreview(data.preview);
      } catch (error) { if (!canceled) setError(error instanceof Error ? error.message : "加载失败"); }
    })();
    return () => { canceled = true; };
  }, [endpoint, sourceId, sourceType]);

  async function remove() {
    if (!preview || submitting.current) return;
    submitting.current = true; setBusy(true); setError(""); onBusyChange?.(true);
    try {
      const response = await fetch(endpoint, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceType, sourceId, revision: preview.revision }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "移除登记失败");
      notify(`${data.mode === "delete" ? "已删除" : "已作废"}发票登记 ${data.invoiceNo}，${data.affectedCount} 条账单的开票合计已更新`, "success");
      onRemoved();
    } catch (error) { setError(error instanceof Error ? error.message : "移除登记失败"); }
    finally { submitting.current = false; setBusy(false); onBusyChange?.(false); }
  }
  const deleting = preview?.mode === "delete";
  return <Modal title={preview ? deleting ? "删除发票登记" : "作废发票登记" : "核对发票登记"} zClass="z-[110]"
    onClose={() => { if (!submitting.current) onClose(); }}
    footer={<><Button disabled={busy} onClick={onClose}>取消</Button><Button disabled={!preview || busy} tone="danger" onClick={() => void remove()}>{busy ? "处理中…" : deleting ? "确认删除登记" : "确认作废登记"}</Button></>}>
    {error ? <p role="alert" className="mb-3 text-sm text-danger">{error}</p> : null}
    {preview ? <div className="space-y-3 text-sm">
      <p>发票号：<strong>{preview.invoiceNo}</strong> · 整票含税金额：{preview.currency} {Number(preview.total).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
      <p className="break-all text-ink-2">原件：{preview.fileName || "—"}</p>
      <p>{deleting ? "删除这张上传发票的登记、账期分摊和账单附件引用，并重新计算开票合计。删除后可重新上传正确发票，包括同一票号。" : "本地将保留这张票的作废记录，从开票合计中扣除对应金额，并移除账单附件引用。此操作不会作废税务系统中的发票，也不会撤销飞书审批。"}</p>
      <p className="font-medium">将更新以下 {preview.sources.length} 条账单：</p>
      <div className="max-h-60 overflow-auto rounded border border-line-soft"><table className="w-full text-left text-xs">
        <thead><tr><th className="p-2">账期／账单</th><th className="p-2 text-right">扣除含税金额</th></tr></thead>
        <tbody>{preview.sources.map(row => <tr className="border-t border-line-soft" key={row.sourceId}><td className="p-2">{row.period} · {row.sourceNo}{row.sourceId === sourceId ? "（当前账单）" : ""}</td><td className="whitespace-nowrap p-2 text-right">{preview.currency} {Number(row.amountIncludingTax).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td></tr>)}</tbody>
      </table></div>
      <p className="text-ink-2">其他有效发票继续保留；最后一张移除后，账单恢复未开票。应收、应付及实收金额不变。</p>
      {preview.sources.length > 1 ? <p className="text-warning-ink">这会移除整张发票在以上全部账单的登记。如果只是关联错了账期，请取消并使用「调整分摊」。</p> : null}
    </div> : !error ? <p className="py-4 text-sm text-ink-3">正在核对发票及关联账期…</p> : null}
  </Modal>;
}
