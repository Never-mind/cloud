"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button, Input, Select } from "./ui";
import { notify } from "./app-dialog";
import type { ApprovalPanelState } from "./invoice-approval-panel";
import type { VatDraft, VatOption } from "@/lib/vat-invoice-approval";
import { updateInvoiceReviewAmounts } from "@/lib/invoice-review";
import { InvoiceApprovalAttachments } from "./invoice-approval-attachments";
import type { InvoiceAttachmentOption } from "@/lib/invoice-approval-attachments";

type Prefill = {
  draft: VatDraft; sourceNo: string; period: string;
  sourceCurrency: string; sourceAmountIncludingTax: string; currency: "CNY";
  options: { group?: VatOption; companies: VatOption[]; months: VatOption[]; payments: VatOption[] };
  attachments: Array<{ attachmentId: string; fileName: string }>;
  attachmentOptions: InvoiceAttachmentOption[];
  existingApproval: { serialNumber: string; instanceCode: string } | null; blockers: string[];
};
export function VatInvoiceApprovalPanel({ sourceType, sourceId, sourceIds, onStateChange, onSubmitted, active }: {
  sourceType: string; sourceId: string; sourceIds: string[]; active: boolean;
  onStateChange: (state: ApprovalPanelState) => void; onSubmitted: () => void;
}) {
  const [data, setData] = useState<Prefill | null>(null), [draft, setDraft] = useState<VatDraft | null>(null);
  const [loading, setLoading] = useState(false), [submitting, setSubmitting] = useState(false), [error, setError] = useState("");
  const [readingAttachments, setReadingAttachments] = useState(false);
  const lock = useRef(false);
  const requestId = useRef(0);
  const ids = sourceIds.join(",");
  const load = useCallback(async (refresh = false) => {
    const id = ++requestId.current;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ flow: "vat", sourceType, sourceId, sourceIds: ids });
      const response = await fetch("/api/invoices/approval/prefill?" + params, { cache: "no-store" });
      const result = await response.json();
      if (id !== requestId.current) return;
      if (!response.ok) throw new Error(result.error || "增值税表单加载失败");
      setData(result); setDraft(current => refresh && current ? current : result.draft);
      if (!refresh) setReadingAttachments(false);
    } catch (error) { if (id === requestId.current) { setError(error instanceof Error ? error.message : "加载失败"); setData(null); } }
    finally { if (id === requestId.current) setLoading(false); }
  }, [sourceType, sourceId, ids]);
  useEffect(() => { void load(); return () => { requestId.current += 1; }; }, [load]);
  const blocked = loading || readingAttachments || !data || !draft || Boolean(error) || data.blockers.length > 0 || Boolean(data.existingApproval);
  const submit = useCallback(async () => {
    if (blocked || lock.current) return;
    lock.current = true; setSubmitting(true);
    try {
      const response = await fetch("/api/invoices/approval", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flow: "vat", sourceType, sourceId, sourceIds, draft }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "提交失败");
      notify("增值税开票审批已发起，回票后可核对发票信息", "success"); onSubmitted();
    } catch (error) { notify(error instanceof Error ? error.message : "提交失败", "error"); }
    finally { lock.current = false; setSubmitting(false); }
  }, [blocked, draft, sourceType, sourceId, sourceIds, onSubmitted]);
  useEffect(() => { if (active) onStateChange({ loading, blocked, submitting, preparingAttachments: readingAttachments, submit }); }, [active, loading, blocked, submitting, readingAttachments, submit, onStateChange]);
  const patch = (next: Partial<VatDraft>) => setDraft(current => current ? { ...current, ...next } : current);
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-2"><span className="text-sm text-ink-2">增值税开票申请 · CLOUD</span><Button disabled={loading || submitting || readingAttachments} onClick={() => void load(true)}><RefreshCw size={14} />刷新选项</Button></div>
    {loading ? <p className="text-sm text-ink-3">正在读取增值税审批表单…</p> : null}
    {[error, ...(data?.blockers ?? []), data?.existingApproval ? "该单据已有审批：" + (data.existingApproval.serialNumber || data.existingApproval.instanceCode) : ""].filter(Boolean).map(message => <p key={message} role="alert" className="flex items-start gap-2 text-sm text-danger"><AlertCircle size={16} className="shrink-0" />{message}</p>)}
    {draft && data ? <fieldset disabled={submitting || loading} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">开票主体<Select value={draft.companyKey} onChange={e => patch({ companyKey: e.target.value })}><option value="">请选择</option>{data.options.companies.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></label>
        <label className="flex flex-col gap-1 text-sm">所属项目组<Input value="CLOUD" readOnly /></label>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm"><span>票据类型</span>{([["special", "专票"], ["ordinary", "普票"]] as const).map(([value, label]) => <label key={value} className="flex items-center gap-2"><input type="radio" name="vat-type" checked={draft.invoiceType === value} onChange={() => patch({ invoiceType: value })} />{label}</label>)}</div>
      <section className="border-t border-line-soft pt-4"><h3 className="mb-3 text-sm font-medium">客户开票资料</h3><div className="grid gap-3 sm:grid-cols-2">
        {([["customerName", "客户公司名称"], ["taxId", "纳税人识别号"], ...(draft.invoiceType === "special" ? [["address", "开票地址"], ["phone", "电话"], ["bankName", "开户行"], ["bankAccount", "银行账号"]] : [])] as Array<[keyof VatDraft, string]>).map(([key, label]) => <label key={key} className="flex flex-col gap-1 text-sm">{label}<Input value={String(draft[key])} onChange={e => patch({ [key]: e.target.value })} /></label>)}
      </div></section>
      <section className="border-t border-line-soft pt-4"><h3 className="mb-3 text-sm font-medium">开票信息（CNY）</h3>
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">来源币种<Input value={data.sourceCurrency || ""} readOnly /></label>
        <label className="flex flex-col gap-1 text-sm">来源含税金额<Input value={data.sourceAmountIncludingTax || ""} readOnly /></label>
        <label className="flex flex-col gap-1 text-sm">开票币种<Input value="CNY" readOnly /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {([["amountExcludingTax", "未税金额"], ["taxRate", "税率（%）"], ["taxAmount", "税额"], ["amountIncludingTax", "开票金额（含税）"]] as const).map(([key, label]) => <label key={key} className="flex flex-col gap-1 text-sm">{label}<Input value={draft[key]} onChange={e => patch(updateInvoiceReviewAmounts(draft, key, e.target.value))} /></label>)}
        <label className="flex flex-col gap-1 text-sm">账期（天）<Input type="number" min="0" max="3650" value={draft.paymentTermDays} onChange={e => patch({ paymentTermDays: e.target.value })} /></label>
      </div>
      {(["months", "payments"] as const).map(key => <div key={key} className="mt-4 flex flex-wrap items-center gap-3 text-sm"><span>{key === "months" ? "所属月份" : "付款类型"}</span>{data.options[key].map(option => <label key={option.value} className="flex items-center gap-1"><input type="checkbox" checked={draft[key].includes(option.value)} onChange={e => patch({ [key]: e.target.checked ? [...draft[key], option.value] : draft[key].filter(v => v !== option.value) })} />{option.label}</label>)}</div>)}
      </section>
      <InvoiceApprovalAttachments key={`${sourceType}:${sourceId}:${ids}`} options={data.attachmentOptions ?? []} value={draft}
        onChange={selection => patch({ attachmentRefs: selection.attachmentRefs, attachments: selection.attachments })}
        disabled={submitting || loading || data.blockers.length > 0 || Boolean(data.existingApproval)} onBusyChange={setReadingAttachments} />
    </fieldset> : null}
  </div>;
}
