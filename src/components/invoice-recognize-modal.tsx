"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { Button, Input, Select } from "./ui";
import { Modal } from "./modal";
import { SearchSelect } from "./search-select";
import { usePartnerOptions } from "./invoice-draft-modal";
import { InvoiceRecognitionReview } from "./invoice-recognition-review";
import { completeInvoiceReviewAmounts, updateInvoiceReviewAmounts, validateInvoiceReview, type InvoiceReviewAmounts } from "@/lib/invoice-review";
import type { InvoiceRecognition, RecognizedInvoiceForm } from "@/lib/invoice-recognition-service";

const emptyForm: RecognizedInvoiceForm = { type: "", accountPeriod: "", accountingDate: "", invoiceNo: "", invoiceDate: "", receivableDate: "", currency: "", exchangeRate: "", invoiceTotal: "", taxRate: "", amountExcludingTax: "", taxAmount: "", companyEntityId: "", companyEntity: "", invoiceEntityId: "", invoiceEntity: "", invoiceEntityType: "", taxUuid: "" };

export function InvoiceRecognizeModal({ open, projectId, onClose, onSaved }: {
  open: boolean; projectId: string; onClose: () => void;
  onSaved: (form: RecognizedInvoiceForm, file: File) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [recognition, setRecognition] = useState<InvoiceRecognition | null>(null);
  const [draft, setDraft] = useState<RecognizedInvoiceForm>({ ...emptyForm });
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const units = usePartnerOptions("undertaking-units", draft.type === "income" ? recognition?.partyMatches?.issuerUnit : recognition?.partyMatches?.receiverUnit);
  const suppliers = usePartnerOptions("suppliers", recognition?.partyMatches?.issuerSupplier);
  const customers = usePartnerOptions("customers", recognition?.partyMatches?.receiverCustomer);
  const partners = draft.type === "income" ? customers : suppliers;
  const patch = (next: Partial<RecognizedInvoiceForm>) => setDraft(current => ({ ...current, ...next }));
  const amounts = { ...draft, amountIncludingTax: draft.invoiceTotal };
  const changeAmount = (key: keyof InvoiceReviewAmounts, value: string) => {
    const next = updateInvoiceReviewAmounts(amounts, key, value);
    patch({ amountExcludingTax: next.amountExcludingTax, taxRate: next.taxRate, taxAmount: next.taxAmount, invoiceTotal: next.amountIncludingTax });
  };
  function close() {
    if (lock.current) return;
    setFile(null); setRecognition(null); setDraft({ ...emptyForm }); setError(""); onClose();
  }
  async function recognize(next: File) {
    if (lock.current) return;
    if (next.size > 20 * 1024 * 1024) { setError("文件不能超过 20 MB"); return; }
    lock.current = true; setBusy(true); setFile(next); setRecognition(null); setDraft({ ...emptyForm }); setError("");
    try {
      const body = new FormData(); body.set("file", next);
      const response = await fetch(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/invoices/recognize`, { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "发票识别失败");
      const result = data.recognition as InvoiceRecognition;
      const values = completeInvoiceReviewAmounts({ ...result.form, amountIncludingTax: result.form.invoiceTotal });
      setRecognition(result); setDraft({ ...result.form, ...values, invoiceTotal: values.amountIncludingTax });
    } catch (error) { setError(`${error instanceof Error ? error.message : "识别失败"}，可手工补充后确认`); }
    finally { lock.current = false; setBusy(false); }
  }
  async function save() {
    if (!file || lock.current) return;
    const validation = validateInvoiceReview(amounts);
    if (validation) { setError(validation); return; }
    if (!draft.type || !draft.companyEntityId || !draft.invoiceEntityId) { setError("请选择类型、承接单位及供应商/客户"); return; }
    if (!["CNY", "USD", "MXN"].includes(draft.currency)) { setError("结算发票币种仅支持 CNY、USD、MXN，请确认后选择"); return; }
    if (!(Number(draft.exchangeRate) > 0)) { setError("请填写大于 0 的汇率（1 USD 对应原币金额）"); return; }
    lock.current = true; setSaving(true); setError("");
    try {
      const values = completeInvoiceReviewAmounts(amounts);
      await onSaved({ ...draft, ...values, invoiceTotal: values.amountIncludingTax, recognitionFacts: recognition?.facts }, file);
      setFile(null); setRecognition(null); setDraft({ ...emptyForm });
    } catch (error) { setError(error instanceof Error ? error.message : "保存失败"); }
    finally { lock.current = false; setSaving(false); }
  }
  if (!open) return null;
  return <Modal title="上传并识别" onClose={close} widthClass="max-w-5xl" footer={<>
    <Button disabled={busy || saving} onClick={close}>取消</Button>
    <Button disabled={!file || busy || saving} tone="primary" onClick={() => void save()}>{saving ? "保存中…" : "确认并新增到明细"}</Button>
  </>}>
    <div className="space-y-4">
      <input ref={inputRef} className="hidden" type="file" onChange={event => { const next = event.target.files?.[0]; event.target.value = ""; if (next) void recognize(next); }} />
      <Button disabled={busy || saving} onClick={() => inputRef.current?.click()}><FileUp size={16} />{busy ? "正在识别…" : file ? "重新上传并识别" : "上传并识别"}</Button>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <InvoiceRecognitionReview recognition={recognition} file={file} values={amounts} direction={draft.type} />
      {file ? <fieldset disabled={busy || saving} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">类型<Select value={draft.type} onChange={event => {
          const type = event.target.value as RecognizedInvoiceForm["type"];
          const companyId = type === "income" ? recognition?.matches?.issuerUnitId : type === "cost" ? recognition?.matches?.receiverUnitId : "";
          const partnerId = type === "income" ? recognition?.matches?.receiverCustomerId : type === "cost" ? recognition?.matches?.issuerSupplierId : "";
          patch({ type, invoiceEntityType: type === "income" ? "customer" : "supplier",
            companyEntityId: companyId || "", invoiceEntityId: partnerId || "",
            companyEntity: String(units.find(item => item.value === companyId)?.label || ""),
            invoiceEntity: String((type === "income" ? customers : suppliers).find(item => item.value === partnerId)?.label || "") });
        }}><option value="">请选择</option><option value="cost">成本</option><option value="income">收入</option></Select></label>
        <label className="flex flex-col gap-1 text-sm">承接单位<SearchSelect value={draft.companyEntityId} options={units} onChange={id => patch({ companyEntityId: id, companyEntity: String(units.find(item => item.value === id)?.label ?? "") })} /></label>
        <label className="flex flex-col gap-1 text-sm">{draft.type === "income" ? "客户" : "供应商"}<SearchSelect value={draft.invoiceEntityId} options={partners} onChange={id => patch({ invoiceEntityId: id, invoiceEntity: String(partners.find(item => item.value === id)?.label ?? ""), invoiceEntityType: draft.type === "income" ? "customer" : "supplier" })} /></label>
        {([ ["invoiceNo", "发票号"], ["invoiceDate", "开票日期"], ["accountPeriod", "账期"], ["accountingDate", "财务记账日期"], ["receivableDate", draft.type === "income" ? "应收日期" : "预计付款日期"], ["currency", "币种"], ["exchangeRate", "汇率（1 USD 对应原币）"], ["taxUuid", "税务 UUID"] ] as const).map(([key, label]) => <label key={key} className="flex flex-col gap-1 text-sm">{label}{key === "currency" ? <Select value={draft.currency} onChange={event => patch({ currency: event.target.value })}><option value="">请选择</option>{draft.currency && !["CNY", "USD", "MXN"].includes(draft.currency) ? <option value={draft.currency}>{draft.currency}（暂不支持）</option> : null}{["CNY", "USD", "MXN"].map(currency => <option key={currency}>{currency}</option>)}</Select> : <Input type={key.endsWith("Date") || key === "accountPeriod" ? "date" : "text"} value={draft[key] ?? ""} onChange={event => patch({ [key]: event.target.value })} />}</label>)}
        {([["amountExcludingTax", "未税金额"], ["taxRate", "税率（%）"], ["taxAmount", "税金"], ["amountIncludingTax", "含税金额"]] as const).map(([key, label]) => <label key={key} className="flex flex-col gap-1 text-sm">{label}<Input value={amounts[key]} onChange={event => changeAmount(key, event.target.value)} /></label>)}
      </fieldset> : null}
    </div>
  </Modal>;
}
