"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileUp, Plus, RefreshCw, Search, Trash2, XCircle } from "lucide-react";
import { Button, Input, Panel, Select, Textarea } from "./ui";
import { Modal } from "./modal";
import { PaginationBar } from "./pagination-bar";
import { EmptyState, LoadingBlock } from "./table-state";
import { confirmDialog, notify } from "./app-dialog";
import { SearchSelect, type SearchSelectOption } from "./search-select";
import { formatDisplayValue, formatMoneyValue } from "@/lib/display-format";

type InvoiceRow = Record<string, unknown>;

type DraftLine = { periodLabel: string; description: string; amount: string };

type DraftForm = {
  sourceType: "manual" | "cloud_row" | "billing_statement";
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

const SOURCE_LABELS: Record<string, string> = { generated: "系统生成", external: "外部上传" };
const STATUS_LABELS: Record<string, string> = { draft: "草稿", issued: "已开票", void: "已作废" };
const STATUS_TONES: Record<string, string> = {
  draft: "bg-canvas text-ink-2",
  issued: "bg-success-soft text-success",
  void: "bg-danger-soft text-danger",
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function addDays(dateString: string, days: number) {
  const base = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(base.getTime())) return dateString;
  return new Date(base.getTime() + days * 86400000).toISOString().slice(0, 10);
}

function money(value: unknown, currency: unknown) {
  const formatted = formatMoneyValue(value);
  return formatted === "-" ? "-" : `${String(currency ?? "")} ${formatted}`;
}

function emptyDraft(): DraftForm {
  const invoiceDate = todayIso();
  return {
    sourceType: "manual", sourceId: "", sourceNo: "", period: invoiceDate.slice(0, 7).replace("-", ""),
    invoiceNo: "", customerId: "", undertakingUnitId: "", template: "normal", invoiceDate, dueDate: addDays(invoiceDate, 30),
    paymentTermDays: "30", currency: "USD", amountExcludingTax: "", taxRate: "", taxAmount: "",
    amountIncludingTax: "", sgdRate: "", sgdTotal: "", gstRegNo: "",
    comment: "", lines: [{ periodLabel: "", description: "", amount: "" }],
  };
}

/** 复用的伙伴选择：客户 / 承接单位都用同一套搜索下拉。 */
function usePartnerOptions(entity: string) {
  const [options, setOptions] = useState<SearchSelectOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/entities/${entity}?page=1&pageSize=200`, { cache: "no-store" });
        const data = await response.json();
        if (cancelled) return;
        const rows = (data.rows ?? data.items ?? []) as InvoiceRow[];
        setOptions(rows.map((row) => ({
          value: text(row.customerId ?? row.undertakingUnitId ?? row.id),
          label: text(row.shortName ?? row.nameCn ?? row.nameEn ?? row.name),
          code: text(row.customerCode ?? row.undertakingUnitCode),
          hint: text(row.nameEn ?? row.entityName ?? ""),
        })));
      } catch {
        if (!cancelled) setOptions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [entity]);
  return options;
}

export function InvoicesPage() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [period, setPeriod] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<InvoiceRow | null>(null);
  const [draft, setDraft] = useState<DraftForm | null>(null);
  const [upload, setUpload] = useState<DraftForm | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const customerOptions = usePartnerOptions("customers");
  const unitOptions = usePartnerOptions("undertaking-units");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (period.trim()) params.set("period", period.trim());
      if (source) params.set("source", source);
      if (status) params.set("status", status);
      const response = await fetch(`/api/invoices?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "发票列表加载失败");
      setRows(data.rows ?? []);
      setTotal(Number(data.total ?? 0));
      setPageCount(Number(data.pageCount ?? 1));
    } catch (error) {
      notify(error instanceof Error ? error.message : "发票列表加载失败", "error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [keyword, page, pageSize, period, source, status]);

  useEffect(() => { void load(); }, [load]);

  /** 消费预填接口：账单入口或手工开票都用同一套表单。 */
  const openDraft = useCallback(async (sourceType: DraftForm["sourceType"], sourceId = "") => {
    const base = emptyDraft();
    base.sourceType = sourceType;
    base.sourceId = sourceId;
    if (sourceType === "manual") { setDraft(base); return; }
    try {
      const response = await fetch(`/api/invoices/prefill?sourceType=${sourceType}&sourceId=${encodeURIComponent(sourceId)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "预填失败");
      setDraft({
        ...base,
        sourceId,
        sourceNo: text(data.sourceNo),
        period: text(data.period) || base.period,
        invoiceNo: text(data.suggestedInvoiceNo),
        customerId: text(data.customerId),
        undertakingUnitId: text(data.undertakingUnitId),
        invoiceDate: text(data.invoiceDate) || base.invoiceDate,
        dueDate: text(data.dueDate) || base.dueDate,
        paymentTermDays: text(data.paymentTermDays) || "30",
        currency: text(data.currency) || "USD",
        amountExcludingTax: text(data.amountExcludingTax),
        taxRate: text(data.taxRate),
        taxAmount: text(data.taxAmount),
        amountIncludingTax: text(data.amountIncludingTax),
        lines: (data.lines ?? []).map((line: Record<string, unknown>) => ({
          periodLabel: text(line.date), description: text(line.desc), amount: text(line.cost),
        })),
      });
      if ((data.missing ?? []).length) {
        notify(`开票资料待补齐：${(data.missing as string[]).join("、")}`, "info");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "预填失败", "error");
    }
  }, []);

  const submitDraft = useCallback(async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "开票失败");
      notify(`已开票：${text(data.invoice?.invoiceNo)}`, "success");
      setDraft(null);
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "开票失败", "error");
    } finally {
      setBusy(false);
    }
  }, [draft, load]);

  const submitUpload = useCallback(async () => {
    if (!upload || !uploadFile) { notify("请先选择发票文件", "error"); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", uploadFile);
      form.set("payload", JSON.stringify(upload));
      const response = await fetch("/api/invoices", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "登记失败");
      notify(`已登记外部发票：${text(data.invoice?.invoiceNo)}`, "success");
      setUpload(null);
      setUploadFile(null);
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "登记失败", "error");
    } finally {
      setBusy(false);
    }
  }, [load, upload, uploadFile]);

  const openDetail = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "详情加载失败");
      setDetail(data.invoice);
    } catch (error) {
      notify(error instanceof Error ? error.message : "详情加载失败", "error");
    }
  }, []);

  const voidOne = useCallback(async (row: InvoiceRow) => {
    if (!(await confirmDialog(`作废发票 ${text(row.invoiceNo)}？票面会保留，来源账单回到未开票。`))) return;
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(text(row.id))}/void`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "页面作废" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "作废失败");
      notify("已作废", "success");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "作废失败", "error");
    }
  }, [load]);

  const regenerate = useCallback(async (row: InvoiceRow) => {
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(text(row.id))}/regenerate`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "重新生成失败");
      notify("票面已重新生成", "success");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "重新生成失败", "error");
    }
  }, [load]);

  const remove = useCallback(async (row: InvoiceRow) => {
    if (!(await confirmDialog(`删除开票记录 ${text(row.invoiceNo)}？`))) return;
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(text(row.id))}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "删除失败");
      notify("已删除", "success");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "删除失败", "error");
    }
  }, [load]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Panel>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <Input className="w-[220px]" onChange={(event) => { setPage(1); setKeyword(event.target.value); }} placeholder="发票号 / 客户 / 来源单据" value={keyword} />
          <Input className="w-[120px]" onChange={(event) => { setPage(1); setPeriod(event.target.value); }} placeholder="账期 YYYYMM" value={period} />
          <Select className="w-[130px]" onChange={(event) => { setPage(1); setSource(event.target.value); }} value={source}>
            <option value="">全部来源</option>
            <option value="generated">系统生成</option>
            <option value="external">外部上传</option>
          </Select>
          <Select className="w-[130px]" onChange={(event) => { setPage(1); setStatus(event.target.value); }} value={status}>
            <option value="">全部状态</option>
            <option value="issued">已开票</option>
            <option value="draft">草稿</option>
            <option value="void">已作废</option>
          </Select>
          <Button onClick={() => void load()}><Search size={15} />查询</Button>
          <Button onClick={() => { setKeyword(""); setPeriod(""); setSource(""); setStatus(""); setPage(1); }}><RefreshCw size={15} />重置</Button>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={() => {
              const params = new URLSearchParams();
              if (keyword.trim()) params.set("keyword", keyword.trim());
              if (period.trim()) params.set("period", period.trim());
              if (source) params.set("source", source);
              if (status) params.set("status", status);
              window.location.href = `/api/invoices/export?${params.toString()}`;
            }}>导出</Button>
            <Button onClick={() => void openDraft("manual")} tone="primary"><Plus size={15} />开票</Button>
            <Button onClick={() => { const form = emptyDraft(); form.sourceType = "manual"; setUpload(form); setUploadFile(null); }}>
              <FileUp size={15} />上传外部发票
            </Button>
          </div>
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? <LoadingBlock /> : (
            <table className="w-full min-w-[1500px] border-collapse text-sm">
              <thead className="bg-canvas">
                <tr>
                  {["发票号", "来源", "客户", "开票主体", "币种", "未税", "税金", "含税", "开票日", "到期日", "关联账单", "状态", "文件", "操作"].map((label) => (
                    <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-left font-medium" key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="hover:bg-surface-2" key={text(row.id)}>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 font-medium">{text(row.invoiceNo)}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs ${text(row.source) === "external" ? "bg-warning-soft text-warning" : "bg-info-soft text-primary"}`}>
                        {SOURCE_LABELS[text(row.source)] ?? text(row.source)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{text(row.customerDisplayName ?? row.customerName) || "-"}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{text(row.sellerDisplayName ?? row.sellerName) || "-"}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{text(row.currency) || "-"}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right">{money(row.amountExcludingTax, "")}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right">{money(row.taxAmount, "")}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-right font-medium">{money(row.amountIncludingTax, "")}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{formatDisplayValue(row.invoiceDate as never, "date")}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{formatDisplayValue(row.dueDate as never, "date")}</td>
                    <td className="max-w-[220px] truncate border-b border-r border-line-soft px-3 py-2 text-xs text-ink-3" title={text(row.sourceNo)}>{text(row.sourceNo) || "-"}</td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_TONES[text(row.status)] ?? "bg-canvas text-ink-2"}`}>
                        {STATUS_LABELS[text(row.status)] ?? text(row.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-xs text-ink-3" title={text(row.fileName)}>
                      {text(row.fileProvider) === "obs" ? "云盘" : "数据库"}
                    </td>
                    <td className="whitespace-nowrap border-b border-line-soft px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button className="rounded px-1.5 py-0.5 text-xs text-primary hover:bg-canvas" onClick={() => void openDetail(text(row.id))} type="button">查看</button>
                        <a className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-primary hover:bg-canvas" href={`/api/invoices/${encodeURIComponent(text(row.id))}/file`}>
                          <Download size={12} />下载
                        </a>
                        {text(row.source) === "generated" && text(row.status) !== "void" ? (
                          <button className="rounded px-1.5 py-0.5 text-xs text-ink-2 hover:bg-canvas" onClick={() => void regenerate(row)} type="button">重生成</button>
                        ) : null}
                        {text(row.status) === "issued" ? (
                          <button className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-danger hover:bg-canvas" onClick={() => void voidOne(row)} type="button">
                            <XCircle size={12} />作废
                          </button>
                        ) : (
                          <button className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-danger hover:bg-canvas" onClick={() => void remove(row)} type="button">
                            <Trash2 size={12} />删除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!rows.length ? <tr><td colSpan={14}><EmptyState hint="点右上角「开票」在系统里出票，或「上传外部发票」登记外部已开的票。" title="还没有开票记录" /></td></tr> : null}
              </tbody>
            </table>
          )}
        </div>
        <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPage(1); setPageSize(size); }} />
      </Panel>

      {detail ? (
        <Modal
          description={`${SOURCE_LABELS[text(detail.source)] ?? ""} · ${STATUS_LABELS[text(detail.status)] ?? ""}`}
          footer={<><Button onClick={() => setDetail(null)}>关闭</Button>
            <a className="inline-flex h-9 items-center rounded border border-line px-3 text-sm text-ink-2 hover:border-primary hover:text-primary" href={`/api/invoices/${encodeURIComponent(text(detail.id))}/file`}>下载文件</a></>}
          onClose={() => setDetail(null)}
          title={`发票 ${text(detail.invoiceNo)}`}
          widthClass="max-w-4xl"
        >
          <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {[
              ["客户抬头", text(detail.customerName)], ["开票主体", text(detail.sellerName)],
              ["客户地址", text(detail.customerAddress)], ["主体地址", text(detail.sellerAddress)],
              ["币种", text(detail.currency)], ["含税金额", money(detail.amountIncludingTax, detail.currency)],
              ["未税金额", money(detail.amountExcludingTax, "")], ["税金", money(detail.taxAmount, "")],
              ["开票日期", formatDisplayValue(detail.invoiceDate as never, "date")], ["到期日", formatDisplayValue(detail.dueDate as never, "date")],
              ["收款账号", text(detail.bankAccount)], ["开户行", text(detail.bankName)],
              ["来源单据", text(detail.sourceNo)], ["文件名", text(detail.fileName)],
              ["创建人", text(detail.createdByName)], ["创建时间", formatDisplayValue(detail.createdAt as never, "datetime")],
              ["作废时间", detail.voidedAt ? formatDisplayValue(detail.voidedAt as never, "datetime") : "-"],
              ["作废原因", text(detail.voidReason) || "-"],
            ].map(([label, value]) => (
              <div className="flex gap-2 border-b border-line-soft py-1" key={label}>
                <span className="w-24 shrink-0 text-ink-3">{label}</span>
                <span className="min-w-0 break-words">{value || "-"}</span>
              </div>
            ))}
          </div>
          {text(detail.comment) ? (
            <div className="mt-3 rounded border border-line-soft bg-canvas p-3 text-sm">
              <div className="mb-1 text-ink-3">备注</div>
              <div className="whitespace-pre-wrap">{text(detail.comment)}</div>
            </div>
          ) : null}
          <h3 className="mt-4 mb-2 text-sm font-medium">明细行</h3>
          <table className="w-full border-collapse text-sm">
            <thead className="bg-canvas">
              <tr>{["期间", "描述", "金额", "SGD 汇率"].map((label) => (
                <th className="border-b border-r border-line-soft px-3 py-2 text-left font-medium" key={label}>{label}</th>
              ))}</tr>
            </thead>
            <tbody>
              {((detail.items ?? []) as InvoiceRow[]).map((item) => (
                <tr key={text(item.id)}>
                  <td className="border-b border-r border-line-soft px-3 py-2">{text(item.periodLabel)}</td>
                  <td className="border-b border-r border-line-soft px-3 py-2">{text(item.description)}</td>
                  <td className="border-b border-r border-line-soft px-3 py-2 text-right">{formatMoneyValue(item.amount)}</td>
                  <td className="border-b border-line-soft px-3 py-2 text-right">{text(item.sgdRate) || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      ) : null}

      {draft ? (
        <Modal
          description="票面按开票主体与客户档案生成；缺资料会拦下并提示去补档案"
          footer={<><Button onClick={() => setDraft(null)}>取消</Button>
            <Button disabled={busy} onClick={() => void submitDraft()} tone="primary">{busy ? "生成中…" : "生成并标记已开票"}</Button></>}
          onClose={() => setDraft(null)}
          title="开票"
          widthClass="max-w-5xl"
        >
          <DraftFormFields
            draft={draft}
            customerOptions={customerOptions}
            unitOptions={unitOptions}
            onChange={setDraft}
          />
        </Modal>
      ) : null}

      {upload ? (
        <Modal
          description="外部已经开好票时用这里：只登记 + 存文件，不生成票面"
          footer={<><Button onClick={() => { setUpload(null); setUploadFile(null); }}>取消</Button>
            <Button disabled={busy} onClick={() => void submitUpload()} tone="primary">{busy ? "保存中…" : "保存并标记已开票"}</Button></>}
          onClose={() => { setUpload(null); setUploadFile(null); }}
          title="上传外部发票"
          widthClass="max-w-5xl"
        >
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-sm text-ink-2">发票文件（PDF / 图片，最大 25 MB）</div>
              <input
                className="w-full rounded border border-line px-3 py-2 text-sm"
                onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                type="file"
              />
              {uploadFile ? <div className="mt-1 text-xs text-ink-3">已选：{uploadFile.name}（{Math.round(uploadFile.size / 1024)} KB）</div> : null}
            </div>
            <DraftFormFields
              draft={upload}
              customerOptions={customerOptions}
              unitOptions={unitOptions}
              onChange={setUpload}
              simple
            />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function DraftFormFields({
  draft,
  customerOptions,
  unitOptions,
  onChange,
  simple = false,
}: {
  draft: DraftForm;
  customerOptions: SearchSelectOption[];
  unitOptions: SearchSelectOption[];
  onChange: (next: DraftForm) => void;
  simple?: boolean;
}) {
  const patch = (values: Partial<DraftForm>) => onChange({ ...draft, ...values });
  const labelClass = "flex min-w-0 flex-col gap-1 text-sm";
  const sectionClass = "space-y-3 border-t border-line-soft pt-4 first:border-t-0 first:pt-0";
  const headingClass = "text-sm font-medium text-ink";
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
        <h3 className={headingClass}>开票双方</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            <span className="text-ink-2">客户抬头</span>
            <SearchSelect
              className="w-full"
              onChange={(value) => patch({ customerId: value })}
              options={customerOptions}
              placeholder="按简称 / 编码搜索客户"
              value={draft.customerId}
            />
            <span className={hintClass}>抬头、发票地址、联系人都取客户档案</span>
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">开票主体（承接单位）</span>
            <SearchSelect
              className="w-full"
              onChange={(value) => patch({ undertakingUnitId: value })}
              options={unitOptions}
              placeholder="按简称 / 编码搜索承接单位"
              value={draft.undertakingUnitId}
            />
            <span className={hintClass}>地址、电话、财务邮箱、签章与收款银行取承接单位档案</span>
          </label>
        </div>
      </section>

      <section className={sectionClass}>
        <h3 className={headingClass}>票号与日期</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={labelClass}>
            <span className="text-ink-2">发票号</span>
            <Input className="w-full" onChange={(event) => patch({ invoiceNo: event.target.value })} placeholder="留空自动分配" value={draft.invoiceNo} />
            <span className={hintClass}>{simple ? "填外部系统出具的发票号" : "规则 INV-账期-流水，可手工改"}</span>
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">开票日期</span>
            <Input
              className="w-full"
              onChange={(event) => {
                const invoiceDate = event.target.value;
                const days = Number(draft.paymentTermDays) || 30;
                patch({ invoiceDate, dueDate: addDays(invoiceDate, days), period: invoiceDate.slice(0, 7).replace("-", "") });
              }}
              type="date"
              value={draft.invoiceDate}
            />
            <span className={hintClass}>账期按开票日所在月归集</span>
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">账期天数 / 到期日</span>
            <div className="flex min-w-0 items-center gap-2">
              <Input
                className="w-[92px] shrink-0"
                onChange={(event) => {
                  const days = event.target.value;
                  patch({ paymentTermDays: days, dueDate: addDays(draft.invoiceDate, Number(days) || 30) });
                }}
                value={draft.paymentTermDays}
              />
              <Input className="w-full" readOnly value={draft.dueDate} />
            </div>
            <span className={hintClass}>到期日 = 开票日 + 账期天数</span>
          </label>
        </div>
      </section>

      <section className={sectionClass}>
        <h3 className={headingClass}>金额</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelClass}>
            <span className="text-ink-2">币种</span>
            <Input className="w-full" onChange={(event) => patch({ currency: event.target.value })} value={draft.currency} />
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">未税金额</span>
            <Input className="w-full" onChange={(event) => patch({ amountExcludingTax: event.target.value })} value={draft.amountExcludingTax} />
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">税率（%）</span>
            <Input className="w-full" onChange={(event) => patch({ taxRate: event.target.value })} value={draft.taxRate} />
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">税金</span>
            <Input className="w-full" onChange={(event) => patch({ taxAmount: event.target.value })} value={draft.taxAmount} />
          </label>
          <label className={labelClass}>
            <span className="text-ink-2">含税金额</span>
            <Input
              className="w-full"
              onChange={(event) => onChange({ ...draft, ...syncSgdTotal({ amountIncludingTax: event.target.value }) })}
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

      {simple ? null : (
        <>
          <section className={sectionClass}>
            <div className="flex items-center justify-between">
              <h3 className={headingClass}>明细行</h3>
              <Button onClick={() => patch({ lines: [...draft.lines, { periodLabel: "", description: "", amount: "" }] })} size="sm" type="button">
                添加行
              </Button>
            </div>
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
            <h3 className={headingClass}>备注</h3>
            <Textarea className="w-full" onChange={(event) => patch({ comment: event.target.value })} rows={3} value={draft.comment} />
            <p className={hintClass}>备注会按票面宽度自动折行，并据此调整票面行高。</p>
          </section>
        </>
      )}
    </div>
  );
}
