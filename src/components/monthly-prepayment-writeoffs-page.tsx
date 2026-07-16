"use client";

import { useEffect, useMemo, useState } from "react";
import { FileDown, RefreshCw, Search } from "lucide-react";
import { formatDisplayValue } from "@/lib/display-format";
import { DEFAULT_PAGE_SIZE, paginateRows } from "@/lib/pagination";
import { PaginationBar } from "./pagination-bar";
import { Button, Input, Panel } from "./ui";

type Row = Record<string, string | number | boolean | null>;

const columns: Array<{ key: string; label: string; type?: string }> = [
  { key: "writeOffMonth", label: "核销月份", type: "date" },
  { key: "contractNo", label: "预付款合同号" },
  { key: "countryCode", label: "国家" },
  { key: "batchName", label: "批次号" },
  { key: "undertakingUnitCode", label: "承接单位" },
  { key: "supplierCode", label: "供应商" },
  { key: "requestNo", label: "需求单号" },
  { key: "poNo", label: "PO单号" },
  { key: "deviceCode", label: "实例编码" },
  { key: "modelCode", label: "机型" },
  { key: "nameEn", label: "英文名称" },
  { key: "quantity", label: "数量" },
  { key: "currency", label: "币种" },
  { key: "originalAmount", label: "合同总价", type: "money" },
  { key: "monthlyAmount", label: "月核销金额", type: "money" },
  { key: "lineType", label: "明细类型", type: "lineType" },
  { key: "sourceType", label: "来源" },
  { key: "adjustmentNo", label: "调整单号" },
] as const;

export function MonthlyPrepaymentWriteOffsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [keyword, setKeyword] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [batchName, setBatchName] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  async function loadData() {
    setLoading(true);
    setPage(1);
    const params = new URLSearchParams();
    if (keyword.trim()) params.set("keyword", keyword.trim());
    if (countryCode.trim()) params.set("countryCode", countryCode.trim());
    if (batchName.trim()) params.set("batchName", batchName.trim());
    if (startMonth) params.set("startMonth", startMonth);
    if (endMonth) params.set("endMonth", endMonth);
    try {
      const response = await fetch(`/api/prepayments/monthly-writeoffs?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "预付款核销明细加载失败");
      setRows(data.rows ?? []);
    } catch (error) {
      setRows([]);
      alert(error instanceof Error ? error.message : "预付款核销明细加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const totalAmount = useMemo(
    () => rows.reduce((total, row) => total + Number(row.monthlyAmount ?? 0), 0),
    [rows],
  );
  const pagedRows = useMemo(() => paginateRows(rows, page, pageSize), [page, pageSize, rows]);

  function exportCsv() {
    const header = columns.map((column) => column.label);
    const body = rows.map((row) =>
      columns.map((column) => `"${String(formatValue(row[column.key], column.type)).replaceAll('"', '""')}"`).join(","),
    );
    const csv = [header.join(","), ...body].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "prepayment-monthly-writeoffs.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-[#303133]">预付款每月核销明细</h1>
        <p className="mt-1 text-sm text-[#909399]">查看已确认预付款合同按24个月生成的每月核销金额。</p>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#ebeef5] p-4">
          <Input placeholder="搜索合同/批次/需求单/PO/实例编码" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <Input placeholder="国家" value={countryCode} onChange={(event) => setCountryCode(event.target.value)} />
          <Input placeholder="批次" value={batchName} onChange={(event) => setBatchName(event.target.value)} />
          <Input type="date" value={startMonth} onChange={(event) => setStartMonth(event.target.value)} />
          <Input type="date" value={endMonth} onChange={(event) => setEndMonth(event.target.value)} />
          <Button tone="primary" onClick={() => void loadData()}>
            <Search size={15} />
            查询
          </Button>
          <Button onClick={() => void loadData()}>
            <RefreshCw size={15} />
            刷新
          </Button>
          <Button className="ml-auto" tone="warning" onClick={exportCsv}>
            <FileDown size={15} />
            导出
          </Button>
        </div>
        <div className="border-b border-[#ebeef5] bg-[#fafafa] px-4 py-3 text-sm text-[#606266]">
          当前筛选共 {rows.length} 条，月核销金额合计 {formatValue(totalAmount, "money")}
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
                <tr className="hover:bg-[#fafafa]" key={String(row.id)}>
                  {columns.map((column) => (
                    <td className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3" key={column.key}>
                      {formatValue(row[column.key], column.type)}
                    </td>
                  ))}
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td className="py-12 text-center text-[#909399]" colSpan={columns.length}>
                    {loading ? "加载中..." : "暂无核销明细"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <PaginationBar page={page} pageSize={pageSize} total={rows.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </Panel>
    </div>
  );
}

function formatValue(value: unknown, type?: string) {
  return formatDisplayValue(value as string | number | boolean | null | undefined, type);
}
