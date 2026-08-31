"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Edit3,
  Eye,
  FileDown,
  FileSpreadsheet,
  ListFilter,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { formatDateInputValue, formatDisplayValue } from "@/lib/display-format";
import { postWorkspaceMessage } from "@/lib/tab-workspace";
import type { EntityConfig } from "@/lib/modules";
import { TableColumnMenu, type TableFilterOption, type TableSortOrder } from "./table-column-menu";
import { StickyTable } from "./sticky-table";
import { StatusTag } from "./status-tag";
import { AuditInfoBar, Button, Input, Panel, Textarea } from "./ui";

type Value = string | number | boolean | null | undefined;
type Row = Record<string, Value>;

type PartyOption = {
  value: string;
  code: string;
  shortName: string;
  label: string;
};

type ProductOption = Row & {
  productCode?: string;
  productName?: string;
};

type ListResponse = {
  rows?: Row[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
};

const listFields = [
  { key: "poNo", label: "客户PO号", sortable: true, filterable: true },
  { key: "projectName", label: "项目名称", sortable: true, filterable: true },
  { key: "undertakingUnitName", label: "承接单位", sortable: true, filterable: true },
  { key: "customerName", label: "客户", sortable: true, filterable: true },
  { key: "poDate", label: "PO日期", sortable: true, filterable: true, type: "date" },
  { key: "deliveryDate", label: "交付日期", sortable: true, filterable: true, type: "date" },
  { key: "currency", label: "币种", sortable: true, filterable: true },
  { key: "status", label: "状态", sortable: true, filterable: true },
  { key: "quotationNo", label: "关联报价单" },
] as const;

const itemFields = [
  "lineNo",
  "customerSku",
  "customerProductName",
  "customerBrand",
  "customerSpec",
  "quantity",
  "unit",
  "targetUnitPrice",
  "currency",
  "matchedProductCode",
  "productMasterId",
  "productModelId",
  "productSpecId",
  "matchStatus",
  "remark",
] as const;

const emptyMaster = (): Row => ({
  poNo: "",
  projectName: "",
  undertakingUnitId: "",
  customerId: "",
  poDate: new Date().toISOString().slice(0, 10),
  deliveryDate: "",
  currency: "USD",
  status: "draft",
  remark: "",
});

function emptyItem(lineNo: number, currency: string): Row {
  return {
    id: `new-${Date.now()}-${lineNo}`,
    lineNo,
    customerSku: "",
    customerProductName: "",
    customerBrand: "",
    customerSpec: "",
    unit: "",
    quantity: 1,
    targetUnitPrice: "",
    currency: currency || "USD",
    matchedProductCode: "",
    productMasterId: null,
    productModelId: null,
    productSpecId: null,
    matchStatus: "unmatched",
    remark: "",
  };
}

export function CustomerPoListPage({ config }: { config: EntityConfig }) {
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [sortField, setSortField] = useState("");
  const [sortOrder, setSortOrder] = useState<TableSortOrder>("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), keyword: appliedKeyword });
      if (status) params.set("status", status);
      if (sortField && sortOrder) {
        params.set("sortField", sortField);
        params.set("sortOrder", sortOrder);
      }
      for (const [field, values] of Object.entries(columnFilters)) {
        for (const value of values) params.append(`filter.${field}`, value);
      }
      const response = await fetch(`/api/po/customer-pos?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as ListResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "客户PO加载失败");
      setRows(data.rows ?? []);
      setTotal(Number(data.total ?? 0));
      setPage(Number(data.page ?? page));
      setPageSize(Number(data.pageSize ?? pageSize));
      setTotalPages(Number(data.totalPages ?? 1));
    } catch (loadError) {
      setRows([]);
      setTotal(0);
      setError(loadError instanceof Error ? loadError.message : "客户PO加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function deletePo(id: string, poNo: string) {
    if (!window.confirm(`确认删除客户PO ${poNo || ""}？删除后会同步删除产品明细。`)) return;
    setError("");
    try {
      const response = await fetch(`/api/entities/customer-pos/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "客户PO删除失败");
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "客户PO删除失败");
    }
  }

  useEffect(() => { void load(); }, [appliedKeyword, columnFilters, page, pageSize, sortField, sortOrder, status]);

  function openRoute(route: string, title: string) {
    postWorkspaceMessage({ type: "cloud-power:open-tab", route, title });
  }

  async function loadOptions(field: string, optionKeyword: string): Promise<TableFilterOption[]> {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      const value = String(row[field] ?? "").trim();
      if (!value || (optionKeyword && !value.toLowerCase().includes(optionKeyword.toLowerCase()))) return;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    });
    return Array.from(counts.entries()).map(([value, count]) => ({
      value,
      label: field === "status" ? formatPoStatus(value) : value,
      count,
    }));
  }

  const canPrevious = page > 1;
  const canNext = page < totalPages;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-medium text-[#303133]">客户PO</h1>
          <p className="mt-1 text-sm text-[#909399]">客户采购订单主单与产品明细。</p>
        </div>
        <Button onClick={() => void load()} disabled={loading} aria-label="刷新" title="刷新"><RefreshCw size={15} /></Button>
        <Button tone="primary" onClick={() => openRoute("/customer-pos/new", "新建客户PO")}><Plus size={15} />新建客户PO</Button>
      </div>
      <Panel>
        <div className="flex flex-wrap items-end gap-3 border-b border-[#ebeef5] p-4">
          <label className="min-w-[280px] flex-1">
            <span className="sr-only">搜索客户PO</span>
            <div className="flex gap-2">
              <Input className="h-10 w-full" value={keyword} placeholder="搜索PO号、客户或承接单位编码/简称" onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setPage(1); setAppliedKeyword(keyword.trim()); } }} />
              <Button tone="primary" className="h-10 w-10 px-0" aria-label="查询" title="查询" onClick={() => { setPage(1); setAppliedKeyword(keyword.trim()); }}><Search size={16} /></Button>
            </div>
          </label>
          <label className="w-36 text-sm text-[#606266]">
            <span className="mb-1 block text-xs text-[#909399]">状态</span>
            <select className="h-10 w-full rounded border border-[#dcdfe6] bg-white px-3 outline-none focus:border-[#1890ff]" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
              <option value="">全部状态</option>
              <option value="draft">草稿</option>
              <option value="confirmed">已完成</option>
            </select>
          </label>
          <span className="text-sm text-[#909399]">共 {total} 条</span>
        </div>
        {error ? <div className="border-b border-[#fde2e2] bg-[#fef0f0] px-4 py-3 text-sm text-[#f56c6c]">{error}</div> : null}
        <StickyTable className="table-scroll overflow-auto" tableKey="customer-pos-list">
          <table className="min-w-[1500px] border-collapse text-sm">
            <thead className="bg-[#f5f7fa] text-[#303133]"><tr>{listFields.map((field) => <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={field.key}><TableColumnMenu column={field} filterValues={columnFilters[field.key] ?? []} loadOptions={(optionKeyword) => loadOptions(field.key, optionKeyword)} onFilter={(values) => { setPage(1); setColumnFilters((current) => ({ ...current, [field.key]: values })); }} onSort={(order) => { setPage(1); setSortField(field.key); setSortOrder(order); }} sortOrder={sortField === field.key ? sortOrder : ""} /></th>)}<th className="sticky right-0 border-b border-[#ebeef5] bg-[#f5f7fa] px-3 py-3 text-left font-medium">操作</th></tr></thead>
            <tbody>
              {loading ? <tr><td className="px-4 py-12 text-center text-[#909399]" colSpan={listFields.length + 1}>加载中...</td></tr> : rows.map((row) => {
                const id = String(row.id ?? "");
                return <tr className="hover:bg-[#fafafa]" key={id}>{listFields.map((field) => <td className="max-w-[240px] truncate whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3" key={field.key}>{field.key === "poNo" ? <button className="text-[#1890ff] hover:underline" type="button" onClick={() => openRoute(`/customer-pos/${encodeURIComponent(id)}?returnTo=%2Fcustomer-pos`, "客户PO明细")}>{String(row[field.key] ?? "-")}</button> : field.key === "status" ? <StatusTag status={String(row[field.key] ?? "draft")} label={formatPoStatus(row[field.key])} /> : formatPoListValue(row[field.key], "type" in field ? field.type : undefined)}</td>)}<td className="sticky right-0 whitespace-nowrap border-b border-[#ebeef5] bg-white px-3 py-3"><button className="inline-flex h-8 w-8 items-center justify-center text-[#606266] hover:text-[#1890ff]" type="button" aria-label="查看" title="查看" onClick={() => openRoute(`/customer-pos/${encodeURIComponent(id)}?returnTo=%2Fcustomer-pos`, "客户PO明细")}><Eye size={16} /></button>{String(row.status ?? "draft") !== "confirmed" ? <button className="ml-2 inline-flex h-8 w-8 items-center justify-center text-[#f56c6c] hover:text-[#ff4949]" type="button" aria-label="删除" title="删除草稿" onClick={() => void deletePo(id, String(row.poNo ?? ""))}><Trash2 size={16} /></button> : null}</td></tr>;
              })}
              {!loading && !rows.length ? <tr><td className="px-4 py-12 text-center text-[#909399]" colSpan={listFields.length + 1}>暂无客户PO</td></tr> : null}
            </tbody>
          </table>
        </StickyTable>
        <div className="flex items-center justify-between border-t border-[#ebeef5] px-4 py-3 text-sm text-[#606266]"><span>第 {page} / {totalPages} 页</span><div className="flex items-center gap-2"><select className="h-8 rounded border border-[#dcdfe6] bg-white px-2" value={pageSize} onChange={(event) => { setPage(1); setPageSize(Number(event.target.value)); }}><option value={20}>20条/页</option><option value={50}>50条/页</option><option value={100}>100条/页</option></select><Button disabled={!canPrevious} onClick={() => setPage((value) => value - 1)}>上一页</Button><Button disabled={!canNext} onClick={() => setPage((value) => value + 1)}>下一页</Button></div></div>
      </Panel>
    </div>
  );
}

export function CustomerPoDetailPage({ config, id }: { config: EntityConfig; id: string }) {
  const isNew = id === "new";
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.startsWith("/") ? searchParams.get("returnTo")! : "/customer-pos";
  const [master, setMaster] = useState<Row | null>(isNew ? emptyMaster() : null);
  const [masterDraft, setMasterDraft] = useState<Row>(isNew ? emptyMaster() : {});
  const [items, setItems] = useState<Row[]>([]);
  const [editing, setEditing] = useState(isNew);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [matching, setMatching] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [removedItemIds, setRemovedItemIds] = useState<string[]>([]);
  const itemFileRef = useRef<HTMLInputElement>(null);
  const [importingItems, setImportingItems] = useState(false);

  async function load() {
    if (isNew) {
      const draft = emptyMaster();
      setMaster(draft);
      setMasterDraft(draft);
      setItems([]);
      setEditing(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/po/customer-pos/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "客户PO详情加载失败");
      setMaster(data.master ?? null);
      setMasterDraft(data.master ?? {});
      setItems(data.items ?? []);
      setRemovedItemIds([]);
      setEditing(false);
    } catch (loadError) {
      setMaster(null);
      setItems([]);
      setError(loadError instanceof Error ? loadError.message : "客户PO详情加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [id, isNew]);

  const confirmed = String(masterDraft.status ?? "") === "confirmed";
  const totalQuantity = useMemo(() => items.reduce((total, row) => total + Number(row.quantity ?? 0), 0), [items]);

  function goBack() {
    postWorkspaceMessage({ type: "cloud-power:open-tab", route: returnTo, title: "客户PO" });
  }

  function startEditing() {
    setMasterDraft(master ?? {});
    setEditing(true);
    setNotice("");
    setError("");
  }

  function cancelEditing() {
    if (isNew) {
      goBack();
      return;
    }
    setMasterDraft(master ?? {});
    setItems((current) => current.filter((row) => !String(row.id ?? "").startsWith("new-")));
    setRemovedItemIds([]);
    setEditing(false);
    setError("");
  }

  function updateMaster(key: string, value: Value, displayKey?: string, displayValue?: string) {
    setMasterDraft((current) => ({ ...current, [key]: value, ...(displayKey ? { [displayKey]: displayValue ?? "" } : {}) }));
  }

  function updateItem(idValue: string, key: string, value: Value) {
    setItems((current) => current.map((row) => String(row.id) === idValue ? { ...row, [key]: value } : row));
  }

  function addItem() {
    if (!editing) return;
    setItems((current) => [...current, emptyItem(current.length + 1, String(masterDraft.currency ?? "USD"))]);
  }

  async function importItemsFile(file: File) {
    setImportingItems(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/po/customer-pos/items/import", { method: "POST", body: formData });
      const result = (await response.json().catch(() => ({}))) as {
        rows?: Row[];
        total?: number;
        success?: number;
        failed?: Array<{ rowNumber: number; error: string }>;
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "产品明细导入失败");
        return;
      }
      const importedRows = (result.rows ?? []).map((row, index) => ({
        ...emptyItem(Number(row.lineNo ?? items.length + index + 1), String(masterDraft.currency ?? row.currency ?? "USD")),
        ...row,
        id: `new-${Date.now()}-${index}`,
        lineNo: Number(row.lineNo ?? items.length + index + 1),
        currency: row.currency || String(masterDraft.currency ?? "USD"),
      }));
      setItems((current) => [...current, ...importedRows]);
      setNotice(`产品明细导入完成：成功 ${result.success ?? importedRows.length}/${result.total ?? importedRows.length} 条${result.failed?.length ? `，失败 ${result.failed.length} 条` : ""}`);
      if (result.failed?.length) setError(result.failed.map((row) => `第${row.rowNumber}行：${row.error}`).join("；"));
      else setError("");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "网络或文件处理失败");
    } finally {
      setImportingItems(false);
    }
  }

  function removeItem(row: Row) {
    if (!editing) return;
    const rowId = String(row.id ?? "");
    setItems((current) => current.filter((item) => String(item.id) !== rowId));
    if (rowId && !rowId.startsWith("new-")) setRemovedItemIds((current) => [...current, rowId]);
  }

  async function saveChanges() {
    const missingMaster = [
      ["poNo", "客户PO号"],
      ["undertakingUnitId", "承接单位"],
      ["customerId", "客户"],
      ["poDate", "PO日期"],
    ].find(([key]) => !String(masterDraft[key] ?? "").trim());
    if (missingMaster) {
      setError(`请先填写客户PO基础信息：${missingMaster[1]}`);
      return;
    }
    const invalidItem = items.find((row) => !String(row.customerProductName ?? "").trim() || Number(row.quantity ?? 0) <= 0);
    if (invalidItem) {
      setError("请填写每条明细的产品名称，并确保数量大于0");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const masterPayload = Object.fromEntries(config.formFields.map((field) => [field.key, masterDraft[field.key] ?? null]));
      const masterResponse = await fetch(isNew ? "/api/entities/customer-pos" : `/api/entities/customer-pos/${encodeURIComponent(id)}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(masterPayload),
      });
      const masterData = await masterResponse.json().catch(() => ({}));
      if (!masterResponse.ok) throw new Error(masterData.error ?? "客户PO主单保存失败");
      const savedId = String(masterData.id ?? id);

      for (const itemId of removedItemIds) {
        const response = await fetch(`/api/entities/customer-po-items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "客户PO明细删除失败");
        }
      }
      for (const row of items) {
        const payload = Object.fromEntries(itemFields.map((field) => {
          if (field === "lineNo" || field === "quantity" || field === "targetUnitPrice") {
            return [field, row[field] === "" || row[field] === null || row[field] === undefined ? null : Number(row[field])];
          }
          return [field, row[field] ?? null];
        }));
        payload.poId = savedId;
        const rowId = String(row.id ?? "");
        const response = await fetch(`/api/entities/customer-po-items${rowId.startsWith("new-") ? "" : `/${encodeURIComponent(rowId)}`}`, {
          method: rowId.startsWith("new-") ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "客户PO明细保存失败");
        }
      }
      if (isNew) {
        window.location.replace(`/customer-pos/${encodeURIComponent(savedId)}?embed=1&returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }
      setNotice("客户PO已保存");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "客户PO保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function confirmPo() {
    if (isNew || confirmed || confirming) return;
    if (!confirm("确认该客户PO吗？确认后主单和明细不可再修改。")) return;
    setConfirming(true);
    setError("");
    try {
      const response = await fetch(`/api/po/customer-pos/${encodeURIComponent(id)}/confirm`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "客户PO确认失败");
      setNotice(`客户PO已确认，确认人：${data.confirmedByName ?? ""}`);
      await load();
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "客户PO确认失败");
    } finally {
      setConfirming(false);
    }
  }

  async function matchProducts() {
    if (isNew || matching) return;
    setMatching(true);
    setError("");
    try {
      const response = await fetch(`/api/po/customer-pos/${encodeURIComponent(id)}/match`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "产品自动匹配失败");
      setNotice(`产品自动匹配完成：成功 ${data.matched ?? 0} 条，未匹配 ${data.unmatched ?? 0} 条`);
      await load();
    } catch (matchError) {
      setError(matchError instanceof Error ? matchError.message : "产品自动匹配失败");
    } finally {
      setMatching(false);
    }
  }

  async function generateQuotation() {
    if (isNew || quoting) return;
    setQuoting(true);
    setError("");
    try {
      const response = await fetch("/api/po/quotations/from-customer-po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poId: id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "生成报价单失败");
      setNotice(data.existing ? `已存在报价单：${data.quotationNo ?? ""}` : `报价单已生成：${data.quotationNo ?? ""}`);
      await load();
    } catch (quotationError) {
      setError(quotationError instanceof Error ? quotationError.message : "生成报价单失败");
    } finally {
      setQuoting(false);
    }
  }

  if (loading) return <Panel className="p-10 text-center text-sm text-[#909399]">正在加载客户PO...</Panel>;
  if (!master) return <Panel className="p-10 text-center text-sm text-[#f56c6c]">{error || "未找到客户PO"}</Panel>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={goBack}><ArrowLeft size={15} />返回列表</Button>
        <div><h1 className="text-xl font-medium text-[#303133]">客户PO明细：{String(masterDraft.poNo ?? id)}</h1><p className="mt-1 text-sm text-[#909399]">维护客户PO主单和产品明细，明细允许先自由录入，后续再匹配产品主档。</p></div>
        <div className="ml-auto flex flex-wrap gap-2">
          {!isNew ? <><Button onClick={() => void matchProducts()} disabled={matching}><RefreshCw size={15} />{matching ? "匹配中..." : "自动匹配"}</Button><Button onClick={() => void generateQuotation()} disabled={quoting}><FileDown size={15} />{quoting ? "生成中..." : "生成报价单"}</Button></> : null}
          {editing ? <><Button onClick={cancelEditing} disabled={saving}><X size={15} />取消</Button><Button tone="primary" onClick={() => void saveChanges()} disabled={saving}><Save size={15} />{saving ? "保存中..." : "保存"}</Button></> : <><Button onClick={startEditing} disabled={confirmed}><Edit3 size={15} />修改</Button><Button tone="success" onClick={() => void confirmPo()} disabled={confirmed || confirming}><CheckCircle2 size={15} />{confirmed ? "已确认" : confirming ? "确认中..." : "确认"}</Button></>}
          <Button onClick={() => void load()} aria-label="刷新" title="刷新"><RefreshCw size={15} /></Button>
        </div>
      </div>
      {error ? <div className="border border-[#fde2e2] bg-[#fef0f0] px-4 py-3 text-sm text-[#f56c6c]">{error}</div> : null}
      {notice ? <div className="border border-[#c2e7b0] bg-[#f0f9eb] px-4 py-3 text-sm text-[#67c23a]">{notice}</div> : null}

      <Panel>
        <div className="border-b border-[#ebeef5] px-4 py-3 font-medium text-[#303133]">主单基础信息</div>
        <div className="grid gap-x-5 gap-y-4 p-4 md:grid-cols-2 lg:grid-cols-4">
          <label><span className="mb-1 block text-xs text-[#606266]">客户PO号 <b className="text-[#f56c6c]">*</b></span><Input className="w-full" disabled={!editing} value={String(masterDraft.poNo ?? "")} onChange={(event) => updateMaster("poNo", event.target.value)} /></label>
          <label><span className="mb-1 block text-xs text-[#606266]">项目名称</span><Input className="w-full" disabled={!editing} value={String(masterDraft.projectName ?? "")} onChange={(event) => updateMaster("projectName", event.target.value)} /></label>
          <PartySearchSelect kind="undertaking-units" label="承接单位" required value={String(masterDraft.undertakingUnitId ?? "")} selectedLabel={String(masterDraft.undertakingUnitName ?? "")} disabled={!editing} onChange={(option) => updateMaster("undertakingUnitId", option.value, "undertakingUnitName", option.shortName)} />
          <PartySearchSelect kind="customers" label="客户" required value={String(masterDraft.customerId ?? "")} selectedLabel={String(masterDraft.customerName ?? "")} disabled={!editing} onChange={(option) => updateMaster("customerId", option.value, "customerName", option.shortName)} />
          <label><span className="mb-1 block text-xs text-[#606266]">PO日期 <b className="text-[#f56c6c]">*</b></span><Input className="w-full" disabled={!editing} type="date" value={formatDateInputValue(masterDraft.poDate)} onChange={(event) => updateMaster("poDate", event.target.value)} /></label>
          <label><span className="mb-1 block text-xs text-[#606266]">交付日期</span><Input className="w-full" disabled={!editing} type="date" value={formatDateInputValue(masterDraft.deliveryDate)} onChange={(event) => updateMaster("deliveryDate", event.target.value)} /></label>
          <label><span className="mb-1 block text-xs text-[#606266]">币种</span><Input className="w-full" disabled={!editing} value={String(masterDraft.currency ?? "USD")} onChange={(event) => updateMaster("currency", event.target.value)} /></label>
          <label><span className="mb-1 block text-xs text-[#606266]">状态</span><div className="flex h-9 items-center text-sm text-[#606266]">{formatPoStatus(masterDraft.status)}</div></label>
          <label className="md:col-span-2 lg:col-span-4"><span className="mb-1 block text-xs text-[#606266]">备注</span><Textarea className="w-full" disabled={!editing} value={String(masterDraft.remark ?? "")} onChange={(event) => updateMaster("remark", event.target.value)} /></label>
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#ebeef5] px-4 py-3"><h2 className="font-medium text-[#303133]">产品明细</h2><span className="text-xs text-[#909399]">共 {items.length} 行</span>{editing ? <div className="ml-auto flex gap-2"><Button onClick={() => itemFileRef.current?.click()} disabled={importingItems}><Upload size={15} />{importingItems ? "导入中..." : "导入明细"}</Button><a href="/api/po/customer-pos/items/template"><Button><FileSpreadsheet size={15} />明细模板</Button></a><Button onClick={addItem}><Plus size={15} />新增明细</Button><input ref={itemFileRef} className="hidden" type="file" accept=".xlsx,.xls" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importItemsFile(file); event.currentTarget.value = ""; }} /></div> : null}</div>
        <StickyTable className="table-scroll overflow-auto" tableKey="customer-po-items-detail">
          <table className="min-w-[1900px] border-collapse text-sm">
            <thead className="bg-[#f5f7fa] text-[#303133]"><tr>{[
              ["lineNo", "行号"], ["customerSku", "客户SKU"], ["customerProductName", "产品名称"], ["customerBrand", "品牌"], ["customerSpec", "规格"], ["quantity", "数量"], ["unit", "单位"], ["targetUnitPrice", "目标单价"], ["currency", "币种"], ["matchedProductCode", "产品主档匹配"], ["matchStatus", "匹配状态"], ["remark", "备注"],
            ].map(([key, label]) => <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={key}>{label}</th>)}{editing ? <th className="sticky right-0 border-b border-[#ebeef5] bg-[#f5f7fa] px-3 py-3 text-left font-medium">操作</th> : null}</tr></thead>
            <tbody>{items.map((row) => <CustomerPoItemRow editing={editing} key={String(row.id)} row={row} onChange={updateItem} onRemove={removeItem} />)}{!items.length ? <tr><td className="px-4 py-12 text-center text-[#909399]" colSpan={editing ? 13 : 12}>暂无产品明细，请点击“新增明细”</td></tr> : null}</tbody>
          </table>
        </StickyTable>
      </Panel>
      <AuditInfoBar createdBy={master.createdByName} createdAt={master.createdAt} updatedBy={master.updatedByName} updatedAt={master.updatedAt} confirmedBy={master.confirmedByName} confirmedAt={master.confirmedAt} />
    </div>
  );
}

function CustomerPoItemRow({ editing, row, onChange, onRemove }: { editing: boolean; row: Row; onChange: (id: string, key: string, value: Value) => void; onRemove: (row: Row) => void }) {
  const id = String(row.id ?? "");
  const input = (key: string, type: "text" | "number" = "text", className = "w-full") => editing
    ? <Input className={className} type={type} value={String(row[key] ?? "")} onChange={(event) => onChange(id, key, type === "number" ? event.target.value : event.target.value)} />
    : formatDisplayValue(row[key], type === "number" ? "number" : undefined);
  return <tr className="hover:bg-[#fafafa]">
    <td className="border-b border-r border-[#ebeef5] px-2 py-2">{input("lineNo", "number", "w-16")}</td>
    <td className="border-b border-r border-[#ebeef5] px-2 py-2">{input("customerSku")}</td>
    <td className="border-b border-r border-[#ebeef5] px-2 py-2">{input("customerProductName")}</td>
    <td className="border-b border-r border-[#ebeef5] px-2 py-2">{input("customerBrand")}</td>
    <td className="border-b border-r border-[#ebeef5] px-2 py-2">{input("customerSpec")}</td>
    <td className="border-b border-r border-[#ebeef5] px-2 py-2">{input("quantity", "number", "w-24")}</td>
    <td className="border-b border-r border-[#ebeef5] px-2 py-2">{input("unit", "text", "w-24")}</td>
    <td className="border-b border-r border-[#ebeef5] px-2 py-2">{input("targetUnitPrice", "number", "w-28")}</td>
    <td className="border-b border-r border-[#ebeef5] px-2 py-2">{input("currency", "text", "w-24")}</td>
    <td className="border-b border-r border-[#ebeef5] px-2 py-2"><ProductMasterPicker disabled={!editing} value={String(row.matchedProductCode ?? "")} label={String(row.matchedProductName ?? "")} onChange={(product) => { onChange(id, "matchedProductCode", product?.productCode ?? ""); onChange(id, "productMasterId", product?.productMasterId ?? null); onChange(id, "productModelId", product?.productModelId ?? null); onChange(id, "productSpecId", product?.productSpecId ?? null); onChange(id, "matchStatus", product ? "matched" : "unmatched"); }} /></td>
    <td className="border-b border-r border-[#ebeef5] px-2 py-2">{String(row.matchStatus ?? "unmatched") === "matched" ? <span className="text-[#13a561]">已匹配</span> : <span className="text-[#909399]">未匹配</span>}</td>
    <td className="border-b border-r border-[#ebeef5] px-2 py-2">{input("remark")}</td>
    {editing ? <td className="sticky right-0 border-b border-[#ebeef5] bg-white px-2 py-2"><button className="inline-flex h-8 w-8 items-center justify-center text-[#f56c6c] hover:text-[#ff4949]" type="button" aria-label="删除明细" title="删除明细" onClick={() => onRemove(row)}><Trash2 size={15} /></button></td> : null}
  </tr>;
}

function PartySearchSelect({ kind, label, required, value, selectedLabel, disabled, onChange }: { kind: "customers" | "undertaking-units"; label: string; required?: boolean; value: string; selectedLabel: string; disabled: boolean; onChange: (option: PartyOption) => void }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PartyOption[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadOptions(nextQuery: string) {
    setLoading(true);
    try {
      const response = await fetch(`/api/po/customer-pos/references?kind=${kind}&keyword=${encodeURIComponent(nextQuery)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.ok) setOptions((data.options ?? []) as PartyOption[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void loadOptions(query), 180);
    return () => window.clearTimeout(timer);
  }, [kind, open, query]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function openPicker() {
    if (disabled) return;
    setOpen(true);
    setQuery(selectedLabel || value);
    window.setTimeout(() => inputRef.current?.select(), 0);
  }

  return <div className="relative" ref={wrapperRef}><span className="mb-1 block text-xs text-[#606266]">{label}{required ? <b className="text-[#f56c6c]"> *</b> : null}</span><div className="relative"><Input ref={inputRef} className="w-full pr-8 disabled:bg-[#f5f7fa]" disabled={disabled} value={open ? query : selectedLabel || value} placeholder={`请选择${label}`} onFocus={openPicker} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} /><ListFilter className="pointer-events-none absolute right-2 top-2 text-[#909399]" size={15} /></div>{open ? <div className="absolute left-0 right-0 top-[62px] z-30 max-h-60 overflow-auto border border-[#dcdfe6] bg-white shadow-lg">{loading ? <div className="px-3 py-4 text-center text-xs text-[#909399]">加载中...</div> : options.map((option) => <button className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-[#ecf5ff]" key={option.value} type="button" onClick={() => { onChange(option); setQuery(option.shortName); setOpen(false); }}>{option.label}</button>)}{!loading && !options.length ? <div className="px-3 py-4 text-center text-xs text-[#909399]">暂无匹配伙伴</div> : null}</div> : null}</div>;
}

function ProductMasterPicker({ disabled, value, label, onChange }: { disabled: boolean; value: string; label: string; onChange: (product: ProductOption | null) => void }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 320 });

  async function loadOptions(nextQuery: string) {
    setLoading(true);
    try {
      const response = await fetch(`/api/po/product-lookup?keyword=${encodeURIComponent(nextQuery)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.ok) setOptions((data.rows ?? []) as ProductOption[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void loadOptions(query), 180);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const input = inputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      const width = Math.max(320, rect.width);
      const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
      const estimatedHeight = 248;
      const top = rect.bottom + 4 + estimatedHeight <= window.innerHeight
        ? rect.bottom + 4
        : Math.max(8, rect.top - estimatedHeight - 4);
      setPosition({ top, left, width });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  function openPicker() {
    if (disabled) return;
    setOpen(true);
    setQuery(label || value);
    window.setTimeout(() => inputRef.current?.select(), 0);
  }

  if (disabled) return <span className={value ? "text-[#606266]" : "text-[#c0c4cc]"}>{value ? label || value : "未匹配"}</span>;

  const dropdown = open && typeof document !== "undefined" ? createPortal(
    <div ref={panelRef} className="fixed z-[100] max-h-60 overflow-auto border border-[#dcdfe6] bg-white shadow-lg" style={{ top: position.top, left: position.left, width: position.width }}>
      {loading ? <div className="px-3 py-4 text-center text-xs text-[#909399]">加载中...</div> : options.map((option) => <button className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-[#ecf5ff]" key={String(option.productCode)} type="button" onClick={() => { onChange(option); setQuery(String(option.productCode ?? "")); setOpen(false); }}>{String(option.productCode ?? "")} - {String(option.productName ?? "")}</button>)}
      {!loading && !options.length ? <div className="px-3 py-4 text-center text-xs text-[#909399]">暂无匹配产品</div> : null}
    </div>,
    document.body,
  ) : null;

  return <div className="relative min-w-[260px]" ref={wrapperRef}><div className="relative"><Input ref={inputRef} className="w-full pr-8" value={open ? query : label || value} placeholder="搜索产品编码、名称、品牌或规格" onFocus={openPicker} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} />{value || label ? <button className="absolute right-2 top-2 text-[#909399] hover:text-[#f56c6c]" type="button" aria-label="取消产品匹配" title="取消产品匹配" onClick={() => onChange(null)}><X size={15} /></button> : <Search className="pointer-events-none absolute right-2 top-2 text-[#909399]" size={15} />}</div>{dropdown}</div>;
}

function formatPoStatus(value: Value) {
  const text = String(value ?? "");
  if (text === "draft") return "草稿";
  if (text === "confirmed") return "已完成";
  return text || "-";
}

function formatPoListValue(value: Value, type?: string) {
  if (type === "date" || type === "datetime") return formatDisplayValue(value, type);
  return type === "status" ? formatPoStatus(value) : formatPoStatusIfStatus(value);
}

function formatPoStatusIfStatus(value: Value) {
  const text = String(value ?? "");
  return text === "draft" || text === "confirmed" ? formatPoStatus(text) : formatDisplayValue(value);
}
