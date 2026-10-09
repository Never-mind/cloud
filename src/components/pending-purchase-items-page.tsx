"use client";

/**
 * 待采购明细（方案 B）。
 *
 * 需求单确认后明细进入这里；勾选若干行（以实例行数为准）→ 生成一张采购订单。
 * 一条明细只能属于一张采购订单，生成后就不再出现在本列表里。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckSquare, RefreshCw, Search } from "lucide-react";
import { FileDown } from "lucide-react";
import { formatDisplayValue } from "@/lib/display-format";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { fetchTableFilterOptions, useRequestGuard } from "@/lib/table-query-client";
import { PaginationBar } from "./pagination-bar";
import { StickyTable } from "./sticky-table";
import { TableColumnMenu, type TableSortOrder } from "./table-column-menu";
import { Button, Input, Panel, Select } from "./ui";
import { Modal } from "./modal";
import { confirmDialog, notify } from "./app-dialog";
import { TableStateContent } from "./table-state";

type Row = Record<string, string | number | boolean | null>;

const columns: Array<[string, string, string?]> = [
  ["requestNo", "需求单号"],
  ["countryCode", "国家"],
  ["customerName", "客户"],
  ["undertakingUnitName", "承接单位"],
  ["supplierName", "供应商"],
  ["batchName", "批次"],
  ["deviceCode", "设备编码"],
  ["nameEn", "实例名称"],
  ["quantity", "数量", "number"],
  ["requestType", "类型"],
  ["requestedAt", "需求时间", "date"],
];

const DEFAULT_CURRENCY_OPTIONS = ["USD", "CNY", "MXN", "BRL", "CLP"];

export function PendingPurchaseItemsPage({
  initialRequestNo = "",
  onCountChange,
  onCreated,
}: {
  initialRequestNo?: string;
  onCountChange?: (count: number) => void;
  onCreated?: (poNo: string) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [requestNo, setRequestNo] = useState(initialRequestNo);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const pageSizeRef = useRef(pageSize);
  const [sortField, setSortField] = useState("");
  const [sortOrder, setSortOrder] = useState<TableSortOrder>("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const beginRequest = useRequestGuard();

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [poNo, setPoNo] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [usdRate, setUsdRate] = useState("");
  const [releasedAt, setReleasedAt] = useState("");
  const [targetPoNo, setTargetPoNo] = useState("");
  const [draftOrders, setDraftOrders] = useState<Array<{ poNo: string; sourceRequestNos: string }>>([]);
  const [createRows, setCreateRows] = useState<Row[]>([]);

  const loadRows = useCallback(async (nextPage = page, nextPageSize = pageSizeRef.current, queryState = { sortField, sortOrder, columnFilters, requestNo }) => {
    const isCurrentRequest = beginRequest();
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (queryState.requestNo.trim()) params.set("requestNo", queryState.requestNo.trim());
      if (queryState.sortField && queryState.sortOrder) {
        params.set("sortField", queryState.sortField);
        params.set("sortOrder", queryState.sortOrder);
      }
      for (const [field, values] of Object.entries(queryState.columnFilters)) {
        for (const value of values) params.append(`filter.${field}`, value);
      }
      const response = await fetch(`/api/procurement/pending-items?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "待采购明细加载失败");
      if (!isCurrentRequest()) return;
      setRows(data.rows ?? []);
      setTotal(Number(data.total ?? 0));
      setPage(Number(data.page ?? nextPage));
      onCountChange?.(Number(data.total ?? 0));
    } catch (error) {
      if (!isCurrentRequest()) return;
      notify(error instanceof Error ? error.message : "待采购明细加载失败", "info");
    } finally {
      if (isCurrentRequest()) setLoading(false);
    }
  }, [beginRequest, columnFilters, keyword, onCountChange, page, requestNo, sortField, sortOrder]);

  useEffect(() => {
    void loadRows(1, pageSizeRef.current, { sortField: "", sortOrder: "", columnFilters: {}, requestNo: initialRequestNo });
  }, [initialRequestNo]);

  function refreshTableQuery(next: { sortField?: string; sortOrder?: TableSortOrder; columnFilters?: Record<string, string[]> }) {
    const nextState = {
      sortField: next.sortField ?? sortField,
      sortOrder: next.sortOrder ?? sortOrder,
      columnFilters: next.columnFilters ?? columnFilters,
      requestNo,
    };
    setSortField(nextState.sortField);
    setSortOrder(nextState.sortOrder);
    setColumnFilters(nextState.columnFilters);
    setPage(1);
    void loadRows(1, pageSizeRef.current, nextState);
  }

  const currentPageIds = rows.map((row) => String(row.requestItemId));
  const allSelected = currentPageIds.length > 0 && currentPageIds.every((id) => selected.includes(id));

  function toggleCurrentPageSelection() {
    setSelected((current) => allSelected
      ? current.filter((id) => !currentPageIds.includes(id))
      : Array.from(new Set([...current, ...currentPageIds])));
  }

  function toggleRow(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function openCreate() {
    const picked = rows.filter((row) => selected.includes(String(row.requestItemId)));
    if (!picked.length) {
      notify("请至少勾选一条待采购明细", "info");
      return;
    }
    const requestNos = Array.from(new Set(picked.map((row) => String(row.requestNo ?? "")).filter(Boolean)));
    setPoNo(requestNos.length === 1 ? `PO-${requestNos[0]}` : "");
    setCreateRows(picked);
    setTargetPoNo("");
    setCreateOpen(true);
    try {
      const response = await fetch("/api/entities/purchase-orders?page=1&pageSize=200&filter.status=%E8%8D%89%E7%A8%BF", { cache: "no-store" });
      const data = await response.json();
      if (response.ok) {
        const related = (data.rows ?? []) as Array<Record<string, unknown>>;
        setDraftOrders(related
          .filter((row) => requestNos.some((no) => String(row.sourceRequestNos ?? "").split(",").includes(no)))
          .map((row) => ({ poNo: String(row.poNo ?? ""), sourceRequestNos: String(row.sourceRequestNos ?? "") })));
      }
    } catch {
      setDraftOrders([]);
    }
  }

  async function submitCreate() {
    if (!createRows.length) return;
    if (!targetPoNo && !poNo.trim()) {
      notify("请填写 PO 号", "error");
      return;
    }
    const label = targetPoNo ? `追加到采购订单 ${targetPoNo}` : `新建采购订单 ${poNo.trim()}`;
    if (!await confirmDialog(`确认按已选 ${createRows.length} 条明细${label}？`)) return;
    setCreating(true);
    try {
      const response = await fetch("/api/procurement/purchase-orders/from-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestItemIds: createRows.map((row) => String(row.requestItemId)),
          poNo: targetPoNo ? "" : poNo.trim(),
          targetPoNo: targetPoNo || undefined,
          currency,
          usdRate: usdRate.trim() || null,
          releasedAt: releasedAt || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "生成采购订单失败");
      notify(`已生成采购订单 ${data.poNo}（${data.itemCount} 条明细）`, "success");
      setCreateOpen(false);
      setSelected([]);
      await loadRows(page, pageSizeRef.current);
      onCreated?.(String(data.poNo ?? ""));
    } catch (error) {
      notify(error instanceof Error ? error.message : "生成采购订单失败", "info");
    } finally {
      setCreating(false);
    }
  }

  const selectedQty = rows
    .filter((row) => selected.includes(String(row.requestItemId)))
    .reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);

  /** 导出当前筛选下的全部待采购明细（采购员拿去核对/线下排单）。 */
  async function exportCsv() {
    try {
      const params = new URLSearchParams({ export: "1" });
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (requestNo.trim()) params.set("requestNo", requestNo.trim());
      for (const [field, values] of Object.entries(columnFilters)) {
        for (const value of values) params.append(`filter.${field}`, value);
      }
      const response = await fetch(`/api/procurement/pending-items?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "导出失败");
      const exportRows = (data.rows ?? []) as Row[];
      const content = [
        columns.map(([, label]) => label).join(","),
        ...exportRows.map((row) => columns.map(([key, , type]) => `"${String(formatDisplayValue(row[key], type)).replaceAll('"', '""')}"`).join(",")),
      ].join("\n");
      const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "pending-purchase-items.csv";
      link.click();
      URL.revokeObjectURL(url);
      notify(`正在下载 ${exportRows.length} 条待采购明细`, "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : "导出失败", "info");
    }
  }

  return (
    <>
      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-4">
          <Input placeholder="搜索需求单号、设备编码、批次" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <Input placeholder="按需求单号精确筛选" value={requestNo} onChange={(event) => setRequestNo(event.target.value)} />
          <Button tone="secondary" onClick={() => { setPage(1); void loadRows(1, pageSizeRef.current, { sortField, sortOrder, columnFilters, requestNo }); }}><Search size={15} />查询</Button>
          <Button onClick={() => void loadRows()}><RefreshCw size={15} />刷新</Button>
          <span className="ml-auto text-sm text-ink-3">已选 {selected.length} 条 · 合计 {selectedQty} 台</span>
          <Button className="ml-auto" tone="warning" onClick={() => void exportCsv()}><FileDown size={15} />导出</Button>
          <Button tone="primary" onClick={() => void openCreate()}><CheckSquare size={15} />生成采购订单</Button>
        </div>
        <StickyTable className="table-scroll table-viewport overflow-auto" tableKey="pending-purchase-items">
          <table className="w-full min-w-[1320px] border-collapse text-sm">
            <thead className="bg-canvas text-ink">
              <tr>
                <th className="table-select-cell whitespace-nowrap border-b border-r border-line-soft py-3 text-center font-medium [&>input]:h-4 [&>input]:w-4 [&>input]:align-middle">
                  <input type="checkbox" checked={allSelected} onChange={toggleCurrentPageSelection} />
                </th>
                {columns.map(([key, label, type]) => (
                  <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3 text-left font-medium" key={key}>
                    <TableColumnMenu
                      column={{ key, label, type, sortable: true, filterable: true }}
                      filterValues={columnFilters[key] ?? []}
                      loadOptions={(optionKeyword) => fetchTableFilterOptions("/api/procurement/pending-items", key, optionKeyword, {}, columnFilters)}
                      onFilter={(values) => refreshTableQuery({ columnFilters: { ...columnFilters, [key]: values } })}
                      onSort={(order) => refreshTableQuery({ sortField: order ? key : "", sortOrder: order })}
                      sortOrder={sortField === key ? sortOrder : ""}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = String(row.requestItemId);
                return (
                  <tr className={selected.includes(id) ? "bg-info-soft" : "hover:bg-surface-2"} key={id}>
                    <td className="table-select-cell border-b border-r border-line-soft py-3 text-center [&>input]:h-4 [&>input]:w-4 [&>input]:align-middle">
                      <input type="checkbox" checked={selected.includes(id)} onChange={() => toggleRow(id)} />
                    </td>
                    {columns.map(([key, , type]) => (
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3" key={key}>{formatDisplayValue(row[key], type)}</td>
                    ))}
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td className="py-12 text-center text-ink-3" colSpan={columns.length + 1}>
                    <TableStateContent empty="暂无待采购明细（需求单确认后，明细会出现在这里）" loading={loading} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </StickyTable>
        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={(next) => { setPage(next); void loadRows(next, pageSizeRef.current); }}
          onPageSizeChange={(next) => { pageSizeRef.current = next; setPageSize(next); setPage(1); void loadRows(1, next); }}
        />
      </Panel>

      {createOpen ? (
        <Modal
          description="这些明细会写进同一张采购订单；一条明细只能属于一张采购订单。"
          footer={<>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button disabled={creating} onClick={() => void submitCreate()} tone="primary">{creating ? "生成中…" : "生成采购订单（草稿）"}</Button>
          </>}
          onClose={() => setCreateOpen(false)}
          title="生成采购订单"
          widthClass="max-w-4xl"
        >
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-sm text-ink-2">
                <span>生成方式</span>
                <Select className="w-full" value={targetPoNo} onChange={(event) => setTargetPoNo(event.target.value)}>
                  <option value="">新建采购订单</option>
                  {draftOrders.map((order) => (
                    <option key={order.poNo} value={order.poNo}>追加到草稿 {order.poNo}</option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm text-ink-2">
                <span>PO 号</span>
                <Input className="w-full" disabled={Boolean(targetPoNo)} value={targetPoNo || poNo} onChange={(event) => setPoNo(event.target.value)} />
              </label>
              <label className="space-y-1 text-sm text-ink-2">
                <span>币种</span>
                <Select className="w-full" value={currency} onChange={(event) => setCurrency(event.target.value)}>
                  {DEFAULT_CURRENCY_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                </Select>
              </label>
              <label className="space-y-1 text-sm text-ink-2">
                <span>汇率（对 USD）</span>
                <Input className="w-full" placeholder="可留空，之后在采购单里补" value={usdRate} onChange={(event) => setUsdRate(event.target.value)} />
              </label>
              <label className="space-y-1 text-sm text-ink-2">
                <span>下发日期</span>
                <Input className="w-full" type="date" value={releasedAt} onChange={(event) => setReleasedAt(event.target.value)} />
              </label>
              <label className="space-y-1 text-sm text-ink-2">
                <span>已选明细</span>
                <Input className="w-full" readOnly value={`${createRows.length} 条 · 合计 ${createRows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0)} 台`} />
              </label>
            </div>
            <div className="table-scroll max-h-[320px] overflow-auto border border-line-soft">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead className="bg-canvas text-ink">
                  <tr>
                    {["需求单号", "设备编码", "实例名称", "数量", "类型", "操作"].map((label) => (
                      <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2 text-left font-medium" key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {createRows.map((row) => (
                    <tr className="hover:bg-surface-2" key={String(row.requestItemId)}>
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{String(row.requestNo ?? "")}</td>
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{String(row.deviceCode ?? "")}</td>
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{String(row.nameEn ?? "")}</td>
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{String(row.quantity ?? "")}</td>
                      <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-2">{String(row.requestType ?? "")}</td>
                      <td className="whitespace-nowrap border-b border-line-soft px-3 py-2">
                        <button className="text-danger" type="button" onClick={() => { setCreateRows((current) => current.filter((item) => String(item.requestItemId) !== String(row.requestItemId))); setSelected((current) => current.filter((id) => id !== String(row.requestItemId))); }}>移除</button>
                      </td>
                    </tr>
                  ))}
                  {!createRows.length ? <tr><td className="py-6 text-center text-ink-3" colSpan={6}>已清空，请关闭后重新勾选</td></tr> : null}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-3">生成后这些明细会从待采购清单移除；采购订单是草稿，可在「采购订单」标签里继续修改或确认（确认后才会生成物流单）。</p>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
