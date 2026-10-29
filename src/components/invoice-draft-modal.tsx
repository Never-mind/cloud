"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { Button, Input, Select, Textarea } from "./ui";
import { Modal } from "./modal";
import { notify } from "./app-dialog";
import { SearchSelect, type SearchSelectOption } from "./search-select";
import { InvoiceRecognitionReview } from "./invoice-recognition-review";
import { InvoiceAllocationEditor } from "./invoice-allocation-editor";
import { InvoiceAllocationAdjustModal } from "./invoice-allocation-adjust-modal";
import { validateInvoiceAllocationPlan, type InvoiceAllocationPlan } from "@/lib/invoice-allocation";
import type { InvoiceRecognition } from "@/lib/invoice-recognition-service";
import { recognizedInvoiceFields } from "@/lib/invoice-recognition-fill";
import { usePartnerOptions } from "./use-invoice-partner-options";
export { usePartnerOptions } from "./use-invoice-partner-options";
import { completeInvoiceReviewAmounts, updateInvoiceReviewAmounts, validateInvoiceReview } from "@/lib/invoice-review";
import { defaultInvoicePaymentTermDays, invoiceDueDate, updateInvoicePaymentDates, validateInvoicePaymentDates } from "@/lib/invoice-payment-terms";
import { type ApprovalPanelState } from "./invoice-approval-panel";
import { InvoiceApprovalFlows } from "./invoice-approval-flows";
import { INVOICE_CUSTOMER_FIELDS, INVOICE_SELLER_FIELDS, invoicePartyFields, partnerToInvoiceFields, type InvoicePartyFields } from "@/lib/invoice-party-fields";

/**
 * 开票弹层（两种模式共用）：
 *   - mode="generated"：系统生成票面，票号按账期自动分配；
 *   - mode="external" ：外部已开票，上传文件 + 登记票号金额。
 * 账单页（华为云对账、月账单对账单）和发票台账页都复用这一个组件，
 * 区别只在 sourceType / sourceId —— 传了来源就调 /api/invoices/prefill 预填。
 */

export type InvoiceDraftMode = "generated" | "external";
export type InvoiceDraftSourceType = "manual" | "cloud_row" | "billing_statement" | "service_fee" | "settlement_invoice";

type DraftLine = { periodLabel: string; description: string; amount: string };

type DraftForm = InvoicePartyFields & {
  sourceType: InvoiceDraftSourceType;
  sourceId: string;
  sourceNo: string;
  period: string;
  invoiceNo: string;
  customerId: string;
  undertakingUnitId: string;
  template: "normal" | "sgd";
  invoiceDate: string;
  dueDate: string;
  paymentTermDays: string;
  currency: string;
  exchangeRate: string;
  amountExcludingTax: string;
  taxRate: string;
  taxAmount: string;
  amountIncludingTax: string;
  sgdRate: string;
  sgdTotal: string;
  gstRegNo: string;
  comment: string;
  lines: DraftLine[];
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function addDays(dateString: string, days: number) {
  const base = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(base.getTime())) return dateString;
  base.setDate(base.getDate() + days);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

export function emptyInvoiceDraft(sourceType: InvoiceDraftSourceType = "manual", sourceId = ""): DraftForm {
  const invoiceDate = todayIso();
  return {
    sourceType, sourceId, sourceNo: "", period: invoiceDate.slice(0, 7).replace("-", ""),
    invoiceNo: "", customerId: "", undertakingUnitId: "", template: "normal",
    invoiceDate, dueDate: addDays(invoiceDate, 30), paymentTermDays: "30", currency: "USD",
    amountExcludingTax: "", taxRate: "", taxAmount: "", amountIncludingTax: "", exchangeRate: "",
    sgdRate: "", sgdTotal: "", gstRegNo: "", comment: "",
    lines: [{ periodLabel: "", description: "", amount: "" }],
  };
}

export function InvoiceDraftModal({
  autoOpenMergePicker = false,
  mode,
  onClose,
  onSaved,
  open,
  sourceId = "",
  sourceType = "manual",
}: {
  /** 从账单行的「合并多账期」入口进来时，直接打开账单行选择弹层。 */
  autoOpenMergePicker?: boolean;
  mode: InvoiceDraftMode;
  onClose: () => void;
  onSaved?: (invoice: Record<string, unknown>) => void;
  open: boolean;
  sourceId?: string;
  sourceType?: InvoiceDraftSourceType;
}) {
  const [draft, setDraft] = useState<DraftForm | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [recognition, setRecognition] = useState<InvoiceRecognition | null>(null);
  const sourceParties = useRef({ customerId: "", undertakingUnitId: "" });
  const requestId = useRef(0);
  const saving = useRef(false);
  const [prefilling, setPrefilling] = useState(false);
  const [loadingTerms, setLoadingTerms] = useState(false);
  const [termsError, setTermsError] = useState("");
  const [allocationIds, setAllocationIds] = useState<string[]>([]);
  const [allocationPlan,setAllocationPlan] = useState<InvoiceAllocationPlan|null>(null);
  const [existingInvoiceId,setExistingInvoiceId] = useState<string|null>(null);
  const [adjustExisting,setAdjustExisting] = useState(false);
  const updateAllocationPlan = useCallback((plan:InvoiceAllocationPlan) => {setAllocationPlan(plan);setAllocationIds(plan.allocations.map(row=>row.sourceId));},[]);
  /**
   * 开票方式：本地开票（系统生成票面）/ 飞书审批开票。
   * 放在弹层顶部切换 —— 原来这两个是底部两个按钮，长表单要滚到最底才看得到。
   * 飞书审批只支持华为云对账行，所以其它来源不显示这个切换。
   */
  const [issueMode, setIssueMode] = useState<"local" | "approval">("local");
  const [approvalState, setApprovalState] = useState<ApprovalPanelState | null>(null);
  const [visitedApproval, setVisitedApproval] = useState(false);
  /**
   * 飞书审批开票的入口：只对**有来源单据**的开票显示（手工开票没有单据可回填）。
   * 覆盖华为云对账行、月账单对账单、服务费对账单、集采结算发票四种收入来源。
   */
  const showIssueTabs = mode === "generated" && sourceType !== "manual";
  const customerOptions = usePartnerOptions("customers", recognition?.partyMatches?.receiverCustomer);
  const unitOptions = usePartnerOptions("undertaking-units", recognition?.partyMatches?.issuerUnit);

  // 打开时按来源预填；来源为空就是纯手填
  useEffect(() => {
    if (!open) return;
    const base = emptyInvoiceDraft(sourceType, sourceId);
    sourceParties.current = { customerId: "", undertakingUnitId: "" };
    setRecognition(null); setRecognizing(false); setFile(null); setAllocationIds([]);
    setAllocationPlan(null);setExistingInvoiceId(null);setAdjustExisting(false);
    setLoadingTerms(false); setTermsError("");
    requestId.current += 1;
    setIssueMode("local"); setApprovalState(null); setVisitedApproval(false);
    if (!sourceId) { setDraft(base); setFile(null); setPrefilling(false); return () => { requestId.current += 1; }; }
    let cancelled = false;
    setPrefilling(true);
    void (async () => {
      try {
        const response = await fetch(`/api/invoices/prefill?sourceType=${sourceType}&sourceId=${encodeURIComponent(sourceId)}`, { cache: "no-store" });
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(data.error ?? "预填失败");
        sourceParties.current = { customerId: text(data.customerId), undertakingUnitId: text(data.undertakingUnitId) };
        setDraft({
          ...base,
          ...invoicePartyFields(data),
          sourceNo: text(data.sourceNo),
          period: text(data.period) || base.period,
          invoiceNo: mode === "external" ? "" : text(data.suggestedInvoiceNo),
          customerId: text(data.customerId),
          undertakingUnitId: text(data.undertakingUnitId),
          invoiceDate: text(data.invoiceDate) || base.invoiceDate,
          dueDate: mode === "external" ? invoiceDueDate(text(data.invoiceDate) || base.invoiceDate, defaultInvoicePaymentTermDays(data.paymentTermDays)) : text(data.dueDate) || base.dueDate,
          paymentTermDays: String(defaultInvoicePaymentTermDays(data.paymentTermDays)),
          currency: text(data.currency) || "USD",
          exchangeRate: text(data.exchangeRate),
          amountExcludingTax: text(data.amountExcludingTax),
          taxRate: text(data.taxRate),
          taxAmount: text(data.taxAmount),
          amountIncludingTax: text(data.amountIncludingTax),
          lines: ((data.lines ?? []) as Record<string, unknown>[]).map((line) => ({
            periodLabel: text(line.date), description: text(line.desc), amount: text(line.cost),
          })),
        });
        const missing = (data.missing ?? []) as string[];
        if (missing.length) notify(`开票资料待补齐：${missing.join("、")}`, "info");
      } catch (error) {
        if (!cancelled) {
          notify(error instanceof Error ? error.message : "预填失败", "error");
          setDraft(base);
        }
      } finally {
        if (!cancelled) setPrefilling(false);
      }
    })();
    setFile(null);
    setAllocationIds([]);
    setIssueMode("local");
    setApprovalState(null);
    return () => { cancelled = true; requestId.current += 1; };
  }, [autoOpenMergePicker, mode, open, sourceId, sourceType]);

  async function recognizeFile(next: File) {
    if (next.size > 20 * 1024 * 1024) { notify("文件不能超过 20 MB", "error"); return; }
    const id = ++requestId.current;
    setFile(next); setRecognition(null); setRecognizing(true); setExistingInvoiceId(null);
    setTermsError("");
    setDraft(current => current ? { ...current, ...sourceParties.current, invoiceNo: "", invoiceDate: "", paymentTermDays: "30", dueDate: "", amountExcludingTax: "", taxRate: "", taxAmount: "", amountIncludingTax: "" } : current);
    try {
      const body = new FormData(); body.set("file", next);
      const response = await fetch("/api/invoices/recognize", { method: "POST", body });
      const data = await response.json();
      if (id !== requestId.current) return;
      if (!response.ok) throw new Error(data.error ?? "识别失败");
      const result = data.recognition as InvoiceRecognition;
      setRecognition(result);
      setDraft(current => {
        if (!current) return current;
        return { ...current, ...recognizedInvoiceFields(result, current),
          ...(!current.sourceId && result.facts?.servicePeriod ? { period: result.facts.servicePeriod.replace("-", "") } : {}) };
      });
    } catch (error) {
      if (id === requestId.current) notify(`${error instanceof Error ? error.message : "识别失败"}，可手工填写后确认`, "info");
    } finally { if (id === requestId.current) setRecognizing(false); }
  }

  async function changePartner(kind: "customers" | "undertakingUnits", partnerId: string) {
    const id = ++requestId.current;
    setTermsError("");
    const keepInvoiceTerms = mode === "external" && Boolean(recognition?.facts?.dueDate || recognition?.facts?.paymentTermDays);
    const matchedId = kind === "customers" ? recognition?.matches?.receiverCustomerId : recognition?.matches?.issuerUnitId;
    const keepInvoiceParties = mode === "external" && recognition?.partyFields && (!matchedId || matchedId === partnerId);
    const retainedFields = keepInvoiceParties ? Object.fromEntries((kind === "customers" ? INVOICE_CUSTOMER_FIELDS : INVOICE_SELLER_FIELDS)
      .filter(([key]) => recognition.partyFields?.[key] !== undefined).map(([key]) => [key, draft?.[key] ?? recognition.partyFields?.[key]])) : {};
    setDraft(current => current ? { ...current, ...partnerToInvoiceFields(kind, {}), ...retainedFields, ...(kind === "customers" ? { customerId: partnerId } : { undertakingUnitId: partnerId, ...(!keepInvoiceTerms ? { paymentTermDays: "", dueDate: "" } : {}) }) } : current);
    if (!partnerId) { setLoadingTerms(false); return; }
    setLoadingTerms(true);
    try {
      const response = await fetch(`/api/invoices/partners?kind=${kind}&id=${encodeURIComponent(partnerId)}`, { cache: "no-store" });
      const data = await response.json();
      if (id !== requestId.current) return;
      if (!response.ok) throw new Error(data.error ?? "主体账期加载失败");
      const paymentTermDays = String(defaultInvoicePaymentTermDays(data.paymentTermDays));
      setDraft(current => current ? { ...current, ...partnerToInvoiceFields(kind, data), ...retainedFields, ...(kind === "undertakingUnits" && !keepInvoiceTerms ? { paymentTermDays, dueDate: invoiceDueDate(current.invoiceDate, paymentTermDays) } : {}) } : current);
      if (data.warnings?.length) notify(data.warnings.join("；"), "info");
    } catch (error) {
      if (id === requestId.current) setTermsError(`${error instanceof Error ? error.message : "开票资料加载失败"}，请重新选择业务伙伴`);
    } finally { if (id === requestId.current) setLoadingTerms(false); }
  }

  function close() {
    if (saving.current || approvalState?.submitting || approvalState?.preparingAttachments) return;
    requestId.current += 1;
    onClose();
  }

  const submit = useCallback(async () => {
    if (!draft || saving.current || recognizing || loadingTerms) return;
    if(allocationPlan) {const error=validateInvoiceAllocationPlan(allocationPlan,draft);if(error){notify(error,"error");return;}if(allocationPlan.currency!==draft.currency){notify("请按当前开票币种重新核对分摊","error");return;}}
    if (!draft.customerId || !draft.undertakingUnitId) { notify("请选择客户抬头和开票主体", "error"); return; }
    if (termsError) { notify(termsError, "error"); return; }
    if (mode === "external" && !file) { notify("请先选择发票文件", "error"); return; }
    if (mode === "external") {
      if (termsError) { notify(termsError, "error"); return; }
      if (!draft.customerId || !draft.undertakingUnitId) { notify("请选择客户抬头和开票主体", "error"); return; }
      const error = validateInvoiceReview(draft);
      if (error) { notify(error, "error"); return; }
      const datesError = validateInvoicePaymentDates(draft);
      if (datesError) { notify(datesError, "error"); return; }
    }
    saving.current = true;
    setBusy(true);
    try {
      let response: Response;
      if (mode === "external") {
        const form = new FormData();
        form.set("file", file as File);
        form.set("payload", JSON.stringify({ ...draft, ...completeInvoiceReviewAmounts(draft), source: "external", recognitionFacts: recognition?.facts,allocationPlan }));
        response = await fetch("/api/invoices", { method: "POST", body: form });
      } else {
        response = await fetch("/api/invoices", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...draft, source: "generated", allocationSourceIds: allocationIds,allocationPlan }),
        });
      }
      const data = await response.json();
      if(data.existingInvoiceId)setExistingInvoiceId(data.existingInvoiceId);
      if (!response.ok) throw new Error(data.error ?? (mode === "external" ? "登记失败" : "开票失败"));
      notify(`${mode === "external" ? "已登记外部发票" : "已开票"}：${text(data.invoice?.invoiceNo)}`, "success");
      onSaved?.(data.invoice as Record<string, unknown>);
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "保存失败", "error");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }, [allocationIds, allocationPlan, draft, file, mode, onClose, onSaved, recognizing, recognition, loadingTerms, termsError]);

  if (!open) return null;

  return (
    <Modal
      description={mode === "external"
        ? "外部已经开好票：只登记 + 存文件，不生成票面"
        : issueMode === "approval"
          ? undefined
          : "票面按开票主体与客户档案生成；资料缺项会拦下并提示去补档案"}
      footer={<>
        <Button disabled={busy || approvalState?.submitting || approvalState?.preparingAttachments} onClick={close}>取消</Button>
        {issueMode === "approval" ? (
          <Button
            disabled={!approvalState || approvalState.loading || approvalState.blocked || approvalState.submitting}
            onClick={() => void approvalState?.submit()}
            tone="primary"
          >
            {approvalState?.submitting ? "提交中…" : "提交飞书审批"}
          </Button>
        ) : (
          <Button disabled={busy || recognizing || loadingTerms || Boolean(termsError) || prefilling || !draft} onClick={() => void submit()} tone="primary">
            {busy ? "保存中…" : mode === "external" ? "确认并保存发票" : "生成并标记已开票"}
          </Button>
        )}
      </>}
      onClose={close}
      title={mode === "external" ? "上传并识别" : "开票"}
      widthClass="max-w-5xl"
    >
      {showIssueTabs ? (
        <div className="mb-4 inline-flex rounded border border-line-soft bg-surface-2 p-0.5">
          {([["local", "本地开票"], ["approval", "飞书审批开票"]] as const).map(([key, label]) => (
            <button
              className={`rounded px-4 py-1.5 text-sm transition-colors ${issueMode === key ? "bg-white font-medium text-primary shadow-sm" : "text-ink-2 hover:text-ink"}`}
              key={key}
              disabled={busy || approvalState?.submitting || approvalState?.preparingAttachments}
              onClick={() => { setIssueMode(key); if (key === "approval") setVisitedApproval(true); }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {visitedApproval && showIssueTabs ? <div hidden={issueMode !== "approval"}>
        <InvoiceApprovalFlows
          active={issueMode === "approval"}
          onClose={onClose}
          onStateChange={setApprovalState}
          sourceId={draft?.sourceId || sourceId}
          sourceIds={allocationIds}
          sourceType={sourceType}
          allocationPlan={allocationPlan}
          onAllocationChange={updateAllocationPlan}
        />
      </div> : null}
      <div hidden={issueMode === "approval" && showIssueTabs}>
      {!draft || prefilling ? (
        <div className="py-10 text-center text-sm text-ink-3">正在按账单预填…</div>
      ) : (
        <div className="space-y-4">
          {mode === "external" ? (
            <section className="rounded border border-line-soft bg-white p-4">
              <h3 className="mb-3 border-b border-line-soft pb-2 text-sm font-medium text-ink">发票文件</h3>
              <label className="flex cursor-pointer items-center gap-2 rounded border border-dashed border-line px-4 py-4 text-sm text-ink-2 hover:border-primary hover:text-primary">
                <FileUp size={16} />
                <span className="min-w-0 break-all">{recognizing ? "正在识别…" : file ? `${file.name}（${Math.max(1, Math.round(file.size / 1024))} KB）` : "上传并识别（PDF / Excel / OFD / XML，最大 20 MB）"}</span>
                <input disabled={busy || recognizing || loadingTerms} className="hidden" onChange={(event) => { const next = event.target.files?.[0]; event.target.value = ""; if (next) void recognizeFile(next); }} type="file" />
              </label>
              <InvoiceRecognitionReview recognition={recognition} file={file} values={draft} direction="income" />
              {recognition?.facts?.servicePeriod && !allocationPlan ? <p className={`mt-2 text-sm ${draft.sourceId && draft.period.replace(/[^0-9]/g, "").slice(0, 6) !== recognition.facts.servicePeriod.replace("-", "") ? "text-warning-ink" : "text-ink-2"}`}>票面服务月份：{recognition.facts.servicePeriod}；关联账单账期：{draft.period || "未指定"}。{draft.sourceId && draft.period.replace(/[^0-9]/g, "").slice(0, 6) !== recognition.facts.servicePeriod.replace("-", "") ? "月份不一致，请核对关联账单。" : ""}</p> : null}
              {recognition?.matches && ((sourceParties.current.customerId && recognition.matches.receiverCustomerId && sourceParties.current.customerId !== recognition.matches.receiverCustomerId) || (sourceParties.current.undertakingUnitId && recognition.matches.issuerUnitId && sourceParties.current.undertakingUnitId !== recognition.matches.issuerUnitId)) ? <p className="mt-2 text-sm text-warning-ink">票面双方与业务单据默认单位不同，已按票面匹配填写本张发票，请确认。</p> : null}
              {recognition?.matches && ((recognition.matches.receiverCustomerId && recognition.matches.receiverCustomerId !== draft.customerId) || (recognition.matches.issuerUnitId && recognition.matches.issuerUnitId !== draft.undertakingUnitId)) ? <p className="mt-2 text-sm text-danger">票面双方与当前选择不一致，请核对客户及开票主体。</p> : null}
            </section>
          ) : null}
          {loadingTerms ? <p className="text-sm text-ink-3">正在读取业务伙伴开票资料…</p> : null}
          {termsError ? <p role="alert" className="text-sm text-danger">{termsError}</p> : null}
          {existingInvoiceId?<div className="flex flex-wrap items-center gap-2 rounded border border-warning-border p-3 text-sm"><span>该发票已登记，可直接调整原票的关联账期。</span><a className="text-primary" href={`/api/invoices/${encodeURIComponent(existingInvoiceId)}/file`} target="_blank" rel="noreferrer">查看原发票</a><Button onClick={()=>setAdjustExisting(true)}>调整关联账期及分摊</Button></div>:null}
          {["cloud_row","service_fee"].includes(sourceType)?<div className="space-y-2"><InvoiceAllocationEditor sourceType={sourceType} sourceId={sourceId} currency={draft.currency} totals={draft} value={allocationPlan} onChange={updateAllocationPlan} autoOpen={autoOpenMergePicker} recognizedLines={recognition?.lines} disabled={busy||recognizing||loadingTerms}
            onTotalsChange={mode==="generated"?totals=>setDraft(current=>current?{...current,amountExcludingTax:String(totals.amountExcludingTax),taxAmount:String(totals.taxAmount),amountIncludingTax:String(totals.amountIncludingTax),taxRate:String(totals.taxRate??"")}:current):undefined}/>
            <button className="text-xs text-primary" type="button" onClick={()=>setAdjustExisting(true)}>查看／调整本账单已登记发票的分摊</button></div>:null}
          <fieldset disabled={busy || recognizing || loadingTerms}><DraftFormFields
            customerOptions={customerOptions}
            draft={draft}
            mergedCount={allocationIds.length}
            hasAllocationPlan={Boolean(allocationPlan)}
            onOpenMergePicker={undefined}
            onChange={setDraft}
            onUndertakingUnitChange={id => void changePartner("undertakingUnits", id)}
            onCustomerChange={id => void changePartner("customers", id)}
            simple={mode === "external"}
            unitOptions={unitOptions}
          /></fieldset>
        </div>
      )}
      </div>
      {adjustExisting?<InvoiceAllocationAdjustModal invoiceId={existingInvoiceId||undefined} sourceType={sourceType} sourceId={sourceId} onClose={()=>setAdjustExisting(false)} onSaved={()=>{setAdjustExisting(false);onSaved?.({});onClose();}}/>:null}

    </Modal>
  );
}

function DraftFormFields({
  draft,
  customerOptions,
  unitOptions,
  mergedCount = 0,
  hasAllocationPlan = false,
  onChange,
  onUndertakingUnitChange,
  onCustomerChange,
  onOpenMergePicker,
  simple = false,
}: {
  draft: DraftForm;
  customerOptions: SearchSelectOption[];
  unitOptions: SearchSelectOption[];
  /** 已合并的账期数量（>0 时提示保存后这些行都会标记已开票）。 */
  mergedCount?: number;
  hasAllocationPlan?: boolean;
  onChange: (next: DraftForm) => void;
  onUndertakingUnitChange?: (id: string) => void;
  onCustomerChange?: (id: string) => void;
  /** 传了才显示「合并多账期」按钮（目前只有华为云对账行支持）。 */
  onOpenMergePicker?: () => void;
  simple?: boolean;
}) {
  const patch = (values: Partial<DraftForm>) => onChange({ ...draft, ...values });
  const labelClass = "flex min-w-0 flex-col gap-1 text-sm";
  const sectionClass = "rounded border border-line-soft bg-white p-4";
  const headingClass = "text-sm font-medium text-ink";
  const headingRowClass = "mb-3 flex items-center gap-2 border-b border-line-soft pb-2";
  const hintClass = "text-xs text-ink-3";

  const updateLine = (index: number, values: Partial<DraftLine>) =>
    patch({ lines: draft.lines.map((line, i) => (i === index ? { ...line, ...values } : line)) });

  /** 双币模板：改汇率或含税金额时把 SGD 合计按 汇率 × 含税 重算，用户仍可手工覆盖。 */
  const syncSgdTotal = (next: Partial<DraftForm>) => {
    const merged = { ...draft, ...next };
    if (merged.template !== "sgd") return next;
    const rate = Number(merged.sgdRate);
    const total = Number(merged.amountIncludingTax);
    if (!Number.isFinite(rate) || !Number.isFinite(total) || rate <= 0 || total <= 0) return next;
    return { ...next, sgdTotal: (Math.round(rate * total * 100) / 100).toFixed(2) };
  };

  return (
    <div className="space-y-5">
      <section className={sectionClass}>
        <div className={headingRowClass}><h3 className={headingClass}>开票双方</h3></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            <span className="text-ink-2">客户抬头</span>
            <SearchSelect
              className="w-full"
              onChange={(value) => onCustomerChange ? onCustomerChange(value) : patch({ customerId: value })}
              options={customerOptions}
              placeholder="按名称 / 编码 / 税号搜索客户"
              value={draft.customerId}
            />
            <span className={hintClass}>抬头、发票地址、联系人都取客户档案</span>
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">开票主体（承接单位）</span>
            <SearchSelect
              className="w-full"
              onChange={(value) => onUndertakingUnitChange ? onUndertakingUnitChange(value) : patch({ undertakingUnitId: value })}
              options={unitOptions}
              placeholder="按名称 / 编码 / 税号搜索承接单位"
              value={draft.undertakingUnitId}
            />
            <span className={hintClass}>地址、电话、财务邮箱、签章与收款银行取承接单位档案</span>
          </label>
        </div>
      </section>

      <section className={sectionClass}>
        <details><summary className="cursor-pointer text-sm font-medium">开票资料（自动带入，可展开修改）</summary>
          <p className="my-2 text-xs text-ink-3">修改仅用于本次开票，保存时记录资料快照。</p>
          <div className="grid gap-3 sm:grid-cols-2">{[...INVOICE_CUSTOMER_FIELDS, ...INVOICE_SELLER_FIELDS].map(([key, label]) => <label key={key} className={labelClass}><span>{label}</span><Input value={draft[key] ?? ""} onChange={event => patch({ [key]: event.target.value })} /></label>)}</div>
        </details>
      </section>
      <section className={sectionClass}>
        <div className={headingRowClass}><h3 className={headingClass}>票号与日期</h3></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={labelClass}>
            <span className="text-ink-2">发票号</span>
            <Input className="w-full" onChange={(event) => patch({ invoiceNo: event.target.value })} placeholder={simple ? "真实发票号码" : "留空自动分配"} value={draft.invoiceNo} />
            <span className={hintClass}>{simple ? "填外部系统出具的发票号" : "规则 INV-账期-流水，可手工改"}</span>
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">开票日期</span>
            <Input
              className="w-full"
              onChange={(event) => {
                const invoiceDate = event.target.value;
                onChange({ ...updateInvoicePaymentDates(draft, "invoiceDate", invoiceDate), ...(!draft.sourceId ? { period: invoiceDate.slice(0, 7).replace("-", "") } : {}) });
              }}
              type="date"
              value={draft.invoiceDate}
            />
            {!simple ? <span className={hintClass}>账期按开票日所在月归集</span> : null}
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">账期天数 / 到期日</span>
            <div className="flex min-w-0 items-center gap-2">
              <Input
                className="w-[92px] shrink-0"
                type="number"
                min="0"
                step="1"
                onChange={(event) => {
                  const days = event.target.value;
                  onChange(updateInvoicePaymentDates(draft, "paymentTermDays", days));
                }}
                value={draft.paymentTermDays}
              />
              <Input className="w-full" type="date" onChange={event => onChange(updateInvoicePaymentDates(draft, "dueDate", event.target.value))} value={draft.dueDate} />
            </div>
            {!simple ? <span className={hintClass}>到期日 = 开票日 + 账期天数</span> : null}
          </label>
        </div>
      </section>

      <section className={sectionClass}>
        <div className={headingRowClass}><h3 className={headingClass}>金额</h3></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelClass}>
            <span className="text-ink-2">币种</span>
            <Input className="w-full" onChange={(event) => patch({ currency: event.target.value })} value={draft.currency} />
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">未税金额</span>
            <Input className="w-full" onChange={(event) => onChange(updateInvoiceReviewAmounts(draft, "amountExcludingTax", event.target.value))} value={draft.amountExcludingTax} />
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">税率（%）</span>
            <Input className="w-full" onChange={(event) => onChange(updateInvoiceReviewAmounts(draft, "taxRate", event.target.value))} placeholder="例如 8 表示 8%" value={draft.taxRate} />
            <span className={hintClass}>填百分数：8% 就填 8（不要填 0.08）</span>
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">税金</span>
            <Input className="w-full" onChange={(event) => onChange(updateInvoiceReviewAmounts(draft, "taxAmount", event.target.value))} value={draft.taxAmount} />
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">含税金额</span>
            <Input
              className="w-full"
              onChange={(event) => onChange({ ...updateInvoiceReviewAmounts(draft, "amountIncludingTax", event.target.value), ...syncSgdTotal({ amountIncludingTax: event.target.value }) })}
              value={draft.amountIncludingTax}
            />
            <span className={hintClass}>票面 Total，也是明细行合计</span>
          </label>
          {simple ? null : (
            <>
              <label className={labelClass}>
                <span className="text-ink-2">票面模板</span>
                <Select className="w-full" onChange={(event) => patch({ template: event.target.value === "sgd" ? "sgd" : "normal" })} value={draft.template}>
                  <option value="normal">普通 Invoice</option>
                  <option value="sgd">双币 TAX INVOICE（含 SGD 列）</option>
                </Select>
              </label>
              {draft.template === "sgd" ? (
                <>
                  <label className={labelClass}>
                    <span className="text-ink-2">SGD 汇率</span>
                    <Input
                      className="w-full"
                      onChange={(event) => onChange({ ...draft, ...syncSgdTotal({ sgdRate: event.target.value }) })}
                      value={draft.sgdRate}
                    />
                    <span className={hintClass}>行 SGD 金额 = 金额 × 汇率</span>
                  </label>
                  <label className={labelClass}>
                    <span className="text-ink-2">SGD 合计</span>
                    <Input className="w-full" onChange={(event) => patch({ sgdTotal: event.target.value })} value={draft.sgdTotal} />
                  </label>
                </>
              ) : null}
            </>
          )}
        </div>
      </section>
      {simple && (draft.sourceType === "cloud_row" || draft.sourceType === "settlement_invoice") ? <label className={labelClass}>
        <span>发票汇率（1 USD 对应的原币金额）</span><Input value={draft.exchangeRate} onChange={event => patch({ exchangeRate: event.target.value })} />
      </label> : null}
      {simple ? <label className={labelClass}><span>发票备注</span><Textarea className="w-full" rows={2} value={draft.comment} onChange={event => patch({ comment: event.target.value })} /></label> : null}

      {simple || hasAllocationPlan ? null : (
        <>
          <section className={sectionClass}>
            <div className="mb-3 flex items-center justify-between border-b border-line-soft pb-2">
              <h3 className={headingClass}>明细行</h3>
              <div className="flex items-center gap-2">
                {onOpenMergePicker ? (
                  <Button onClick={onOpenMergePicker} size="sm" tone="secondary" type="button">合并多账期</Button>
                ) : null}
                <Button onClick={() => patch({ lines: [...draft.lines, { periodLabel: "", description: "", amount: "" }] })} size="sm" type="button">
                  添加行
                </Button>
              </div>
            </div>
            {mergedCount ? (
              <p className="text-xs text-primary">已合并 {mergedCount} 个账期：保存后这些账单行都会标记已开票，票面会挂到每一行的开票附件下。</p>
            ) : null}
            <div className="overflow-hidden rounded border border-line-soft">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-canvas">
                  <tr>
                    {["期间", "描述", "金额", ""].map((label, index) => (
                      <th className="border-b border-line-soft px-3 py-2 text-left font-medium text-ink-2" key={index}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.map((line, index) => (
                    <tr key={index}>
                      <td className="border-b border-line-soft p-2 align-middle">
                        <Input className="w-full" onChange={(event) => updateLine(index, { periodLabel: event.target.value })} value={line.periodLabel} />
                      </td>
                      <td className="border-b border-line-soft p-2 align-middle">
                        <Input className="w-full" onChange={(event) => updateLine(index, { description: event.target.value })} value={line.description} />
                      </td>
                      <td className="border-b border-line-soft p-2 align-middle">
                        <Input className="w-full" onChange={(event) => updateLine(index, { amount: event.target.value })} value={line.amount} />
                      </td>
                      <td className="border-b border-line-soft p-2 align-middle text-right">
                        <button
                          className="rounded px-2 py-1 text-xs text-danger hover:bg-danger-soft disabled:opacity-50"
                          disabled={draft.lines.length <= 1}
                          onClick={() => patch({ lines: draft.lines.filter((_, i) => i !== index) })}
                          type="button"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={hintClass}>票面数量固定为 1，金额同时作为单价与小计；不足 6 行会自动补空行。</p>
          </section>

          <section className={sectionClass}>
            <div className={headingRowClass}><h3 className={headingClass}>备注</h3></div>
            <Textarea className="w-full" onChange={(event) => patch({ comment: event.target.value })} rows={3} value={draft.comment} />
            <p className={hintClass}>备注会按票面宽度自动折行，并据此调整票面行高。</p>
          </section>
        </>
      )}
    </div>
  );
}
