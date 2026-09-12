"use client";

import Link from "next/link";
import * as XLSX from "xlsx";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, FileDown, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { formatDisplayValue } from "@/lib/display-format";
import type { EntityConfig } from "@/lib/modules";
import { isConfirmedOrderStatus, type OrderStatusTab } from "@/lib/order-status";
import { formatRequestRemoteStatus } from "@/lib/request-remote-status";
import {
  getOrderListColumnKeys,
  getOrderListPrimaryDisplayValue,
  shouldShowPurchaseSourceGenerator,
} from "@/lib/order-list-view";
import { getOrderCreateRoute, getOrderDetailRoute, type OrderRouteMode } from "@/lib/order-routes";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { buildDetailRoute, buildListRoute, getCurrentRoute, getPositiveNumber, useListScrollPosition } from "@/lib/client-list-navigation";
import { fetchAllEntityRows } from "@/lib/client-entity-fetch";
import { PaginationBar } from "./pagination-bar";
import { StickyTable } from "./sticky-table";
import { TableColumnMenu, type TableFilterOption, type TableSortOrder } from "./table-column-menu";
import { useRequestGuard } from "@/lib/table-query-client";
import { readJsonResponse } from "@/lib/client-response";
import { postWorkspaceMessage } from "@/lib/tab-workspace";
import { Button, Input, Panel } from "./ui";
import { confirmDialog, notify } from "./app-dialog";
import { TableStateContent } from "./table-state";

type Row = Record<string, string | number | boolean | null>;
type PageMode = OrderRouteMode;
type OrderListResponse = {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  statusCounts: { draft: number; confirmed: number };
};

export function OrderListPage({
  mode,
  masterConfig,
  detailConfig: _detailConfig,
}: {
  mode: PageMode;
  masterConfig: EntityConfig;
  detailConfig: EntityConfig;
  relationKey: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState({ draft: 0, confirmed: 0 });
  const [keyword, setKeyword] = useState(() => searchParams.get("keyword") ?? "");
  const [countryCode, setCountryCode] = useState(() => searchParams.get("countryCode") ?? "");
  const [appliedKeyword, setAppliedKeyword] = useState(() => searchParams.get("keyword") ?? "");
  const [appliedCountryCode, setAppliedCountryCode] = useState(() => searchParams.get("countryCode") ?? "");
  const [countryOptions, setCountryOptions] = useState<Array<{ code: string; nameZh: string }>>([]);
  const [statusTab, setStatusTab] = useState<OrderStatusTab>(() =>
    searchParams.get("statusTab") === "confirmed" ? "confirmed" : "draft",
  );
  const [loading, setLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [selectedRequestNos, setSelectedRequestNos] = useState<Set<string>>(() => new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [page, setPage] = useState(() => getPositiveNumber(searchParams.get("page"), 1));
  const [pageSize, setPageSize] = useState(() => getPositiveNumber(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE));
  const [sortField, setSortField] = useState(() => searchParams.get("sortField") ?? "");
  const [sortOrder, setSortOrder] = useState<TableSortOrder>(() => {
    const value = searchParams.get("sortOrder");
    return value === "asc" || value === "desc" ? value : "";
  });
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>(() => ({
    requestNo: searchParams.getAll("filter.requestNo"),
    countryCode: searchParams.getAll("filter.countryCode"),
    batchName: searchParams.getAll("filter.batchName"),
    status: searchParams.getAll("filter.status"),
    requestType: searchParams.getAll("filter.requestType"),
    currency: searchParams.getAll("filter.currency"),
  }));
  const pageSizeRef = useRef(pageSize);
  const skipNextPageChangeRef = useRef(false);
  const columnKeys = getOrderListColumnKeys(mode);
  const currentRoute = getCurrentRoute(pathname, searchParams.toString());
  const beginRequest = useRequestGuard();

  useListScrollPosition(currentRoute, !loading);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("statusTab", statusTab);
    if (sortField && sortOrder) {
      params.set("sortField", sortField);
      params.set("sortOrder", sortOrder);
    } else {
      params.delete("sortField");
      params.delete("sortOrder");
    }
    if (appliedKeyword.trim()) params.set("keyword", appliedKeyword);
    else params.delete("keyword");
    if (appliedCountryCode.trim()) params.set("countryCode", appliedCountryCode);
    else params.delete("countryCode");
    for (const [key, values] of Object.entries(columnFilters)) {
      params.delete(`filter.${key}`);
      for (const value of values) params.append(`filter.${key}`, value);
    }

    const nextRoute = buildListRoute(pathname, params);
    if (nextRoute !== currentRoute) router.replace(nextRoute, { scroll: false });
  }, [appliedCountryCode, appliedKeyword, columnFilters, currentRoute, page, pageSize, pathname, router, searchParams, sortField, sortOrder, statusTab]);

  useEffect(() => {
    let active = true;
    void fetchAllEntityRows<Row>("countries")
      .then((rows) => {
        if (!active) return;
        setCountryOptions(
          rows
            .map((row) => ({ code: String(row.code ?? "").trim(), nameZh: String(row.nameZh ?? "").trim() }))
            .filter((row) => row.code)
            .sort((left, right) => left.code.localeCompare(right.code)),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function fetchData(
    nextPage: number,
    nextPageSize: number,
    nextStatusTab = statusTab,
    nextKeyword = appliedKeyword,
    nextCountryCode = appliedCountryCode,
    exportAll = false,
  ): Promise<OrderListResponse> {
    const params = new URLSearchParams({
      mode,
      page: String(nextPage),
      pageSize: String(nextPageSize),
      statusTab: nextStatusTab,
    });
    if (nextKeyword.trim()) params.set("keyword", nextKeyword.trim());
    if (nextCountryCode.trim()) params.set("countryCode", nextCountryCode.trim());
    for (const [key, values] of Object.entries(columnFilters)) {
      for (const value of values) params.append(`filter.${key}`, value);
    }
    if (sortField && sortOrder) {
      params.set("sortField", sortField);
      params.set("sortOrder", sortOrder);
    }
    if (exportAll) params.set("export", "1");
    const response = await fetch(`/api/orders?${params.toString()}`);
    return readJsonResponse<OrderListResponse>(response, "订单列表加载失败");
  }

  async function loadColumnOptions(field: string, optionKeyword: string): Promise<TableFilterOption[]> {
    const params = new URLSearchParams({ mode, field });
    if (optionKeyword.trim()) params.set("keyword", optionKeyword.trim());
    params.set("statusTab", statusTab);
    if (appliedCountryCode.trim()) params.set("countryCode", appliedCountryCode.trim());
    for (const [key, values] of Object.entries(columnFilters)) {
      if (key === field) continue;
      for (const value of values) params.append(`filter.${key}`, value);
    }
    const response = await fetch(`/api/orders?${params.toString()}`);
    const data = await readJsonResponse<{ options?: TableFilterOption[] }>(response, "筛选候选值加载失败");
    return (data.options ?? []) as TableFilterOption[];
  }

  function renderHeader(field: string, label: string) {
    return (
      <TableColumnMenu
        column={{ key: field, label }}
        filterValues={columnFilters[field] ?? []}
        loadOptions={(optionKeyword) => loadColumnOptions(field, optionKeyword)}
        onFilter={(values) => { setColumnFilters((current) => ({ ...current, [field]: values })); setPage(1); }}
        onSort={(order) => { setSortField(order ? field : ""); setSortOrder(order); setPage(1); }}
        sortOrder={sortField === field ? sortOrder : ""}
      />
    );
  }

  async function loadData(nextPage = page, nextPageSize = pageSizeRef.current, nextStatusTab = statusTab, nextKeyword = appliedKeyword, nextCountryCode = appliedCountryCode) {
    const isCurrentRequest = beginRequest();
    setLoading(true);
    try {
      const data = await fetchData(nextPage, nextPageSize, nextStatusTab, nextKeyword, nextCountryCode);
      if (!isCurrentRequest()) return;
      setRows(data.rows ?? []);
      setTotal(Number(data.total ?? 0));
      setStatusCounts(data.statusCounts ?? { draft: 0, confirmed: 0 });
      if (data.page !== nextPage) setPage(data.page);
    } catch (error) {
      if (!isCurrentRequest()) return;
      setRows([]);
      setTotal(0);
      setStatusCounts({ draft: 0, confirmed: 0 });
      notify(error instanceof Error ? error.message : "订单列表加载失败", "info");
    } finally {
      if (isCurrentRequest()) setLoading(false);
    }
  }

  useEffect(() => {
    void loadData(page, pageSize, statusTab, appliedKeyword, appliedCountryCode);
  }, [appliedCountryCode, appliedKeyword, columnFilters, mode, page, pageSize, sortField, sortOrder, statusTab]);

  useEffect(() => {
    setSelectedRequestNos(new Set());
  }, [appliedCountryCode, appliedKeyword, columnFilters, mode, page, pageSize, sortField, sortOrder, statusTab]);

  async function confirmRequestOrder(requestNo: string) {
    setConfirmingId(requestNo);
    await fetch("/api/procurement/from-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestNo }),
    });
    await loadData(1, pageSizeRef.current, "confirmed");
    setConfirmingId("");
    setStatusTab("confirmed");
    setPage(1);
  }

  async function confirmPurchaseOrder(poNo: string) {
    setConfirmingId(poNo);
    await fetch(`/api/procurement/${encodeURIComponent(poNo)}/confirm`, {
      method: "POST",
    });
    await loadData(page, pageSizeRef.current);
    setConfirmingId("");
  }

  async function deleteOrder(id: string) {
    const message =
      mode === "requests"
        ? `确认删除需求单 ${id} 吗？未生成月账单和预付款时，将同步删除该需求单明细及关联采购草稿。`
        : `确认删除采购单 ${id} 吗？未生成月账单和预付款时，将同步删除采购明细及物流草稿。`;
    if (!await confirmDialog(message)) return;
    setDeletingId(id);
    const response = await fetch(`/api/entities/${masterConfig.key}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = await response.json().catch(() => ({}));
    setDeletingId("");
    if (!response.ok) {
      notify(data.error ?? "删除失败", "info");
      return;
    }
    setSelectedRequestNos((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    await loadData(page, pageSizeRef.current);
  }

  async function deleteSelectedRequests() {
    const requestNos = [...selectedRequestNos];
    if (mode !== "requests" || statusTab !== "draft" || !requestNos.length) return;
    if (!await confirmDialog(`确认批量删除选中的 ${requestNos.length} 条需求单吗？未生成月账单和预付款时，将同步删除需求单明细及关联采购草稿。`)) return;

    setBatchDeleting(true);
    try {
      const response = await fetch("/api/orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "requests", ids: requestNos }),
      });
      const data = await response.json().catch(() => ({})) as {
        error?: string;
        blocked?: Array<{ requestNo?: string; reason?: string }>;
      };
      if (!response.ok) {
        const blocked = (data.blocked ?? [])
          .map((item) => `${item.requestNo ?? ""}: ${item.reason ?? "删除被阻止"}`)
          .filter(Boolean)
          .join("\n");
        notify([data.error ?? "批量删除失败", blocked].filter(Boolean).join("\n"), "info");
        return;
      }
      setSelectedRequestNos(new Set());
      await loadData(page, pageSizeRef.current);
    } catch (error) {
      notify(error instanceof Error ? error.message : "批量删除失败", "info");
    } finally {
      setBatchDeleting(false);
    }
  }

  async function exportOrders() {
    let exportRows: Row[];
    try {
      const data = await fetchData(1, pageSizeRef.current, statusTab, appliedKeyword, appliedCountryCode, true);
      exportRows = data.rows;
    } catch (error) {
      notify(error instanceof Error ? error.message : "订单导出失败", "info");
      return;
    }
    const columns: Array<[string, string, string?]> =
      mode === "requests"
        ? [
            ["requestNo", "需求单号"], ["countryCode", "国家"], ["batchName", "批次号"], ["status", "状态"], ["remoteStatus", "远端状态"],
            ["totalQuantity", "总数量"], ["plannedDeliveryDate", "计划交付日期", "date"],
            ["createdAt", "创建日期", "datetime"], ["updatedAt", "更新日期", "datetime"],
          ]
        : [
            ["poNo", "PO订单号"], ["requestNo", "来源需求单"], ["countryCode", "国家"], ["batchName", "批次号"], ["status", "状态"],
            ["currency", "币种"], ["totalQuantity", "总数量"], ["purchaseTotalAmount", "采购总金额", "money"],
            ["createdAt", "创建日期", "datetime"], ["updatedAt", "更新日期", "datetime"],
          ];
    const worksheet = XLSX.utils.aoa_to_sheet([
      columns.map(([, label]) => label),
      ...exportRows.map((row) => columns.map(([key, , type]) => formatValue(row[key], type))),
    ]);
    worksheet["!cols"] = columns.map(([, label]) => ({ wch: Math.max(12, label.length * 2 + 4) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, mode === "requests" ? "需求单列表" : "采购订单列表");
    XLSX.writeFile(workbook, `${mode === "requests" ? "需求单列表" : "采购订单列表"}-${statusTab}.xlsx`);
  }

  const hasActionColumn = mode === "purchase" || mode === "requests";
  const canBatchDelete = mode === "requests" && statusTab === "draft";
  const selectableRequestNos = canBatchDelete
    ? rows
      .filter((row) => !isConfirmedOrderStatus(mode, row.status))
      .map((row) => String(row[masterConfig.primaryKey]))
    : [];
  const selectedPageCount = selectableRequestNos.filter((requestNo) => selectedRequestNos.has(requestNo)).length;
  const allRowsSelected = selectableRequestNos.length > 0 && selectedPageCount === selectableRequestNos.length;
  const detailTitle = mode === "requests" ? "需求单明细" : "采购订单明细";

  function openOrderDetail(id: string, event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    postWorkspaceMessage({
      type: "cloud-power:open-tab",
      route: buildDetailRoute(getOrderDetailRoute(mode, id), currentRoute),
      title: detailTitle,
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-ink">
          {mode === "requests" ? "需求单列表" : "采购清单列表"}
        </h1>
        <p className="mt-1 text-sm text-ink-3">
          {mode === "requests"
            ? "需求单按草稿和已确认分区展示，点击需求单号进入明细页面。"
            : "采购清单按草稿和已确认分区展示，草稿确认后会自动生成物流单据。"}
        </p>
      </div>

      <Panel>
        <div className="flex items-center gap-2 border-b border-line-soft bg-surface-2 p-3">
          <Button tone={statusTab === "draft" ? "primary" : "default"} onClick={() => { setStatusTab("draft"); setPage(1); void loadData(1, pageSizeRef.current, "draft"); }}>
            草稿
            <span className="ml-1 rounded bg-white/35 px-1.5 text-xs">{statusCounts.draft}</span>
          </Button>
          <Button
            tone={statusTab === "confirmed" ? "primary" : "default"}
            onClick={() => { setStatusTab("confirmed"); setPage(1); void loadData(1, pageSizeRef.current, "confirmed"); }}
          >
            已确认
            <span className="ml-1 rounded bg-white/35 px-1.5 text-xs">{statusCounts.confirmed}</span>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-4">
          <Input
            placeholder={mode === "requests" ? "搜索需求单号/状态/批次" : "搜索PO单号/需求单号/状态"}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              setAppliedKeyword(keyword);
              setAppliedCountryCode(countryCode);
              setPage(1);
              void loadData(1, pageSizeRef.current, statusTab, keyword, countryCode);
            }}
          />
          <select
            className="h-9 min-w-32 rounded border border-line bg-white px-3 text-sm outline-none focus:border-primary"
            value={countryCode}
            onChange={(event) => {
              const value = event.target.value;
              setCountryCode(value);
              setPage(1);
            }}
          >
            <option value="">全部国家</option>
            {countryOptions.map((country) => (
              <option key={country.code} value={country.code}>
                {country.nameZh ? `${country.code} - ${country.nameZh}` : country.code}
              </option>
            ))}
          </select>
          <Button tone="secondary" onClick={() => {
            setAppliedKeyword(keyword);
            setAppliedCountryCode(countryCode);
            setPage(1);
            void loadData(1, pageSizeRef.current, statusTab, keyword, countryCode);
          }}>
            <Search size={15} />
            查询
          </Button>
          <Button onClick={() => void loadData()}>
            <RefreshCw size={15} />
            刷新
          </Button>
          <Link href={getOrderCreateRoute(mode)}>
            <Button tone="primary">
              <Plus size={15} />
              新建
            </Button>
          </Link>
          <div>
              <Button tone="warning" onClick={() => void exportOrders()}>
              <FileDown size={15} />
              导出 Excel
            </Button>
          </div>
          {canBatchDelete ? (
            <Button
              disabled={!selectedRequestNos.size || batchDeleting}
              tone="danger"
              onClick={() => void deleteSelectedRequests()}
            >
              <Trash2 size={15} />
              {batchDeleting ? "删除中..." : `批量删除${selectedRequestNos.size ? ` (${selectedRequestNos.size})` : ""}`}
            </Button>
          ) : null}
          {shouldShowPurchaseSourceGenerator(mode) ? <div className="ml-auto" /> : null}
        </div>

        <StickyTable className="table-scroll overflow-auto" tableKey={`orders-${mode}`}>
          <table className="w-full min-w-[1180px] border-collapse text-sm">
            <thead className="bg-canvas text-ink">
              <tr>
                {canBatchDelete ? (
                  <th className="table-select-cell border-b border-r border-line-soft py-3 text-center font-medium [&>input]:h-4 [&>input]:w-4 [&>input]:align-middle">
                    <input
                      aria-label="全选当前页需求单"
                      type="checkbox"
                      checked={allRowsSelected}
                      disabled={!selectableRequestNos.length || batchDeleting}
                      onChange={(event) => {
                        setSelectedRequestNos((current) => {
                          const next = new Set(current);
                          for (const requestNo of selectableRequestNos) {
                            if (event.target.checked) next.add(requestNo);
                            else next.delete(requestNo);
                          }
                          return next;
                        });
                      }}
                    />
                  </th>
                ) : null}
                <th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">
                  {renderHeader(mode === "requests" ? "requestNo" : "poNo", mode === "requests" ? "需求单号" : "PO订单号")}
                </th>
                {mode === "requests" ? (
                  <>
                    <th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">{renderHeader("countryCode", "国家")}</th>
                    <th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">{renderHeader("batchName", "批次号")}</th>
                  </>
                ) : null}
                {mode === "purchase" ? (
                  <th className="w-[260px] min-w-[260px] border-b border-r border-line-soft px-3 py-3 text-left font-medium">
                    {renderHeader("requestNo", "来源需求单")}
                  </th>
                ) : null}
                {mode === "purchase" ? (
                  <th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">
                    {renderHeader("countryCode", "国家")}
                  </th>
                ) : null}
                {mode === "purchase" ? (
                  <th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">
                    {renderHeader("batchName", "批次号")}
                  </th>
                ) : null}
                <th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">{renderHeader("status", "状态")}</th>
                {mode === "requests" ? (
                  <th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">{renderHeader("remoteStatus", "远端状态")}</th>
                ) : null}
                {mode === "purchase" ? (
                  <>
                        <th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">{renderHeader("currency", "币种")}</th>
                  </>
                ) : null}
                <th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">{renderHeader("totalQuantity", "总数量")}</th>
                {mode === "purchase" ? (
                  <th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">
                    {renderHeader("purchaseTotalAmount", "采购总金额")}
                  </th>
                ) : null}
                {mode === "requests" ? (
                  <th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">
                    {renderHeader("plannedDeliveryDate", "计划交付日期")}
                  </th>
                ) : null}
                <th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">{renderHeader("createdAt", "创建时间")}</th>
                <th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">{renderHeader("updatedAt", "更新时间")}</th>
                {hasActionColumn ? (
                  <th className="sticky right-0 border-b border-line-soft bg-canvas px-3 py-3 text-left font-medium">
                    操作
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = String(row[masterConfig.primaryKey]);
                const primaryDisplayValue = getOrderListPrimaryDisplayValue(mode, row);
                const confirmed = isConfirmedOrderStatus(mode, row.status);
                return (
                  <tr className="hover:bg-surface-2" key={id}>
                    {canBatchDelete ? (
                      <td className="table-select-cell border-b border-r border-line-soft py-3 text-center [&>input]:h-4 [&>input]:w-4 [&>input]:align-middle">
                        <input
                          aria-label={`选择需求单 ${id}`}
                          type="checkbox"
                          checked={selectedRequestNos.has(id)}
                          disabled={confirmed || batchDeleting}
                          onChange={(event) => {
                            setSelectedRequestNos((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(id);
                              else next.delete(id);
                              return next;
                            });
                          }}
                        />
                      </td>
                    ) : null}
                    <td className="border-b border-r border-line-soft px-3 py-3">
                      <Link
                        className="font-medium text-primary hover:underline"
                        href={buildDetailRoute(getOrderDetailRoute(mode, id), currentRoute)}
                        onClick={(event) => openOrderDetail(id, event)}
                      >
                        {primaryDisplayValue}
                      </Link>
                    </td>
                    {mode === "requests" ? (
                      <>
                        <td className="border-b border-r border-line-soft px-3 py-3">
                          {formatValue(row.countryCode)}
                        </td>
                        <td className="border-b border-r border-line-soft px-3 py-3">
                          {formatValue(row.batchName)}
                        </td>
                      </>
                    ) : null}
                    {mode === "purchase" ? (
                      <td className="w-[260px] max-w-[260px] border-b border-r border-line-soft px-3 py-3">
                        <span className="block truncate" title={String(row.requestNo ?? "")}>{formatValue(row.requestNo)}</span>
                      </td>
                    ) : null}
                    {mode === "purchase" ? (
                      <td className="border-b border-r border-line-soft px-3 py-3">
                        {formatValue(row.countryCode)}
                      </td>
                    ) : null}
                    {mode === "purchase" ? (
                      <td className="border-b border-r border-line-soft px-3 py-3">
                        {formatValue(row.batchName)}
                      </td>
                    ) : null}
                    <td className="border-b border-r border-line-soft px-3 py-3">
                      <StatusBadge mode={mode} value={String(row.status ?? "-")} />
                    </td>
                    {mode === "requests" ? (
                      <td className="border-b border-r border-line-soft px-3 py-3">{formatDisplayValue(row.remoteStatus, "text")}</td>
                    ) : null}
                    {mode === "purchase" ? (
                      <>
                        <td className="border-b border-r border-line-soft px-3 py-3">
                          {formatValue(row.currency)}
                        </td>
                      </>
                    ) : null}
                    <td className="border-b border-r border-line-soft px-3 py-3">
                      {formatValue(row.totalQuantity)}
                    </td>
                    {mode === "purchase" ? (
                      <td className="border-b border-r border-line-soft px-3 py-3">
                        {formatValue(row.purchaseTotalAmount, "money")}
                      </td>
                    ) : null}
                    {mode === "requests" ? (
                      <td className="border-b border-r border-line-soft px-3 py-3">
                        {formatValue(row.plannedDeliveryDate, "date")}
                      </td>
                    ) : null}
                    <td className="border-b border-r border-line-soft px-3 py-3">
                      {formatValue(row.createdAt, "datetime")}
                    </td>
                    <td className="border-b border-r border-line-soft px-3 py-3">
                      {formatValue(row.updatedAt, "datetime")}
                    </td>
                    {hasActionColumn ? (
                      <td className="sticky right-0 whitespace-nowrap border-b border-line-soft bg-white px-3 py-3">
                        {mode === "requests" ? (
                          <div className="flex items-center gap-2">
                            <Link
                              href={buildDetailRoute(getOrderDetailRoute(mode, id), currentRoute)}
                              onClick={(event) => openOrderDetail(id, event)}
                            >
                              <Button disabled={confirmed}>
                                <Pencil size={15} />
                                修改
                              </Button>
                            </Link>
                            <Button
                              disabled={confirmed || confirmingId === id}
                              tone="success"
                              onClick={() => void confirmRequestOrder(id)}
                            >
                              <CheckCircle2 size={15} />
                              {confirmed || confirmingId === id ? "已确认" : "确认需求单"}
                            </Button>
                            <Button disabled={batchDeleting || deletingId === id} tone="danger" onClick={() => void deleteOrder(id)}>
                              <Trash2 size={15} />
                              删除
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Button
                              disabled={confirmed || confirmingId === id}
                              tone="success"
                              onClick={() => void confirmPurchaseOrder(id)}
                            >
                              <CheckCircle2 size={15} />
                              {confirmed || confirmingId === id ? "已确认" : "确认采购"}
                            </Button>
                            <Button disabled={deletingId === id} tone="danger" onClick={() => void deleteOrder(id)}>
                              <Trash2 size={15} />
                              删除
                            </Button>
                          </div>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td className="py-12 text-center text-ink-3" colSpan={columnKeys.length + (canBatchDelete ? 1 : 0)}>
                    <TableStateContent empty="暂无数据" loading={loading} />
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
            void loadData(nextPage, pageSizeRef.current);
          }}
          onPageSizeChange={(nextPageSize) => {
            pageSizeRef.current = nextPageSize;
            skipNextPageChangeRef.current = true;
            setPageSize(nextPageSize);
            setPage(1);
            void loadData(1, nextPageSize);
          }}
        />
      </Panel>
    </div>
  );
}

function StatusBadge({ mode, value }: { mode: PageMode; value: string }) {
  const tone = isConfirmedOrderStatus(mode, value)
    ? "border-success bg-[#f0fff7] text-[#13a85a]"
    : value === "草稿" || value === "待采购"
      ? "border-warning bg-[#fff8e6] text-[#b88600]"
      : "border-line bg-white text-ink-2";

  return <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${tone}`}>{value}</span>;
}

function formatValue(value: unknown, type?: string) {
  return formatDisplayValue(value as string | number | boolean | null | undefined, type);
}
