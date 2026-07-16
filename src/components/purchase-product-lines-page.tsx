"use client";

import { useEffect, useMemo, useState } from "react";
import { FileDown, RefreshCw, Search } from "lucide-react";
import { formatDisplayValue } from "@/lib/display-format";
import { exportRowsToXlsx } from "@/lib/client-xlsx-export";
import { DEFAULT_PAGE_SIZE, paginateRows } from "@/lib/pagination";
import {
  PURCHASE_PRODUCT_LINE_COLUMNS,
  buildPurchaseProductLines,
  filterPurchaseProductLines,
} from "@/lib/purchase-lines";
import { PaginationBar } from "./pagination-bar";
import { Button, Input, Panel } from "./ui";

type Row = Record<string, string | number | boolean | null>;

const columns = PURCHASE_PRODUCT_LINE_COLUMNS;

export function PurchaseProductLinesPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<Row[]>([]);
  const [purchaseItems, setPurchaseItems] = useState<Row[]>([]);
  const [requestItems, setRequestItems] = useState<Row[]>([]);
  const [requests, setRequests] = useState<Row[]>([]);
  const [instanceModels, setInstanceModels] = useState<Row[]>([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  async function fetchEntity(entity: string) {
    const rows: Row[] = [];
    let page = 1;
    let total = 0;
    do {
      const response = await fetch(`/api/entities/${entity}?page=${page}&pageSize=100`);
      const data = await response.json();
      rows.push(...((data.rows ?? []) as Row[]));
      total = Number(data.total ?? rows.length);
      page += 1;
    } while (rows.length < total);
    return rows;
  }

  async function loadData() {
    setLoading(true);
    const [orders, items, requestRows, requestMasterRows, modelRows] = await Promise.all([
      fetchEntity("purchase-orders"),
      fetchEntity("purchase-order-items"),
      fetchEntity("request-items"),
      fetchEntity("requests"),
      fetchEntity("instance-models"),
    ]);
    setPurchaseOrders(orders);
    setPurchaseItems(items);
    setRequestItems(requestRows);
    setRequests(requestMasterRows);
    setInstanceModels(modelRows);
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  const rows = useMemo(() => {
    const merged = buildPurchaseProductLines({
      confirmedOnly: true,
      purchaseOrders: purchaseOrders as any,
      purchaseItems: purchaseItems as any,
      requestItems: requestItems as any,
      requests: requests as any,
      instanceModels: instanceModels as any,
    });
    return filterPurchaseProductLines(merged, keyword);
  }, [instanceModels, keyword, purchaseItems, purchaseOrders, requestItems, requests]);
  const pagedRows = useMemo(() => paginateRows(rows, page, pageSize), [page, pageSize, rows]);

  function exportRows() {
    exportRowsToXlsx({
      columns: columns.map((column) => ({ ...column, format: (value) => formatValue(value) })),
      rows,
      sheetName: "采购明细一览",
      fileName: "采购明细一览.xlsx",
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-[#303133]">采购明细一览</h1>
        <p className="mt-1 text-sm text-[#909399]">
          按采购订单中的产品实例集中展示实例编码、名称、数量、币种和单价。
        </p>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#ebeef5] p-4">
          <Input
            placeholder="搜索PO订单号/需求单号/实例编码/名称"
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
            }}
          />
          <Button tone="primary">
            <Search size={15} />
            查询
          </Button>
          <Button onClick={() => void loadData()}>
            <RefreshCw size={15} />
            刷新
          </Button>
          <div>
            <Button tone="warning" onClick={exportRows}>
              <FileDown size={15} />
              导出 Excel
            </Button>
          </div>
        </div>

        <div className="table-scroll overflow-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-[#f5f7fa] text-[#303133]">
              <tr>
                {columns.map((column) => (
                  <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={column.key}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <tr className="hover:bg-[#fafafa]" key={row.id}>
                  {columns.map((column) => (
                    <td className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3" key={column.key}>
                      {formatValue(row[column.key])}
                    </td>
                  ))}
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td className="py-12 text-center text-[#909399]" colSpan={columns.length}>
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

function formatValue(value: unknown, type?: string) {
  return formatDisplayValue(value as string | number | boolean | null | undefined, type);
}
