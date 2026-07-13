"use client";

import { useEffect, useMemo, useState } from "react";
import { FilePlus2, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatDateInputValue, formatDisplayValue } from "@/lib/display-format";
import { Button, Input, Panel } from "./ui";

type Row = {
  id: string;
  countryCode: string;
  batchName: string;
  requestNo: string;
  poNo: string;
  deviceCode: string;
  modelCode: string;
  nameEn: string;
  quantity: number;
  currency: string;
  actualUnitPrice: number;
  actualTotalAmount: number;
};

const columns = [
  { key: "countryCode", label: "国家" },
  { key: "batchName", label: "批次号" },
  { key: "requestNo", label: "需求单号" },
  { key: "poNo", label: "PO单号" },
  { key: "deviceCode", label: "实例编码" },
  { key: "modelCode", label: "机型" },
  { key: "nameEn", label: "英文名称" },
  { key: "quantity", label: "数量" },
  { key: "currency", label: "币种" },
  { key: "actualUnitPrice", label: "实际单价" },
  { key: "actualTotalAmount", label: "实际总价" },
] as const;

export function PrepaymentAvailablePage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [contractNo, setContractNo] = useState(`PPC-${formatDateInputValue(new Date()).replaceAll("-", "")}`);
  const [effectiveDate, setEffectiveDate] = useState(formatDateInputValue(new Date()));
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  async function loadData() {
    setLoading(true);
    const response = await fetch("/api/prepayments/available");
    const data = await response.json();
    setRows(data.rows ?? []);
    setSelectedIds([]);
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredRows = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) return rows;
    return rows.filter((row) =>
      [row.batchName, row.requestNo, row.poNo, row.deviceCode, row.modelCode, row.nameEn].some((value) =>
        String(value ?? "").toLowerCase().includes(normalizedKeyword),
      ),
    );
  }, [keyword, rows]);

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds],
  );
  const summary = useMemo(
    () => ({
      selectedRows: selectedRows.length,
      totalQuantity: selectedRows.reduce((total, row) => total + Number(row.quantity ?? 0), 0),
      actualTotalAmount: roundMoney(selectedRows.reduce((total, row) => total + Number(row.actualTotalAmount ?? 0), 0)),
    }),
    [selectedRows],
  );
  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedIds.includes(row.id));

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function toggleAllVisible() {
    const visibleIds = filteredRows.map((row) => row.id);
    setSelectedIds((current) => {
      if (visibleIds.every((id) => current.includes(id))) {
        return current.filter((id) => !visibleIds.includes(id));
      }
      return Array.from(new Set([...current, ...visibleIds]));
    });
  }

  async function createDraft() {
    setCreating(true);
    const response = await fetch("/api/prepayments/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractNo, effectiveDate, purchaseOrderItemIds: selectedIds }),
    });
    const data = await response.json();
    setCreating(false);
    if (response.ok) {
      router.push(`/finance/prepayment-contracts/${encodeURIComponent(String(data.contractNo))}`);
    } else {
      alert(data.error ?? "生成失败");
    }
  }

  return (
    <div className="space-y-5 pb-24">
      <div>
        <h1 className="text-xl font-medium text-[#303133]">待生成预付款实例</h1>
        <p className="mt-1 text-sm text-[#909399]">
          仅展示已确认采购、且需求单已下单、尚未被预付款草稿或合同占用的实例。
        </p>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#ebeef5] p-4">
          <Input
            placeholder="搜索批次/需求单/PO/实例编码/机型"
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
          <div className="ml-auto flex max-w-[520px] flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1">
              <span className="mb-1 block text-xs font-medium text-[#606266]">预付款合同号</span>
          <Input
            className="w-full"
            placeholder="预付款合同号"
            value={contractNo}
            onChange={(event) => setContractNo(event.target.value)}
          />
            </label>
            <label className="min-w-[160px]">
              <span className="mb-1 block text-xs font-medium text-[#606266]">合同生效日期</span>
          <Input
            type="date"
            value={effectiveDate}
            onChange={(event) => setEffectiveDate(event.target.value)}
          />
            </label>
            <p className="w-full text-xs text-[#909399]">
              勾选实例后，系统会按这里填写的合同号和生效日期生成预付款合同草稿。
            </p>
          </div>
        </div>

        <div className="table-scroll overflow-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-[#f5f7fa] text-[#303133]">
              <tr>
                <th className="w-12 border-b border-r border-[#ebeef5] px-3 py-3 text-left">
                  <input checked={allVisibleSelected} type="checkbox" onChange={toggleAllVisible} />
                </th>
                {columns.map((column) => (
                  <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={column.key}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr className="hover:bg-[#fafafa]" key={row.id}>
                  <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                    <input checked={selectedIds.includes(row.id)} type="checkbox" onChange={() => toggleSelected(row.id)} />
                  </td>
                  {columns.map((column) => (
                    <td className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3" key={column.key}>
                      {formatValue(row[column.key])}
                    </td>
                  ))}
                </tr>
              ))}
              {!filteredRows.length ? (
                <tr>
                  <td className="py-12 text-center text-[#909399]" colSpan={columns.length + 1}>
                    {loading ? "加载中..." : "暂无可生成预付款合同的实例"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      {selectedIds.length ? (
        <div className="fixed bottom-5 left-[230px] right-5 z-20 border border-[#1890ff] bg-white p-4 shadow-lg">
          <div className="flex flex-wrap items-center gap-5 text-sm text-[#606266]">
            <span>已选实例：<b className="text-[#303133]">{summary.selectedRows}</b></span>
            <span>已选数量：<b className="text-[#303133]">{summary.totalQuantity}</b></span>
            <span>实际总价：<b className="text-[#303133]">{formatValue(summary.actualTotalAmount)}</b></span>
            <span>预付款合同总价金额：<b className="text-[#303133]">{formatValue(summary.actualTotalAmount)}</b></span>
            <Button className="ml-auto" disabled={creating || !contractNo || !selectedIds.length} tone="primary" onClick={() => void createDraft()}>
              <FilePlus2 size={15} />
              生成预付款合同草稿
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatValue(value: unknown) {
  return formatDisplayValue(value as string | number | boolean | null | undefined);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
