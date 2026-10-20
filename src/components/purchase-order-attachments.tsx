"use client";

/**
 * 采购订单详情页的附件区（上传 / 下载 / 删除）。
 *
 * 附件存在通用附件表（ownerType = purchase-orders），与「发起付款申请」时上传的
 * 发票/合同是同一份数据：付款申请里传过的附件，这里能直接下载。
 */
import { useCallback, useEffect, useState } from "react";
import { Download, FileUp, Pencil, ReceiptText, Trash2 } from "lucide-react";
import { confirmDialog, notify } from "./app-dialog";
import { formatDisplayValue } from "@/lib/display-format";
import { normalizeDateOnlyValue } from "@/lib/date-only";
import { Button, IconButton, IconLink, Input, Select, Textarea } from "./ui";
import { Modal } from "./modal";

type Attachment = {
  attachmentId: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string | null;
};

type InvoiceInfo = {
  purchaseOrderId: string;
  poNo: string | null;
  orderCurrency: string | null;
  invoiceNo: string | null;
  invoiceDate: string | null;
  invoiceAmount: number | null;
  invoiceCurrency: string | null;
  invoiceStatus: string | null;
  expectedPaymentDate: string | null;
  paymentStatus: string | null;
  actualPaymentDate: string | null;
  invoiceRemark: string | null;
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

export function PurchaseOrderAttachments({ purchaseOrderId, readOnly = false }: { purchaseOrderId: string; readOnly?: boolean }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [invoiceInfo, setInvoiceInfo] = useState<InvoiceInfo | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>({
    invoiceNo: "",
    invoiceDate: "",
    invoiceAmount: "",
    invoiceCurrency: "USD",
    invoiced: false,
    expectedPaymentDate: "",
    paid: false,
    actualPaymentDate: "",
    invoiceRemark: "",
  });
  const [savingInvoice, setSavingInvoice] = useState(false);

  const load = useCallback(async () => {
    if (!purchaseOrderId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/common/attachments/purchase-orders/${encodeURIComponent(purchaseOrderId)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "附件加载失败");
      setAttachments(data.attachments ?? []);
    } catch (error) {
      notify(error instanceof Error ? error.message : "附件加载失败", "info");
    } finally {
      setLoading(false);
    }
  }, [purchaseOrderId]);

  const loadInvoiceInfo = useCallback(async () => {
    if (!purchaseOrderId) return;
    try {
      const response = await fetch(`/api/procurement/purchase-orders/${encodeURIComponent(purchaseOrderId)}/invoice-info`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setInvoiceInfo(null);
        return;
      }
      setInvoiceInfo(data.invoiceInfo ?? null);
    } catch {
      setInvoiceInfo(null);
    }
  }, [purchaseOrderId]);

  useEffect(() => {
    void load();
    void loadInvoiceInfo();
  }, [load, loadInvoiceInfo]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch(`/api/common/attachments/purchase-orders/${encodeURIComponent(purchaseOrderId)}`, { method: "POST", body });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? `上传失败：${file.name}`);
      }
      notify("附件已上传", "success");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "附件上传失败", "info");
    } finally {
      setUploading(false);
    }
  }

  async function remove(attachment: Attachment) {
    if (!(await confirmDialog({ title: "删除附件", message: `确认删除「${attachment.fileName}」？`, tone: "danger" }))) return;
    try {
      const response = await fetch(
        `/api/common/attachments/purchase-orders/${encodeURIComponent(purchaseOrderId)}/${encodeURIComponent(attachment.attachmentId)}`,
        { method: "DELETE" },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "删除失败");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "附件删除失败", "info");
    }
  }

  function openInvoiceForm() {
    setInvoiceDraft({
      invoiceNo: String(invoiceInfo?.invoiceNo ?? ""),
      invoiceDate: dateValue(invoiceInfo?.invoiceDate),
      invoiceAmount: invoiceInfo?.invoiceAmount == null ? "" : String(invoiceInfo.invoiceAmount),
      invoiceCurrency: String(invoiceInfo?.invoiceCurrency || invoiceInfo?.orderCurrency || "USD"),
      invoiced: invoiceInfo?.invoiceStatus === "issued" || (!invoiceInfo?.invoiceStatus && Boolean(invoiceInfo?.invoiceNo || invoiceInfo?.invoiceDate)),
      expectedPaymentDate: dateValue(invoiceInfo?.expectedPaymentDate),
      paid: invoiceInfo?.paymentStatus === "已付款",
      actualPaymentDate: dateValue(invoiceInfo?.actualPaymentDate),
      invoiceRemark: String(invoiceInfo?.invoiceRemark ?? ""),
    });
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

  const hasInvoiceInfo = Boolean(invoiceInfo && (invoiceInfo.invoiceNo || invoiceInfo.invoiceDate || invoiceInfo.expectedPaymentDate || invoiceInfo.invoiceAmount !== null || invoiceInfo.invoiceStatus || invoiceInfo.paymentStatus || invoiceInfo.actualPaymentDate));

  return (
    <section className="rounded border border-line-soft bg-white">
      <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
        <FileUp className="text-primary" size={17} />
        <h2 className="text-sm font-medium text-ink">附件</h2>
        <label
          className={`ml-auto inline-flex h-8 items-center gap-1 rounded border border-line px-3 text-sm ${
            readOnly || uploading ? "cursor-not-allowed text-ink-4" : "cursor-pointer text-ink-2 hover:border-primary hover:text-primary"
          }`}
        >
          {uploading ? "上传中…" : "上传附件"}
          <input className="hidden" disabled={readOnly || uploading} multiple type="file" onChange={(event) => { void upload(event.target.files); event.target.value = ""; }} />
        </label>
      </div>
      <div className="border-b border-line-soft bg-surface-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <ReceiptText className="text-primary" size={16} />
          <span className="text-sm font-medium text-ink">发票信息</span>
          {hasInvoiceInfo ? <span className="rounded bg-success-soft px-1.5 py-0.5 text-[11px] text-success">已登记</span> : null}
          <Button className="ml-auto" disabled={readOnly || savingInvoice} onClick={openInvoiceForm} size="sm">
            <Pencil size={14} />{hasInvoiceInfo ? "修改发票信息" : "登记发票信息"}
          </Button>
        </div>
        {hasInvoiceInfo && invoiceInfo ? (
          <div className="mt-2 grid gap-x-6 gap-y-1 text-xs text-ink-2 sm:grid-cols-2 lg:grid-cols-4">
            <div>发票号：<span className="text-ink">{invoiceInfo.invoiceNo || "-"}</span></div>
            <div>开票日期：<span className="text-ink">{dateValue(invoiceInfo.invoiceDate) || "-"}</span></div>
            <div>开票状态：<span className={invoiceInfo.invoiceStatus === "issued" ? "text-success" : "text-ink"}>{invoiceInfo.invoiceStatus === "issued" ? "已开票" : "未开票"}</span></div>
            <div>发票金额：<span className="text-ink">{invoiceInfo.invoiceAmount == null ? "-" : `${invoiceInfo.invoiceCurrency || ""} ${formatDisplayValue(invoiceInfo.invoiceAmount, "money")}`}</span></div>
            <div>预计付款日期：<span className="text-ink">{dateValue(invoiceInfo.expectedPaymentDate) || "-"}</span></div>
            <div>付款状态：<span className={invoiceInfo.paymentStatus === "已付款" ? "text-success" : invoiceInfo.paymentStatus === "审批中" ? "text-warning-ink" : "text-ink"}>{invoiceInfo.paymentStatus || "未付款"}</span></div>
            <div>实际付款日期：<span className="text-ink">{dateValue(invoiceInfo.actualPaymentDate) || "-"}</span></div>
            {invoiceInfo.invoiceRemark ? <div className="sm:col-span-2 lg:col-span-4">备注：<span className="text-ink">{invoiceInfo.invoiceRemark}</span></div> : null}
          </div>
        ) : <div className="mt-1 text-xs text-ink-3">上传发票后可登记开票日期、预计付款日期和发票金额。</div>}
      </div>
      <div className="divide-y divide-line-soft">
        {loading ? <div className="px-4 py-6 text-center text-sm text-ink-3">加载中…</div> : null}
        {!loading && !attachments.length ? <div className="px-4 py-6 text-center text-sm text-ink-3">暂无附件</div> : null}
        {attachments.map((attachment) => (
          <div className="flex items-center gap-3 px-4 py-2.5 text-sm" key={attachment.attachmentId}>
            <FileUp className="shrink-0 text-ink-3" size={16} />
            <div className="min-w-0 flex-1">
              <strong className="block truncate font-normal text-ink">{attachment.fileName}</strong>
              <div className="text-xs text-ink-3">
                {formatFileSize(Number(attachment.fileSize ?? 0))}
                {attachment.uploadedAt ? ` · ${formatDisplayValue(attachment.uploadedAt as never, "datetime")}` : ""}
              </div>
            </div>
            <IconLink
              href={`/api/common/attachments/purchase-orders/${encodeURIComponent(purchaseOrderId)}/${encodeURIComponent(attachment.attachmentId)}`}
              label="下载"
            >
              <Download size={15} />
            </IconLink>
            {readOnly ? null : (
              <IconButton icon={<Trash2 size={15} />} label="删除" onClick={() => void remove(attachment)} tone="danger" />
            )}
          </div>
        ))}
      </div>
      {invoiceOpen ? (
        <Modal
          description="登记供应商发票信息；预计付款日期会同步到付款申请的需求付款日期。"
          footer={<><Button disabled={savingInvoice} onClick={() => setInvoiceOpen(false)}>取消</Button><Button disabled={savingInvoice} onClick={() => void saveInvoiceInfo()} tone="primary">{savingInvoice ? "保存中…" : "保存"}</Button></>}
          onClose={() => setInvoiceOpen(false)}
          title="登记发票信息"
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
              <label className="flex items-center gap-2"><input checked={invoiceDraft.invoiced} type="checkbox" onChange={(event) => setInvoiceDraft({ ...invoiceDraft, invoiced: event.target.checked })} />已开票</label>
              <label className="flex items-center gap-2"><input checked={invoiceDraft.paid} type="checkbox" onChange={(event) => setInvoiceDraft({ ...invoiceDraft, paid: event.target.checked, actualPaymentDate: event.target.checked ? invoiceDraft.actualPaymentDate || todayValue() : "" })} />已付款</label>
            </div>
            <label className="space-y-1 text-sm text-ink-2 sm:col-span-2"><span>备注</span><Textarea className="w-full" rows={3} value={invoiceDraft.invoiceRemark} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, invoiceRemark: event.target.value })} /></label>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

function formatFileSize(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
