"use client";

import { useEffect, useRef, useState } from "react";
import { FileDown, RefreshCw, Search } from "lucide-react";
import { formatDisplayValue } from "@/lib/display-format";
import { exportRowsToXlsx } from "@/lib/client-xlsx-export";
import { fetchAllEntityRows } from "@/lib/client-entity-fetch";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { PURCHASE_PRODUCT_LINE_COLUMNS } from "@/lib/purchase-lines";
import { PaginationBar } from "./pagination-bar";
import { Button, Input, Panel } from "./ui";

type Row = Record<string, string | number | boolean | null>;
type ListResponse = { rows: Row[]; total: number; page: number; pageSize: number; totalPages: number };

const columns = PURCHASE_PRODUCT_LINE_COLUMNS;

export function PurchaseProductLinesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [keyword, setKeyword] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [countries, setCountries] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const pageSizeRef = useRef(pageSize);
  const skipNextPageChangeRef = useRef(false);

  function buildParams(nextPage: number, nextPageSize: number, exportAll = false, nextCountryCode = countryCode) {
    const params = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
    if (keyword.trim()) params.set("keyword", keyword.trim());
    if (nextCountryCode.trim()) params.set("countryCode", nextCountryCode.trim());
    if (exportAll) params.set("export", "1");
    return params;
  }

  async function fetchData(nextPage: number, nextPageSize: number, exportAll = false, nextCountryCode = countryCode): Promise<ListResponse> {
    const response = await fetch(`/api/purchase/product-lines?${buildParams(nextPage, nextPageSize, exportAll, nextCountryCode)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "采购明细加载失败");
    return data as ListResponse;
  }

  async function loadData(nextPage = page, nextPageSize = pageSizeRef.current, nextCountryCode = countryCode) {
    setLoading(true);
    try {
      const data = await fetchData(nextPage, nextPageSize, false, nextCountryCode);
      setRows(data.rows ?? []);
      setTotal(Number(data.total ?? 0));
      if (data.page !== nextPage) setPage(data.page);
    } catch (error) {
      setRows([]);
      setTotal(0);
      alert(error instanceof Error ? error.message : "采购明细加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData(1, pageSizeRef.current);
  }, []);

  useEffect(() => {
    void fetchAllEntityRows<Row>("countries").then(setCountries).catch(() => setCountries([]));
  }, []);

  async function exportRows() {
    try {
      const data = await fetchData(1, pageSizeRef.current, true, countryCode);
      exportRowsToXlsx({
        columns: columns.map((column) => ({ ...column, format: (value) => formatValue(value) })),
        rows: data.rows,
        sheetName: "采购明细一览",
        fileName: "采购明细一览.xlsx",
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "采购明细导出失败");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-[#303133]">采购明细一览</h1>
        <p className="mt-1 text-sm text-[#909399]">按已确认采购订单中的产品实例集中展示实例编码、名称、数量、币种和单价。</p>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#ebeef5] p-4">
          <Input placeholder="搜索PO订单号/需求单号/实例编码/名称" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <select className="h-9 min-w-32 rounded border border-[#dcdfe6] bg-white px-3 text-sm outline-none focus:border-[#1890ff]" value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
            <option value="">全部国家</option>
            {countries
              .map((country) => ({ code: String(country.code ?? "").trim(), nameZh: String(country.nameZh ?? "").trim() }))
              .filter((country) => country.code)
              .sort((left, right) => left.code.localeCompare(right.code))
              .map((country) => <option key={country.code} value={country.code}>{country.nameZh ? `${country.code} - ${country.nameZh}` : country.code}</option>)}
          </select>
          <Button tone="primary" onClick={() => { setPage(1); void loadData(1, pageSizeRef.current, countryCode); }}>
            <Search size={15} />
            查询
          </Button>
          <Button onClick={() => void loadData()}>
            <RefreshCw size={15} />
            刷新
          </Button>
          <Button tone="warning" onClick={() => void exportRows()}>
            <FileDown size={15} />
            导出 Excel
          </Button>
        </div>

        <div className="table-scroll overflow-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-[#f5f7fa] text-[#303133]"><tr>{columns.map((column) => <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={column.key}>{column.label}</th>)}</tr></thead>
            <tbody>
              {rows.map((row) => <tr className="hover:bg-[#fafafa]" key={String(row.id)}>{columns.map((column) => <td className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3" key={column.key}>{formatValue(row[column.key])}</td>)}</tr>)}
              {!rows.length ? <tr><td className="py-12 text-center text-[#909399]" colSpan={columns.length}>{loading ? "加载中..." : "暂无数据"}</td></tr> : null}
            </tbody>
          </table>
        </div>
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

function formatValue(value: unknown, type?: string) {
  return formatDisplayValue(value as string | number | boolean | null | undefined, type);
}
