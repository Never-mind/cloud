"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RefreshCw, ScanLine, GitBranch } from "lucide-react";
import { Button, Input } from "./ui";
import { Modal } from "./modal";
import { SearchSelect } from "./search-select";
import { usePartnerOptions } from "./use-invoice-partner-options";
import { notify } from "./app-dialog";
import { InvoiceRecognitionReview } from "./invoice-recognition-review";
import { updateInvoiceReviewAmounts, validateInvoiceReview } from "@/lib/invoice-review";
import { invoiceDueDate, defaultInvoicePaymentTermDays, validateInvoicePaymentDates } from "@/lib/invoice-payment-terms";
import type { InvoiceRecognition } from "@/lib/invoice-recognition-service";
import { VAT_APPROVAL_CODE } from "@/lib/vat-invoice-approval";
import type { ReturnFileSummary } from "@/lib/invoice-approval-returns";
import {InvoiceAllocationEditor} from "./invoice-allocation-editor";
import {validateInvoiceAllocationPlan,type InvoiceAllocationPlan} from "@/lib/invoice-allocation";

type Group = { key: string; primary: ReturnFileSummary; files: ReturnFileSummary[]; registered: boolean; conflicting: boolean };
type Approval = {
  flow?: "cloud" | "vat";
  instanceCode: string; serialNumber: string; approvalCode: string; ownerNo: string; status: string; syncError: string;
  rejectReason: string; invoiceId: string; lastSyncedAt: string; groups: Group[]; invoiceParseJson?: string;
};
type ReviewDraft = {
  invoiceNo: string; invoiceDate: string; customerId: string; undertakingUnitId: string; currency: string; exchangeRate: string;
  amountExcludingTax: string; taxRate: string; taxAmount: string; amountIncludingTax: string; paymentTermDays: string; dueDate: string;
};
const approvalLabels: Record<string, string> = { pending: "审批中", returned: "已退回", approved: "已通过", rejected: "已驳回", canceled: "已撤回" };
export function InvoiceApprovalProgress({ sourceType, sourceId, onSaved }: { sourceType?: string; sourceId?: string; onSaved?: () => void }) {
  const [rows, setRows] = useState<Approval[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [syncing, setSyncing] = useState(""), [selected, setSelected] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const load = useCallback(async (offset = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("offset", String(offset));
      if (sourceType && sourceId) { params.set("sourceType", sourceType); params.set("sourceId", sourceId); }
      const response = await fetch("/api/invoices/approval/returns?" + params, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "审批记录加载失败");
      setRows(current => offset ? [...new Map([...current, ...data.approvals].map(row => [row.instanceCode, row])).values()] : data.approvals);
      setNextOffset(data.nextOffset ?? null); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "加载失败"); }
    finally { setLoading(false); }
  }, [sourceType, sourceId]);
  useEffect(() => { void load(); }, [load]);
  async function sync(instanceCode: string) {
    if (syncing) return;
    setSyncing(instanceCode);
    try {
      const response = await fetch("/api/invoices/approval/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instanceCode }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "同步失败");
      await load();
    } catch (error) { notify(error instanceof Error ? error.message : "同步失败", "error"); }
    finally { setSyncing(""); }
  }
  return <section className="space-y-3">
    <div className="flex items-center gap-2"><GitBranch size={16} /><h3 className="text-sm font-medium">审批进度与回票</h3><Button disabled={loading} onClick={() => void load()} aria-label="刷新审批记录"><RefreshCw size={14} /></Button></div>
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    {!loading && !error && !rows.length ? <p className="text-sm text-ink-3">暂无开票审批</p> : null}
    {rows.map(row => {
      let nodes: Array<{ name: string; status: string }> = [];
      try { nodes = JSON.parse(row.invoiceParseJson || "{}").nodes ?? []; } catch {}
      return <div key={row.instanceCode} className="border-b border-line-soft pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>{row.flow === "vat" || row.approvalCode === VAT_APPROVAL_CODE ? "增值税开票申请" : "Cloud Invoice Process"} · {row.serialNumber || row.instanceCode}</span>
          <span className="text-primary">{approvalLabels[row.status] || row.status}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-3"><span>{row.ownerNo}</span><span>同步：{row.lastSyncedAt ? String(row.lastSyncedAt).replace("T", " ").slice(0, 19) : "未同步"}</span><Button disabled={Boolean(syncing)} onClick={() => void sync(row.instanceCode)}><RefreshCw size={14} />{syncing === row.instanceCode ? "同步中…" : "同步进度与回票"}</Button></div>
        {nodes.length ? <div className="my-2 flex flex-wrap gap-3 text-xs text-ink-2">{nodes.map((node, index) => <span key={index}>{node.name}：{({ APPROVED: "已通过", DONE: "已完成", PENDING: "待处理", REJECTED: "已驳回", TRANSFERRED: "已转交" } as Record<string, string>)[node.status] || node.status}</span>)}</div> : null}
        {row.rejectReason ? <p className="text-sm text-danger">{row.rejectReason}</p> : null}
        {row.syncError ? <p className="break-all text-sm text-danger">{row.syncError}</p> : null}
        {!row.groups.length ? <p className="mt-2 text-sm text-ink-3">{row.invoiceId ? "已登记发票" : row.status === "approved" ? "审批已通过，待财务回传发票" : "待回传发票"}</p> : null}
        {row.groups.map(group => <div key={group.key} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 break-all">{group.primary.invoiceNo || group.primary.fileName}</span>
          <span className={group.conflicting ? "text-danger" : "text-ink-2"}>{group.registered ? "已登记" : row.invoiceId ? "新增回票待核对" : group.conflicting ? "版本信息不一致" : group.primary.recognition ? "已识别，待确认" : "识别失败，待补充"}</span>
          <Button onClick={() => setSelected(group.primary.id)}><ScanLine size={14} />{group.registered ? "查看发票" : "核对发票"}</Button>
          <div className="flex w-full flex-wrap gap-3 text-xs">{group.files.map(file => <a key={file.id} className="inline-flex items-center gap-1 break-all text-primary" href={"/api/invoices/approval/returns?download=1&fileId=" + encodeURIComponent(file.id)}><Download size={13} />{file.fileName}</a>)}</div>
        </div>)}
      </div>;
    })}
    {nextOffset !== null ? <Button disabled={loading} onClick={() => void load(nextOffset)}>加载更多</Button> : null}
    {selected ? <ReturnedInvoiceReview fileId={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); void load(); onSaved?.(); }} /> : null}
  </section>;
}

function ReturnedInvoiceReview({ fileId, onClose, onSaved }: { fileId: string; onClose: () => void; onSaved: () => void }) {
  const [allocationPlan,setAllocationPlan]=useState<InvoiceAllocationPlan|null>(null);
  const [sourceContext,setSourceContext]=useState({sourceType:"",sourceId:""});
  const [draft, setDraft] = useState<ReviewDraft | null>(null), [recognition, setRecognition] = useState<InvoiceRecognition | null>(null);
  const [error, setError] = useState(""), [warning, setWarning] = useState(""), [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [files, setFiles] = useState<ReturnFileSummary[]>([]);
  const [loadingTerms, setLoadingTerms] = useState(false);
  const termsRequest = useRef(0);
  const lock = useRef(false);
  const units = usePartnerOptions("undertaking-units", recognition?.partyMatches?.issuerUnit);
  const customers = usePartnerOptions("customers", recognition?.partyMatches?.receiverCustomer);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/invoices/approval/returns?fileId=" + encodeURIComponent(fileId), { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "发票读取失败");
        if (cancelled) return;
        const result = data.group?.primary.recognition as InvoiceRecognition | null;
        const facts = result?.facts;
        const base = data.base;
        const expected = data.expectedInvoice;
        const currency = String(facts?.currency || expected?.currency || base.currency || "").trim().toUpperCase();
        const baseCurrency = String(base.currency || "").trim().toUpperCase();
        const days = String(defaultInvoicePaymentTermDays(base.paymentTermDays));
        setRecognition(result);
        setAllocationPlan(data.allocationPlan??null);
        setSourceContext({sourceType:data.approval.sourceType,sourceId:data.approval.sourceId});
        setFiles(data.group?.files ?? []);
        setDraft({
          invoiceNo: facts?.invoiceNo || "", invoiceDate: facts?.invoiceDate || "",
          customerId: result?.matches?.receiverCustomerId || "", undertakingUnitId: result?.matches?.issuerUnitId || "",
          currency, exchangeRate: currency === baseCurrency ? String(base.exchangeRate || "") : "",
          amountExcludingTax: facts?.amountExcludingTax || "", taxRate: facts?.taxRate || "", taxAmount: facts?.taxAmount || "", amountIncludingTax: facts?.amountIncludingTax || "",
          paymentTermDays: days, dueDate: invoiceDueDate(facts?.invoiceDate || "", days),
          ...(data.confirmed ? Object.fromEntries(Object.entries(data.confirmed).map(([key, value]) => [key, String(value ?? "")])) : {}),
        });
        const warnings = [];
        if (data.approval.status !== "approved") warnings.push("审批尚未通过，可以核对识别内容，暂不能登记");
        if (data.approval.invoiceId) warnings.push("该审批已有已登记发票，不会自动覆盖");
        if (data.group?.conflicting) warnings.push("不同格式的票面信息不一致，请下载原件核对");
        if (!result) warnings.push(data.group?.primary.recognitionError || "识别失败，可手工填写票面信息");
        const reference = expected || { currency: baseCurrency, amountIncludingTax: base.amountIncludingTax };
        if (reference.currency && currency !== reference.currency) warnings.push("票面币种与" + (expected ? "开票申请" : "来源单据") + "币种不同，请核对");
        if (currency === reference.currency && facts?.amountIncludingTax && String(reference.amountIncludingTax ?? "").trim() && Math.abs(Number(facts.amountIncludingTax) - Number(reference.amountIncludingTax)) > 0.01) warnings.push("发票含税金额与" + (expected ? "开票申请" : "来源单据") + "不同，请核对");
        const partyReference = data.partySnapshot ? "开票申请" : "来源单据";
        if (result?.matches?.receiverCustomerId && result.matches.receiverCustomerId !== base.customerId) warnings.push("票面客户与" + partyReference + "客户不同");
        if (result?.matches?.issuerUnitId && result.matches.issuerUnitId !== base.undertakingUnitId) warnings.push("票面开票主体与" + partyReference + "不同");
        setWarning(warnings.join("；"));
        setBlocked(data.approval.status !== "approved" || Boolean(data.approval.invoiceId) || data.group?.registered);
      } catch (error) { if (!cancelled) setError(error instanceof Error ? error.message : "加载失败"); }
    })();
    return () => { cancelled = true; termsRequest.current += 1; };
  }, [fileId]);
  const patch = (next: Partial<ReviewDraft>) => { setConfirmed(false); setDraft(current => current ? { ...current, ...next } : current); };
  async function changeUnit(id: string) {
    patch({ undertakingUnitId: id, paymentTermDays: "", dueDate: "" });
    const requestId = ++termsRequest.current;
    if (!id) return;
    setLoadingTerms(true); setError("");
    try {
      const response = await fetch("/api/entities/undertaking-units/" + encodeURIComponent(id), { cache: "no-store" });
      const unit = await response.json();
      if (requestId !== termsRequest.current) return;
      if (!response.ok) throw new Error(unit.error || "开票主体账期读取失败");
      const days = String(defaultInvoicePaymentTermDays(unit.paymentTermDays));
      setDraft(current => current ? { ...current, paymentTermDays: days, dueDate: invoiceDueDate(current.invoiceDate, days) } : current);
    } catch (error) { if (requestId === termsRequest.current) setError(error instanceof Error ? error.message : "账期读取失败，请重新选择主体"); }
    finally { if (requestId === termsRequest.current) setLoadingTerms(false); }
  }
  async function save() {
    if (!draft || blocked || loadingTerms || lock.current || !confirmed) return;
    const validation = validateInvoiceReview(draft) || validateInvoicePaymentDates(draft);
    if (validation) { setError(validation); return; }
    if(allocationPlan){const problem=validateInvoiceAllocationPlan(allocationPlan,draft);if(problem||allocationPlan.currency!==draft.currency){setError(problem||"请核对分摊币种");return;}}
    if (!draft.customerId || !draft.undertakingUnitId) { setError("请选择客户和开票主体"); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/invoices/approval/returns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId, draft:{...draft,allocationPlan} }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "登记失败");
      notify(data.warning || "已确认发票并回写来源单据", data.warning ? "info" : "success"); onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : "登记失败"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Modal title="回票信息确认" widthClass="max-w-5xl" onClose={() => { if (!lock.current) onClose(); }} footer={<><Button disabled={busy} onClick={onClose}>关闭</Button><Button tone="primary" disabled={busy || blocked || loadingTerms || !draft || !confirmed} onClick={() => void save()}>{busy ? "登记中…" : "确认并登记发票"}</Button></>}>
    <div className="space-y-4">
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {warning ? <p className="text-sm text-amber-700">{warning}</p> : null}
      <div className="flex flex-wrap gap-3 text-xs">{files.map(file => <a key={file.id} className="inline-flex items-center gap-1 break-all text-primary" href={"/api/invoices/approval/returns?download=1&fileId=" + encodeURIComponent(file.id)}><Download size={14} />{file.fileName}</a>)}</div>
      <InvoiceRecognitionReview recognition={recognition} file={null} values={draft ?? {}} direction="income" />
      {loadingTerms ? <p className="text-sm text-ink-3">正在读取主体账期…</p> : null}
      {draft ? <fieldset disabled={busy || blocked || loadingTerms} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">开票主体<SearchSelect options={units} value={draft.undertakingUnitId} onChange={id => void changeUnit(id)} /></label>
        <label className="flex flex-col gap-1 text-sm">客户<SearchSelect options={customers} value={draft.customerId} onChange={id => patch({ customerId: id })} /></label>
        {([["invoiceNo", "发票号"], ["invoiceDate", "开票日期"], ["currency", "币种"], ["exchangeRate", "汇率"], ["paymentTermDays", "账期（天）"], ["dueDate", "到期日"]] as const).map(([key, label]) => <label key={key} className="flex flex-col gap-1 text-sm">{label}<Input type={key === "invoiceDate" || key === "dueDate" ? "date" : "text"} value={draft[key]} readOnly={key === "dueDate"} onChange={e => patch({ [key]: e.target.value, ...(["invoiceDate", "paymentTermDays"].includes(key) ? { dueDate: invoiceDueDate(key === "invoiceDate" ? e.target.value : draft.invoiceDate, key === "paymentTermDays" ? e.target.value : draft.paymentTermDays) } : {}) })} /></label>)}
        {([["amountExcludingTax", "未税金额"], ["taxRate", "税率（%）"], ["taxAmount", "税额"], ["amountIncludingTax", "含税金额"]] as const).map(([key, label]) => <label key={key} className="flex flex-col gap-1 text-sm">{label}<Input value={draft[key]} onChange={e => patch(updateInvoiceReviewAmounts(draft, key, e.target.value))} /></label>)}
      </fieldset> : <p className="text-sm text-ink-3">正在读取发票信息…</p>}
      {draft&&allocationPlan?<InvoiceAllocationEditor {...sourceContext} currency={draft.currency} totals={draft} value={allocationPlan} onChange={plan=>{setAllocationPlan(plan);setConfirmed(false);}} disabled={busy||blocked} lockSources/>:null}
      {!blocked ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />已核对票面明细、业务主体、各期分摊及金额差异</label> : null}
    </div>
  </Modal>;
}
