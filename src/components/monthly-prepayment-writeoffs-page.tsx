"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileDown, RefreshCw, Search, Trash2 } from "lucide-react";
import { formatDisplayValue } from "@/lib/display-format";
import { appendKnownTotal, DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { PaginationBar } from "./pagination-bar";
import { StickyTable } from "./sticky-table";
import { TableColumnMenu, type TableFilterOption, type TableSortOrder } from "./table-column-menu";
import { useRequestGuard } from "@/lib/table-query-client";
import { buildDetailRoute, buildListRoute, getCurrentRoute, getPositiveNumber, useListScrollPosition } from "@/lib/client-list-navigation";
import { Button, Input, Panel, Select } from "./ui";
import { confirmDialog, notify } from "./app-dialog";
import { monthlyPrepaymentWriteOffColumns } from "@/lib/writeoff-export-columns";
import { TableStateContent } from "./table-state";

type Row = Record<string, string | number | boolean | null>;
type ListResponse = { rows: Row[]; total: number; totalAmount: number; page: number; pageSize: number; totalPages: number };

// 列定义与"服务端导出文件"共用一份，避免两边列不一致。
const columns = monthlyPrepaymentWriteOffColumns.map((column) => ({ ...column, sortable: true, filterable: true }));

export function MonthlyPrepaymentWriteOffsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [keyword, setKeyword] = useState(() => searchParams.get("keyword") ?? "");
  const [countryCode, setCountryCode] = useState(() => searchParams.get("countryCode") ?? "");
  const [batchName, setBatchName] = useState(() => searchParams.get("batchName") ?? "");
  const [startMonth, setStartMonth] = useState(() => searchParams.get("startMonth") ?? "");
  const [endMonth, setEndMonth] = useState(() => searchParams.get("endMonth") ?? "");
  const [requestType, setRequestType] = useState(() => searchParams.get("requestType") ?? "");
  const [appliedFilters, setAppliedFilters] = useState(() => ({ keyword, countryCode, batchName, startMonth, endMonth, requestType }));
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(() => getPositiveNumber(searchParams.get("page"), 1));
  const [pageSize, setPageSize] = useState(() => getPositiveNumber(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE));
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [sortField, setSortField] = useState(() => searchParams.get("sortField") ?? "");
  const [sortOrder, setSortOrder] = useState<TableSortOrder>(() => {
    const value = searchParams.get("sortOrder");
    return value === "asc" || value === "desc" ? value : "";
  });
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(columns.map((column) => [column.key, searchParams.getAll(`filter.${column.key}`)])),
  );
  const [deletingId, setDeletingId] = useState("");
  const pageSizeRef = useRef(pageSize);
  const skipNextPageChangeRef = useRef(false);
  const queryMountedRef = useRef(false);
  const beginRequest = useRequestGuard();
  const currentRoute = getCurrentRoute(pathname, searchParams.toString());

  useListScrollPosition(currentRoute, !loading);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(appliedFilters)) {
      if (value.trim()) params.set(key, value);
      else params.delete(key);
    }
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (sortField && sortOrder) { params.set("sortField", sortField); params.set("sortOrder", sortOrder); }
    else { params.delete("sortField"); params.delete("sortOrder"); }
    for (const [key, values] of Object.entries(columnFilters)) {
      params.delete(`filter.${key}`);
      values.forEach((value) => params.append(`filter.${key}`, value));
    }
    const nextRoute = buildListRoute(pathname, params);
    if (nextRoute !== currentRoute) router.replace(nextRoute, { scroll: false });
  }, [appliedFilters, columnFilters, currentRoute, page, pageSize, pathname, router, searchParams, sortField, sortOrder]);

  function buildRequestParams(nextPage: number, nextPageSize: number, exportAll = false, filters = appliedFilters, reuseKnownTotals = false) {
    const params = new URLSearchParams();
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.countryCode.trim()) params.set("countryCode", filters.countryCode.trim());
    if (filters.batchName.trim()) params.set("batchName", filters.batchName.trim());
    if (filters.requestType.trim()) params.set("requestType", filters.requestType.trim());
    if (filters.startMonth) params.set("startMonth", filters.startMonth);
    if (filters.endMonth) params.set("endMonth", filters.endMonth);
    params.set("page", String(nextPage));
    params.set("pageSize", String(nextPageSize));
    if (sortField && sortOrder) { params.set("sortField", sortField); params.set("sortOrder", sortOrder); }
    for (const [key, values] of Object.entries(columnFilters)) values.forEach((value) => params.append(`filter.${key}`, value));
    if (exportAll) params.set("export", "1");
    if (!exportAll && reuseKnownTotals) {
      appendKnownTotal(params, total);
      params.set("knownTotalAmount", String(totalAmount));
    }
    return params;
  }

  async function loadColumnOptions(field: string, optionKeyword: string): Promise<TableFilterOption[]> {
    const params = new URLSearchParams({ field });
    if (optionKeyword.trim()) params.set("keyword", optionKeyword.trim());
    for (const [key, values] of Object.entries(columnFilters)) {
      if (key === field) continue;
      for (const value of values) params.append(`filter.${key}`, value);
    }
    const response = await fetch(`/api/prepayments/monthly-writeoffs?${params}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "筛选候选值加载失败");
    return (data.options ?? []) as TableFilterOption[];
  }

  function renderHeader(column: (typeof columns)[number]) {
    return <TableColumnMenu column={column} filterValues={columnFilters[column.key] ?? []} loadOptions={(keyword) => loadColumnOptions(column.key, keyword)} onFilter={(values) => { setColumnFilters((current) => ({ ...current, [column.key]: values })); setPage(1); }} onSort={(order) => { setSortField(order ? column.key : ""); setSortOrder(order); setPage(1); }} sortOrder={sortField === column.key ? sortOrder : ""} />;
  }

  /**
   * 撤销追加尾期：财务误加的尾期直接删掉。
   * 后端只放行 `来源 = 追加尾期` 的行，且被核销调整单 / 服务费对账单引用时会给出提示。
   */
  async function deleteTail(row: Row) {
    const label = `${String(row.writeOffMonth ?? "")} 第 ${String(row.monthIndex ?? "")} 期 ${formatValue(row.monthlyAmount, "money")}`;
    if (!await confirmDialog(`确认删除追加的尾期（${label}）？\n删除后该期从预付款月核销明细消失，合同的核销状态会重新计算。`)) return;
    setDeletingId(String(row.id ?? ""));
    try {
      const response = await fetch(`/api/prepayment-adjustments/append-month?id=${encodeURIComponent(String(row.id ?? ""))}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "删除尾期失败");
      notify(`已删除尾期 ${String(data.writeOffMonth ?? "")}`, "success");
      await loadData(page, pageSizeRef.current, appliedFilters, true);
    } catch (error) {
      notify(error instanceof Error ? error.message : "删除尾期失败", "error");
    } finally {
      setDeletingId("");
    }
  }

  async function fetchData(nextPage: number, nextPageSize: number, exportAll = false, filters = appliedFilters, reuseKnownTotals = false): Promise<ListResponse> {
    const response = await fetch(`/api/prepayments/monthly-writeoffs?${buildRequestParams(nextPage, nextPageSize, exportAll, filters, reuseKnownTotals).toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "预付款核销明细加载失败");
    return data as ListResponse;
  }

  async function loadData(nextPage = page, nextPageSize = pageSizeRef.current, filters = appliedFilters, reuseKnownTotals = false) {
    const isCurrentRequest = beginRequest();
    setLoading(true);
    try {
      const data = await fetchData(nextPage, nextPageSize, false, filters, reuseKnownTotals);
      if (!isCurrentRequest()) return;
      setRows(data.rows ?? []);
      setTotal(Number(data.total ?? 0));
      setTotalAmount(Number(data.totalAmount ?? 0));
      if (data.page !== nextPage) setPage(data.page);
    } catch (error) {
      if (!isCurrentRequest()) return;
      setRows([]);
      setTotal(0);
      setTotalAmount(0);
      notify(error instanceof Error ? error.message : "预付款核销明细加载失败", "info");
    } finally {
      if (isCurrentRequest()) setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!queryMountedRef.current) {
      queryMountedRef.current = true;
      return;
    }
    setPage(1);
    void loadData(1, pageSizeRef.current, appliedFilters);
  }, [columnFilters, sortField, sortOrder]);

  async function downloadExport() {
    setExporting(true);
    try {
      const response = await fetch(`/api/prepayments/monthly-writeoffs/export?${buildRequestParams(1, pageSizeRef.current, false, appliedFilters).toString()}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "预付款核销明细导出失败");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "prepayment-monthly-writeoffs.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      notify(error instanceof Error ? error.message : "MSG", "info");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-ink">预付款每月核销明细</h1>
        <p className="mt-1 text-sm text-ink-3">查看已确认预付款合同按24个月生成的每月核销金额。</p>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-4">
          <Input placeholder="搜索合同/批次/需求单/PO/实例编码" value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { const filters = { keyword, countryCode, batchName, startMonth, endMonth, requestType }; setAppliedFilters(filters); setPage(1); void loadData(1, pageSizeRef.current, filters); } }} />
          <Input placeholder="国家" value={countryCode} onChange={(event) => setCountryCode(event.target.value)} />
          <Input placeholder="批次" value={batchName} onChange={(event) => setBatchName(event.target.value)} />
          <Input type="date" value={startMonth} onChange={(event) => setStartMonth(event.target.value)} />
          <Input type="date" value={endMonth} onChange={(event) => setEndMonth(event.target.value)} />
          <Select value={requestType} onChange={(event) => setRequestType(event.target.value)}>
            <option value="">全部类型</option>
            <option value="整机">整机</option>
            <option value="备件">备件</option>
          </Select>
          <Button tone="secondary" onClick={() => { const filters = { keyword, countryCode, batchName, startMonth, endMonth, requestType }; setAppliedFilters(filters); setPage(1); void loadData(1, pageSizeRef.current, filters); }}>
            <Search size={15} />
            查询
          </Button>
          <Button onClick={() => void loadData()}>
            <RefreshCw size={15} />
            刷新
          </Button>
          <Button className="ml-auto" disabled={exporting} tone="warning" onClick={() => void downloadExport()}>
            <FileDown size={15} />
            导出
          </Button>
        </div>
        <div className="border-b border-line-soft bg-surface-2 px-4 py-3 text-sm text-ink-2">
          当前筛选共 {total} 条，月核销金额合计 {formatValue(totalAmount, "money")}
        </div>

        <StickyTable className="table-scroll table-viewport overflow-auto" tableKey="monthly-prepayment-writeoffs">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-canvas text-ink">
              <tr>
                {columns.map((column) => (
                  <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3 text-left font-medium" key={column.key}>
                    {renderHeader(column)}
                  </th>
                ))}
                <th className="whitespace-nowrap sticky right-0 border-b border-line-soft bg-canvas px-3 py-3 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="hover:bg-surface-2" key={String(row.id)}>
                  {columns.map((column) => (
                    <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3" key={column.key}>
                      {renderLinkedValue(row, column, currentRoute)}
                    </td>
                  ))}
                  <td className="sticky right-0 whitespace-nowrap border-b border-line-soft bg-white px-3 py-3">
                    {String(row.sourceType ?? "") === "追加尾期" ? (
                      <Button disabled={deletingId === String(row.id)} tone="danger" onClick={() => void deleteTail(row)}>
                        <Trash2 size={15} />
                        {deletingId === String(row.id) ? "删除中" : "删除尾期"}
                      </Button>
                    ) : (
                      <span className="text-xs text-ink-3">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td className="py-12 text-center text-ink-3" colSpan={columns.length + 1}>
                    <TableStateContent empty="暂无核销明细" loading={loading} />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </StickyTable>
        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={(nextPage) => {
            if (skipNextPageChangeRef.current) {
              skipNextPageChangeRef.current = false;
              return;
            }
            setPage(nextPage);
            void loadData(nextPage, pageSizeRef.current, appliedFilters, true);
          }}
          onPageSizeChange={(nextPageSize) => {
            pageSizeRef.current = nextPageSize;
            skipNextPageChangeRef.current = true;
            setPageSize(nextPageSize);
            setPage(1);
            void loadData(1, nextPageSize, appliedFilters, true);
          }}
        />
      </Panel>
    </div>
  );
}

function renderLinkedValue(row: Row, column: { key: string; type?: string }, returnTo: string) {
  const value = formatValue(row[column.key], column.type);
  if (column.key === "contractNo" && row.contractNo) {
    return <Link className="font-medium text-primary hover:underline" href={buildDetailRoute(`/finance/prepayment-contracts/${encodeURIComponent(String(row.contractNo))}`, returnTo)}>{value}</Link>;
  }
  if (column.key === "requestNo" && row.requestNo) {
    return <Link className="font-medium text-primary hover:underline" href={buildDetailRoute(`/requests/orders/${encodeURIComponent(String(row.requestNo))}`, returnTo)}>{value}</Link>;
  }
  if (column.key === "poNo" && row.purchaseOrderId) {
    return <Link className="font-medium text-primary hover:underline" href={buildDetailRoute(`/purchase/orders/${encodeURIComponent(String(row.purchaseOrderId))}`, returnTo)}>{value}</Link>;
  }
  return value;
}

function formatValue(value: unknown, type?: string) {
  return formatDisplayValue(value as string | number | boolean | null | undefined, type);
}
