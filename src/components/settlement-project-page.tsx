"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, RefreshCw, Search, Trash2 } from "lucide-react";
import { Button, Input, Panel } from "./ui";
import { PaginationBar } from "./pagination-bar";
import { StickyTable } from "./sticky-table";
import { TableColumnMenu, type TableFilterOption, type TableSortOrder } from "./table-column-menu";
import { StatusTag } from "./status-tag";
import { postWorkspaceMessage } from "@/lib/tab-workspace";

type Project = {
  id: string; projectNo: string; quotationId: string; quotationNo: string; projectName: string | null; customerName: string | null; contractingUnitName: string | null;
  remark: string | null; quotedPurchaseCostUsd: number; purchasedCostUsd: number; quotedSalesRevenueUsd: number;
  receivedRevenueTaxIncludedUsd: number; receivedRevenueUsd: number; grossProfitUsd: number; status: string;
  createdByName: string | null; updatedByName: string | null; confirmedByName: string | null; createdAt: string; updatedAt: string;
};

type ListResult = { items: Project[]; total: number; page: number; pageSize: number; totalPages: number };

const columns = [
  ["projectNo", "项目单号"], ["quotationNo", "报价单号"], ["projectName", "项目名称"], ["customerName", "客户"], ["contractingUnitName", "承接单位"], ["status", "状态"],
  ["quotedPurchaseCostUsd", "采购成本（未税 USD）"], ["purchasedCostUsd", "已采购成本（未税 USD）"], ["quotedSalesRevenueUsd", "销售收入（未税 USD）"],
  ["receivedRevenueTaxIncludedUsd", "已销售收入（含税 USD）"], ["receivedRevenueUsd", "已销售收入（未税 USD）"], ["grossProfitUsd", "项目毛利（未税 USD）"],
] as const;

export function SettlementProjectPage() {
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<ListResult>({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
  const [sortField, setSortField] = useState("");
  const [sortOrder, setSortOrder] = useState<TableSortOrder>("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), keyword: appliedKeyword });
      if (status) params.set("status", status);
      const response = await fetch(`/api/po/settlement-projects?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "项目结算加载失败");
      setResult(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "项目结算加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [page, pageSize, appliedKeyword, status]);

  const rows = useMemo(() => {
    let next = result.items.filter((row) => Object.entries(columnFilters).every(([field, values]) => !values.length || values.includes(String(row[field as keyof Project] ?? ""))));
    if (sortField && sortOrder) {
      next = [...next].sort((left, right) => {
        const a = left[sortField as keyof Project]; const b = right[sortField as keyof Project];
        const av = typeof a === "number" ? a : String(a ?? ""); const bv = typeof b === "number" ? b : String(b ?? "");
        const compared = av < bv ? -1 : av > bv ? 1 : 0;
        return sortOrder === "asc" ? compared : -compared;
      });
    }
    return next;
  }, [columnFilters, result.items, sortField, sortOrder]);

  async function deleteProject(id: string) {
    if (!window.confirm("确认删除该项目结算？删除后会同步删除其采购、费用、销售、发票和附件明细。")) return;
    const response = await fetch(`/api/po/settlement-projects/${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error ?? "项目结算删除失败"); return; }
    void load();
  }

  async function loadOptions(field: string): Promise<TableFilterOption[]> {
    const values = new Map<string, number>();
    for (const row of result.items) { const value = String(row[field as keyof Project] ?? ""); if (value) values.set(value, (values.get(value) ?? 0) + 1); }
    return [...values.entries()].map(([value, count]) => ({ value, label: field === "status" ? statusLabel(value) : value, count }));
  }

  function openRoute(route: string, title: string) {
    postWorkspaceMessage({ type: "cloud-power:open-tab", route, title });
  }

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-[#ebeef5] p-4">
          <div className="mr-auto"><h1 className="text-xl font-medium text-[#303133]">项目结算</h1><p className="mt-1 text-sm text-[#909399]">已确认报价单自动生成项目结算主单，采购、收入和发票明细独立维护。</p></div>
          <a className="inline-flex h-9 items-center gap-1 rounded border border-[#dcdfe6] bg-white px-3 text-sm text-[#606266] hover:opacity-85" href="/api/po/settlement-projects/export"><Download size={15} />导出</a>
        </div>
        <div className="flex flex-wrap items-end gap-3 border-b border-[#ebeef5] p-4">
          <label><span className="mb-1 block text-xs font-semibold text-[#606266]">关键字</span><div className="flex gap-2"><Input value={keyword} placeholder="项目单号、报价单号、客户" onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setPage(1); setAppliedKeyword(keyword.trim()); } }} /><Button tone="primary" onClick={() => { setPage(1); setAppliedKeyword(keyword.trim()); }}><Search size={15} />查询</Button></div></label>
          <label><span className="mb-1 block text-xs font-semibold text-[#606266]">状态</span><select className="h-9 min-w-[150px] rounded border border-[#dcdfe6] bg-white px-3 text-sm" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}><option value="">全部状态</option><option value="purchasing">采购中</option><option value="procurement_completed">采购完成</option><option value="accepting">验收中</option><option value="closed">已完结</option></select></label>
          <Button onClick={() => void load()} disabled={loading}><RefreshCw size={15} />刷新</Button>
        </div>
        {error ? <div className="m-4 border border-[#ffb4ab] bg-[#ffdad6] px-3 py-2 text-sm text-[#93000a]">{error}<button className="ml-3 underline" onClick={() => setError("")}>关闭</button></div> : null}
        <StickyTable className="table-scroll max-h-[calc(100vh-300px)] overflow-auto" tableKey="settlement-projects">
         <table className="min-w-[2400px] border-collapse text-sm">
            <thead className="bg-[#f5f7fa]"><tr>{columns.map(([field, label]) => <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={field}><TableColumnMenu column={{ key: field, label, sortable: true, filterable: true }} sortOrder={sortField === field ? sortOrder : ""} filterValues={columnFilters[field] ?? []} loadOptions={() => loadOptions(field)} onSort={(order) => { setSortField(field); setSortOrder(order); }} onFilter={(values) => setColumnFilters((current) => ({ ...current, [field]: values }))} /></th>)}<th className="border-b border-[#ebeef5] px-3 py-3 text-left font-medium">操作</th></tr></thead>
             <tbody>{loading ? <tr><td className="px-4 py-12 text-center text-[#909399]" colSpan={columns.length + 1}>加载中...</td></tr> : rows.map((row) => <tr key={row.id}>
               <td className="whitespace-nowrap px-3 py-3"><button className="text-[#1890ff] hover:underline" type="button" onClick={() => openRoute(`/po/settlement-projects/${encodeURIComponent(row.id)}?returnTo=%2Fpo%2Fsettlement-projects`, "项目结算详情")}>{row.projectNo}</button></td><td className="whitespace-nowrap px-3 py-3"><button className="text-[#1890ff] hover:underline" type="button" onClick={() => openRoute(`/quotation/list?keyword=${encodeURIComponent(row.quotationNo)}`, "报价列表")}>{row.quotationNo}</button></td><td className="px-3 py-3">{row.projectName || "-"}</td><td className="px-3 py-3">{row.customerName || "-"}</td><td className="px-3 py-3">{row.contractingUnitName || "-"}</td>
               <td className="px-3 py-3"><StatusTag status={row.status} label={statusLabel(row.status)} /></td>
               <td className="numeric-cell px-3 py-3">{money(row.quotedPurchaseCostUsd)}</td><td className="numeric-cell px-3 py-3">{money(row.purchasedCostUsd)}</td><td className="numeric-cell px-3 py-3">{money(row.quotedSalesRevenueUsd)}</td><td className="numeric-cell px-3 py-3">{money(row.receivedRevenueTaxIncludedUsd)}</td><td className="numeric-cell px-3 py-3">{money(row.receivedRevenueUsd)}</td><td className="numeric-cell px-3 py-3">{money(row.grossProfitUsd)}</td>
              <td className="whitespace-nowrap px-3 py-3"><button className="mr-2 inline-flex h-8 w-8 items-center justify-center text-[#606266] hover:text-[#1890ff]" type="button" aria-label="查看" title="查看" onClick={() => openRoute(`/po/settlement-projects/${encodeURIComponent(row.id)}?returnTo=%2Fpo%2Fsettlement-projects`, "项目结算详情")}><Eye size={16} /></button>{row.status !== "closed" ? <button className="inline-flex h-8 w-8 items-center justify-center text-[#f56c6c] hover:text-[#f56c6c]" type="button" aria-label="删除" title="删除" onClick={() => void deleteProject(row.id)}><Trash2 size={16} /></button> : null}</td>
              </tr>)}{!loading && !rows.length ? <tr><td className="px-4 py-12 text-center text-[#909399]" colSpan={columns.length + 1}>暂无项目结算。报价单确认后会自动生成。</td></tr> : null}</tbody>
          </table>
        </StickyTable>
        <PaginationBar page={result.page} pageSize={result.pageSize} total={result.total} onPageChange={setPage} onPageSizeChange={(value) => { setPage(1); setPageSize(value); }} />
      </Panel>
    </div>
  );
}

function money(value: number) { return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatDate(value: string) { return value ? String(value).slice(0, 16).replace("T", " ") : "-"; }
function statusLabel(status: string) { return ({ purchasing: "采购中", procurement_completed: "采购完成", accepting: "验收中", closed: "已完结" } as Record<string, string>)[status] || status || "-"; }
function statusClass(status: string) { return status === "closed" ? "bg-[#dcfce7] text-[#166534]" : status === "accepting" ? "bg-[#e0e7ff] text-[#4338ca]" : status === "procurement_completed" ? "bg-[#dbeafe] text-[#1d4ed8]" : "bg-[#fef3c7] text-[#92400e]"; }
