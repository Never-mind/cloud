"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { Download, FileUp, History, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { exportRowsToXlsx } from "@/lib/client-xlsx-export";
import {
  blankInternalServiceSpare,
  importInternalServiceSpareRows,
  INTERNAL_SERVICE_SPARE_FIELDS,
  normalizeInternalServiceSpare,
  normalizeSpareMonth,
  type InternalServiceSpareImportFailure,
  type InternalServiceSpareInput,
} from "@/lib/internal-service-fee-spare";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { confirmDialog, notify } from "./app-dialog";
import { Modal } from "./modal";
import { NumberInput } from "./number-input";
import { PaginationBar } from "./pagination-bar";
import { StickyTable } from "./sticky-table";
import { TableStateContent } from "./table-state";
import { Button, IconButton, Input, Panel, Select, Textarea } from "./ui";

type Country = { code: string; nameZh?: string };
type SpareRow = Record<string, string | number | boolean | null>;
type AuditRow = Record<string, unknown>;
type ListResponse = { rows: SpareRow[]; total: number; page: number; pageSize: number; totalPages: number };

export function InternalServiceFeeSparesPage({ countries }: { countries: Country[] }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<SpareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InternalServiceSpareInput>(blankInternalServiceSpare());
  const [readOnly, setReadOnly] = useState(false);
  const [archivedMonths, setArchivedMonths] = useState(0);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [voidingRow, setVoidingRow] = useState<SpareRow | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importLines, setImportLines] = useState<InternalServiceSpareInput[]>([]);
  const [importFailures, setImportFailures] = useState<InternalServiceSpareImportFailure[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importTotal, setImportTotal] = useState(0);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    void loadRows();
  }, []);

  async function loadRows(nextPage = page, nextPageSize = pageSize) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(nextPageSize),
      });
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (countryCode) params.set("countryCode", countryCode);
      if (status) params.set("status", status);
      const response = await fetch(`/api/internal-service-fees/spares?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "备件管理费加载失败");
      const result = data as ListResponse;
      setRows(result.rows ?? []);
      setTotal(Number(result.total ?? 0));
      setPage(Number(result.page ?? nextPage));
    } catch (error) {
      setRows([]);
      setTotal(0);
      notify(error instanceof Error ? error.message : "备件管理费加载失败", "info");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setFormOpen(true);
    setEditingId(null);
    setForm(blankInternalServiceSpare());
    setReadOnly(false);
    setArchivedMonths(0);
    setAudits([]);
  }

  async function openEdit(row: SpareRow) {
    try {
      const response = await fetch(`/api/internal-service-fees/spares?ledgerId=${encodeURIComponent(String(row.ledgerId))}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "备件详情加载失败");
      setFormOpen(true);
      setEditingId(String(data.ledgerId));
      setForm({
        countryCode: String(data.countryCode ?? ""),
        batchName: String(data.batchName ?? ""),
        spareName: String(data.spareName ?? ""),
        spareCode: String(data.spareCode ?? ""),
        quantity: String(data.quantity ?? 1),
        startMonth: String(data.startMonth ?? "").slice(0, 7),
        procurementCostUsd: String(data.procurementCostUsd ?? ""),
        contractExcludingTaxUsd: data.contractExcludingTaxUsd == null ? "" : String(data.contractExcludingTaxUsd),
        managementFeeTotalUsd: String(data.managementFeeTotalUsd ?? ""),
        first24MonthlyUsd: String(data.first24MonthlyUsd ?? ""),
        next36MonthlyUsd: String(data.next36MonthlyUsd ?? ""),
        notes: String(data.notes ?? ""),
      });
      setReadOnly(String(data.status) === "已停用");
      setArchivedMonths(Number(data.archivedMonths ?? 0));
      setAudits(Array.isArray(data.audits) ? data.audits : []);
    } catch (error) {
      notify(error instanceof Error ? error.message : "备件详情加载失败", "info");
    }
  }

  function updateForm(key: keyof InternalServiceSpareInput, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    const normalized = normalizeInternalServiceSpare(form);
    if (!normalized.value) return notify(normalized.errors[0], "info");
    setSaving(true);
    try {
      const response = await fetch(
        editingId ? `/api/internal-service-fees/spares/${encodeURIComponent(editingId)}` : "/api/internal-service-fees/spares",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "备件管理费保存失败");
      setFormOpen(false);
      setEditingId(null);
      await loadRows(1, pageSize);
      notify(editingId ? "备件管理费已更新并重算开放月份" : "备件管理费已创建，已生成60个月计划", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "备件管理费保存失败", "info");
    } finally {
      setSaving(false);
    }
  }

  async function voidSpare() {
    if (!voidingRow) return;
    if (!voidReason.trim()) return notify("请填写作废原因", "error");
    if (!await confirmDialog(`确认停用 ${String(voidingRow.batchName)} / ${String(voidingRow.spareName)}？已对账月份会保留，未对账月份将被删除。`)) return;
    try {
      const response = await fetch(`/api/internal-service-fees/spares/${encodeURIComponent(String(voidingRow.ledgerId))}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: voidReason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "停用失败");
      setVoidingRow(null);
      setVoidReason("");
      await loadRows(page, pageSize);
      notify(`已停用，保留 ${data.archivedMonths ?? 0} 个已对账月份`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "停用失败", "info");
    }
  }

  function downloadTemplate() {
    exportRowsToXlsx({
      fileName: "备件管理费导入模板.xlsx",
      sheetName: "备件管理费",
      columns: INTERNAL_SERVICE_SPARE_FIELDS.map((field) => ({ key: field.key, label: field.label })),
      rows: [blankInternalServiceSpare()],
    });
  }

  function exportRows() {
    exportRowsToXlsx({
      fileName: "备件管理费台账.xlsx",
      sheetName: "备件管理费",
      columns: [
        { key: "countryCode", label: "国家" },
        { key: "batchName", label: "批次" },
        { key: "spareName", label: "备件名称" },
        { key: "spareCode", label: "备件编码" },
        { key: "quantity", label: "数量" },
        { key: "startMonth", label: "开始月份" },
        { key: "procurementCostUsd", label: "采购成本 USD" },
        { key: "contractExcludingTaxUsd", label: "合同不含税金额 USD" },
        { key: "managementFeeTotalUsd", label: "管理费总额 USD" },
        { key: "first24MonthlyUsd", label: "前24个月月管理费 USD" },
        { key: "next36MonthlyUsd", label: "后36个月月管理费 USD" },
        { key: "archivedMonths", label: "已对账月数" },
        { key: "totalMonths", label: "月计划数" },
        { key: "status", label: "状态" },
        { key: "notes", label: "备注" },
      ],
      rows,
    });
  }

  async function importFile(file: File) {
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!worksheet) throw new Error("未找到可读取的工作表");
      const sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: false });
      const parsed = importInternalServiceSpareRows(sourceRows);
      setImportFileName(file.name);
      setImportTotal(sourceRows.length);
      setImportLines(parsed.lines);
      setImportFailures(parsed.failures);
      if (!parsed.lines.length) notify("文件中没有可导入的有效行", "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : "文件读取失败", "info");
    }
  }

  async function confirmImport() {
    if (!importLines.length) return notify("没有可导入的有效行", "error");
    setImporting(true);
    try {
      const response = await fetch("/api/internal-service-fees/spares/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: importLines, fileName: importFileName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "导入失败");
      setImportOpen(false);
      setImportLines([]);
      setImportFailures([]);
      await loadRows(1, pageSize);
      notify(`已导入 ${data.count} 条备件管理费`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "导入失败", "info");
    } finally {
      setImporting(false);
    }
  }

  const calculatedTotal = (number(form.first24MonthlyUsd) * 24) + (number(form.next36MonthlyUsd) * 36);
  const amountMatches = Math.abs(calculatedTotal - number(form.managementFeeTotalUsd)) <= 0.01;

  return <div className="space-y-5">
    <div>
      <h1 className="text-xl font-medium text-ink">备件管理费</h1>
      <p className="mt-1 text-sm text-ink-3">备件独立生成 60 个月计划，不进入整机实例或 JC。已有对账月份冻结，修改只重算开放月份。</p>
    </div>
    <Panel>
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-4">
        <Input placeholder="搜索批次、备件名称、编码或备注" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
        <Select className="w-32" value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
          <option value="">全部国家</option>
          {countries.map((country) => <option key={country.code} value={country.code}>{country.code} {country.nameZh ? `- ${country.nameZh}` : ""}</option>)}
        </Select>
        <Select className="w-32" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">全部状态</option>
          <option value="启用">启用</option>
          <option value="已停用">已停用</option>
        </Select>
        <Button tone="secondary" onClick={() => void loadRows(1, pageSize)}><Search size={15} />查询</Button>
        <Button onClick={() => void loadRows()}><RefreshCw size={15} />刷新</Button>
        <Button onClick={downloadTemplate}><Download size={15} />下载模板</Button>
        <Button onClick={() => { setImportOpen(true); setImportLines([]); setImportFailures([]); setImportFileName(""); setImportTotal(0); }}>
          <FileUp size={15} />导入Excel
        </Button>
        <Button tone="primary" onClick={openCreate}><Plus size={15} />新增备件</Button>
        <Button className="ml-auto" onClick={exportRows}><Download size={15} />导出当前页</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-line-soft bg-surface-2 px-4 py-3 text-sm text-ink-2">
        <span>当前筛选 {total} 条备件台账</span>
        <Link className="text-primary hover:underline" href="/finance/internal-service-fees">返回管理费分摊</Link>
      </div>
      <StickyTable className="table-scroll table-viewport overflow-auto" tableKey="internal-service-fee-spares">
        <table className="w-full min-w-[1780px] border-collapse text-sm">
          <thead className="bg-canvas text-ink">
            <tr>
              {["国家", "批次", "备件名称", "备件编码", "数量", "开始月份", "采购成本 USD", "合同不含税 USD", "管理费总额 USD", "前24月/月 USD", "后36月/月 USD", "对账进度", "状态", "更新时间", "操作"].map((label) => (
                <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3 text-left font-medium" key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const stopped = String(row.status) === "已停用";
              return <tr className="hover:bg-surface-2" key={String(row.ledgerId)}>
                <Cell>{String(row.countryCode ?? "")}</Cell>
                <Cell>{String(row.batchName ?? "")}</Cell>
                <Cell>{String(row.spareName ?? "")}</Cell>
                <Cell>{String(row.spareCode ?? "")}</Cell>
                <Cell className="text-right">{number(row.quantity).toLocaleString("en-US")}</Cell>
                <Cell>{String(row.startMonth ?? "").slice(0, 7)}</Cell>
                <MoneyCell value={row.procurementCostUsd} />
                <MoneyCell value={row.contractExcludingTaxUsd} />
                <MoneyCell value={row.managementFeeTotalUsd} />
                <MoneyCell value={row.first24MonthlyUsd} />
                <MoneyCell value={row.next36MonthlyUsd} />
                <Cell>{number(row.archivedMonths)} / {number(row.totalMonths)} 已对账</Cell>
                <Cell><span className={stopped ? "text-ink-3" : "text-success-strong"}>{String(row.status ?? "")}</span></Cell>
                <Cell>{String(row.updatedAt ?? "")}</Cell>
                <td className="whitespace-nowrap border-b border-line-soft px-3 py-2">
                  <div className="flex items-center gap-2">
                    <IconButton icon={stopped ? <History size={15} /> : <Pencil size={15} />} label={stopped ? "查看变更记录" : "编辑"} onClick={() => void openEdit(row)} />
                    {!stopped ? <IconButton icon={<Trash2 size={15} />} label="停用" tone="danger" onClick={() => { setVoidingRow(row); setVoidReason(""); }} /> : null}
                  </div>
                </td>
              </tr>;
            })}
            {!rows.length ? <tr><td colSpan={15} className="py-12 text-center"><TableStateContent empty="暂无备件管理费，请新增或导入" loading={loading} /></td></tr> : null}
          </tbody>
        </table>
      </StickyTable>
      <PaginationBar
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(next) => { setPage(next); void loadRows(next, pageSize); }}
        onPageSizeChange={(next) => { setPageSize(next); setPage(1); void loadRows(1, next); }}
      />
    </Panel>

    {formOpen && <Modal
      title={editingId ? `备件管理费 · ${readOnly ? "查看" : "编辑"}` : "新增备件管理费"}
      description="管理费总额必须等于前24个月月金额×24 + 后36个月月金额×36；分币尾差计入最后一个开放月份。"
      widthClass="max-w-5xl"
      onClose={() => { if (!saving) { setFormOpen(false); setEditingId(null); setForm(blankInternalServiceSpare()); } }}
      footer={<>
        <Button disabled={saving} onClick={() => { setFormOpen(false); setEditingId(null); setForm(blankInternalServiceSpare()); }}>关闭</Button>
        {!readOnly ? <Button tone="primary" disabled={saving || !amountMatches} onClick={() => void save()}>{saving ? "保存中…" : editingId ? "保存并重算" : "创建并生成60个月"}</Button> : null}
      </>}
    >
      <fieldset disabled={readOnly || saving} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="国家 *"><Select value={form.countryCode} onChange={(event) => updateForm("countryCode", event.target.value)}><option value="">选择国家</option>{countries.map((country) => <option key={country.code} value={country.code}>{country.code} {country.nameZh ? `- ${country.nameZh}` : ""}</option>)}</Select></Field>
        <Field label="批次 *"><Input value={form.batchName} onChange={(event) => updateForm("batchName", event.target.value)} /></Field>
        <Field label="备件名称 *"><Input value={form.spareName} onChange={(event) => updateForm("spareName", event.target.value)} /></Field>
        <Field label="备件编码（可选）"><Input value={form.spareCode} onChange={(event) => updateForm("spareCode", event.target.value)} placeholder="不填写时自动生成" /></Field>
        <Field label="数量 *"><NumberInput min="1" step="1" value={form.quantity} onChange={(value) => updateForm("quantity", value)} /></Field>
        <Field label="开始月份 *"><Input disabled={archivedMonths > 0} type="month" value={normalizeSpareMonth(form.startMonth).slice(0, 7)} onChange={(event) => updateForm("startMonth", event.target.value)} /></Field>
        <Field label="采购成本 USD *"><NumberInput min="0" step="0.01" value={form.procurementCostUsd} onChange={(value) => updateForm("procurementCostUsd", value)} /></Field>
        <Field label="合同不含税金额 USD"><NumberInput step="0.01" value={form.contractExcludingTaxUsd} onChange={(value) => updateForm("contractExcludingTaxUsd", value)} /></Field>
        <Field label="管理费总额 USD *"><NumberInput step="0.01" value={form.managementFeeTotalUsd} onChange={(value) => updateForm("managementFeeTotalUsd", value)} /></Field>
        <Field label="前24个月月管理费 USD *"><NumberInput step="0.01" value={form.first24MonthlyUsd} onChange={(value) => updateForm("first24MonthlyUsd", value)} /></Field>
        <Field label="后36个月月管理费 USD *"><NumberInput step="0.01" value={form.next36MonthlyUsd} onChange={(value) => updateForm("next36MonthlyUsd", value)} /></Field>
        <Field label="分期核对">
          <div className={`flex h-9 items-center rounded border px-3 text-sm ${amountMatches ? "border-success-border bg-success-soft text-success-strong" : "border-danger-border bg-danger-soft text-danger"}`}>
            {calculatedTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </Field>
        <Field className="md:col-span-2 xl:col-span-3" label="备注"><Textarea className="min-h-16" value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} /></Field>
      </fieldset>
      {archivedMonths > 0 ? <p className="mt-3 rounded border border-warning-border bg-warning-soft px-3 py-2 text-xs text-warning-ink">已有 {archivedMonths} 个对账月份。修改会保留这些月份，只重算未对账月份；开始月份不可修改。</p> : null}
      {audits.length ? <div className="mt-5 border-t border-line-soft pt-4"><h3 className="mb-2 font-medium text-ink">变更记录</h3><div className="max-h-52 overflow-auto border border-line-soft"><table className="w-full border-collapse text-xs"><thead className="bg-canvas"><tr><th className="border-b px-2 py-2 text-left">时间</th><th className="border-b px-2 py-2 text-left">动作</th><th className="border-b px-2 py-2 text-left">操作人</th><th className="border-b px-2 py-2 text-left">原因/备注</th></tr></thead><tbody>{audits.map((audit, index) => <tr key={String(audit.id ?? index)}><td className="border-b px-2 py-2">{String(audit.createdAt ?? "")}</td><td className="border-b px-2 py-2">{auditActionLabel(String(audit.action ?? ""))}</td><td className="border-b px-2 py-2">{String(audit.actor ?? "")}</td><td className="border-b px-2 py-2">{String(audit.reason ?? "")}</td></tr>)}</tbody></table></div></div> : null}
    </Modal>}

    {importOpen ? <Modal
      title="导入备件管理费"
      description="先下载模板。文件会先在页面校验，确认后才写入数据库。"
      widthClass="max-w-4xl"
      onClose={() => { if (!importing) setImportOpen(false); }}
      footer={<><Button disabled={importing} onClick={() => setImportOpen(false)}>关闭</Button><Button tone="primary" disabled={importing || !importLines.length} onClick={() => void confirmImport()}>{importing ? "导入中…" : `确认导入 ${importLines.length} 条`}</Button></>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={downloadTemplate}><Download size={15} />下载模板</Button>
          <Button tone="primary" onClick={() => fileInputRef.current?.click()}><FileUp size={15} />选择Excel</Button>
          <input ref={fileInputRef} className="hidden" type="file" accept=".xlsx,.xls,.csv" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importFile(file); }} />
        </div>
        {importFileName ? <div className="rounded border border-line-soft bg-surface-2 px-3 py-2 text-sm text-ink-2">文件：{importFileName}。读取 {importTotal} 行，有效 {importLines.length} 行，错误 {importFailures.length} 行。</div> : null}
        {importFailures.length ? <div className="max-h-44 overflow-auto border border-danger-border"><div className="bg-danger-soft px-3 py-2 text-sm text-danger">以下行不会导入</div><table className="w-full border-collapse text-xs"><tbody>{importFailures.map((failure) => <tr key={`${failure.rowNumber}-${failure.error}`}><td className="w-20 border-b px-3 py-2">第 {failure.rowNumber} 行</td><td className="border-b px-3 py-2">{failure.error}</td></tr>)}</tbody></table></div> : null}
        {importLines.length ? <div className="max-h-64 overflow-auto border border-line-soft"><table className="w-full min-w-[900px] border-collapse text-xs"><thead className="bg-canvas"><tr>{["国家", "批次", "备件名称", "编码", "数量", "开始月份", "总额 USD", "前24月 USD", "后36月 USD"].map((label) => <th className="border-b px-2 py-2 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{importLines.map((line, index) => <tr key={index}><td className="border-b px-2 py-2">{line.countryCode}</td><td className="border-b px-2 py-2">{line.batchName}</td><td className="border-b px-2 py-2">{line.spareName}</td><td className="border-b px-2 py-2">{line.spareCode}</td><td className="border-b px-2 py-2">{line.quantity}</td><td className="border-b px-2 py-2">{normalizeSpareMonth(line.startMonth).slice(0, 7)}</td><td className="border-b px-2 py-2">{formatMoney(line.managementFeeTotalUsd)}</td><td className="border-b px-2 py-2">{formatMoney(line.first24MonthlyUsd)}</td><td className="border-b px-2 py-2">{formatMoney(line.next36MonthlyUsd)}</td></tr>)}</tbody></table></div> : null}
      </div>
    </Modal> : null}

    {voidingRow ? <Modal title="停用备件管理费" description="已对账月份继续保留并进入历史对账单；未对账月份会删除。" onClose={() => setVoidingRow(null)} footer={<><Button onClick={() => setVoidingRow(null)}>取消</Button><Button tone="danger" onClick={() => void voidSpare()}>确认停用</Button></>}>
      <p className="mb-3 text-sm text-ink-2">{String(voidingRow.batchName)} / {String(voidingRow.spareName)}</p>
      <Textarea autoFocus placeholder="填写作废原因（必填）" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
    </Modal> : null}
  </div>;
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`grid gap-1.5 text-xs text-ink-2 ${className}`}><span>{label}</span>{children}</label>;
}

function Cell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap border-b border-r border-line-soft px-3 py-3 ${className}`}>{children}</td>;
}

function MoneyCell({ value }: { value: unknown }) {
  return <Cell className="text-right">{formatMoney(value)}</Cell>;
}

function formatMoney(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";
}

function number(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function auditActionLabel(action: string) {
  if (action === "create") return "新增";
  if (action === "import") return "Excel导入";
  if (action === "update") return "修改";
  if (action === "void") return "停用";
  return action;
}
