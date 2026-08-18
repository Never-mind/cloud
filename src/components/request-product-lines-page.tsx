"use client";

import { useEffect, useRef, useState } from "react";
import { FileDown, RefreshCw, Search } from "lucide-react";
import { formatDisplayValue } from "@/lib/display-format";
import { exportRowsToXlsx } from "@/lib/client-xlsx-export";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { PaginationBar } from "./pagination-bar";
import { Button, Input, Panel } from "./ui";

type Row = Record<string, string | number | boolean | null>;
type ListResponse = { rows: Row[]; total: number; page: number; pageSize: number; totalPages: number };

const columns = [
  { key: "countryCode", label: "国家" },
  { key: "batchName", label: "批次" },
  { key: "requestNo", label: "需求单号" },
  { key: "deviceCode", label: "设备编码" },
  { key: "modelCode", label: "机型" },
  { key: "nameEn", label: "英文名称" },
  { key: "supplierName", label: "供应商" },
  { key: "quantity", label: "节点数量" },
  { key: "plannedDeliveryDate", label: "交付时间" },
  { key: "createdAt", label: "创建时间" },
  { key: "updatedAt", label: "修改时间" },
];

export function RequestProductLinesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const pageSizeRef = useRef(pageSize);
  const skipNextPageChangeRef = useRef(false);

  function buildParams(nextPage: number, nextPageSize: number, exportAll = false) {
    const params = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
    if (keyword.trim()) params.set("keyword", keyword.trim());
    if (exportAll) params.set("export", "1");
    return params;
  }

  async function fetchData(nextPage: number, nextPageSize: number, exportAll = false): Promise<ListResponse> {
    const response = await fetch(`/api/requests/product-lines?${buildParams(nextPage, nextPageSize, exportAll)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "需求明细加载失败");
    return data as ListResponse;
  }

  async function loadData(nextPage = page, nextPageSize = pageSizeRef.current) {
    setLoading(true);
    try {
      const data = await fetchData(nextPage, nextPageSize);
      setRows(data.rows ?? []);
      setTotal(Number(data.total ?? 0));
      if (data.page !== nextPage) setPage(data.page);
    } catch (error) {
      setRows([]);
      setTotal(0);
      alert(error instanceof Error ? error.message : "需求明细加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData(1, pageSizeRef.current);
  }, []);

  async function exportRows() {
    try {
      const data = await fetchData(1, pageSizeRef.current, true);
      exportRowsToXlsx({
        columns: columns.map((column) => ({ ...column, format: (value) => formatValue(value) })),
        rows: data.rows,
        sheetName: "需求明细一览",
        fileName: "需求明细一览.xlsx",
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "需求明细导出失败");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-[#303133]">需求明细一览</h1>
        <p className="mt-1 text-sm text-[#909399]">从需求单同步展示国家、需求单号、产品实例、供应商、数量和交付时间等信息。</p>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#ebeef5] p-4">
          <Input placeholder="搜索国家/批次/需求单号/设备编码/机型/供应商" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <Button tone="primary" onClick={() => { setPage(1); void loadData(1, pageSizeRef.current); }}>
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
            <thead className="bg-[#f5f7fa] text-[#303133]">
              <tr>{columns.map((column) => <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={column.key}>{column.label}</th>)}</tr>
            </thead>
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
