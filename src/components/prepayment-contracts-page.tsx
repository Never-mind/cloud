"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, RotateCcw, Search, Trash2 } from "lucide-react";
import { formatDisplayValue } from "@/lib/display-format";
import { fetchAllEntityRows } from "@/lib/client-entity-fetch";
import { buildDetailRoute, buildListRoute, getCurrentRoute, useListScrollPosition } from "@/lib/client-list-navigation";
import { Button, Input, Panel } from "./ui";

type Row = Record<string, string | number | boolean | null>;

const columns: Array<{ key: string; label: string; type?: string }> = [
  { key: "contractNo", label: "预付款合同号" },
  { key: "status", label: "状态" },
  { key: "currency", label: "币种" },
  { key: "effectiveDate", label: "生效日期", type: "date" },
  { key: "totalAmount", label: "合同总金额", type: "money" },
  { key: "confirmedAt", label: "确认时间", type: "datetime" },
  { key: "createdAt", label: "创建时间", type: "datetime" },
  { key: "updatedAt", label: "更新时间", type: "datetime" },
] as const;

export function PrepaymentContractsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [keyword, setKeyword] = useState(() => searchParams.get("keyword") ?? "");
  const [statusTab, setStatusTab] = useState<"draft" | "confirmed">(() => searchParams.get("statusTab") === "confirmed" ? "confirmed" : "draft");
  const [loading, setLoading] = useState(false);
  const currentRoute = getCurrentRoute(pathname, searchParams.toString());

  useListScrollPosition(currentRoute, !loading);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("statusTab", statusTab);
    if (keyword.trim()) params.set("keyword", keyword);
    else params.delete("keyword");
    const nextRoute = buildListRoute(pathname, params);
    if (nextRoute !== currentRoute) router.replace(nextRoute, { scroll: false });
  }, [currentRoute, keyword, pathname, router, searchParams, statusTab]);

  async function loadData() {
    setLoading(true);
    setRows(await fetchAllEntityRows<Row>("prepayment-contracts"));
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredRows = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return rows.filter((row) => {
      const confirmed = String(row.status ?? "") === "已确认";
      if (statusTab === "confirmed" ? !confirmed : confirmed) return false;
      if (!normalizedKeyword) return true;
      return [row.contractNo, row.status, row.currency].some((value) =>
        String(value ?? "").toLowerCase().includes(normalizedKeyword),
      );
    });
  }, [keyword, rows, statusTab]);

  async function deleteDraft(contractNo: string) {
    if (!confirm("确认删除该预付款合同草稿？删除后已占用实例会释放回待生成列表。")) return;
    await fetch(`/api/prepayments/contracts/${encodeURIComponent(contractNo)}`, { method: "DELETE" });
    await loadData();
  }

  async function rollbackContract(contractNo: string) {
    if (!confirm("回退后会删除该合同生成的预付款每月核销明细，合同将恢复为草稿。是否继续？")) return;
    const response = await fetch(`/api/prepayments/contracts/${encodeURIComponent(contractNo)}/rollback`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      alert(data.error ?? "回退失败");
      return;
    }
    await loadData();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-[#303133]">预付款合同</h1>
        <p className="mt-1 text-sm text-[#909399]">管理预付款合同草稿和已确认合同，草稿删除后会释放对应实例。</p>
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
          <Input placeholder="搜索合同号/状态/币种" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <Button tone="primary">
            <Search size={15} />
            查询
          </Button>
          <Button onClick={() => void loadData()}>
            <RefreshCw size={15} />
            刷新
          </Button>
          <Link className="ml-auto" href="/finance/prepayment-available">
            <Button tone="primary">去生成预付款草稿</Button>
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
                const contractNo = String(row.contractNo ?? "");
                const confirmed = String(row.status ?? "") === "已确认";
                return (
                  <tr className="hover:bg-[#fafafa]" key={contractNo}>
                    {columns.map((column) => (
                      <td className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3" key={column.key}>
                        {column.key === "contractNo" ? (
                          <Link className="font-medium text-[#1890ff] hover:underline" href={buildDetailRoute(`/finance/prepayment-contracts/${encodeURIComponent(contractNo)}`, currentRoute)}>
                            {contractNo}
                          </Link>
                        ) : (
                          formatValue(row[column.key], column.type)
                        )}
                      </td>
                    ))}
                    <td className="sticky right-0 whitespace-nowrap border-b border-[#ebeef5] bg-white px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={buildDetailRoute(`/finance/prepayment-contracts/${encodeURIComponent(contractNo)}`, currentRoute)}>
                          <Button>{confirmed ? "查看" : "编辑"}</Button>
                        </Link>
                        <Button disabled={confirmed} tone="danger" onClick={() => void deleteDraft(contractNo)}>
                          <Trash2 size={15} />
                          删除草稿
                        </Button>
                        {confirmed ? (
                          <Button tone="warning" onClick={() => void rollbackContract(contractNo)}>
                            <RotateCcw size={15} />
                            回退草稿
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filteredRows.length ? (
                <tr>
                  <td className="py-12 text-center text-[#909399]" colSpan={columns.length + 1}>
                    {loading ? "加载中..." : "暂无数据"}
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
