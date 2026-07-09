"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { formatDisplayValue } from "@/lib/display-format";
import { Button, Input, Panel } from "./ui";

type Row = Record<string, string | number | boolean | null>;

const columns: Array<{ key: string; label: string; type?: string }> = [
  { key: "adjustmentNo", label: "调整单号" },
  { key: "instanceContractNo", label: "实例合同单号" },
  { key: "status", label: "状态" },
  { key: "itemCount", label: "明细数量", type: "number" },
  { key: "countryCode", label: "国家" },
  { key: "batchName", label: "批次号" },
  { key: "deviceCode", label: "实例编码" },
  { key: "reason", label: "调整原因" },
  { key: "confirmedAt", label: "确认时间", type: "date" },
  { key: "createdAt", label: "创建时间", type: "date" },
];

export function BillingAdjustmentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [keyword, setKeyword] = useState("");
  const [statusTab, setStatusTab] = useState<"draft" | "confirmed">("draft");
  const [loading, setLoading] = useState(false);

  async function loadRows() {
    setLoading(true);
    const params = new URLSearchParams();
    if (keyword.trim()) params.set("keyword", keyword.trim());
    const response = await fetch(`/api/billing/adjustments?${params.toString()}`);
    const data = await response.json();
    setRows(data.rows ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadRows();
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const confirmed = String(row.status ?? "") === "已确认";
      return statusTab === "confirmed" ? confirmed : !confirmed;
    });
  }, [rows, statusTab]);

  async function confirmAdjustment(adjustmentNo: string) {
    if (!confirm("确认后会按调整单明细更新对应月账单每月核销明细，是否继续？")) return;
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

  async function deleteDraft(adjustmentNo: string) {
    if (!confirm("确认删除该实例合同调整单草稿？")) return;
    const response = await fetch(`/api/billing/adjustments/${encodeURIComponent(adjustmentNo)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      alert(data.error ?? "删除失败");
      return;
    }
    await loadRows();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-[#303133]">实例合同调整单</h1>
        <p className="mt-1 text-sm text-[#909399]">按调整单主从结构维护多个实例的合同价格调整，确认后更新月账单核销明细。</p>
      </div>

      <Panel>
        <div className="flex items-center gap-2 border-b border-[#ebeef5] bg-[#fafafa] p-3">
          <Button tone={statusTab === "draft" ? "primary" : "default"} onClick={() => setStatusTab("draft")}>
            草稿
            <span className="ml-1 rounded bg-white/35 px-1.5 text-xs">
              {rows.filter((row) => String(row.status ?? "") !== "已确认").length}
            </span>
          </Button>
          <Button tone={statusTab === "confirmed" ? "primary" : "default"} onClick={() => setStatusTab("confirmed")}>
            已确认
            <span className="ml-1 rounded bg-white/35 px-1.5 text-xs">
              {rows.filter((row) => String(row.status ?? "") === "已确认").length}
            </span>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-[#ebeef5] p-4">
          <Input placeholder="搜索调整单/合同号/国家/批次/实例编码" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <Button tone="primary" onClick={() => void loadRows()}>
            <Search size={15} />
            查询
          </Button>
          <Button onClick={() => void loadRows()}>
            <RefreshCw size={15} />
            刷新
          </Button>
          <Link className="ml-auto" href="/finance/billing-adjustments/new">
            <Button tone="primary">
              <Plus size={15} />
              新建调整单
            </Button>
          </Link>
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
                <th className="sticky right-0 border-b border-[#ebeef5] bg-[#f5f7fa] px-3 py-3 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const adjustmentNo = String(row.adjustmentNo ?? "");
                const confirmed = String(row.status ?? "") === "已确认";
                return (
                  <tr className="hover:bg-[#fafafa]" key={adjustmentNo}>
                    {columns.map((column) => (
                      <td className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3" key={column.key}>
                        {column.key === "adjustmentNo" ? (
                          <Link className="font-medium text-[#1890ff] hover:underline" href={`/finance/billing-adjustments/${encodeURIComponent(adjustmentNo)}`}>
                            {adjustmentNo}
                          </Link>
                        ) : (
                          formatValue(row[column.key], column.type)
                        )}
                      </td>
                    ))}
                    <td className="sticky right-0 whitespace-nowrap border-b border-[#ebeef5] bg-white px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/finance/billing-adjustments/${encodeURIComponent(adjustmentNo)}`}>
                          <Button>{confirmed ? "查看" : "编辑"}</Button>
                        </Link>
                        <Button disabled={confirmed} tone="success" onClick={() => void confirmAdjustment(adjustmentNo)}>
                          <CheckCircle2 size={15} />
                          确认
                        </Button>
                        <Button disabled={confirmed} tone="danger" onClick={() => void deleteDraft(adjustmentNo)}>
                          <Trash2 size={15} />
                          删除
                        </Button>
                      </div>
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
    </div>
  );
}

function formatValue(value: unknown, type?: string) {
  return formatDisplayValue(value as string | number | boolean | null | undefined, type);
}
