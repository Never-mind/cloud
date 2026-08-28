"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import type { EntityConfig } from "@/lib/modules";
import { fetchAllEntityRows } from "@/lib/client-entity-fetch";
import { Button, Panel } from "./ui";
import { StickyTable } from "./sticky-table";
import { EntityPage } from "./entity-page";

type Row = Record<string, string | number | boolean | null>;

export function MasterDetailPage({
  masterConfig,
  detailConfig,
  relationKey,
  initialMasterId,
  detailRoute,
}: {
  masterConfig: EntityConfig;
  detailConfig: EntityConfig;
  relationKey: string;
  initialMasterId?: string;
  detailRoute?: string;
}) {
  const [masters, setMasters] = useState<Row[]>([]);
  const [details, setDetails] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [matching, setMatching] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [detailCreateRequest, setDetailCreateRequest] = useState<number | undefined>();

  async function loadMasters() {
    const rows = await fetchAllEntityRows<Row>(masterConfig.key);
    setMasters(rows);
    setSelected((current) => {
      const requested = initialMasterId?.trim() ?? "";
      if (requested && rows.some((row) => String(row[masterConfig.primaryKey]) === requested)) return requested;
      if (current && rows.some((row) => String(row[masterConfig.primaryKey]) === current)) return current;
      return String(rows[0]?.[masterConfig.primaryKey] ?? "");
    });
  }

  async function loadDetails(masterId: string) {
    if (!masterId) return;
    const rows = await fetchAllEntityRows<Row>(detailConfig.key, { keyword: masterId });
    setDetails(rows.filter((row) => String(row[relationKey]) === masterId));
  }

  async function matchProducts() {
    if (masterConfig.key !== "customer-pos" || !selected || matching) return;
    setMatching(true);
    try {
      const response = await fetch(`/api/po/customer-pos/${encodeURIComponent(selected)}/match`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "产品匹配失败");
      alert(`产品匹配完成：成功 ${data.matched ?? 0} 条，未匹配 ${data.unmatched ?? 0} 条`);
      await loadDetails(selected);
    } catch (error) {
      alert(error instanceof Error ? error.message : "产品匹配失败");
    } finally {
      setMatching(false);
    }
  }

  async function generateQuotation() {
    if (masterConfig.key !== "customer-pos" || !selected || matching) return;
    setMatching(true);
    try {
      const response = await fetch("/api/po/quotations/from-customer-po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poId: selected }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "生成报价单失败");
      alert(data.existing ? `已存在报价单：${data.quotationNo ?? ""}` : `报价单已生成：${data.quotationNo ?? ""}，共 ${data.itemCount ?? 0} 条明细`);
      await loadMasters();
    } catch (error) {
      alert(error instanceof Error ? error.message : "生成报价单失败");
    } finally {
      setMatching(false);
    }
  }

  async function confirmQuotation() {
    if (masterConfig.key !== "quotations" || !selected || quoting) return;
    setQuoting(true);
    try {
      const response = await fetch(`/api/po/quotations/${encodeURIComponent(selected)}/confirm`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "确认报价单失败");
      alert(`报价单已确认：${data.quotationNo ?? ""}`);
      await loadMasters();
    } catch (error) {
      alert(error instanceof Error ? error.message : "确认报价单失败");
    } finally {
      setQuoting(false);
    }
  }

  useEffect(() => {
    void loadMasters();
  }, [initialMasterId, masterConfig.key]);

  useEffect(() => {
    void loadDetails(selected);
  }, [selected]);

  const selectedMaster = useMemo(
    () => masters.find((row) => String(row[masterConfig.primaryKey]) === selected),
    [masters, masterConfig.primaryKey, selected],
  );
  const detailRelationValues = useMemo(
    () => (selected ? { [relationKey]: selected } : {}),
    [relationKey, selected],
  );
  const detailEditorConfig = useMemo(
    () => ({
      ...detailConfig,
      formFields: detailConfig.formFields.map((field) => (
        field.key === relationKey ? { ...field, hidden: true } : field
      )),
    }),
    [detailConfig, relationKey],
  );

  return (
    <div className="space-y-5">
      <Panel>
        <div className="border-b border-[#ebeef5] p-4">
          <h1 className="text-xl font-medium text-[#303133]">{masterConfig.title}主从表单</h1>
          <p className="mt-1 text-sm text-[#909399]">
            左侧选择主单，右侧查看和维护该主单下的明细；下方仍保留完整主单列表和导入导出。
          </p>
        </div>
        <div className="grid grid-cols-[300px_1fr]">
          <div className="border-r border-[#ebeef5]">
            {masters.map((row) => {
              const id = String(row[masterConfig.primaryKey]);
              const itemContent = (
                <>
                  <div className="font-medium">{id}</div>
                  <div className="mt-1 truncate text-xs text-[#909399]">
                    {String(row.batchName ?? row.currency ?? row.status ?? "")}
                  </div>
                </>
              );
              const className = `block w-full border-b border-[#ebeef5] px-4 py-3 text-left ${
                selected === id ? "bg-[#ecf5ff] text-[#1890ff]" : "bg-white"
              }`;
              return detailRoute ? (
                <Link className={className} href={`${detailRoute}/${encodeURIComponent(id)}`} key={id} onClick={() => setSelected(id)}>
                  {itemContent}
                </Link>
              ) : (
                <button className={className} key={id} onClick={() => setSelected(id)} type="button">
                  {itemContent}
                </button>
              );
            })}
          </div>
          <div className="p-4">
            <div className="mb-4 grid grid-cols-3 gap-3">
              {masterConfig.listFields.slice(0, 6).map((field) => (
                <div className="border border-[#ebeef5] bg-[#fafafa] p-3" key={field.key}>
                  <div className="text-xs text-[#909399]">{field.label}</div>
                  <div className="mt-1 truncate text-[#303133]">
                    {String(selectedMaster?.[field.key] ?? "-")}
                  </div>
                </div>
              ))}
            </div>
            <div className="mb-2 flex items-center">
              <h2 className="font-medium text-[#303133]">{detailConfig.title}</h2>
              {masterConfig.key === "customer-pos" ? (
                <div className="ml-2 flex gap-2">
                  <Button disabled={matching || !selected} onClick={() => void matchProducts()}>
                    <RefreshCw size={15} />
                    {matching ? "处理中" : "按产品编码匹配"}
                  </Button>
                  <Button disabled={matching || !selected} tone="primary" onClick={() => void generateQuotation()}>
                    生成报价单
                  </Button>
                </div>
              ) : masterConfig.key === "quotations" ? (
                <Button className="ml-2" disabled={quoting || !selected} tone="success" onClick={() => void confirmQuotation()}>
                  {quoting ? "确认中" : "确认报价单"}
                </Button>
              ) : null}
              <Button
                className="ml-auto"
                disabled={!selected}
                tone="primary"
                onClick={() => setDetailCreateRequest((current) => (current ?? 0) + 1)}
              >
                添加明细
              </Button>
            </div>
            <StickyTable className="table-scroll overflow-auto border border-[#ebeef5]" tableKey={`${masterConfig.key}-details`}>
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-[#f5f7fa] text-[#303133]">
                  <tr>
                    {detailConfig.listFields.map((field) => (
                      <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left" key={field.key}>
                        {field.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {details.map((row) => (
                    <tr key={String(row[detailConfig.primaryKey])}>
                      {detailConfig.listFields.map((field) => (
                        <td className="border-b border-r border-[#ebeef5] px-3 py-3" key={field.key}>
                          {String(row[field.key] ?? "-")}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!details.length && (
                    <tr>
                      <td className="py-8 text-center text-[#909399]" colSpan={detailConfig.listFields.length}>
                        暂无明细
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </StickyTable>
          </div>
        </div>
      </Panel>
      {selected ? (
        <div id="master-detail-line-editor">
          <EntityPage
            config={detailEditorConfig}
            fixedFilters={detailRelationValues}
            fixedValues={detailRelationValues}
            createRequestKey={detailCreateRequest}
            onSaved={() => void loadDetails(selected)}
          />
        </div>
      ) : null}
      <EntityPage config={masterConfig} />
    </div>
  );
}
