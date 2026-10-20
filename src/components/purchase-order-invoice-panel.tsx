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
import { Button, Input, Select, Textarea } from "./ui";
import { Modal } from "./modal";

type InvoiceInfo = {
  invoiceNo: string | null;
  invoiceDate: string | null;
  invoiceAmount: number | null;
  invoiceCurrency: string | null;
  invoiceStatus: string | null;
  expectedPaymentDate: string | null;
  paymentStatus: string | null;
  actualPaymentDate: string | null;
  invoiceRemark: string | null;
  orderCurrency: string | null;
};

type InvoiceDraft = {
  invoiceNo: string;
  invoiceDate: string;
  invoiceAmount: string;
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

function draftFromInfo(info: InvoiceInfo | null): InvoiceDraft {
  return {
    invoiceNo: String(info?.invoiceNo ?? ""),
    invoiceDate: dateValue(info?.invoiceDate),
    invoiceAmount: info?.invoiceAmount == null ? "" : String(info.invoiceAmount),
    invoiceCurrency: String(info?.invoiceCurrency || info?.orderCurrency || "USD"),
    invoiced: info?.invoiceStatus === "已开票" || info?.invoiceStatus === "issued" || (!info?.invoiceStatus && Boolean(info?.invoiceNo || info?.invoiceDate)),
    expectedPaymentDate: dateValue(info?.expectedPaymentDate),
    paid: info?.paymentStatus === "已付款",
    actualPaymentDate: dateValue(info?.actualPaymentDate),
    invoiceRemark: String(info?.invoiceRemark ?? ""),
  };
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

  async function saveInvoiceInfo() {
    setSavingInvoice(true);
    try {
      const response = await fetch(`/api/procurement/purchase-orders/${encodeURIComponent(purchaseOrderId)}/invoice-info`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoiceDraft),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "发票信息保存失败");
      setInvoiceInfo(data.invoiceInfo ?? null);
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
      const base = draftFromInfo(invoiceInfo);
      setInvoiceDraft({
        ...base,
        invoiceNo: String(form.invoiceNo || base.invoiceNo),
        invoiceDate: String(form.invoiceDate || base.invoiceDate),
        invoiceAmount: String(form.invoiceTotal || base.invoiceAmount),
        invoiceCurrency: String(form.currency || base.invoiceCurrency),
        invoiced: true,
        expectedPaymentDate: String(form.receivableDate || base.expectedPaymentDate),
      });
      setInvoiceOpen(true);
      notify(`发票已上传并识别${recognizeData.recognition?.source ? `：${recognizeData.recognition.source}` : ""}，请确认开票信息`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "发票上传或识别失败", "info");
    } finally {
      setRecognizing(false);
    }
  }

  const hasInvoiceInfo = Boolean(invoiceInfo && (invoiceInfo.invoiceNo || invoiceInfo.invoiceDate || invoiceInfo.expectedPaymentDate || invoiceInfo.invoiceAmount !== null || invoiceInfo.invoiceStatus || invoiceInfo.paymentStatus || invoiceInfo.actualPaymentDate));
  const paymentStatus = invoiceInfo?.paymentStatus || "未付款";

  return (
    <section className="border-t border-line-soft">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <ReceiptText className="text-primary" size={16} />
        <h3 className="text-sm font-medium text-ink">发票与付款</h3>
        {hasInvoiceInfo ? <span className="rounded bg-success-soft px-1.5 py-0.5 text-[11px] text-success">已登记</span> : null}
        <div className="ml-auto flex flex-wrap gap-2">
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
        <div className="grid gap-x-6 gap-y-1 px-4 pb-4 text-xs text-ink-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>发票号：<span className="text-ink">{invoiceInfo.invoiceNo || "-"}</span></div>
          <div>开票日期：<span className="text-ink">{dateValue(invoiceInfo.invoiceDate) || "-"}</span></div>
          <div>开票状态：<span className={invoiceInfo.invoiceStatus === "已开票" || invoiceInfo.invoiceStatus === "issued" ? "text-success" : "text-ink"}>{invoiceInfo.invoiceStatus === "已开票" || invoiceInfo.invoiceStatus === "issued" ? "已开票" : "未开票"}</span></div>
          <div>发票金额：<span className="text-ink">{invoiceInfo.invoiceAmount == null ? "-" : `${invoiceInfo.invoiceCurrency || ""} ${formatDisplayValue(invoiceInfo.invoiceAmount, "money")}`}</span></div>
          <div>预计付款日期：<span className="text-ink">{dateValue(invoiceInfo.expectedPaymentDate) || "-"}</span></div>
          <div>付款状态：<span className={paymentStatus === "已付款" ? "text-success" : paymentStatus === "审批中" ? "text-warning-ink" : "text-ink"}>{paymentStatus}</span></div>
          <div>实际付款日期：<span className="text-ink">{dateValue(invoiceInfo.actualPaymentDate) || "-"}</span></div>
          {invoiceInfo.invoiceRemark ? <div className="sm:col-span-2 lg:col-span-4">备注：<span className="text-ink">{invoiceInfo.invoiceRemark}</span></div> : null}
        </div>
      ) : <div className="px-4 pb-4 text-xs text-ink-3">上传发票后自动识别开票信息，也可以手工登记发票号、开票日期和预计付款日期。</div>}

      {invoiceOpen ? (
        <Modal
          description="上传发票会自动带出识别结果；预计付款日期会同步到付款申请的需求付款日期。"
          footer={<><Button disabled={savingInvoice} onClick={() => setInvoiceOpen(false)}>取消</Button><Button disabled={savingInvoice} onClick={() => void saveInvoiceInfo()} tone="primary">{savingInvoice ? "保存中…" : "保存"}</Button></>}
          onClose={() => setInvoiceOpen(false)}
          title={hasInvoiceInfo ? "修改发票信息" : "登记发票信息"}
          widthClass="max-w-2xl"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-ink-2"><span>发票号</span><Input className="w-full" value={invoiceDraft.invoiceNo} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, invoiceNo: event.target.value })} /></label>
            <label className="space-y-1 text-sm text-ink-2"><span>开票日期</span><Input className="w-full" type="date" value={invoiceDraft.invoiceDate} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, invoiceDate: event.target.value })} onBlur={(event) => setInvoiceDraft({ ...invoiceDraft, invoiceDate: event.target.value })} /></label>
            <label className="space-y-1 text-sm text-ink-2"><span>发票金额</span><Input className="w-full" step="0.0001" type="number" value={invoiceDraft.invoiceAmount} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, invoiceAmount: event.target.value })} /></label>
            <label className="space-y-1 text-sm text-ink-2"><span>发票币种</span><Select className="w-full" value={invoiceDraft.invoiceCurrency} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, invoiceCurrency: event.target.value })}>{INVOICE_CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</Select></label>
            <label className="space-y-1 text-sm text-ink-2"><span>预计付款日期</span><Input className="w-full" type="date" value={invoiceDraft.expectedPaymentDate} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, expectedPaymentDate: event.target.value })} onBlur={(event) => setInvoiceDraft({ ...invoiceDraft, expectedPaymentDate: event.target.value })} /></label>
            <label className="space-y-1 text-sm text-ink-2"><span>实际付款日期</span><Input className="w-full" disabled={!invoiceDraft.paid} type="date" value={invoiceDraft.actualPaymentDate} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, actualPaymentDate: event.target.value })} onBlur={(event) => setInvoiceDraft({ ...invoiceDraft, actualPaymentDate: event.target.value })} /></label>
            <div className="flex flex-wrap items-center gap-5 text-sm text-ink-2">
              <SlideSwitch checked={invoiceDraft.invoiced} onChange={(checked) => setInvoiceDraft({ ...invoiceDraft, invoiced: checked })} onLabel="已开票" offLabel="未开票" />
              <SlideSwitch checked={invoiceDraft.paid} onChange={(checked) => setInvoiceDraft({ ...invoiceDraft, paid: checked, actualPaymentDate: checked ? invoiceDraft.actualPaymentDate || todayValue() : "" })} onLabel="已付款" offLabel="未付款" />
            </div>
            <label className="space-y-1 text-sm text-ink-2 sm:col-span-2"><span>备注</span><Textarea className="w-full" rows={3} value={invoiceDraft.invoiceRemark} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, invoiceRemark: event.target.value })} /></label>
          </div>
          {invoiceInfo?.paymentStatus === "审批中" ? <div className="mt-3 rounded border border-warning-border-soft bg-warning-soft px-3 py-2 text-xs text-warning-ink">付款审批中，保存发票信息不会改变审批状态；审批结果会自动回写付款状态和实际付款日期。</div> : null}
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
