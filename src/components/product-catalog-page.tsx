"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Cable,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Download,
  Edit3,
  Layers3,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { fetchAllEntityRows } from "@/lib/client-entity-fetch";
import { formatDisplayValue } from "@/lib/display-format";
import type { EntityConfig } from "@/lib/modules";
import { Button, Input, Panel, Textarea } from "./ui";
import { StickyTable } from "./sticky-table";
import { TableColumnMenu, type TableFilterOption, type TableSortOrder } from "./table-column-menu";

type Row = Record<string, string | number | boolean | null>;

type ProductListResult = {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type ProductTab = "base" | "models" | "pricing" | "references";

const masterColumns = [
  ["masterCode", "主档编码"],
  ["name", "产品主档"],
  ["category", "品类"],
  ["unit", "默认单位"],
  ["status", "状态"],
  ["createdAt", "创建时间"],
  ["updatedAt", "更新时间"],
] as const;

const modelColumns = [
  ["modelCode", "型号编码"],
  ["brand", "品牌"],
  ["model", "型号"],
  ["series", "系列"],
  ["supplierId", "供应商"],
  ["suggestedPurchaseUnitPrice", "建议采购价"],
  ["status", "状态"],
] as const;

const emptyMaster = {
  masterCode: "",
  name: "",
  nameEn: "",
  category: "",
  unit: "pcs",
  hsCodeCn: "",
  hsCodeMx: "",
  description: "",
  status: "active",
};

const emptyModel = {
  masterId: "",
  modelCode: "",
  brand: "",
  model: "",
  series: "",
  supplierId: "",
  purchaseCurrency: "USD",
  suggestedPurchaseUnitPrice: "0",
  length: "0",
  width: "0",
  height: "0",
  grossWeight: "0",
  hsCodeCn: "",
  hsCodeMx: "",
  isMagnetic: false,
  isElectric: false,
  needNom: false,
  status: "active",
};

const emptySpec = {
  modelId: "",
  specProductCode: "",
  specCode: "",
  specKey: "",
  specName: "",
  mode: "fixed",
  parameterValue: "",
  parameterUnit: "",
  purchaseCurrency: "USD",
  suggestedPurchaseUnitPrice: "0",
  length: "0",
  width: "0",
  height: "0",
  grossWeight: "0",
  status: "active",
};

export function ProductCatalogListPage({ config }: { config: EntityConfig }) {
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ProductListResult>({ rows: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
  const [expanded, setExpanded] = useState<string[]>([]);
  const [models, setModels] = useState<Record<string, Row[]>>({});
  const [sortField, setSortField] = useState("");
  const [sortOrder, setSortOrder] = useState<TableSortOrder>("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (appliedKeyword) params.set("keyword", appliedKeyword);
      if (sortField && sortOrder) {
        params.set("sortField", sortField);
        params.set("sortOrder", sortOrder);
      }
      for (const [field, values] of Object.entries(columnFilters)) {
        for (const value of values) params.append(`filter.${field}`, value);
      }
      const response = await fetch(`/api/entities/product-masters?${params.toString()}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "产品主档加载失败");
      setResult(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "产品主档加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [appliedKeyword, columnFilters, page, sortField, sortOrder]);

  async function toggleMaster(id: string) {
    if (expanded.includes(id)) {
      setExpanded((current) => current.filter((item) => item !== id));
      return;
    }
    setExpanded((current) => [...current, id]);
    if (models[id]) return;
    try {
      const rows = await fetchAllEntityRows<Row>("product-models", { masterId: id });
      setModels((current) => ({ ...current, [id]: rows }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "品牌型号加载失败");
    }
  }

  async function loadOptions(field: string): Promise<TableFilterOption[]> {
    const values = new Map<string, number>();
    for (const row of result.rows) {
      const value = String(row[field] ?? "").trim();
      if (value) values.set(value, (values.get(value) ?? 0) + 1);
    }
    return [...values.entries()].map(([value, count]) => ({ value, count }));
  }

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-[#ebeef5] p-4">
          <div className="mr-auto">
            <h1 className="text-xl font-medium text-[#303133]">产品主档</h1>
            <p className="mt-1 text-sm text-[#909399]">一个主档维护多个品牌型号，每个品牌型号下的每个规格拥有独立产品编码。</p>
          </div>
          <Button onClick={() => void load()} disabled={loading}><RefreshCw size={15} />刷新</Button>
          <a className="inline-flex h-9 items-center gap-1 border border-[#dcdfe6] bg-white px-3 text-sm text-[#606266] hover:border-[#1890ff] hover:text-[#1890ff]" href="/api/entities/product-masters/export"><Download size={15} />导出</a>
          <Link className="inline-flex h-9 items-center gap-1 border border-[#dcdfe6] bg-white px-3 text-sm text-[#606266] hover:border-[#1890ff] hover:text-[#1890ff]" href="/product-catalog/new"><Plus size={15} />新建产品主档</Link>
        </div>
        <div className="flex flex-wrap items-end gap-3 border-b border-[#ebeef5] p-4">
          <label className="min-w-[280px] flex-1"><span className="mb-1 block text-xs font-semibold text-[#606266]">关键字</span><div className="flex gap-2"><Input value={keyword} placeholder="主档编码、产品名称或品类" onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setPage(1); setAppliedKeyword(keyword.trim()); } }} /><Button tone="primary" onClick={() => { setPage(1); setAppliedKeyword(keyword.trim()); }}><Search size={15} />查询</Button></div></label>
          <span className="text-sm text-[#909399]">共 {result.total} 条产品主档</span>
        </div>
        {error ? <div className="border-b border-[#fde2e2] bg-[#fef0f0] px-4 py-3 text-sm text-[#f56c6c]">{error}<button className="ml-3 underline" type="button" onClick={() => setError("")}>关闭</button></div> : null}
        <StickyTable className="table-scroll overflow-auto" tableKey="product-masters">
          <table className="min-w-[1180px] border-collapse text-sm">
            <thead className="bg-[#f5f7fa]"><tr><th className="w-10 border-b border-r border-[#ebeef5]" />{masterColumns.map(([field, label]) => <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={field}><TableColumnMenu column={{ key: field, label, sortable: true, filterable: true }} filterValues={columnFilters[field] ?? []} sortOrder={sortField === field ? sortOrder : ""} loadOptions={() => loadOptions(field)} onFilter={(values) => { setPage(1); setColumnFilters((current) => ({ ...current, [field]: values })); }} onSort={(order) => { setPage(1); setSortField(field); setSortOrder(order); }} /></th>)}<th className="border-b border-[#ebeef5] px-3 py-3 text-left font-medium">操作</th></tr></thead>
            <tbody>
              {loading ? <tr><td className="px-4 py-12 text-center text-[#909399]" colSpan={masterColumns.length + 2}>加载中...</td></tr> : result.rows.map((row) => {
                const id = String(row.id ?? "");
                const isOpen = expanded.includes(id);
                const childRows = models[id] ?? [];
                return <ProductMasterRow key={id} row={row} id={id} isOpen={isOpen} models={childRows} onToggle={() => void toggleMaster(id)} />;
              })}
              {!loading && !result.rows.length ? <tr><td className="px-4 py-12 text-center text-[#909399]" colSpan={masterColumns.length + 2}>暂无产品主档</td></tr> : null}
            </tbody>
          </table>
        </StickyTable>
        <div className="flex items-center justify-between border-t border-[#ebeef5] px-4 py-3 text-sm text-[#606266]"><span>第 {result.page} / {Math.max(1, result.totalPages)} 页</span><div className="flex gap-2"><Button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</Button><Button disabled={page >= result.totalPages} onClick={() => setPage((value) => value + 1)}>下一页</Button></div></div>
      </Panel>
    </div>
  );
}

function ProductMasterRow({ row, id, isOpen, models, onToggle }: { row: Row; id: string; isOpen: boolean; models: Row[]; onToggle: () => void }) {
  return <>
    <tr className="hover:bg-[#f5f7fa]">
      <td className="border-b border-r border-[#ebeef5] px-2 py-3 text-center"><button className="inline-flex h-6 w-6 items-center justify-center text-[#606266] hover:text-[#1890ff]" type="button" title={isOpen ? "收起品牌型号" : "展开品牌型号"} onClick={onToggle}>{isOpen ? <ChevronRight className="rotate-90" size={16} /> : <ChevronRight size={16} />}</button></td>
      <td className="border-b border-r border-[#ebeef5] px-3 py-3 font-mono"><Link className="text-[#1890ff] hover:underline" href={`/product-catalog/${encodeURIComponent(id)}`}>{String(row.masterCode ?? "-")}</Link></td>
      <td className="border-b border-r border-[#ebeef5] px-3 py-3"><strong>{String(row.name ?? "-")}</strong>{row.nameEn ? <small className="ml-2 text-[#909399]">{String(row.nameEn)}</small> : null}</td>
      <td className="border-b border-r border-[#ebeef5] px-3 py-3">{String(row.category ?? "-")}</td>
      <td className="border-b border-r border-[#ebeef5] px-3 py-3">{String(row.unit ?? "-")}</td>
      <td className="border-b border-r border-[#ebeef5] px-3 py-3">{String(row.status ?? "active") === "active" ? <span className="inline-flex items-center gap-1 text-[#13a561]"><BadgeCheck size={14} />已启用</span> : "已停用"}</td>
      <td className="border-b border-r border-[#ebeef5] px-3 py-3 whitespace-nowrap">{formatDisplayValue(row.createdAt, "datetime")}</td>
      <td className="border-b border-r border-[#ebeef5] px-3 py-3 whitespace-nowrap">{formatDisplayValue(row.updatedAt, "datetime")}</td>
      <td className="border-b border-[#ebeef5] px-3 py-3 whitespace-nowrap"><Link className="inline-flex items-center gap-1 text-[#1890ff] hover:underline" href={`/product-catalog/${encodeURIComponent(id)}`}><Edit3 size={14} />查看详情</Link></td>
    </tr>
    {isOpen ? <tr className="bg-[#fafcff]"><td className="border-b border-[#ebeef5]" /><td className="border-b border-[#ebeef5] px-3 py-2 text-xs font-medium text-[#909399]" colSpan={9}>品牌型号（{models.length}）</td></tr> : null}
    {isOpen ? models.map((model) => <tr className="bg-[#fafcff] text-xs" key={String(model.id)}><td className="border-b border-[#ebeef5]" /><td className="border-b border-[#ebeef5] px-3 py-2" colSpan={2}><span className="mr-2 text-[#1890ff]">{String(model.brand ?? "-")}</span>{String(model.model ?? "-")}</td><td className="border-b border-[#ebeef5] px-3 py-2">{String(model.series ?? "-")}</td><td className="border-b border-[#ebeef5] px-3 py-2 font-mono">{String(model.modelCode ?? "-")}</td><td className="border-b border-[#ebeef5] px-3 py-2">{String(model.status ?? "active") === "active" ? "已启用" : "已停用"}</td><td className="border-b border-[#ebeef5] px-3 py-2" colSpan={3}>{String(model.supplierId ?? "未指定供应商")}</td></tr>) : null}
    {isOpen && !models.length ? <tr><td className="border-b border-[#ebeef5]" /><td className="px-3 py-4 text-xs text-[#909399]" colSpan={9}>该主档暂无品牌型号</td></tr> : null}
  </>;
}

export function ProductCatalogDetailPage({ masterConfig, modelConfig, specConfig, id }: { masterConfig: EntityConfig; modelConfig: EntityConfig; specConfig: EntityConfig; id: string }) {
  const isNew = id === "new";
  const [tab, setTab] = useState<ProductTab>("base");
  const [master, setMaster] = useState<Row | null>(isNew ? { ...emptyMaster } : null);
  const [models, setModels] = useState<Row[]>([]);
  const [specifications, setSpecifications] = useState<Row[]>([]);
  const [activeModelId, setActiveModelId] = useState("");
  const [modelDraft, setModelDraft] = useState({ ...emptyModel });
  const [specDraft, setSpecDraft] = useState({ ...emptySpec });
  const [editingModelId, setEditingModelId] = useState("");
  const [editingMaster, setEditingMaster] = useState(isNew);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load(masterId = id) {
    setLoading(true);
    try {
      const masterResponse = await fetch(`/api/entities/product-masters/${encodeURIComponent(masterId)}`, { cache: "no-store" });
      const masterData = await masterResponse.json().catch(() => ({}));
      if (!masterResponse.ok) throw new Error(masterData.error ?? "产品主档不存在");
      const nextModels = await fetchAllEntityRows<Row>("product-models", { masterId });
      const nextSpecifications = (await Promise.all(nextModels.map((model) => fetchAllEntityRows<Row>("product-specifications", { modelId: String(model.id) })))).flat();
      setMaster(masterData);
      setModels(nextModels);
      setSpecifications(nextSpecifications);
      setActiveModelId((current) => current && nextModels.some((model) => String(model.id) === current) ? current : String(nextModels[0]?.id ?? ""));
      setModelDraft({ ...emptyModel, masterId });
      setSpecDraft({ ...emptySpec });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "产品主档加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (!isNew) void load(); }, [id, isNew]);

  const activeModel = useMemo(() => models.find((item) => String(item.id) === activeModelId), [activeModelId, models]);
  const activeSpecifications = useMemo(() => specifications.filter((item) => String(item.modelId) === activeModelId), [activeModelId, specifications]);
  const configuredCount = specifications.length;

  async function saveMaster(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const body = { ...(master ?? emptyMaster) };
      const response = await fetch(`/api/entities/product-masters${isNew ? "" : `/${encodeURIComponent(id)}`}`, { method: isNew ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "产品主档保存失败");
      if (isNew) {
        window.location.href = `/product-catalog/${encodeURIComponent(String(data.id))}`;
        return;
      }
      setMaster(data);
      setEditingMaster(false);
      setNotice("产品主档已保存");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "产品主档保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveModel(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`/api/entities/product-models${editingModelId ? `/${encodeURIComponent(editingModelId)}` : ""}`, { method: editingModelId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...modelDraft, masterId: id, suggestedPurchaseUnitPrice: Number(modelDraft.suggestedPurchaseUnitPrice || 0), length: Number(modelDraft.length || 0), width: Number(modelDraft.width || 0), height: Number(modelDraft.height || 0), grossWeight: Number(modelDraft.grossWeight || 0) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "品牌型号保存失败");
      setEditingModelId("");
      setModelDraft({ ...emptyModel, masterId: id });
      setNotice(editingModelId ? "品牌型号已保存" : "品牌型号已新增");
      await load();
      setActiveModelId(String(data.id ?? ""));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "品牌型号保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveSpecification(event: React.FormEvent) {
    event.preventDefault();
    if (!activeModelId) { setError("请先选择品牌型号"); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/entities/product-specifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...specDraft, modelId: activeModelId, parameterValue: specDraft.parameterValue === "" ? null : Number(specDraft.parameterValue), suggestedPurchaseUnitPrice: Number(specDraft.suggestedPurchaseUnitPrice || 0), length: Number(specDraft.length || 0), width: Number(specDraft.width || 0), height: Number(specDraft.height || 0), grossWeight: Number(specDraft.grossWeight || 0) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "产品规格保存失败");
      setSpecDraft({ ...emptySpec });
      setNotice(`规格 ${String(data.specProductCode ?? "")} 已新增`);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "产品规格保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSpecification(specId: string) {
    if (!window.confirm("确认删除这条未被引用的产品规格吗？")) return;
    const response = await fetch(`/api/entities/product-specifications/${encodeURIComponent(specId)}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error ?? "产品规格删除失败"); return; }
    await load();
  }

  function editModel(item: Row) {
    setEditingModelId(String(item.id));
    setModelDraft(Object.fromEntries(Object.keys(emptyModel).map((key) => [key, key.startsWith("is") || key === "needNom" ? Boolean(item[key]) : String(item[key] ?? "")])) as typeof emptyModel);
    setTab("models");
  }

  if (loading) return <Panel className="p-10 text-center text-sm text-[#909399]">正在加载产品主档...</Panel>;
  if (!master) return <Panel className="p-10 text-center text-sm text-[#f56c6c]">{error || "未找到产品主档"}</Panel>;

  const title = String(master.name ?? "").trim() || (isNew ? "新建产品主档" : "产品主档");
  const tabs: Array<{ key: ProductTab; label: string; icon: typeof Layers3 }> = [
    { key: "base", label: "基础资料", icon: PackageCheck },
    { key: "models", label: "品牌型号", icon: Layers3 },
    { key: "pricing", label: "报价规格", icon: CircleDollarSign },
    { key: "references", label: "引用记录", icon: ClipboardList },
  ];

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3"><Link className="inline-flex h-9 items-center gap-1 border border-[#dcdfe6] bg-white px-3 text-sm text-[#606266] hover:border-[#1890ff] hover:text-[#1890ff]" href="/product-catalog"><ChevronRight className="rotate-180" size={15} />返回产品主档</Link><div><div className="text-xs text-[#909399]">集采系统 / 产品主档</div><h1 className="mt-1 text-xl font-medium text-[#303133]">{title}</h1></div><div className="ml-auto flex items-center gap-2"><span className="inline-flex items-center gap-1 text-sm text-[#13a561]"><BadgeCheck size={15} />{String(master.status ?? "active") === "active" ? "已启用" : "已停用"}</span>{!isNew ? <span className="font-mono text-sm text-[#909399]">{String(master.masterCode ?? "")}</span> : null}<Button onClick={() => void load()}><RefreshCw size={15} />刷新</Button></div></div>
    {error ? <div className="border border-[#fde2e2] bg-[#fef0f0] px-4 py-3 text-sm text-[#f56c6c]">{error}<button className="ml-3 underline" type="button" onClick={() => setError("")}>关闭</button></div> : null}
    {notice ? <div className="border border-[#c2e7b0] bg-[#f0f9eb] px-4 py-3 text-sm text-[#67c23a]">{notice}<button className="ml-3 underline" type="button" onClick={() => setNotice("")}>关闭</button></div> : null}
    <Panel className="overflow-hidden"><div className="flex flex-wrap items-center gap-4 border-b border-[#ebeef5] bg-[#fbfdff] p-4"><div className="flex h-12 w-12 items-center justify-center bg-[#ecf5ff] text-[#1890ff]"><Cable size={25} /></div><div className="mr-auto"><strong className="text-lg text-[#303133]">{title}</strong><div className="mt-1 text-sm text-[#909399]">{String(master.category ?? "未设置品类")} · {String(master.unit ?? "-")}</div></div><Metric label="品牌型号" value={models.length} suffix="个" /><Metric label="独立规格编码" value={configuredCount} suffix="条" /></div><div className="flex overflow-x-auto border-b border-[#ebeef5]">{tabs.map((item) => { const Icon = item.icon; return <button className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-5 py-3 text-sm ${tab === item.key ? "border-[#1890ff] text-[#1890ff]" : "border-transparent text-[#606266] hover:text-[#1890ff]"}`} key={item.key} type="button" onClick={() => setTab(item.key)}><Icon size={15} />{item.label}</button>; })}</div>
      {tab === "base" ? <MasterBase master={master} editing={editingMaster} onChange={(patch) => setMaster((current) => ({ ...(current ?? {}), ...patch }))} onEdit={() => setEditingMaster(true)} onSave={saveMaster} saving={saving} isNew={isNew} /> : null}
      {tab === "models" ? <ModelsTab models={models} activeModelId={activeModelId} draft={modelDraft} editingId={editingModelId} saving={saving} onSelect={setActiveModelId} onDraftChange={(patch) => setModelDraft((current) => ({ ...current, ...patch }))} onEdit={editModel} onCancel={() => { setEditingModelId(""); setModelDraft({ ...emptyModel, masterId: id }); }} onSave={saveModel} /> : null}
      {tab === "pricing" ? <PricingTab activeModel={activeModel} specifications={activeSpecifications} draft={specDraft} saving={saving} onDraftChange={(patch) => setSpecDraft((current) => ({ ...current, ...patch }))} onSave={saveSpecification} onDelete={deleteSpecification} onSelectModel={setActiveModelId} models={models} /> : null}
      {tab === "references" ? <div className="p-6"><div className="flex items-center gap-2 text-base font-medium text-[#303133]"><ClipboardList size={18} />引用记录</div><p className="mt-2 text-sm leading-6 text-[#606266]">客户 PO、报价单和历史报价通过独立产品编码关联。单据确认后保存产品名称、品牌型号、规格键和采购价快照，后续停用产品不会改写历史单据。</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><Metric label="品牌型号" value={models.length} suffix="个" /><Metric label="固定规格" value={specifications.filter((item) => String(item.mode ?? "fixed") === "fixed").length} suffix="条" /><Metric label="参数规格" value={specifications.filter((item) => String(item.mode ?? "fixed") === "parameter").length} suffix="条" /></div></div> : null}
    </Panel>
  </div>;
}

function MasterBase({ master, editing, isNew, saving, onChange, onEdit, onSave }: { master: Row; editing: boolean; isNew: boolean; saving: boolean; onChange: (patch: Row) => void; onEdit: () => void; onSave: (event: React.FormEvent) => void }) {
  const field = (key: string, label: string, type: "text" | "textarea" = "text") => <label className="block"><span className="mb-1 block text-xs text-[#606266]">{label}</span>{type === "textarea" ? <Textarea disabled={!editing} value={String(master[key] ?? "")} onChange={(event) => onChange({ [key]: event.target.value })} /> : <Input disabled={!editing} className="w-full" value={String(master[key] ?? "")} onChange={(event) => onChange({ [key]: event.target.value })} />}</label>;
  return <form className="p-5" onSubmit={onSave}><div className="mb-4 flex items-center"><div className="text-base font-medium text-[#303133]">基础资料</div><div className="ml-auto">{editing ? <Button tone="primary" disabled={saving} type="submit"><Save size={15} />{saving ? "保存中..." : "保存"}</Button> : <Button type="button" onClick={onEdit}><Edit3 size={15} />修改</Button>}</div></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{field("masterCode", "产品主档编码")}{field("name", "产品名称")}{field("nameEn", "产品名称（英文）")}{field("category", "产品品类")}{field("unit", "默认单位")}{field("hsCodeCn", "中国 HS 编码")}{field("hsCodeMx", "目的地 HS 编码")}{field("status", "状态")}{field("description", "描述", "textarea")}</div>{isNew ? <div className="mt-3 text-xs text-[#909399]">产品主档编码用于产品族归档；品牌型号和规格编码在下方分别维护。</div> : null}</form>;
}

function ModelsTab({ models, activeModelId, draft, editingId, saving, onSelect, onDraftChange, onEdit, onCancel, onSave }: { models: Row[]; activeModelId: string; draft: typeof emptyModel; editingId: string; saving: boolean; onSelect: (id: string) => void; onDraftChange: (patch: Partial<typeof emptyModel>) => void; onEdit: (row: Row) => void; onCancel: () => void; onSave: (event: React.FormEvent) => void }) {
  return <div className="grid gap-5 p-5 lg:grid-cols-[260px_minmax(0,1fr)]"><aside className="border border-[#ebeef5] bg-[#fbfdff]"><div className="flex items-center justify-between border-b border-[#ebeef5] p-3"><div><div className="text-xs text-[#909399]">品牌型号</div><strong className="text-lg text-[#303133]">{models.length}</strong></div><Layers3 className="text-[#1890ff]" size={20} /></div><div className="max-h-[430px] overflow-auto">{models.map((item, index) => <button className={`flex w-full items-center gap-2 border-b border-[#ebeef5] p-3 text-left ${String(item.id) === activeModelId ? "bg-[#ecf5ff] text-[#1890ff]" : "hover:bg-white"}`} key={String(item.id)} type="button" onClick={() => onSelect(String(item.id))}><span className="flex h-7 w-7 items-center justify-center bg-[#eef5ff] text-[#1890ff]"><Cable size={15} /></span><span className="min-w-0 flex-1"><strong className="block truncate">{String(item.brand ?? "-")}</strong><small className="block truncate text-[#909399]">{String(item.model ?? "-")}</small></span><ChevronRight size={14} /></button>)}{!models.length ? <div className="p-5 text-center text-xs text-[#909399]">暂无品牌型号</div> : null}</div></aside><section className="min-w-0"><div className="mb-4 flex items-center"><div><h2 className="text-base font-medium text-[#303133]">{editingId ? "修改品牌型号" : "新增品牌型号"}</h2><p className="mt-1 text-xs text-[#909399]">每个品牌型号可继续配置独立规格编码和建议采购价。</p></div>{editingId ? <Button className="ml-auto" type="button" onClick={onCancel}>取消编辑</Button> : null}</div><form className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" onSubmit={onSave}>{(["modelCode", "brand", "model", "series", "supplierId", "purchaseCurrency"] as const).map((key) => <label key={key}><span className="mb-1 block text-xs text-[#606266]">{({ modelCode: "品牌型号编码", brand: "品牌", model: "型号", series: "产品系列", supplierId: "供应商ID", purchaseCurrency: "采购币种" } as Record<string, string>)[key]}</span><Input className="w-full" required={key === "brand" || key === "model"} value={String(draft[key])} onChange={(event) => onDraftChange({ [key]: event.target.value })} placeholder={key === "modelCode" ? "留空自动生成" : ""} /></label>)}{(["suggestedPurchaseUnitPrice", "length", "width", "height", "grossWeight"] as const).map((key) => <label key={key}><span className="mb-1 block text-xs text-[#606266]">{({ suggestedPurchaseUnitPrice: "建议采购价", length: "长（cm）", width: "宽（cm）", height: "高（cm）", grossWeight: "毛重（kg）" } as Record<string, string>)[key]}</span><Input className="w-full" type="number" step="0.0001" value={String(draft[key])} onChange={(event) => onDraftChange({ [key]: event.target.value })} /></label>)}<label className="flex items-center gap-2 text-sm text-[#606266]"><input checked={draft.needNom} type="checkbox" onChange={(event) => onDraftChange({ needNom: event.target.checked })} />需要 NOM</label><label className="flex items-center gap-2 text-sm text-[#606266]"><input checked={draft.isMagnetic} type="checkbox" onChange={(event) => onDraftChange({ isMagnetic: event.target.checked })} />带磁</label><label className="flex items-center gap-2 text-sm text-[#606266]"><input checked={draft.isElectric} type="checkbox" onChange={(event) => onDraftChange({ isElectric: event.target.checked })} />带电</label><div className="md:col-span-2 lg:col-span-3 flex justify-end"><Button tone="primary" disabled={saving} type="submit"><Plus size={15} />{editingId ? "保存品牌型号" : "新增品牌型号"}</Button></div></form><div className="mt-7"><div className="mb-2 text-sm font-medium text-[#303133]">已建品牌型号</div><StickyTable className="table-scroll overflow-auto" tableKey="product-models"><table className="min-w-[900px] border-collapse text-sm"><thead className="bg-[#f5f7fa]"><tr>{modelColumns.map(([field, label]) => <th className="border-b border-r border-[#ebeef5] px-3 py-2 text-left" key={field}>{label}</th>)}<th className="border-b border-[#ebeef5] px-3 py-2 text-left">操作</th></tr></thead><tbody>{models.map((row) => <tr className="hover:bg-[#f5f7fa]" key={String(row.id)}>{modelColumns.map(([field]) => <td className="border-b border-r border-[#ebeef5] px-3 py-2" key={field}>{field === "suggestedPurchaseUnitPrice" ? formatDisplayValue(row[field], "money") : String(row[field] ?? "-")}</td>)}<td className="border-b border-[#ebeef5] px-3 py-2"><button className="mr-3 inline-flex items-center gap-1 text-[#1890ff]" type="button" onClick={() => onEdit(row)}><Edit3 size={14} />编辑</button><button className="inline-flex items-center gap-1 text-[#f56c6c]" type="button" onClick={() => onSelect(String(row.id))}><Check size={14} />选中</button></td></tr>)}{!models.length ? <tr><td className="px-3 py-8 text-center text-[#909399]" colSpan={modelColumns.length + 1}>暂无品牌型号</td></tr> : null}</tbody></table></StickyTable></div></section></div>;
}

function PricingTab({ activeModel, models, specifications, draft, saving, onDraftChange, onSave, onDelete, onSelectModel }: { activeModel?: Row; models: Row[]; specifications: Row[]; draft: typeof emptySpec; saving: boolean; onDraftChange: (patch: Partial<typeof emptySpec>) => void; onSave: (event: React.FormEvent) => void; onDelete: (id: string) => void; onSelectModel: (id: string) => void }) {
  return <div className="p-5"><div className="mb-4 flex flex-wrap items-center gap-3"><div className="mr-auto"><h2 className="text-base font-medium text-[#303133]">报价规格与独立编码</h2><p className="mt-1 text-xs text-[#909399]">按品牌型号维护固定规格或参数规格；产品编码用于客户 PO 和历史报价精确匹配。</p></div><select className="h-9 min-w-[240px] rounded border border-[#dcdfe6] bg-white px-3 text-sm" value={String(activeModel?.id ?? "")} onChange={(event) => onSelectModel(event.target.value)}><option value="">请选择品牌型号</option>{models.map((model) => <option key={String(model.id)} value={String(model.id)}>{String(model.brand ?? "")} · {String(model.model ?? "")}</option>)}</select></div>{activeModel ? <><div className="mb-4 border border-[#dcdfe6] bg-[#fbfdff] p-4"><div className="flex items-center gap-2"><CircleDollarSign size={17} className="text-[#1890ff]" /><strong>{String(activeModel.brand ?? "")} · {String(activeModel.model ?? "")}</strong><span className="ml-auto text-xs text-[#909399]">{String(activeModel.modelCode ?? "")}</span></div></div><StickyTable className="table-scroll overflow-auto border border-[#ebeef5]" tableKey="product-specifications"><table className="min-w-[1180px] border-collapse text-sm"><thead className="bg-[#f5f7fa]"><tr>{[["specProductCode", "规格商品编码"], ["specCode", "规格编码"], ["specName", "规格名称"], ["mode", "模式"], ["parameterValue", "参数值"], ["purchaseCurrency", "采购币种"], ["suggestedPurchaseUnitPrice", "建议采购价"], ["length", "长（cm）"], ["width", "宽（cm）"], ["height", "高（cm）"], ["grossWeight", "毛重（kg）"], ["status", "状态"]].map(([field, label]) => <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-2 text-left" key={field}>{label}</th>)}<th className="border-b border-[#ebeef5] px-3 py-2">操作</th></tr></thead><tbody>{specifications.map((row) => <tr key={String(row.id)}>{["specProductCode", "specCode", "specName", "mode", "parameterValue", "purchaseCurrency", "suggestedPurchaseUnitPrice", "length", "width", "height", "grossWeight", "status"].map((field) => <td className={`border-b border-r border-[#ebeef5] px-3 py-2 ${field.includes("Code") || field === "specProductCode" ? "font-mono" : ""}`} key={field}>{field === "suggestedPurchaseUnitPrice" ? formatDisplayValue(row[field], "money") : String(row[field] ?? "-")}</td>)}<td className="border-b border-[#ebeef5] px-3 py-2"><button className="inline-flex items-center gap-1 text-[#f56c6c]" type="button" onClick={() => onDelete(String(row.id))}><Trash2 size={14} />删除</button></td></tr>)}{!specifications.length ? <tr><td className="px-3 py-8 text-center text-[#909399]" colSpan={13}>当前型号暂无规格</td></tr> : null}</tbody></table></StickyTable><form className="mt-5 border border-[#ebeef5] bg-[#fbfdff] p-4" onSubmit={onSave}><div className="mb-3 flex items-center gap-2"><Plus size={16} className="text-[#1890ff]" /><strong>新增产品规格</strong><span className="text-xs text-[#909399]">每个规格商品编码必须唯一</span></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{(["specProductCode", "specCode", "specKey", "specName", "mode", "parameterValue", "parameterUnit", "purchaseCurrency", "suggestedPurchaseUnitPrice", "length", "width", "height", "grossWeight"] as const).map((key) => <label key={key}><span className="mb-1 block text-xs text-[#606266]">{({ specProductCode: "规格商品编码", specCode: "规格编码", specKey: "规格键", specName: "规格名称", mode: "规格模式", parameterValue: "参数值", parameterUnit: "参数单位", purchaseCurrency: "采购币种", suggestedPurchaseUnitPrice: "建议采购价", length: "长（cm）", width: "宽（cm）", height: "高（cm）", grossWeight: "毛重（kg）" } as Record<string, string>)[key]}</span>{key === "mode" ? <select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-3 text-sm" value={String(draft[key])} onChange={(event) => onDraftChange({ mode: event.target.value })}><option value="fixed">固定规格</option><option value="parameter">参数规格</option></select> : <Input className="w-full" required={key === "specProductCode" || key === "specKey" || key === "specName"} type={["parameterValue", "suggestedPurchaseUnitPrice", "length", "width", "height", "grossWeight"].includes(key) ? "number" : "text"} step="0.0001" value={String(draft[key])} onChange={(event) => onDraftChange({ [key]: event.target.value })} placeholder={key === "specProductCode" ? "例如：CAB-001-NETLINK-5M" : ""} />}</label>)}</div><div className="mt-4 flex justify-end"><Button tone="primary" disabled={saving} type="submit"><Save size={15} />保存规格</Button></div></form></> : <div className="border border-dashed border-[#dcdfe6] p-10 text-center text-sm text-[#909399]"><Layers3 className="mx-auto mb-2" size={24} />请先选择品牌型号</div>}</div>;
}

function Metric({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return <div className="min-w-[110px] border-l border-[#ebeef5] pl-4"><div className="text-xs text-[#909399]">{label}</div><div className="mt-1 text-xl font-medium text-[#303133]">{value}<small className="ml-1 text-xs font-normal text-[#909399]">{suffix}</small></div></div>;
}
