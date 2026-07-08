"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileDown, Plus, RefreshCw, Search } from "lucide-react";
import { formatDateInputValue, formatDisplayValue } from "@/lib/display-format";
import { PURCHASE_CURRENCY_OPTIONS } from "@/lib/purchase-order-form";
import { Button, Input, Panel, Textarea } from "./ui";

type Row = Record<string, string | number | boolean | null>;

const columns: Array<{ key: string; label: string; type?: string }> = [
  { key: "adjustmentNo", label: "调整单号" },
  { key: "status", label: "状态" },
  { key: "countryCode", label: "国家" },
  { key: "batchName", label: "批次号" },
  { key: "deviceCode", label: "实例编码" },
  { key: "currency", label: "币种" },
  { key: "effectiveMonth", label: "生效月份", type: "date" },
  { key: "adjustedFirst24MonthPrice", label: "调整后前24个月价" },
  { key: "adjustedNext36MonthPrice", label: "调整后后36个月价" },
  { key: "confirmedAt", label: "确认时间", type: "datetime" },
] as const;

const emptyForm = {
  adjustmentNo: "",
  status: "草稿",
  countryCode: "",
  batchName: "",
  deviceCode: "",
  currency: "USD",
  effectiveMonth: "",
  adjustedFirst24MonthPrice: 0,
  adjustedNext36MonthPrice: 0,
  reason: "",
};

export function BillingAdjustmentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function loadRows() {
    setLoading(true);
    const response = await fetch(`/api/entities/billing-adjustments?page=1&pageSize=100&keyword=${encodeURIComponent(keyword)}`);
    const data = await response.json();
    setRows(data.rows ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadRows();
  }, []);

  const filteredRows = useMemo(() => rows, [rows]);

  async function saveRow(formData: FormData) {
    const body = {
      adjustmentNo: String(formData.get("adjustmentNo") ?? ""),
      status: String(formData.get("status") ?? "草稿"),
      countryCode: String(formData.get("countryCode") ?? ""),
      batchName: String(formData.get("batchName") ?? ""),
      deviceCode: String(formData.get("deviceCode") ?? ""),
      currency: String(formData.get("currency") ?? "USD"),
      effectiveMonth: String(formData.get("effectiveMonth") ?? ""),
      adjustedFirst24MonthPrice: Number(formData.get("adjustedFirst24MonthPrice") ?? 0),
      adjustedNext36MonthPrice: Number(formData.get("adjustedNext36MonthPrice") ?? 0),
      reason: String(formData.get("reason") ?? ""),
    };
    const id = editing?.adjustmentNo;
    await fetch(`/api/entities/billing-adjustments${id ? `/${encodeURIComponent(String(id))}` : ""}`, {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setShowForm(false);
    setEditing(null);
    await loadRows();
  }

  async function confirmAdjustment(adjustmentNo: string) {
    const response = await fetch(`/api/billing/adjustments/${encodeURIComponent(adjustmentNo)}/confirm`, {
      method: "POST",
    });
    const data = await response.json();
    if (!response.ok) {
      alert(data.error ?? "确认失败");
      return;
    }
    await loadRows();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-[#303133]">实例合同调整单</h1>
        <p className="mt-1 text-sm text-[#909399]">确认后只影响目标批次、实例在生效月份之后的月账单金额。</p>
      </div>
      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#ebeef5] p-4">
          <Input placeholder="搜索调整单/国家/批次/实例编码" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <Button tone="primary" onClick={() => void loadRows()}>
            <Search size={15} />
            查询
          </Button>
          <Button onClick={() => void loadRows()}>
            <RefreshCw size={15} />
            刷新
          </Button>
          <Button tone="primary" onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus size={15} />
            新建调整单
          </Button>
          <a className="ml-auto" href={`/api/entities/billing-adjustments/export?keyword=${encodeURIComponent(keyword)}`}>
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
                  <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={column.key}>{column.label}</th>
                ))}
                <th className="sticky right-0 border-b border-[#ebeef5] bg-[#f5f7fa] px-3 py-3 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const confirmed = String(row.status ?? "") === "已确认";
                return (
                  <tr className="hover:bg-[#fafafa]" key={String(row.adjustmentNo)}>
                    {columns.map((column) => (
                      <td className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3" key={column.key}>
                        {formatValue(row[column.key], column.type)}
                      </td>
                    ))}
                    <td className="sticky right-0 whitespace-nowrap border-b border-[#ebeef5] bg-white px-3 py-3">
                      <Button disabled={confirmed} onClick={() => { setEditing(row); setShowForm(true); }}>编辑</Button>
                      <Button className="ml-2" disabled={confirmed} tone="success" onClick={() => void confirmAdjustment(String(row.adjustmentNo))}>
                        <CheckCircle2 size={15} />
                        确认调整
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!filteredRows.length ? (
                <tr>
                  <td className="py-12 text-center text-[#909399]" colSpan={columns.length + 1}>
                    {loading ? "加载中..." : "暂无调整单"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45">
          <form ref={formRef} action={saveRow} className="w-[760px] bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center">
              <h2 className="text-lg text-[#303133]">{editing ? "编辑调整单" : "新建调整单"}</h2>
              <button className="ml-auto text-xl text-[#909399]" type="button" onClick={() => setShowForm(false)}>x</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(emptyForm).map(([key, defaultValue]) => {
                const value = editing?.[key] ?? defaultValue;
                if (key === "reason") {
                  return (
                    <label className="col-span-2" key={key}>
                      <span className="mb-1 block text-sm font-medium text-[#606266]">调整原因</span>
                      <Textarea className="w-full" name={key} defaultValue={String(value ?? "")} />
                    </label>
                  );
                }
                if (key === "currency") {
                  return (
                    <label key={key}>
                      <span className="mb-1 block text-sm font-medium text-[#606266]">{labelFor(key)}</span>
                      <select
                        className="h-9 w-full border border-[#dcdfe6] bg-white px-3 text-sm outline-none focus:border-[#409eff]"
                        name={key}
                        defaultValue={String(value ?? "USD")}
                        required
                      >
                        {PURCHASE_CURRENCY_OPTIONS.map((currency) => (
                          <option key={currency} value={currency}>
                            {currency}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }
                return (
                  <label key={key}>
                    <span className="mb-1 block text-sm font-medium text-[#606266]">{labelFor(key)}</span>
                    <Input
                      className="w-full"
                      name={key}
                      readOnly={key === "status"}
                      required={key !== "reason"}
                      step={key.includes("Price") ? "0.0001" : undefined}
                      type={key === "effectiveMonth" ? "date" : key.includes("Price") ? "number" : "text"}
                      defaultValue={key === "effectiveMonth" ? formatDateInputValue(value) : String(value ?? "")}
                    />
                  </label>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" onClick={() => setShowForm(false)}>取消</Button>
              <Button tone="primary" type="submit">保存</Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function labelFor(key: string) {
  const labels: Record<string, string> = {
    adjustmentNo: "调整单号",
    status: "状态",
    countryCode: "国家",
    batchName: "批次号",
    deviceCode: "实例编码",
    currency: "币种",
    effectiveMonth: "生效月份",
    adjustedFirst24MonthPrice: "调整后前24个月价",
    adjustedNext36MonthPrice: "调整后后36个月价",
  };
  return labels[key] ?? key;
}

function formatValue(value: unknown, type?: string) {
  return formatDisplayValue(value as string | number | boolean | null | undefined, type);
}
