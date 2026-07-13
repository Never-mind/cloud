"use client";

import { useEffect, useMemo, useState } from "react";
import { FileDown, RefreshCw, Search } from "lucide-react";
import { formatDisplayValue } from "@/lib/display-format";
import { DEFAULT_PAGE_SIZE, paginateRows } from "@/lib/pagination";
import { buildRequestProductLines } from "@/lib/request-lines";
import { PaginationBar } from "./pagination-bar";
import { Button, Input, Panel } from "./ui";

type Row = Record<string, string | number | boolean | null>;

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
  const [requests, setRequests] = useState<Row[]>([]);
  const [requestItems, setRequestItems] = useState<Row[]>([]);
  const [instanceModels, setInstanceModels] = useState<Row[]>([]);
  const [suppliers, setSuppliers] = useState<Row[]>([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

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
    const [requestRows, itemRows, modelRows, supplierRows] = await Promise.all([
      fetchEntity("requests"),
      fetchEntity("request-items"),
      fetchEntity("instance-models"),
      fetchEntity("suppliers"),
    ]);
    setRequests(requestRows);
    setRequestItems(itemRows);
    setInstanceModels(modelRows);
    setSuppliers(supplierRows);
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [keyword, pageSize]);

  const rows = useMemo(() => {
    const merged = buildRequestProductLines({
      confirmedOnly: true,
      requests: requests as any,
      requestItems: requestItems as any,
      instanceModels: instanceModels as any,
      suppliers: suppliers as any,
    });
    const normalizedKeyword = keyword.trim().toLowerCase();

    if (!normalizedKeyword) return merged;
    return merged.filter((row) =>
      [row.countryCode, row.batchName, row.requestNo, row.deviceCode, row.modelCode, row.nameEn, row.supplierName]
        .some((value) => String(value ?? "").toLowerCase().includes(normalizedKeyword)),
    );
  }, [instanceModels, keyword, requestItems, requests, suppliers]);
  const pagedRows = useMemo(() => paginateRows(rows, page, pageSize), [page, pageSize, rows]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-[#303133]">需求明细一览</h1>
        <p className="mt-1 text-sm text-[#909399]">
          从需求单同步展示国家、需求单号、产品实例、供应商、数量和交付时间等信息。
        </p>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#ebeef5] p-4">
          <Input
            placeholder="搜索国家/批次/需求单号/设备编码/机型/供应商"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Button tone="primary">
            <Search size={15} />
            查询
          </Button>
          <Button onClick={() => void loadData()}>
            <RefreshCw size={15} />
            刷新
          </Button>
          <a href={`/api/entities/request-items/export?keyword=${encodeURIComponent(keyword)}`}>
            <Button tone="warning">
              <FileDown size={15} />
              导出 Excel
            </Button>
          </a>
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
                      {formatValue(row[column.key as keyof typeof row])}
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
