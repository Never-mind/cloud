"use client";

import { useEffect, useMemo, useState } from "react";
import type { EntityConfig } from "@/lib/modules";
import { Button, Panel } from "./ui";
import { EntityPage } from "./entity-page";

type Row = Record<string, string | number | boolean | null>;

export function MasterDetailPage({
  masterConfig,
  detailConfig,
  relationKey,
}: {
  masterConfig: EntityConfig;
  detailConfig: EntityConfig;
  relationKey: string;
}) {
  const [masters, setMasters] = useState<Row[]>([]);
  const [details, setDetails] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string>("");

  async function loadMasters() {
    const response = await fetch(`/api/entities/${masterConfig.key}?page=1&pageSize=100`);
    const data = await response.json();
    const rows = data.rows ?? [];
    setMasters(rows);
    setSelected((current) => current || String(rows[0]?.[masterConfig.primaryKey] ?? ""));
  }

  async function loadDetails(masterId: string) {
    if (!masterId) return;
    const response = await fetch(
      `/api/entities/${detailConfig.key}?page=1&pageSize=100&keyword=${encodeURIComponent(masterId)}`,
    );
    const data = await response.json();
    setDetails((data.rows ?? []).filter((row: Row) => String(row[relationKey]) === masterId));
  }

  useEffect(() => {
    void loadMasters();
  }, [masterConfig.key]);

  useEffect(() => {
    void loadDetails(selected);
  }, [selected]);

  const selectedMaster = useMemo(
    () => masters.find((row) => String(row[masterConfig.primaryKey]) === selected),
    [masters, masterConfig.primaryKey, selected],
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
              return (
                <button
                  className={`block w-full border-b border-[#ebeef5] px-4 py-3 text-left ${
                    selected === id ? "bg-[#ecf5ff] text-[#1890ff]" : "bg-white"
                  }`}
                  key={id}
                  onClick={() => setSelected(id)}
                >
                  <div className="font-medium">{id}</div>
                  <div className="mt-1 truncate text-xs text-[#909399]">
                    {String(row.batchName ?? row.currency ?? row.status ?? "")}
                  </div>
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
              <Button className="ml-auto" tone="primary">
                添加明细
              </Button>
            </div>
            <div className="table-scroll overflow-auto border border-[#ebeef5]">
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
            </div>
          </div>
        </div>
      </Panel>
      <EntityPage config={masterConfig} />
    </div>
  );
}
