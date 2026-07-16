"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatDisplayValue } from "@/lib/display-format";
import { Button, Input, Panel } from "./ui";

type Row = {
  purchaseOrderItemId: string;
  countryCode: string;
  batchName: string;
  requestNo: string;
  poNo: string;
  deviceCode: string;
  modelCode: string;
  nameEn: string;
  supplierId: string;
  undertakingUnitId: string;
  supplierCode: string;
  undertakingUnitCode: string;
  quantity: number;
  actualCurrency: string;
  actualUnitPrice: number;
  taxExcludedUnitPrice: number;
  taxSurcharge: number;
  vatRate: number;
  instanceContractNo: string;
  contractCurrency: string;
  first24MonthPrice: number;
  next36MonthPrice: number;
  selfCalculatedUnitPrice: number;
  differenceUnitPrice: number;
  differenceTotalPrice: number;
  startMonth: string;
};

type InstanceContract = {
  contractNo: string;
  countryCode: string;
  deviceCode: string;
  currency: string;
  first24MonthPriceUSD: number;
  next36MonthPriceUSD: number;
};

const columns: Array<{ key: keyof Row; label: string; type?: string }> = [
  { key: "countryCode", label: "国家" },
  { key: "batchName", label: "批次号" },
  { key: "requestNo", label: "需求单号" },
  { key: "deviceCode", label: "实例编码" },
  { key: "modelCode", label: "机型" },
  { key: "nameEn", label: "英文名称" },
  { key: "undertakingUnitCode", label: "承接单位" },
  { key: "supplierCode", label: "供应商" },
  { key: "quantity", label: "数量" },
  { key: "actualCurrency", label: "币种" },
  { key: "actualUnitPrice", label: "实际单价", type: "money" },
  { key: "taxExcludedUnitPrice", label: "不含税单价", type: "money" },
  { key: "taxSurcharge", label: "税费加成", type: "money" },
  { key: "instanceContractNo", label: "实例合同号" },
  { key: "contractCurrency", label: "合同币种" },
  { key: "first24MonthPrice", label: "24个月实例合同价", type: "money" },
  { key: "next36MonthPrice", label: "36个月实例合同价", type: "money" },
  { key: "selfCalculatedUnitPrice", label: "24个月实例单价（含税自算）", type: "money" },
  { key: "differenceUnitPrice", label: "结差差额单价", type: "money" },
  { key: "differenceTotalPrice", label: "结差差额总价", type: "money" },
];

export function BillingAvailablePage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [contracts, setContracts] = useState<InstanceContract[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function loadData() {
    setLoading(true);
    const [response, contractResponse] = await Promise.all([
      fetch("/api/billing/available"),
      fetch("/api/entities/instance-contracts?page=1&pageSize=100"),
    ]);
    const data = await response.json();
    const contractData = await contractResponse.json();
    setRows(data.rows ?? []);
    setContracts(contractData.rows ?? []);
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
      [row.countryCode, row.batchName, row.requestNo, row.poNo, row.deviceCode, row.modelCode, row.nameEn].some((value) =>
        String(value ?? "").toLowerCase().includes(normalizedKeyword),
      ),
    );
  }, [keyword, rows]);
  const selectedRows = rows.filter((row) => selectedIds.includes(row.purchaseOrderItemId));
  const canConfirm = selectedRows.length > 0 && selectedRows.every((row) => row.instanceContractNo && row.contractCurrency && row.startMonth);
  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedIds.includes(row.purchaseOrderItemId));

  function toggleSelected(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleAllVisible() {
    const visibleIds = filteredRows.map((row) => row.purchaseOrderItemId);
    setSelectedIds((current) =>
      visibleIds.every((id) => current.includes(id))
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds])),
    );
  }

  function updateStartMonth(id: string, startMonth: string) {
    setRows((current) => current.map((row) => (row.purchaseOrderItemId === id ? { ...row, startMonth } : row)));
  }

  function updateInstanceContractNo(id: string, instanceContractNo: string) {
    setRows((current) =>
      current.map((row) => {
        if (row.purchaseOrderItemId !== id) return row;
        const contract = findMatchingContract(contracts, row, instanceContractNo);
        return {
          ...row,
          instanceContractNo,
          contractCurrency: contract?.currency ?? "",
          first24MonthPrice: Number(contract?.first24MonthPriceUSD ?? 0),
          next36MonthPrice: Number(contract?.next36MonthPriceUSD ?? 0),
          selfCalculatedUnitPrice: calculateSelfPrice(row),
          differenceUnitPrice: Number(contract?.first24MonthPriceUSD ?? 0) - calculateSelfPrice(row),
          differenceTotalPrice: Number(row.quantity ?? 0) * (Number(contract?.first24MonthPriceUSD ?? 0) - calculateSelfPrice(row)),
        };
      }),
    );
  }

  async function confirmSelected() {
    setConfirming(true);
    const response = await fetch("/api/billing/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: selectedRows.map((row) => ({
          purchaseOrderItemId: row.purchaseOrderItemId,
          instanceContractNo: row.instanceContractNo,
          startMonth: row.startMonth,
        })),
      }),
    });
    const data = await response.json();
    setConfirming(false);
    if (!response.ok) {
      alert(data.error ?? "生成失败");
      return;
    }
    router.push("/finance/monthly-billing-writeoffs");
  }

  return (
    <div className="space-y-5 pb-24">
      <div>
        <h1 className="text-xl font-medium text-[#303133]">待生成月账单实例</h1>
        <p className="mt-1 text-sm text-[#909399]">已确认下单且尚未生成月账单台账的实例会在这里集中确认。</p>
      </div>
      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#ebeef5] p-4">
          <Input placeholder="搜索国家/批次/需求单/PO/实例编码" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <Button tone="primary">
            <Search size={15} />
            查询
          </Button>
          <Button onClick={() => void loadData()}>
            <RefreshCw size={15} />
            刷新
          </Button>
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
                <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">起始核销月份</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr className="hover:bg-[#fafafa]" key={row.purchaseOrderItemId}>
                  <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                    <input checked={selectedIds.includes(row.purchaseOrderItemId)} disabled={!row.instanceContractNo || !row.contractCurrency} type="checkbox" onChange={() => toggleSelected(row.purchaseOrderItemId)} />
                  </td>
                  {columns.map((column) => (
                    <td className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3" key={column.key}>
                      {column.key === "instanceContractNo" ? (
                        <>
                          <Input
                            className="w-48 min-w-0"
                            list={`billing-contracts-${row.purchaseOrderItemId}`}
                            placeholder="搜索合同号"
                            value={row.instanceContractNo}
                            onChange={(event) => updateInstanceContractNo(row.purchaseOrderItemId, event.target.value)}
                          />
                          <datalist id={`billing-contracts-${row.purchaseOrderItemId}`}>
                            {contracts
                              .filter((contract) => contract.countryCode === row.countryCode && contract.deviceCode === row.deviceCode)
                              .map((contract) => (
                                <option key={`${contract.contractNo}-${contract.countryCode}-${contract.deviceCode}`} value={contract.contractNo}>
                                  {contract.currency} / 24: {contract.first24MonthPriceUSD} / 36: {contract.next36MonthPriceUSD}
                                </option>
                              ))}
                          </datalist>
                          {!row.contractCurrency ? <div className="mt-1 text-xs text-[#f56c6c]">未匹配</div> : null}
                        </>
                      ) : (
                        <span
                          className={
                            (column.key === "differenceUnitPrice" || column.key === "differenceTotalPrice") && Number(row[column.key] ?? 0) < 0
                              ? "text-[#f56c6c]"
                              : undefined
                          }
                        >
                          {formatValue(row[column.key], column.type)}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                    <Input className="w-40 min-w-0" type="date" value={row.startMonth} onChange={(event) => updateStartMonth(row.purchaseOrderItemId, event.target.value)} />
                  </td>
                </tr>
              ))}
              {!filteredRows.length ? (
                <tr>
                  <td className="py-12 text-center text-[#909399]" colSpan={columns.length + 2}>
                    {loading ? "加载中..." : "暂无可生成月账单的实例"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
      {selectedIds.length ? (
        <div className="fixed bottom-5 left-[230px] right-5 z-20 border border-[#1890ff] bg-white p-4 shadow-lg">
          <div className="flex items-center gap-5 text-sm text-[#606266]">
            <span>已选实例：<b className="text-[#303133]">{selectedRows.length}</b></span>
            <span>已选数量：<b className="text-[#303133]">{selectedRows.reduce((total, row) => total + Number(row.quantity ?? 0), 0)}</b></span>
            <span>未匹配合同的实例无法确认生成。</span>
            <Button className="ml-auto" disabled={!canConfirm || confirming} tone="primary" onClick={() => void confirmSelected()}>
              <CheckCircle2 size={15} />
              确认生成60个月账单
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatValue(value: unknown, type?: string) {
  return formatDisplayValue(value as string | number | boolean | null | undefined, type);
}

function findMatchingContract(contracts: InstanceContract[], row: Row, contractNo: string) {
  return (
    contracts.find(
      (contract) =>
        contract.contractNo === contractNo.trim() &&
        contract.countryCode === row.countryCode &&
        contract.deviceCode === row.deviceCode,
    ) ?? null
  );
}

function calculateSelfPrice(row: Row) {
  return (
    (Number(row.taxExcludedUnitPrice ?? 0) / 88495.58 * 3978.4 + Number(row.taxSurcharge ?? 0) / 24) *
    (1 + Number(row.vatRate ?? 0))
  );
}
