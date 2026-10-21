"use client";

/**
 * 算力采购订单主单里的「发票与付款」区块。
 *
 * 上传发票时会同时：
 *   1. 保存到采购订单附件；
 *   2. 走共享发票识别（中国增值税 / 墨西哥 CFDI / 新加坡 GST）；
 *   3. 打开登记弹层，带出识别结果供确认。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, Pencil, ReceiptText } from "lucide-react";
import { notify } from "./app-dialog";
import { formatDisplayValue } from "@/lib/display-format";
import { normalizeDateOnlyValue } from "@/lib/date-only";
import { deriveInvoiceTaxAmounts, roundInvoiceAmount, roundInvoiceRate } from "@/lib/invoice-tax";
import { paymentApprovalStatusClass, paymentApprovalStatusLabel } from "@/lib/payment-approval-status";
import { Button, Input, Select, Textarea } from "./ui";
import { Modal } from "./modal";

type InvoiceInfo = {
  invoiceNo: string | null;
  invoiceDate: string | null;
  invoiceAmount: number | null;
  invoiceNetAmount: number | null;
  invoiceTaxRate: number | null;
  invoiceTaxAmount: number | null;
  invoiceCurrency: string | null;
  invoiceStatus: string | null;
  expectedPaymentDate: string | null;
  paymentStatus: string | null;
  actualPaymentDate: string | null;
  invoiceRemark: string | null;
  orderCurrency: string | null;
  paymentApprovalId: string | null;
  paymentApprovalStatus: string | null;
  paymentApprovalNo: string | null;
  paymentConfirmedAt: string | null;
};

type InvoiceDraft = {
  invoiceNo: string;
  invoiceDate: string;
  invoiceAmount: string;
  invoiceNetAmount: string;
  invoiceTaxRate: string;
  invoiceTaxAmount: string;
  invoiceCurrency: string;
  invoiced: boolean;
  expectedPaymentDate: string;
  paid: boolean;
  actualPaymentDate: string;
  invoiceRemark: string;
};

const INVOICE_CURRENCIES = ["USD", "CNY", "MXN", "CLP", "BRL", "SGD", "HKD", "EUR"];

function dateValue(value: unknown) {
  return normalizeDateOnlyValue(value) ?? "";
}

function todayValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function numberText(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? "" : String(roundInvoiceAmount(Number(value)));
}

function rateText(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? "" : String(roundInvoiceRate(Number(value)));
}

function draftNumber(value: string) {
  const text = String(value ?? "").trim().replace(/,/g, "");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function invoiceMoney(value: number | null | undefined, currency: string | null | undefined) {
  return value === null || value === undefined ? "-" : `${currency || ""} ${formatDisplayValue(value, "money")}`.trim();
}

function draftFromInfo(info: InvoiceInfo | null): InvoiceDraft {
  return {
    invoiceNo: String(info?.invoiceNo ?? ""),
    invoiceDate: dateValue(info?.invoiceDate),
    invoiceAmount: numberText(info?.invoiceAmount),
    invoiceNetAmount: numberText(info?.invoiceNetAmount),
    invoiceTaxRate: rateText(info?.invoiceTaxRate),
    invoiceTaxAmount: numberText(info?.invoiceTaxAmount),
    invoiceCurrency: String(info?.invoiceCurrency || info?.orderCurrency || "USD"),
    invoiced: info?.invoiceStatus === "已开票" || info?.invoiceStatus === "issued" || (!info?.invoiceStatus && Boolean(info?.invoiceNo || info?.invoiceDate)),
    expectedPaymentDate: dateValue(info?.expectedPaymentDate),
    paid: info?.paymentStatus === "已付款",
    actualPaymentDate: dateValue(info?.actualPaymentDate),
    invoiceRemark: String(info?.invoiceRemark ?? ""),
  };
}

/** 四个金额联动：改未税/税率算税金与含税，改税金/含税反算税率。 */
function updateDraftAmount(
  draft: InvoiceDraft,
  field: "invoiceNetAmount" | "invoiceTaxRate" | "invoiceTaxAmount" | "invoiceAmount",
  value: string,
) {
  const next = { ...draft, [field]: value };
  const net = draftNumber(next.invoiceNetAmount);
  const rate = draftNumber(next.invoiceTaxRate);
  const tax = draftNumber(next.invoiceTaxAmount);
  const gross = draftNumber(next.invoiceAmount);

  if ((field === "invoiceNetAmount" || field === "invoiceTaxRate") && net !== null && rate !== null) {
    const nextTax = roundInvoiceAmount(net * rate / 100);
    next.invoiceTaxAmount = numberText(nextTax);
    next.invoiceAmount = numberText(roundInvoiceAmount(net + nextTax));
  } else if (field === "invoiceTaxAmount" && net !== null && tax !== null) {
    next.invoiceAmount = numberText(roundInvoiceAmount(net + tax));
    if (net !== 0) next.invoiceTaxRate = rateText(tax / net * 100);
  } else if (field === "invoiceAmount" && net !== null && gross !== null) {
    const nextTax = roundInvoiceAmount(gross - net);
    next.invoiceTaxAmount = numberText(nextTax);
    if (net !== 0) next.invoiceTaxRate = rateText(nextTax / net * 100);
  }
  return next;
}

export function PurchaseOrderInvoicePanel({ purchaseOrderId, readOnly = false }: { purchaseOrderId: string; readOnly?: boolean }) {
  const [invoiceInfo, setInvoiceInfo] = useState<InvoiceInfo | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>(draftFromInfo(null));
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadInvoiceInfo = useCallback(async () => {
    if (!purchaseOrderId) return;
    try {
      const response = await fetch(`/api/procurement/purchase-orders/${encodeURIComponent(purchaseOrderId)}/invoice-info`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      setInvoiceInfo(response.ok ? data.invoiceInfo ?? null : null);
    } catch {
      setInvoiceInfo(null);
    }
  }, [purchaseOrderId]);

  useEffect(() => {
    void loadInvoiceInfo();
  }, [loadInvoiceInfo]);

  function openInvoiceForm() {
    setInvoiceDraft(draftFromInfo(invoiceInfo));
    setInvoiceOpen(true);
  }

  async function persistInvoiceDraft(draft: InvoiceDraft) {
    const response = await fetch(`/api/procurement/purchase-orders/${encodeURIComponent(purchaseOrderId)}/invoice-info`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "发票信息保存失败");
    setInvoiceInfo(data.invoiceInfo ?? null);
  }

  async function saveInvoiceInfo() {
    setSavingInvoice(true);
    try {
      await persistInvoiceDraft(invoiceDraft);
      setInvoiceOpen(false);
      notify("发票信息已保存", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "发票信息保存失败", "info");
    } finally {
      setSavingInvoice(false);
    }
  }

  async function uploadAndRecognize(file: File) {
    setRecognizing(true);
    try {
      const uploadBody = new FormData();
      uploadBody.set("file", file);
      const uploadResponse = await fetch(`/api/common/attachments/purchase-orders/${encodeURIComponent(purchaseOrderId)}`, { method: "POST", body: uploadBody });
      const uploadData = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok) throw new Error(uploadData.error ?? "发票附件上传失败");

      const recognizeBody = new FormData();
      recognizeBody.set("file", file);
      const recognizeResponse = await fetch(`/api/procurement/purchase-orders/${encodeURIComponent(purchaseOrderId)}/invoice-recognize`, { method: "POST", body: recognizeBody });
      const recognizeData = await recognizeResponse.json().catch(() => ({}));
      if (!recognizeResponse.ok) throw new Error(recognizeData.error ?? "发票识别失败");
      const form = recognizeData.recognition?.form ?? {};
      const recognitionWarnings: string[] = Array.isArray(recognizeData.recognition?.warnings)
        ? recognizeData.recognition.warnings.map((item: unknown) => String(item)).filter(Boolean)
        : [];
      const base = draftFromInfo(invoiceInfo);
      const recognizedTax = deriveInvoiceTaxAmounts({
        netAmount: draftNumber(String(form.amountExcludingTax || "")) ?? draftNumber(base.invoiceNetAmount),
        taxRate: draftNumber(String(form.taxRate || "")) ?? draftNumber(base.invoiceTaxRate),
        taxAmount: draftNumber(String(form.taxAmount || "")) ?? draftNumber(base.invoiceTaxAmount),
        grossAmount: draftNumber(String(form.invoiceTotal || "")) ?? draftNumber(base.invoiceAmount),
      });
      const recognizedDraft: InvoiceDraft = {
        ...base,
        invoiceNo: String(form.invoiceNo || base.invoiceNo),
        invoiceDate: String(form.invoiceDate || base.invoiceDate),
        invoiceAmount: numberText(recognizedTax.grossAmount),
        invoiceNetAmount: numberText(recognizedTax.netAmount),
        invoiceTaxRate: rateText(recognizedTax.taxRate),
        invoiceTaxAmount: numberText(recognizedTax.taxAmount),
        invoiceCurrency: String(form.currency || base.invoiceCurrency),
        invoiced: true,
        expectedPaymentDate: String(form.receivableDate || base.expectedPaymentDate),
      };
      setInvoiceDraft(recognizedDraft);
      let saved = false;
      try {
        await persistInvoiceDraft(recognizedDraft);
        saved = true;
      } catch (error) {
        notify(error instanceof Error ? error.message : "识别结果自动登记失败", "info");
      }
      setInvoiceOpen(true);
      notify(
        saved
          ? `发票已上传、识别并登记${recognizeData.recognition?.source ? `：${recognizeData.recognition.source}` : ""}${recognitionWarnings.length ? `；${recognitionWarnings.join("；")}` : ""}`
          : `发票已识别，请核对后点击保存${recognitionWarnings.length ? `；${recognitionWarnings.join("；")}` : ""}`,
        saved && !recognitionWarnings.length ? "success" : "info",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "发票上传或识别失败", "info");
    } finally {
      setRecognizing(false);
    }
  }

  const hasInvoiceInfo = Boolean(invoiceInfo && (
    invoiceInfo.invoiceNo
    || invoiceInfo.invoiceDate
    || invoiceInfo.expectedPaymentDate
    || invoiceInfo.invoiceAmount !== null
    || invoiceInfo.invoiceNetAmount !== null
    || invoiceInfo.invoiceTaxAmount !== null
    || invoiceInfo.invoiceStatus
    || invoiceInfo.paymentStatus
    || invoiceInfo.actualPaymentDate
    || invoiceInfo.paymentApprovalId
    || invoiceInfo.paymentApprovalStatus
  ));
  const paymentStatus = invoiceInfo?.paymentStatus || "未付款";
  const paymentApprovalStatus = paymentApprovalStatusLabel(invoiceInfo?.paymentApprovalStatus);
  const invoiceIssued = invoiceInfo?.invoiceStatus === "已开票" || invoiceInfo?.invoiceStatus === "issued";
  const invoiceCurrency = invoiceInfo?.invoiceCurrency || invoiceInfo?.orderCurrency || "USD";

  return (
    <section className="border-t border-line-soft">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <ReceiptText className="text-primary" size={16} />
        <h3 className="text-sm font-medium text-ink">发票与付款</h3>
        {hasInvoiceInfo ? (
          <>
            <span className={`rounded px-1.5 py-0.5 text-[11px] ${invoiceIssued ? "bg-success-soft text-success" : "bg-canvas text-ink-3"}`}>
              {invoiceIssued ? "已开票" : "未开票"}
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] ${paymentStatus === "已付款" ? "bg-success-soft text-success" : ["审批中", "已退回"].includes(paymentStatus) ? "bg-warning-soft text-warning-ink" : paymentStatus === "已驳回" ? "bg-danger-soft text-danger" : "bg-canvas text-ink-3"}`}>
              {paymentStatus}
            </span>
          </>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {hasInvoiceInfo ? (
            <span className="text-[11px] text-ink-3">
              含税 <b className="text-xs font-medium text-ink">{invoiceMoney(invoiceInfo?.invoiceAmount, invoiceCurrency)}</b>
            </span>
          ) : null}
          <label className={`inline-flex h-8 items-center gap-1 rounded border border-line px-2.5 text-xs ${readOnly || recognizing ? "cursor-not-allowed text-ink-4" : "cursor-pointer text-ink-2 hover:border-primary hover:text-primary"}`}>
            <FileUp size={14} />{recognizing ? "上传识别中…" : "上传发票并识别"}
            <input ref={fileInputRef} accept=".pdf,.ofd,.xml" className="hidden" disabled={readOnly || recognizing} type="file" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadAndRecognize(file); }} />
          </label>
          <Button disabled={readOnly || savingInvoice} onClick={openInvoiceForm} size="sm">
            <Pencil size={14} />{hasInvoiceInfo ? "修改发票信息" : "登记发票信息"}
          </Button>
        </div>
      </div>

      {hasInvoiceInfo && invoiceInfo ? (
        <div className="px-4 pb-4">
          <div className="mb-2 text-[11px] font-medium text-ink-3">发票信息</div>
          <div className="grid gap-x-6 gap-y-2 rounded border border-line-soft bg-surface-2/40 p-3 text-xs text-ink-2 sm:grid-cols-2 lg:grid-cols-4">
            <div>发票号：<span className="text-ink">{invoiceInfo.invoiceNo || "-"}</span></div>
            <div>开票日期：<span className="text-ink">{dateValue(invoiceInfo.invoiceDate) || "-"}</span></div>
            <div>发票币种：<span className="text-ink">{invoiceCurrency}</span></div>
            <div>开票状态：<span className={invoiceIssued ? "text-success" : "text-ink"}>{invoiceIssued ? "已开票" : "未开票"}</span></div>
            <div>未税金额：<span className="text-ink">{invoiceMoney(invoiceInfo.invoiceNetAmount, invoiceCurrency)}</span></div>
            <div>税率：<span className="text-ink">{invoiceInfo.invoiceTaxRate == null ? "-" : `${formatDisplayValue(invoiceInfo.invoiceTaxRate, "number")}%`}</span></div>
            <div>税金：<span className="text-ink">{invoiceMoney(invoiceInfo.invoiceTaxAmount, invoiceCurrency)}</span></div>
            <div>含税金额：<span className="font-medium text-ink">{invoiceMoney(invoiceInfo.invoiceAmount, invoiceCurrency)}</span></div>
          </div>
          <div className="mb-2 mt-4 text-[11px] font-medium text-ink-3">付款信息</div>
          <div className="grid gap-x-6 gap-y-2 rounded border border-line-soft bg-surface-2/40 p-3 text-xs text-ink-2 sm:grid-cols-2 lg:grid-cols-4">
            <div>审批状态：<span className={paymentApprovalStatus ? `inline-flex rounded border px-2 py-0.5 text-[11px] ${paymentApprovalStatusClass(invoiceInfo.paymentApprovalStatus)}` : "text-ink"}>{paymentApprovalStatus || "-"}</span></div>
            <div>审批单号：<span className="text-ink">{invoiceInfo.paymentApprovalNo || "-"}</span></div>
            <div>预计付款日期：<span className="text-ink">{dateValue(invoiceInfo.expectedPaymentDate) || "-"}</span></div>
            <div>付款状态：<span className={paymentStatus === "已付款" ? "text-success" : ["审批中", "已退回"].includes(paymentStatus) ? "text-warning-ink" : paymentStatus === "已驳回" ? "text-danger" : "text-ink"}>{paymentStatus}</span></div>
            <div>实际付款日期：<span className="text-ink">{dateValue(invoiceInfo.actualPaymentDate) || "-"}</span></div>
            <div>确认到账：<span className="text-ink">{invoiceInfo.paymentConfirmedAt ? formatDisplayValue(invoiceInfo.paymentConfirmedAt as never, "datetime") : "-"}</span></div>
            <div className="sm:col-span-2 lg:col-span-4">备注：<span className="text-ink">{invoiceInfo.invoiceRemark || "-"}</span></div>
          </div>
        </div>
      ) : <div className="px-4 pb-4 text-xs text-ink-3">上传发票后自动识别票面信息，也可以手工登记发票号、开票日期，以及未税金额、税率、税金和含税金额。</div>}

      {invoiceOpen ? (
        <Modal
          description="上传发票会自动带出识别结果；预计付款日期会同步到付款申请的需求付款日期。"
          footer={<><Button disabled={savingInvoice} onClick={() => setInvoiceOpen(false)}>取消</Button><Button disabled={savingInvoice} onClick={() => void saveInvoiceInfo()} tone="primary">{savingInvoice ? "保存中…" : "保存"}</Button></>}
          onClose={() => setInvoiceOpen(false)}
          title={hasInvoiceInfo ? "修改发票信息" : "登记发票信息"}
          widthClass="max-w-3xl"
        >
          <div className="space-y-5">
            <section>
              <div className="mb-2 text-xs font-medium text-ink">发票信息</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm text-ink-2"><span>发票号</span><Input className="w-full" value={invoiceDraft.invoiceNo} onChange={(event) => setInvoiceDraft((current) => ({ ...current, invoiceNo: event.target.value }))} /></label>
                <label className="space-y-1 text-sm text-ink-2"><span>开票日期</span><Input className="w-full" type="date" value={invoiceDraft.invoiceDate} onChange={(event) => setInvoiceDraft((current) => ({ ...current, invoiceDate: event.target.value }))} onBlur={(event) => setInvoiceDraft((current) => ({ ...current, invoiceDate: event.target.value }))} /></label>
                <label className="space-y-1 text-sm text-ink-2"><span>发票币种</span><Select className="w-full" value={invoiceDraft.invoiceCurrency} onChange={(event) => setInvoiceDraft((current) => ({ ...current, invoiceCurrency: event.target.value }))}>{INVOICE_CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</Select></label>
                <div className="flex items-end pb-1 text-sm text-ink-2">
                  <SlideSwitch checked={invoiceDraft.invoiced} onChange={(checked) => setInvoiceDraft((current) => ({ ...current, invoiced: checked }))} onLabel="已开票" offLabel="未开票" />
                </div>
              </div>
            </section>

            <section>
              <div className="mb-2 text-xs font-medium text-ink">金额与税金</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1 text-sm text-ink-2"><span>未税金额</span><Input className="w-full" step="0.01" type="number" value={invoiceDraft.invoiceNetAmount} onChange={(event) => setInvoiceDraft((current) => updateDraftAmount(current, "invoiceNetAmount", event.target.value))} /></label>
                <label className="space-y-1 text-sm text-ink-2"><span>税率（%）</span><Input className="w-full" step="0.0001" type="number" value={invoiceDraft.invoiceTaxRate} onChange={(event) => setInvoiceDraft((current) => updateDraftAmount(current, "invoiceTaxRate", event.target.value))} /></label>
                <label className="space-y-1 text-sm text-ink-2"><span>税金</span><Input className="w-full" step="0.01" type="number" value={invoiceDraft.invoiceTaxAmount} onChange={(event) => setInvoiceDraft((current) => updateDraftAmount(current, "invoiceTaxAmount", event.target.value))} /></label>
                <label className="space-y-1 text-sm text-ink-2"><span>含税金额</span><Input className="w-full" step="0.01" type="number" value={invoiceDraft.invoiceAmount} onChange={(event) => setInvoiceDraft((current) => updateDraftAmount(current, "invoiceAmount", event.target.value))} /></label>
              </div>
              <p className="mt-2 text-[11px] text-ink-3">含税金额 = 未税金额 + 税金。修改未税金额或税率会自动计算税金和含税金额；修改税金或含税金额会反算税率。</p>
            </section>

            <section>
              <div className="mb-2 text-xs font-medium text-ink">付款信息</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm text-ink-2"><span>预计付款日期</span><Input className="w-full" type="date" value={invoiceDraft.expectedPaymentDate} onChange={(event) => setInvoiceDraft((current) => ({ ...current, expectedPaymentDate: event.target.value }))} onBlur={(event) => setInvoiceDraft((current) => ({ ...current, expectedPaymentDate: event.target.value }))} /></label>
                <label className="space-y-1 text-sm text-ink-2"><span>实际付款日期</span><Input className="w-full" disabled={!invoiceDraft.paid} type="date" value={invoiceDraft.actualPaymentDate} onChange={(event) => setInvoiceDraft((current) => ({ ...current, actualPaymentDate: event.target.value }))} onBlur={(event) => setInvoiceDraft((current) => ({ ...current, actualPaymentDate: event.target.value }))} /></label>
                <div className="flex items-end pb-1 text-sm text-ink-2">
                  <SlideSwitch checked={invoiceDraft.paid} onChange={(checked) => setInvoiceDraft((current) => ({ ...current, paid: checked, actualPaymentDate: checked ? current.actualPaymentDate || todayValue() : "" }))} onLabel="已付款" offLabel="未付款" />
                </div>
                <label className="space-y-1 text-sm text-ink-2 sm:col-span-2"><span>备注</span><Textarea className="w-full" rows={3} value={invoiceDraft.invoiceRemark} onChange={(event) => setInvoiceDraft((current) => ({ ...current, invoiceRemark: event.target.value }))} /></label>
              </div>
            </section>
          </div>
          {["审批中", "已退回", "已驳回", "已撤回"].includes(invoiceInfo?.paymentStatus ?? "") ? <div className="mt-3 rounded border border-warning-border-soft bg-warning-soft px-3 py-2 text-xs text-warning-ink">
            {invoiceInfo?.paymentStatus === "审批中" ? "付款审批中，保存发票信息不会改变审批状态；审批结果会自动回写付款状态和实际付款日期。" : invoiceInfo?.paymentStatus === "已退回" ? "付款审批已退回，请在飞书修改后重新提交；系统会继续同步审批状态。" : invoiceInfo?.paymentStatus === "已驳回" ? "付款审批已驳回，请核对后在飞书重新发起。" : "付款审批已撤回，请核对后在飞书重新发起。"}
          </div> : null}
        </Modal>
      ) : null}
    </section>
  );
}

function SlideSwitch({ checked, onChange, onLabel, offLabel, disabled = false }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  onLabel: string;
  offLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      aria-checked={checked}
      className="inline-flex items-center gap-2 text-sm text-ink-2 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${checked ? "bg-success" : "bg-ink-4"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </span>
      <span>{checked ? onLabel : offLabel}</span>
    </button>
  );
}
