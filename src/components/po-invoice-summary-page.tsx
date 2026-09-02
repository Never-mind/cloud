"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import { postWorkspaceMessage } from "@/lib/tab-workspace";
import type { PoInvoiceSummaryResult, PoInvoiceSummaryRow } from "@/lib/po-invoice-summary-service";
import { PaginationBar } from "./pagination-bar";
import { StickyTable } from "./sticky-table";
import { StatusTag } from "./status-tag";
import { TableColumnMenu, type TableFilterOption, type TableSortOrder } from "./table-column-menu";
import { Button, Input, Panel } from "./ui";

type Column = { key: string; label: string; type?: "money" | "number" | "date" | "datetime" | "boolean" };

const columns: Column[] = [
  { key: "projectNo", label: "项目单号" },
  { key: "quotationNo", label: "报价单号" },
  { key: "projectName", label: "项目名称" },
  { key: "contractingUnitShortName", label: "承接单位" },
  { key: "customerShortName", label: "客户" },
  { key: "projectStatus", label: "项目状态" },
  { key: "type", label: "类型" },
  { key: "accountPeriod", label: "账期", type: "date" },
  { key: "accountingDate", label: "财务记账日期", type: "date" },
  { key: "companyEntity", label: "承接单位" },
  { key: "invoiceEntity", label: "供应商/客户" },
  { key: "receivableDate", label: "应收日期", type: "date" },
  { key: "invoiceDate", label: "发票日期", type: "date" },
  { key: "invoiceNo", label: "发票号" },
  { key: "invoiceTotal", label: "发票总额", type: "money" },
  { key: "invoiceTaxExcludedTotal", label: "发票不含税总额", type: "money" },
  { key: "taxRate", label: "税率(%)", type: "number" },
  { key: "invoiceTaxAmount", label: "发票税金", type: "money" },
  { key: "currency", label: "发票币种" },
  { key: "exchangeRate", label: "发票汇率", type: "number" },
  { key: "usdAmount", label: "美金金额", type: "money" },
  { key: "isPaid", label: "是否支付", type: "boolean" },
  { key: "isInvoiced", label: "是否开票", type: "boolean" },
  { key: "createdAt", label: "创建时间", type: "datetime" },
  { key: "updatedAt", label: "更新时间", type: "datetime" },
];

const initialResult: PoInvoiceSummaryResult = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 1,
  totals: { incomeUsd: 0, costUsd: 0, netUsd: 0 },
};

export function PoInvoiceSummaryPage() {
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [type, setType] = useState("");
  const [accountPeriodStart, setAccountPeriodStart] = useState("");
  const [accountPeriodEnd, setAccountPeriodEnd] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState("");
  const [sortOrder, setSortOrder] = useState<TableSortOrder>("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<PoInvoiceSummaryResult>(initialResult);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function buildParams(includePaging = true) {
    const params = new URLSearchParams({ keyword: appliedKeyword });
    if (includePaging) {
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
    }
    if (type) params.set("type", type);
    if (accountPeriodStart) params.set("accountPeriodStart", accountPeriodStart);
    if (accountPeriodEnd) params.set("accountPeriodEnd", accountPeriodEnd);
    if (sortField && sortOrder) {
      params.set("sortField", sortField);
      params.set("sortOrder", sortOrder);
    }
    for (const [field, values] of Object.entries(columnFilters)) {
      for (const value of values) params.append(`filter.${field}`, value);
    }
    return params;
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/po/invoices?${buildParams().toString()}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({})) as PoInvoiceSummaryResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "发票汇总加载失败");
      setResult(data);
      if (data.page !== page) setPage(data.page);
    } catch (loadError) {
      setResult(initialResult);
      setError(loadError instanceof Error ? loadError.message : "发票汇总加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [accountPeriodEnd, accountPeriodStart, appliedKeyword, columnFilters, page, pageSize, sortField, sortOrder, type]);

  async function loadOptions(field: string, optionKeyword: string): Promise<TableFilterOption[]> {
    const params = buildParams(false);
    params.set("field", field);
    params.delete("sortField");
    params.delete("sortOrder");
    if (optionKeyword.trim()) params.set("optionKeyword", optionKeyword.trim());
    const response = await fetch(`/api/po/invoices/filter-options?${params.toString()}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({})) as { options?: TableFilterOption[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "发票筛选候选值加载失败");
    return data.options ?? [];
  }

  function applySearch() {
    setPage(1);
    setAppliedKeyword(keyword.trim());
  }

  function downloadSummary() {
    const link = document.createElement("a");
    link.href = `/api/po/invoices/export?${buildParams(false).toString()}`;
    link.download = "po-invoice-summary.xlsx";
    link.click();
  }

  function openProject(row: PoInvoiceSummaryRow) {
    postWorkspaceMessage({
      type: "cloud-power:open-tab",
      route: `/po/settlement-projects/${encodeURIComponent(row.projectId)}?returnTo=%2Fpo%2Finvoices`,
      title: "项目结算详情",
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-medium text-[#303133]">发票汇总</h1>
          <p className="mt-1 text-sm text-[#909399]">集中查看集采项目结算中的收入和成本发票。</p>
        </div>
        <Button onClick={() => void load()} disabled={loading} aria-label="刷新" title="刷新"><RefreshCw size={15} /></Button>
        <Button onClick={downloadSummary} aria-label="导出" title="导出发票汇总"><Download size={15} />导出</Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="收入发票（USD）" value={result.totals.incomeUsd} tone="success" />
        <Metric label="成本发票（USD）" value={result.totals.costUsd} tone="warning" />
        <Metric label="发票净额（USD）" value={result.totals.netUsd} tone="primary" />
      </div>
      <Panel>
        <div className="flex flex-wrap items-end gap-3 border-b border-[#ebeef5] p-4">
          <label className="min-w-[280px] flex-1">
            <span className="sr-only">搜索发票</span>
            <div className="flex gap-2">
              <Input className="h-10 w-full" value={keyword} placeholder="搜索项目单号、报价单号、客户、项目名称或发票号" onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applySearch(); }} />
              <Button tone="primary" className="h-10 w-10 px-0" aria-label="查询" title="查询" onClick={applySearch}><Search size={16} /></Button>
            </div>
          </label>
          <label className="w-32 text-sm text-[#606266]"><span className="mb-1 block text-xs text-[#909399]">类型</span><select className="h-10 w-full rounded border border-[#dcdfe6] bg-white px-3 outline-none focus:border-[#1890ff]" value={type} onChange={(event) => { setPage(1); setType(event.target.value); }}><option value="">全部类型</option><option value="income">收入</option><option value="cost">成本</option></select></label>
          <label className="text-sm text-[#606266]"><span className="mb-1 block text-xs text-[#909399]">账期开始</span><Input className="h-10" type="date" value={accountPeriodStart} onChange={(event) => { setPage(1); setAccountPeriodStart(event.target.value); }} /></label>
          <label className="text-sm text-[#606266]"><span className="mb-1 block text-xs text-[#909399]">账期结束</span><Input className="h-10" type="date" value={accountPeriodEnd} onChange={(event) => { setPage(1); setAccountPeriodEnd(event.target.value); }} /></label>
          <span className="text-sm text-[#909399]">共 {result.total} 条</span>
        </div>
        {error ? <div className="border-b border-[#fde2e2] bg-[#fef0f0] px-4 py-3 text-sm text-[#f56c6c]">{error}</div> : null}
        <StickyTable className="table-scroll max-h-[calc(100vh-340px)] overflow-auto" tableKey="po-invoice-summary">
          <table className="min-w-[2900px] border-collapse text-sm">
            <thead className="bg-[#f5f7fa] text-[#303133]"><tr>{columns.map((column) => <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={column.key}><TableColumnMenu column={{ ...column, sortable: true, filterable: true }} filterValues={columnFilters[column.key] ?? []} loadOptions={(optionKeyword) => loadOptions(column.key, optionKeyword)} onFilter={(values) => { setPage(1); setColumnFilters((current) => ({ ...current, [column.key]: values })); }} onSort={(order) => { setPage(1); setSortField(column.key); setSortOrder(order); }} sortOrder={sortField === column.key ? sortOrder : ""} /></th>)}<th className="sticky right-0 border-b border-[#ebeef5] bg-[#f5f7fa] px-3 py-3 text-left font-medium">操作</th></tr></thead>
            <tbody>
              {loading ? <tr><td className="px-4 py-12 text-center text-[#909399]" colSpan={columns.length + 1}>加载中...</td></tr> : null}
              {!loading && result.items.map((row) => <tr className="hover:bg-[#fafafa]" key={row.id}>{columns.map((column, index) => <td className="max-w-[260px] truncate whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3" key={column.key}>{index === 0 ? <button className="text-[#1890ff] hover:underline" type="button" onClick={() => openProject(row)}>{row.projectNo || "-"}</button> : column.key === "projectStatus" ? <StatusTag status={row.projectStatus} label={statusLabel(row.projectStatus)} /> : formatValue(row[column.key as keyof PoInvoiceSummaryRow], column.type)}</td>)}<td className="sticky right-0 whitespace-nowrap border-b border-[#ebeef5] bg-white px-3 py-3"><button className="text-[#1890ff] hover:underline" type="button" onClick={() => openProject(row)}>查看项目</button></td></tr>)}
              {!loading && !result.items.length ? <tr><td className="px-4 py-12 text-center text-[#909399]" colSpan={columns.length + 1}>暂无发票明细</td></tr> : null}
            </tbody>
          </table>
        </StickyTable>
        <PaginationBar page={result.page} pageSize={result.pageSize} total={result.total} onPageChange={setPage} onPageSizeChange={(value) => { setPage(1); setPageSize(value); }} />
      </Panel>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "success" | "warning" | "primary" }) {
  const border = tone === "success" ? "border-[#b7ebc6]" : tone === "warning" ? "border-[#f5d79a]" : "border-[#b8d8f8]";
  return <div className={`min-h-[84px] rounded border bg-white px-4 py-3 shadow-sm ${border}`}><div className="text-xs text-[#909399]">{label}</div><div className="mt-2 text-xl font-semibold text-[#303133]">{money(value)}</div></div>;
}

function formatValue(value: unknown, type?: Column["type"]) {
  if (value === null || value === undefined || value === "") return "-";
  if (type === "boolean") return Number(value) === 0 ? "否" : "是";
  if (type === "money" || type === "number") return money(Number(value));
  if (type === "date" || type === "datetime") return String(value).replace("T", " ").slice(0, type === "date" ? 10 : 16);
  if (value === "income") return "收入";
  if (value === "cost") return "成本";
  return String(value);
}

function statusLabel(status: string) {
  return (({ purchasing: "采购中", procurement_completed: "采购完成", accepting: "验收中", closed: "已完结" } as Record<string, string>)[status] ?? status) || "-";
}

function money(value: number) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
