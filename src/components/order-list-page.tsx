"use client";

import Link from "next/link";
import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileDown, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { formatDisplayValue } from "@/lib/display-format";
import type { EntityConfig } from "@/lib/modules";
import { countOrderStatusTabs, isConfirmedOrderStatus, type OrderStatusTab } from "@/lib/order-status";
import {
  getOrderListColumnKeys,
  getOrderListPrimaryDisplayValue,
  shouldShowPurchaseSourceGenerator,
} from "@/lib/order-list-view";
import { getOrderCreateRoute, getOrderDetailRoute, type OrderRouteMode } from "@/lib/order-routes";
import { DEFAULT_PAGE_SIZE, paginateRows } from "@/lib/pagination";
import { calculatePurchaseTotalAmount } from "@/lib/purchase-lines";
import { PaginationBar } from "./pagination-bar";
import { Button, Input, Panel } from "./ui";

type Row = Record<string, string | number | boolean | null>;
type PageMode = OrderRouteMode;

export function OrderListPage({
  mode,
  masterConfig,
  detailConfig,
}: {
  mode: PageMode;
  masterConfig: EntityConfig;
  detailConfig: EntityConfig;
  relationKey: string;
}) {
  const [masters, setMasters] = useState<Row[]>([]);
  const [details, setDetails] = useState<Row[]>([]);
  const [requestItems, setRequestItems] = useState<Row[]>([]);
  const [requests, setRequests] = useState<Row[]>([]);
  const [keyword, setKeyword] = useState("");
  const [statusTab, setStatusTab] = useState<OrderStatusTab>("draft");
  const [loading, setLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const columnKeys = getOrderListColumnKeys(mode);

  async function fetchEntity(entity: string) {
    const fetchPageSize = 100;
    let fetchPage = 1;
    let rows: Row[] = [];
    let total = 0;

    do {
      const response = await fetch(`/api/entities/${entity}?page=${fetchPage}&pageSize=${fetchPageSize}`);
      const data = await response.json();
      rows = [...rows, ...((data.rows ?? []) as Row[])];
      total = Number(data.total ?? rows.length);
      fetchPage += 1;
    } while (rows.length < total);

    return rows;
  }

  async function loadData() {
    setLoading(true);
    const [masterRows, detailRows, requestItemRows, requestRows] = await Promise.all([
      fetchEntity(masterConfig.key),
      fetchEntity(detailConfig.key),
      fetchEntity("request-items"),
      fetchEntity("requests"),
    ]);
    setMasters(masterRows);
    setDetails(detailRows);
    setRequestItems(requestItemRows);
    setRequests(requestRows);
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, [masterConfig.key, detailConfig.key]);

  useEffect(() => {
    setPage(1);
  }, [keyword, statusTab, pageSize]);

  const rowsWithTotals = useMemo<Row[]>(() => {
    const requestByNo = new Map(requests.map((request) => [String(request.requestNo), request]));

    return masters.map((master) => ({
      ...master,
      batchName:
        mode === "purchase"
          ? getBatchNamesForPurchaseOrder(master, requestByNo)
          : master.batchName,
      totalQuantity: getTotalQuantity(mode, master, details, requestItems),
      purchaseTotalAmount:
        mode === "purchase" ? getPurchaseTotalAmount(master, details, requestItems) : null,
    }));
  }, [details, masters, mode, requestItems, requests]);

  const statusCounts = useMemo(
    () => countOrderStatusTabs(mode, rowsWithTotals),
    [mode, rowsWithTotals],
  );

  const rows = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const statusRows = rowsWithTotals.filter((row) => {
      const confirmed = isConfirmedOrderStatus(mode, row.status);
      return statusTab === "confirmed" ? confirmed : !confirmed;
    });

    if (!normalizedKeyword) return statusRows;
    return statusRows.filter((row) =>
      [masterConfig.primaryKey, "poNo", "requestNo", "sourceRequestNos", "status", "batchName", "currency"].some((key) =>
        String(row[key] ?? "").toLowerCase().includes(normalizedKeyword),
      ),
    );
  }, [keyword, masterConfig.primaryKey, mode, rowsWithTotals, statusTab]);
  const pagedRows = useMemo(() => paginateRows(rows, page, pageSize), [page, pageSize, rows]);

  async function confirmRequestOrder(requestNo: string) {
    setConfirmingId(requestNo);
    await fetch("/api/procurement/from-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestNo }),
    });
    await loadData();
    setConfirmingId("");
    setStatusTab("confirmed");
  }

  async function confirmPurchaseOrder(poNo: string) {
    setConfirmingId(poNo);
    await fetch(`/api/procurement/${encodeURIComponent(poNo)}/confirm`, {
      method: "POST",
    });
    await loadData();
    setConfirmingId("");
  }

  async function deleteOrder(id: string) {
    const message =
      mode === "requests"
        ? `确认删除需求单 ${id} 吗？未生成月账单和预付款时，将同步删除该需求单明细及关联采购草稿。`
        : `确认删除采购单 ${id} 吗？未生成月账单和预付款时，将同步删除采购明细及物流草稿。`;
    if (!confirm(message)) return;
    setDeletingId(id);
    const response = await fetch(`/api/entities/${masterConfig.key}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = await response.json().catch(() => ({}));
    setDeletingId("");
    if (!response.ok) {
      alert(data.error ?? "删除失败");
      return;
    }
    await loadData();
  }

  function exportOrders() {
    const columns: Array<[string, string, string?]> =
      mode === "requests"
        ? [
            ["requestNo", "需求单号"], ["countryCode", "国家"], ["batchName", "批次号"], ["status", "状态"],
            ["totalQuantity", "总数量"], ["plannedDeliveryDate", "计划交付日期", "date"],
            ["createdAt", "创建日期", "datetime"], ["updatedAt", "更新日期", "datetime"],
          ]
        : [
            ["poNo", "PO订单号"], ["requestNo", "来源需求单"], ["batchName", "批次号"], ["status", "状态"],
            ["currency", "币种"], ["totalQuantity", "总数量"], ["purchaseTotalAmount", "采购总金额", "money"],
            ["createdAt", "创建日期", "datetime"], ["updatedAt", "更新日期", "datetime"],
          ];
    const worksheet = XLSX.utils.aoa_to_sheet([
      columns.map(([, label]) => label),
      ...rows.map((row) => columns.map(([key, , type]) => formatValue(row[key], type))),
    ]);
    worksheet["!cols"] = columns.map(([, label]) => ({ wch: Math.max(12, label.length * 2 + 4) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, mode === "requests" ? "需求单列表" : "采购订单列表");
    XLSX.writeFile(workbook, `${mode === "requests" ? "需求单列表" : "采购订单列表"}-${statusTab}.xlsx`);
  }

  const hasActionColumn = mode === "purchase" || mode === "requests";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-[#303133]">
          {mode === "requests" ? "需求单列表" : "采购清单列表"}
        </h1>
        <p className="mt-1 text-sm text-[#909399]">
          {mode === "requests"
            ? "需求单按草稿和已确认分区展示，点击需求单号进入明细页面。"
            : "采购清单按草稿和已确认分区展示，草稿确认后会自动生成物流单据。"}
        </p>
      </div>

      <Panel>
        <div className="flex items-center gap-2 border-b border-[#ebeef5] bg-[#fafafa] p-3">
          <Button tone={statusTab === "draft" ? "primary" : "default"} onClick={() => setStatusTab("draft")}>
            草稿
            <span className="ml-1 rounded bg-white/35 px-1.5 text-xs">{statusCounts.draft}</span>
          </Button>
          <Button
            tone={statusTab === "confirmed" ? "primary" : "default"}
            onClick={() => setStatusTab("confirmed")}
          >
            已确认
            <span className="ml-1 rounded bg-white/35 px-1.5 text-xs">{statusCounts.confirmed}</span>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-[#ebeef5] p-4">
          <Input
            placeholder={mode === "requests" ? "搜索需求单号/状态/批次" : "搜索PO单号/需求单号/状态"}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
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
            <Button tone="warning" onClick={exportOrders}>
              <FileDown size={15} />
              导出 Excel
            </Button>
          </div>
          {shouldShowPurchaseSourceGenerator(mode) ? <div className="ml-auto" /> : null}
        </div>

        <div className="table-scroll overflow-auto">
          <table className="min-w-[1180px] border-collapse text-sm">
            <thead className="bg-[#f5f7fa] text-[#303133]">
              <tr>
                <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">
                  {mode === "requests" ? "需求单号" : "PO订单号"}
                </th>
                {mode === "requests" ? (
                  <>
                    <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">国家</th>
                    <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">批次号</th>
                  </>
                ) : null}
                {mode === "purchase" ? (
                  <th className="w-[260px] min-w-[260px] border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">
                    来源需求单
                  </th>
                ) : null}
                {mode === "purchase" ? (
                  <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">
                    批次号
                  </th>
                ) : null}
                <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">状态</th>
                {mode === "purchase" ? (
                  <>
                    <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">币种</th>
                  </>
                ) : null}
                <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">总数量</th>
                {mode === "purchase" ? (
                  <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">
                    采购总金额
                  </th>
                ) : null}
                {mode === "requests" ? (
                  <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">
                    计划交付日期
                  </th>
                ) : null}
                <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">创建时间</th>
                <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">更新时间</th>
                {hasActionColumn ? (
                  <th className="sticky right-0 border-b border-[#ebeef5] bg-[#f5f7fa] px-3 py-3 text-left font-medium">
                    操作
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => {
                const id = String(row[masterConfig.primaryKey]);
                const primaryDisplayValue = getOrderListPrimaryDisplayValue(mode, row);
                const confirmed = isConfirmedOrderStatus(mode, row.status);
                return (
                  <tr className="hover:bg-[#fafafa]" key={id}>
                    <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                      <Link
                        className="font-medium text-[#1890ff] hover:underline"
                        href={getOrderDetailRoute(mode, id)}
                      >
                        {primaryDisplayValue}
                      </Link>
                    </td>
                    {mode === "requests" ? (
                      <>
                        <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                          {formatValue(row.countryCode)}
                        </td>
                        <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                          {formatValue(row.batchName)}
                        </td>
                      </>
                    ) : null}
                    {mode === "purchase" ? (
                      <td className="w-[260px] max-w-[260px] border-b border-r border-[#ebeef5] px-3 py-3">
                        <span className="block truncate" title={String(row.requestNo ?? "")}>{formatValue(row.requestNo)}</span>
                      </td>
                    ) : null}
                    {mode === "purchase" ? (
                      <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                        {formatValue(row.batchName)}
                      </td>
                    ) : null}
                    <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                      <StatusBadge mode={mode} value={String(row.status ?? "-")} />
                    </td>
                    {mode === "purchase" ? (
                      <>
                        <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                          {formatValue(row.currency)}
                        </td>
                      </>
                    ) : null}
                    <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                      {formatValue(row.totalQuantity)}
                    </td>
                    {mode === "purchase" ? (
                      <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                        {formatValue(row.purchaseTotalAmount)}
                      </td>
                    ) : null}
                    {mode === "requests" ? (
                      <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                        {formatValue(row.plannedDeliveryDate, "date")}
                      </td>
                    ) : null}
                    <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                      {formatValue(row.createdAt, "datetime")}
                    </td>
                    <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                      {formatValue(row.updatedAt, "datetime")}
                    </td>
                    {hasActionColumn ? (
                      <td className="sticky right-0 whitespace-nowrap border-b border-[#ebeef5] bg-white px-3 py-3">
                        {mode === "requests" ? (
                          <div className="flex items-center gap-2">
                            <Link href={getOrderDetailRoute(mode, id)}>
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
                            <Button disabled={deletingId === id} tone="danger" onClick={() => void deleteOrder(id)}>
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
                  <td className="py-12 text-center text-[#909399]" colSpan={columnKeys.length}>
                    {loading ? "加载中..." : "暂无数据"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={rows.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </Panel>
    </div>
  );
}

function StatusBadge({ mode, value }: { mode: PageMode; value: string }) {
  const tone = isConfirmedOrderStatus(mode, value)
    ? "border-[#13ce66] bg-[#f0fff7] text-[#13a85a]"
    : value === "草稿" || value === "待采购"
      ? "border-[#ffba00] bg-[#fff8e6] text-[#b88600]"
      : "border-[#dcdfe6] bg-white text-[#606266]";

  return <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${tone}`}>{value}</span>;
}

function getTotalQuantity(
  mode: PageMode,
  master: Row,
  details: Row[],
  requestItems: Row[],
) {
  if (mode === "requests") {
    const requestNo = String(master.requestNo ?? "");
    return details
      .filter((detail) => String(detail.requestNo) === requestNo)
      .reduce((total, detail) => total + Number(detail.quantity ?? 0), 0);
  }

  const purchaseOrderId = String(master.purchaseOrderId ?? "");
  const poNo = String(master.poNo ?? "");
  const itemIds = new Set(
    details
      .filter((detail) =>
        purchaseOrderId
          ? String(detail.purchaseOrderId ?? "") === purchaseOrderId
          : String(detail.poNo) === poNo,
      )
      .map((detail) => String(detail.requestItemId)),
  );
  return requestItems
    .filter((item) => itemIds.has(String(item.id)))
    .reduce((total, item) => total + Number(item.quantity ?? 0), 0);
}

function getPurchaseTotalAmount(master: Row, details: Row[], requestItems: Row[]) {
  const purchaseOrderId = String(master.purchaseOrderId ?? "");
  const poNo = String(master.poNo ?? "");
  const requestItemById = new Map(requestItems.map((item) => [String(item.id), item]));

  return calculatePurchaseTotalAmount(
    details
      .filter((detail) =>
        purchaseOrderId
          ? String(detail.purchaseOrderId ?? "") === purchaseOrderId
          : String(detail.poNo) === poNo,
      )
      .map((detail) => ({
        quantity: Number(requestItemById.get(String(detail.requestItemId))?.quantity ?? 0),
        unitPrice: Number(detail.unitPrice ?? 0),
      })),
  );
}

function getBatchNamesForPurchaseOrder(master: Row, requestByNo: Map<string, Row>) {
  const requestNos = String(master.sourceRequestNos ?? master.requestNo ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(
    new Set(requestNos.map((requestNo) => String(requestByNo.get(requestNo)?.batchName ?? "")).filter(Boolean)),
  ).join(",");
}

function formatValue(value: unknown, type?: string) {
  return formatDisplayValue(value as string | number | boolean | null | undefined, type);
}
