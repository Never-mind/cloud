"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileUp, Plus, RefreshCw, Search, Trash2, XCircle } from "lucide-react";
import { Button, Input, Panel, Select } from "./ui";
import { Modal } from "./modal";
import { PaginationBar } from "./pagination-bar";
import { EmptyState, LoadingBlock } from "./table-state";
import { confirmDialog, notify } from "./app-dialog";
import { InvoiceDraftModal, type InvoiceDraftMode } from "./invoice-draft-modal";
import { formatDisplayValue, formatMoneyValue } from "@/lib/display-format";

type InvoiceRow = Record<string, unknown>;

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

function money(value: unknown, currency: unknown) {
  const formatted = formatMoneyValue(value);
  if (formatted === "-") return "-";
  const unit = text(currency);
  return unit ? `${unit} ${formatted}` : formatted;
}

/** 发票台账：系统生成与外部上传两种来源合并成一张表，右上角按钮开票 / 登记外部票。 */
export function InvoicesPage() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [period, setPeriod] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<InvoiceRow | null>(null);
  const [modal, setModal] = useState<InvoiceDraftMode | null>(null);

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
    } catch (error) {
      notify(error instanceof Error ? error.message : "发票列表加载失败", "error");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [keyword, page, pageSize, period, source, status]);

  useEffect(() => { void load(); }, [load]);

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
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "页面作废" }),
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

  const exportParams = new URLSearchParams();
  if (keyword.trim()) exportParams.set("keyword", keyword.trim());
  if (period.trim()) exportParams.set("period", period.trim());
  if (source) exportParams.set("source", source);
  if (status) exportParams.set("status", status);

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
            <a className="inline-flex h-9 items-center gap-1 rounded border border-line bg-white px-3 text-sm text-ink-2 hover:border-primary hover:text-primary" href={`/api/invoices/export?${exportParams.toString()}`}>导出</a>
            <Button onClick={() => setModal("generated")} tone="primary"><Plus size={15} />开票</Button>
            <Button onClick={() => setModal("external")}><FileUp size={15} />上传外部发票</Button>
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

      <InvoiceDraftModal
        mode={modal ?? "generated"}
        onClose={() => setModal(null)}
        onSaved={() => { void load(); }}
        open={Boolean(modal)}
        sourceType="manual"
      />

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
    </div>
  );
}
