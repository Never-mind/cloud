"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Cable,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Download,
  Edit3,
  Eye,
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
  ["modelCount", "品牌型号"],
  ["specCount", "固定规格"],
  ["unit", "默认单位"],
  ["status", "状态"],
  ["createdAt", "创建时间"],
  ["updatedAt", "更新时间"],
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 px-1">
        <div className="mr-auto"><h1 className="text-2xl font-semibold text-[#303133]">产品主档</h1><p className="mt-1 text-sm text-[#909399]">按设备类型归纳产品，展开后查看该主档下的品牌型号与报价规格。</p></div>
        <Button onClick={() => void load()} disabled={loading}><RefreshCw size={15} />刷新</Button>
        <a className="inline-flex h-9 items-center gap-1 border border-[#dcdfe6] bg-white px-3 text-sm text-[#606266] hover:border-[#1890ff] hover:text-[#1890ff]" href="/api/entities/product-masters/export"><Download size={15} />导出固定规格</a>
        <Link className="inline-flex h-9 items-center gap-1 border border-[#1890ff] bg-[#1890ff] px-3 text-sm text-white hover:opacity-85" href="/product-catalog/new"><Plus size={15} />新建产品主档</Link>
      </div>
      <Panel>
        <div className="flex flex-wrap items-end gap-3 border-b border-[#ebeef5] p-4">
          <label className="min-w-[280px] flex-1"><span className="sr-only">搜索产品主档</span><div className="flex gap-2"><Input className="h-10 w-full" value={keyword} placeholder="搜索主档编码、产品名称或品类" onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setPage(1); setAppliedKeyword(keyword.trim()); } }} /><Button tone="primary" className="h-10 w-10 px-0" aria-label="查询" title="查询" onClick={() => { setPage(1); setAppliedKeyword(keyword.trim()); }}><Search size={16} /></Button></div></label>
          <span className="text-sm text-[#909399]">共 {result.total} 条</span>
        </div>
        {error ? <div className="border-b border-[#fde2e2] bg-[#fef0f0] px-4 py-3 text-sm text-[#f56c6c]">{error}<button className="ml-3 underline" type="button" onClick={() => setError("")}>关闭</button></div> : null}
        <StickyTable className="table-scroll overflow-auto" tableKey="product-masters">
            <table className="min-w-[1500px] border-collapse text-sm">
            <thead className="bg-[#f5f7fa]"><tr><th className="w-10 border-b border-r border-[#ebeef5]" />{masterColumns.map(([field, label]) => <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={field}><TableColumnMenu column={{ key: field, label, sortable: !["modelCount", "specCount"].includes(field), filterable: !["modelCount", "specCount"].includes(field) }} filterValues={columnFilters[field] ?? []} sortOrder={sortField === field ? sortOrder : ""} loadOptions={() => loadOptions(field)} onFilter={(values) => { setPage(1); setColumnFilters((current) => ({ ...current, [field]: values })); }} onSort={(order) => { setPage(1); setSortField(field); setSortOrder(order); }} /></th>)}<th className="border-b border-[#ebeef5] px-3 py-3 text-left font-medium">操作</th></tr></thead>
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
      <td className="border-b border-r border-[#ebeef5] px-3 py-3"><strong className="text-[#2468b5]">{Number(row.modelCount ?? 0)}</strong> 个型号</td>
      <td className="border-b border-r border-[#ebeef5] px-3 py-3"><strong className="text-[#2468b5]">{Number(row.specCount ?? 0)}</strong> 条</td>
      <td className="border-b border-r border-[#ebeef5] px-3 py-3">{String(row.unit ?? "-")}</td>
      <td className="border-b border-r border-[#ebeef5] px-3 py-3">{String(row.status ?? "active") === "active" ? <span className="inline-flex items-center gap-1 text-[#13a561]"><BadgeCheck size={14} />已启用</span> : "已停用"}</td>
      <td className="border-b border-r border-[#ebeef5] px-3 py-3 whitespace-nowrap">{formatDisplayValue(row.createdAt, "datetime")}</td>
      <td className="border-b border-r border-[#ebeef5] px-3 py-3 whitespace-nowrap">{formatDisplayValue(row.updatedAt, "datetime")}</td>
      <td className="border-b border-[#ebeef5] px-3 py-3 whitespace-nowrap"><Link className="inline-flex items-center gap-1 text-[#606266] hover:text-[#1890ff]" title="查看详情" aria-label="查看详情" href={`/product-catalog/${encodeURIComponent(id)}`}><Eye size={16} /></Link></td>
    </tr>
    {isOpen ? <tr className="bg-[#f5f7fa] text-xs text-[#8492a6]"><td className="border-b border-[#ebeef5]" /><td className="border-b border-[#ebeef5] px-3 py-2 font-medium">品牌型号</td><td className="border-b border-[#ebeef5] px-3 py-2">计价方式</td><td className="border-b border-[#ebeef5] px-3 py-2">固定规格</td><td className="border-b border-[#ebeef5] px-3 py-2">型号编码 / 系列</td><td className="border-b border-[#ebeef5] px-3 py-2">状态</td><td className="border-b border-[#ebeef5] px-3 py-2">创建时间</td><td className="border-b border-[#ebeef5] px-3 py-2">更新时间</td><td className="border-b border-[#ebeef5] px-3 py-2">操作</td></tr> : null}
    {isOpen ? models.map((model) => <tr className="bg-[#fafcff] text-xs" key={String(model.id)}><td className="border-b border-[#ebeef5]" /><td className="border-b border-[#ebeef5] px-3 py-3"><strong className="text-[#303133]">{String(model.brand ?? "-")}</strong><span className="block text-[#909399]">{String(model.model ?? "-")}</span></td><td className="border-b border-[#ebeef5] px-3 py-3"><span className="bg-[#fff7e6] px-2 py-1 text-[#ad6800]">固定 + 线性</span></td><td className="border-b border-[#ebeef5] px-3 py-3">{Number(model.specCount ?? 0)} 条</td><td className="border-b border-[#ebeef5] px-3 py-3"><span className="font-mono text-[#606266]">{String(model.modelCode ?? "-")}</span><span className="block text-[#909399]">{String(model.series ?? "-")}</span></td><td className="border-b border-[#ebeef5] px-3 py-3">{String(model.status ?? "active") === "active" ? <span className="text-[#13a561]">已启用</span> : "已停用"}</td><td className="border-b border-[#ebeef5] px-3 py-3 whitespace-nowrap">{formatDisplayValue(model.createdAt, "datetime")}</td><td className="border-b border-[#ebeef5] px-3 py-3 whitespace-nowrap">{formatDisplayValue(model.updatedAt, "datetime")}</td><td className="border-b border-[#ebeef5] px-3 py-3"><Link className="text-[#606266] hover:text-[#1890ff]" title="查看型号" aria-label="查看型号" href={`/product-catalog/${encodeURIComponent(id)}`}><Eye size={16} /></Link></td></tr>) : null}
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
  const [pricingMode, setPricingMode] = useState<"parameter" | "fixed">("parameter");
  const masterFormRef = useRef<HTMLFormElement>(null);
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
      const generatedCode = `${String(activeModel?.modelCode ?? activeModelId).trim()}-S${String(activeSpecifications.length + 1).padStart(3, "0")}`;
      const specName = String(specDraft.specName ?? "").trim() || (pricingMode === "parameter" ? "参数化规格" : "固定规格");
      const specProductCode = String(specDraft.specProductCode ?? "").trim() || (pricingMode === "parameter" ? `${String(activeModel?.modelCode ?? activeModelId).trim()}-PARAM` : generatedCode);
      const response = await fetch("/api/entities/product-specifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...specDraft, modelId: activeModelId, mode: pricingMode, specName, specKey: String(specDraft.specKey ?? "").trim() || specName, specProductCode, parameterValue: specDraft.parameterValue === "" ? null : Number(specDraft.parameterValue), suggestedPurchaseUnitPrice: Number(specDraft.suggestedPurchaseUnitPrice || 0), length: Number(specDraft.length || 0), width: Number(specDraft.width || 0), height: Number(specDraft.height || 0), grossWeight: Number(specDraft.grossWeight || 0) }) });
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

  function submitMasterFromHeader() {
    setTab("base");
    setEditingMaster(true);
    window.setTimeout(() => masterFormRef.current?.requestSubmit(), 0);
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

  return <div className="space-y-4">
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#dfe6ee] p-4">
        <Link className="inline-flex h-9 w-9 items-center justify-center border border-[#dcdfe6] bg-white text-[#606266] hover:border-[#1890ff] hover:text-[#1890ff]" href="/product-catalog" title="返回产品主档" aria-label="返回产品主档"><ChevronRight className="rotate-180" size={17} /></Link>
        <div><div className="text-xs text-[#8492a6]">产品管理 <span className="px-1">›</span> 产品主档 <span className="px-1">›</span> {title}</div><div className="mt-1 flex flex-wrap items-center gap-3"><h1 className="text-xl font-semibold text-[#303133]">{title}</h1><span className="inline-flex items-center gap-1 border border-[#b7ebc6] bg-[#f0fff4] px-2 py-1 text-xs text-[#159957]"><BadgeCheck size={14} />{String(master.status ?? "active") === "active" ? "已启用" : "已停用"}</span>{!isNew ? <span className="font-mono text-xs text-[#8492a6]">{String(master.masterCode ?? "")}</span> : null}</div></div>
        <div className="ml-auto flex items-center gap-2"><a className="inline-flex h-9 items-center gap-1 border border-[#dcdfe6] bg-white px-3 text-sm text-[#606266] hover:border-[#1890ff] hover:text-[#1890ff]" href={`/api/entities/product-specifications/export?masterId=${encodeURIComponent(id)}&mode=fixed`}><Download size={15} />导出固定规格</a><Button tone="primary" onClick={submitMasterFromHeader}><Save size={15} />保存</Button></div>
      </div>
      <div className="flex flex-wrap items-center gap-4 bg-[#f7f9fc] p-4"><div className="flex h-12 w-12 items-center justify-center bg-[#eaf3ff] text-[#2468b5]"><Cable size={25} /></div><div className="min-w-[180px] mr-4"><strong className="text-base text-[#303133]">{title}</strong><div className="mt-1 text-xs text-[#8492a6]">{String(master.category ?? "未设置品类")}</div></div><Metric label="品牌型号" value={models.length} suffix="个已建档" /><Metric label="可报价规格" value={configuredCount} suffix="条规则与规格" /><Metric label="状态" value={String(master.status ?? "active") === "active" ? "启用" : "停用"} suffix="主档配置状态" /><div className="ml-auto hidden items-center gap-2 text-xs text-[#8492a6] lg:flex"><PackageCheck size={15} />主档聚合型号，不直接参与报价</div></div>
      {!isNew ? <div className="flex gap-5 border-t border-[#dfe6ee] bg-white px-4 py-2 text-xs text-[#8492a6]"><span>创建 {formatDisplayValue(master.createdAt, "datetime")}</span><span>更新 {formatDisplayValue(master.updatedAt, "datetime")}</span></div> : null}
    </Panel>
    {error ? <div className="border border-[#fde2e2] bg-[#fef0f0] px-4 py-3 text-sm text-[#f56c6c]">{error}<button className="ml-3 underline" type="button" onClick={() => setError("")}>关闭</button></div> : null}
    {notice ? <div className="border border-[#c2e7b0] bg-[#f0f9eb] px-4 py-3 text-sm text-[#67c23a]">{notice}<button className="ml-3 underline" type="button" onClick={() => setNotice("")}>关闭</button></div> : null}
    <Panel className="overflow-hidden"><div className="flex overflow-x-auto border-b border-[#dfe6ee]">{tabs.map((item) => { const Icon = item.icon; return <button className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-5 py-3 text-sm ${tab === item.key ? "border-[#1890ff] text-[#1890ff]" : "border-transparent text-[#606266] hover:text-[#1890ff]"}`} key={item.key} type="button" onClick={() => setTab(item.key)}><Icon size={15} />{item.label}</button>; })}</div>
      {tab === "base" ? <MasterBase formRef={masterFormRef} master={master} editing={editingMaster} onChange={(patch) => setMaster((current) => ({ ...(current ?? {}), ...patch }))} onEdit={() => setEditingMaster(true)} onCancel={() => { if (!isNew) setEditingMaster(false); }} onSave={saveMaster} saving={saving} isNew={isNew} /> : null}
      {tab === "models" ? <ModelsTab models={models} activeModelId={activeModelId} specCount={activeSpecifications.length} draft={modelDraft} editingId={editingModelId} saving={saving} onSelect={setActiveModelId} onAdd={() => { setEditingModelId(""); setModelDraft({ ...emptyModel, masterId: id }); }} onDraftChange={(patch) => setModelDraft((current) => ({ ...current, ...patch }))} onEdit={editModel} onCancel={() => { setEditingModelId(""); setModelDraft({ ...emptyModel, masterId: id }); }} onSave={saveModel} onManagePricing={() => setTab("pricing")} /> : null}
      {tab === "pricing" ? <PricingTab activeModel={activeModel} specifications={activeSpecifications} draft={specDraft} saving={saving} mode={pricingMode} onModeChange={(mode) => { setPricingMode(mode); setSpecDraft((current) => ({ ...current, mode })); }} onDraftChange={(patch) => setSpecDraft((current) => ({ ...current, ...patch }))} onSave={saveSpecification} onDelete={deleteSpecification} onSelectModel={setActiveModelId} models={models} /> : null}
      {tab === "references" ? <div className="p-6"><div className="flex items-center gap-2 text-base font-medium text-[#303133]"><ClipboardList size={18} />引用记录</div><p className="mt-2 text-sm leading-6 text-[#606266]">客户 PO、报价单和历史报价通过独立产品编码关联。单据确认后保存产品名称、品牌型号、规格键和采购价快照，后续停用产品不会改写历史单据。</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><Metric label="品牌型号" value={models.length} suffix="个" /><Metric label="固定规格" value={specifications.filter((item) => String(item.mode ?? "fixed") === "fixed").length} suffix="条" /><Metric label="参数规格" value={specifications.filter((item) => String(item.mode ?? "fixed") === "parameter").length} suffix="条" /></div></div> : null}
    </Panel>
  </div>;
}

function MasterBase({ formRef, master, editing, isNew, saving, onChange, onEdit, onCancel, onSave }: { formRef: React.RefObject<HTMLFormElement | null>; master: Row; editing: boolean; isNew: boolean; saving: boolean; onChange: (patch: Row) => void; onEdit: () => void; onCancel: () => void; onSave: (event: React.FormEvent) => void }) {
  const field = (key: string, label: string, type: "text" | "textarea" = "text") => <label className="block bg-white p-3"><span className="mb-2 block text-xs text-[#606266]">{label}</span>{type === "textarea" ? <Textarea className="w-full" disabled={!editing} value={String(master[key] ?? "")} onChange={(event) => onChange({ [key]: event.target.value })} /> : <Input disabled={!editing} className="w-full" value={String(master[key] ?? "")} onChange={(event) => onChange({ [key]: event.target.value })} />}</label>;
  const select = (key: string, label: string, options: Array<[string, string]>) => <label className="block bg-white p-3"><span className="mb-2 block text-xs text-[#606266]">{label}</span><select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-3 text-sm outline-none focus:border-[#1890ff] disabled:bg-[#f5f7fa]" disabled={!editing} value={String(master[key] ?? "")} onChange={(event) => onChange({ [key]: event.target.value })}>{options.map(([value, optionLabel]) => <option key={value} value={value}>{optionLabel}</option>)}</select></label>;
  return <form ref={formRef} className="p-4" onSubmit={onSave}>
    <div className="mb-4 flex items-center"><div><h2 className="text-base font-medium text-[#303133]">主档基础资料</h2><p className="mt-1 text-xs text-[#8492a6]">用于归纳同类型设备的通用信息，不在报价单中单独计价。</p></div><div className="ml-auto">{editing ? <div className="flex gap-2"><Button type="button" onClick={onCancel}>取消</Button><Button tone="primary" disabled={saving} type="submit"><Save size={15} />{saving ? "保存中..." : "保存"}</Button></div> : <Button type="button" onClick={onEdit}><Edit3 size={15} />修改</Button>}</div></div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
      <section className="border border-[#dfe6ee]">
        <div className="grid gap-px bg-[#dfe6ee] sm:grid-cols-2 lg:grid-cols-3">{field("masterCode", "产品主档编码")}{field("name", "产品名称")}{field("nameEn", "产品英文名称")}{field("category", "产品品类")}{field("unit", "默认计量单位")}{field("hsCodeCn", "默认中国 HS 编码")}{field("hsCodeMx", "默认墨西哥 HS 编码")}{select("status", "档案状态", [["active", "已启用"], ["disabled", "已停用"]])}<div className="bg-[#edf2f7]" aria-hidden="true" /></div>
        <div className="border-t border-[#dfe6ee] p-3"><label className="block"><span className="mb-1 block text-xs text-[#606266]">产品说明</span><Textarea className="min-h-[100px] w-full" disabled={!editing} value={String(master.description ?? "")} onChange={(event) => onChange({ description: event.target.value })} /></label></div>
      </section>
      <div className="space-y-4">
        <section className="border border-[#dfe6ee] p-4"><div className="flex items-center gap-2"><PackageCheck className="text-[#2468b5]" size={18} /><h2 className="text-base font-medium text-[#303133]">通用物流与合规</h2></div><p className="mt-1 text-xs text-[#8492a6]">可被品牌型号继承，也允许型号层覆盖。</p><div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs"><InfoRow label="品牌型号" value="在型号层维护" /><InfoRow label="参考采购价" value="在型号层维护" /><InfoRow label="NOM 认证" value="按型号维护" /><InfoRow label="默认运输方式" value="在报价时选择" /></div></section>
        <section className="border border-[#dfe6ee] p-4"><div className="flex items-center gap-2"><ClipboardList className="text-[#2468b5]" size={18} /><h2 className="text-base font-medium text-[#303133]">产品说明</h2></div><p className="mt-3 text-sm leading-6 text-[#606266]">产品主档用于聚合设备类型，品牌、型号、固定规格和参数化计价规则在对应分区维护。客户 PO 选品时先选择主档，再选择品牌型号和可报价规格。</p></section>
      </div>
    </div>
    {isNew ? <div className="mt-3 text-xs text-[#909399]">产品主档编码用于产品族归档；品牌型号和规格编码在对应分区分别维护。</div> : null}
  </form>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-[#ebeef5] pb-2"><span className="text-[#8492a6]">{label}</span><strong className="float-right font-normal text-[#303133]">{value}</strong></div>;
}

function ModelsTab({ models, activeModelId, specCount, draft, editingId, saving, onSelect, onAdd, onDraftChange, onEdit, onCancel, onSave, onManagePricing }: { models: Row[]; activeModelId: string; specCount: number; draft: typeof emptyModel; editingId: string; saving: boolean; onSelect: (id: string) => void; onAdd: () => void; onDraftChange: (patch: Partial<typeof emptyModel>) => void; onEdit: (row: Row) => void; onCancel: () => void; onSave: (event: React.FormEvent) => void; onManagePricing: () => void }) {
  const activeModel = models.find((item) => String(item.id) === activeModelId);
  const input = (key: keyof typeof emptyModel, label: string, required = false, type = "text") => <label className="block"><span className="mb-1 block text-xs text-[#8492a6]">{label}</span><Input className="w-full" required={required} type={type} step={type === "number" ? "0.0001" : undefined} value={String(draft[key])} onChange={(event) => onDraftChange({ [key]: event.target.value } as Partial<typeof emptyModel>)} placeholder={key === "modelCode" ? "留空自动生成" : ""} /></label>;
  return <div className="grid gap-5 p-4 lg:grid-cols-[225px_minmax(0,1fr)]">
    <aside className="border border-[#dfe6ee] bg-[#fbfdff]"><div className="flex items-center justify-between border-b border-[#dfe6ee] p-3"><div><div className="text-xs text-[#606266]">品牌型号 <span className="ml-1 bg-[#edf2f7] px-1.5 py-0.5 text-[10px]">{models.length}</span></div></div><button className="inline-flex h-7 w-7 items-center justify-center border border-[#dcdfe6] bg-white text-[#606266] hover:border-[#1890ff] hover:text-[#1890ff]" type="button" onClick={onAdd} title="新增品牌型号" aria-label="新增品牌型号"><Plus size={16} /></button></div><div className="max-h-[540px] overflow-auto p-2">{models.map((item) => <button className={`mb-2 flex w-full items-center gap-2 border p-3 text-left ${String(item.id) === activeModelId ? "border-[#5b9cff] bg-[#edf5ff]" : "border-[#dfe6ee] bg-white hover:border-[#9fc5ff]"}`} key={String(item.id)} type="button" onClick={() => { onSelect(String(item.id)); onCancel(); }}><span className="flex h-7 w-7 shrink-0 items-center justify-center bg-[#eaf7ff] text-[#1597b7]"><Cable size={15} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-[#303133]">{String(item.brand ?? "-")}</strong><span className="mt-1 block truncate text-[11px] text-[#8492a6]">{String(item.model ?? "-")}</span></span><ChevronRight size={14} className="shrink-0 text-[#606266]" /></button>)}<button className="flex w-full items-center justify-center gap-1 border border-dashed border-[#7eb3ff] px-2 py-2 text-xs text-[#2468b5] hover:bg-[#edf5ff]" type="button" onClick={onAdd}><Plus size={14} />新增品牌型号</button>{!models.length ? <div className="p-4 text-center text-xs text-[#909399]">暂无品牌型号</div> : null}</div></aside>
    <section className="min-w-0">
      {activeModel ? <div className="border border-[#dfe6ee] bg-white p-4"><div className="flex flex-wrap items-start gap-3 border-b border-[#ebeef5] pb-4"><div className="flex h-10 w-10 items-center justify-center bg-[#eaf3ff] text-[#2468b5]"><Layers3 size={20} /></div><div><h2 className="text-base font-semibold text-[#303133]">{String(activeModel.brand ?? "-")} · {String(activeModel.model ?? "-")}</h2><p className="mt-1 text-xs text-[#8492a6]">品牌型号承接可报价规格、供应信息与合规属性。</p></div><button className="ml-auto inline-flex items-center gap-1 text-sm text-[#2468b5] hover:text-[#1890ff]" type="button" onClick={() => onEdit(activeModel)}><Edit3 size={14} />修改型号</button></div><div className="mt-4 flex items-center justify-between border border-[#d8e6fb] bg-[#f7fbff] px-3 py-2"><div><span className="block text-[11px] text-[#8492a6]">型号编码</span><strong className="font-mono text-sm text-[#303133]">{String(activeModel.modelCode ?? "-")}</strong></div><span className="inline-flex items-center gap-1 border border-[#b7ebc6] bg-[#f0fff4] px-2 py-1 text-xs text-[#159957]"><BadgeCheck size={13} />{String(activeModel.status ?? "active") === "active" ? "已启用" : "已停用"}</span></div><h3 className="mt-5 border-b border-[#ebeef5] pb-2 text-sm font-medium text-[#303133]">型号资料</h3><div className="grid gap-x-5 gap-y-3 py-3 sm:grid-cols-3"><InfoRow label="品牌" value={String(activeModel.brand ?? "-")} /><InfoRow label="型号" value={String(activeModel.model ?? "-")} /><InfoRow label="产品系列" value={String(activeModel.series ?? "-")} /><InfoRow label="默认采购币种" value={String(activeModel.purchaseCurrency ?? "USD")} /><InfoRow label="参考采购价" value={formatProductMoney(activeModel.suggestedPurchaseUnitPrice, activeModel.purchaseCurrency)} /></div><h3 className="mt-2 border-b border-[#ebeef5] pb-2 text-sm font-medium text-[#303133]">合规属性</h3><div className="grid gap-x-5 gap-y-3 py-3 sm:grid-cols-3"><InfoRow label="NOM 认证" value={Boolean(activeModel.needNom) ? "需要" : "不需要"} /><InfoRow label="带磁属性" value={Boolean(activeModel.isMagnetic) ? "是" : "否"} /><InfoRow label="带电属性" value={Boolean(activeModel.isElectric) ? "是" : "否"} /></div><div className="mt-2 flex flex-wrap items-center gap-3 border-t border-[#ebeef5] bg-[#f7fbff] pt-3"><div className="flex items-center gap-2 text-sm text-[#2468b5]"><CircleDollarSign size={16} />已配置 <strong>{specCount}</strong> 条报价规则，可直接进入报价选品。</div><Button className="ml-auto" tone="primary" type="button" onClick={onManagePricing}>管理报价规格</Button></div></div> : <div className="border border-dashed border-[#dfe6ee] p-12 text-center text-sm text-[#8492a6]">请先选择品牌型号，或在下方新增品牌型号</div>}
      <section className="mt-4 border border-dashed border-[#7eb3ff] bg-[#f7fbff] p-4"><div className="mb-4 flex items-center"><div><h3 className="text-sm font-medium text-[#303133]">{editingId ? "修改品牌型号" : "新增品牌型号"}</h3><p className="mt-1 text-xs text-[#8492a6]">一个产品主档可以维护多个品牌和型号。</p></div>{editingId ? <Button className="ml-auto" type="button" onClick={onCancel}>取消编辑</Button> : null}</div><form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={onSave}>{input("brand", "品牌", true)}{input("model", "型号", true)}{input("modelCode", "型号编码")}{input("series", "产品系列")}<label className="block"><span className="mb-1 block text-xs text-[#8492a6]">参考币种</span><select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-3 text-sm" value={String(draft.purchaseCurrency)} onChange={(event) => onDraftChange({ purchaseCurrency: event.target.value })}><option value="USD">USD</option><option value="CNY">CNY</option><option value="MXN">MXN</option></select></label>{input("suggestedPurchaseUnitPrice", "参考采购价", false, "number")}<div className="flex flex-wrap items-center gap-4 text-xs text-[#606266] sm:col-span-2 lg:col-span-3"><label className="flex items-center gap-2"><input checked={draft.needNom} type="checkbox" onChange={(event) => onDraftChange({ needNom: event.target.checked })} />需要 NOM</label><label className="flex items-center gap-2"><input checked={draft.isMagnetic} type="checkbox" onChange={(event) => onDraftChange({ isMagnetic: event.target.checked })} />带磁</label><label className="flex items-center gap-2"><input checked={draft.isElectric} type="checkbox" onChange={(event) => onDraftChange({ isElectric: event.target.checked })} />带电</label><Button className="ml-auto" tone="primary" disabled={saving} type="submit"><Plus size={15} />{editingId ? "保存型号" : "新增型号"}</Button></div></form></section>
    </section>
  </div>;
}

function PricingTab({ activeModel, models, specifications, draft, saving, mode, onModeChange, onDraftChange, onSave, onDelete, onSelectModel }: { activeModel?: Row; models: Row[]; specifications: Row[]; draft: typeof emptySpec; saving: boolean; mode: "parameter" | "fixed"; onModeChange: (mode: "parameter" | "fixed") => void; onDraftChange: (patch: Partial<typeof emptySpec>) => void; onSave: (event: React.FormEvent) => void; onDelete: (id: string) => void; onSelectModel: (id: string) => void }) {
  const field = (key: keyof typeof emptySpec, label: string, type = "number") => <label className="block border border-[#dfe6ee] bg-white p-2"><span className="mb-1 block text-xs text-[#8492a6]">{label}</span><Input className="w-full" type={type} step={type === "number" ? "0.0001" : undefined} value={String(draft[key])} onChange={(event) => onDraftChange({ [key]: event.target.value } as Partial<typeof emptySpec>)} /></label>;
  const currency = (label: string) => <label className="block border border-[#dfe6ee] bg-white p-2"><span className="mb-1 block text-xs text-[#8492a6]">{label}</span><select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-3 text-sm outline-none focus:border-[#1890ff]" value={String(draft.purchaseCurrency)} onChange={(event) => onDraftChange({ purchaseCurrency: event.target.value })}><option value="USD">USD</option><option value="CNY">CNY</option><option value="MXN">MXN</option></select></label>;
  const fixedColumns: Array<[string, string]> = [["specProductCode", "规格商品编码"], ["specName", "规格名称"], ["suggestedPurchaseUnitPrice", "建议采购价"], ["length", "长(cm)"], ["width", "宽(cm)"], ["height", "高(cm)"], ["grossWeight", "毛重(kg)"], ["status", "状态"], ["createdAt", "创建时间"], ["updatedAt", "更新时间"]];
  return <div className="grid gap-5 p-4 lg:grid-cols-[225px_minmax(0,1fr)]">
    <aside className="border border-[#dfe6ee] bg-[#fbfdff]"><div className="flex items-center justify-between border-b border-[#dfe6ee] p-3"><div className="text-xs text-[#606266]">品牌型号 <span className="ml-1 bg-[#edf2f7] px-1.5 py-0.5 text-[10px]">{models.length}</span></div><Layers3 className="text-[#2468b5]" size={18} /></div><div className="max-h-[540px] overflow-auto p-2">{models.map((model) => <button className={`mb-2 flex w-full items-center gap-2 border p-3 text-left ${String(model.id) === String(activeModel?.id) ? "border-[#5b9cff] bg-[#edf5ff]" : "border-[#dfe6ee] bg-white hover:border-[#9fc5ff]"}`} key={String(model.id)} type="button" onClick={() => onSelectModel(String(model.id))}><span className="flex h-7 w-7 shrink-0 items-center justify-center bg-[#eaf7ff] text-[#1597b7]"><Cable size={15} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-[#303133]">{String(model.brand ?? "-")}</strong><span className="mt-1 block truncate text-[11px] text-[#8492a6]">{String(model.model ?? "-")}</span></span><ChevronRight size={14} /></button>)}{!models.length ? <div className="p-4 text-center text-xs text-[#909399]">暂无品牌型号</div> : null}</div></aside>
    <section className="min-w-0">{activeModel ? <><div className="mb-4 flex flex-wrap items-end gap-3"><div className="mr-auto"><h2 className="text-base font-semibold text-[#303133]">报价规格与计价规则</h2><p className="mt-1 text-xs text-[#8492a6]">{String(activeModel.brand ?? "-")} · {String(activeModel.model ?? "-")}，每个型号可选择一种主计价方式。</p></div><div className="text-xs text-[#8492a6]">型号编码 <span className="font-mono text-[#606266]">{String(activeModel.modelCode ?? "-")}</span></div></div><div className="mb-4 grid gap-3 sm:grid-cols-2"><button className={`border p-3 text-left ${mode === "parameter" ? "border-[#5b9cff] bg-[#edf5ff]" : "border-[#dfe6ee] bg-white"}`} type="button" onClick={() => onModeChange("parameter")}><strong className="block text-sm text-[#303133]"><CircleDollarSign className="mr-2 inline text-[#2468b5]" size={15} />参数化规格</strong><span className="mt-1 block text-xs text-[#8492a6]">适用于长度、容量等连续变化参数</span></button><button className={`border p-3 text-left ${mode === "fixed" ? "border-[#5b9cff] bg-[#edf5ff]" : "border-[#dfe6ee] bg-white"}`} type="button" onClick={() => onModeChange("fixed")}><strong className="block text-sm text-[#303133]"><Layers3 className="mr-2 inline text-[#2468b5]" size={15} />固定规格</strong><span className="mt-1 block text-xs text-[#8492a6]">适用于独立 SKU 或非线性价格</span></button></div>{mode === "parameter" ? <form onSubmit={onSave}><div className="border border-[#dfe6ee] p-3"><div className="mb-3 flex items-center"><div><span className="text-xs text-[#8492a6]">基准参数</span><h3 className="text-sm font-medium text-[#303133]">线性加价规则</h3></div><span className="ml-auto border border-[#d8c8ff] bg-[#f7f0ff] px-2 py-1 text-xs text-[#7048a8]">参数化规格</span></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{field("parameterValue", "基准值")}{currency("参考币种")}{field("suggestedPurchaseUnitPrice", "基准采购价")}{field("grossWeight", "基准毛重(kg)")}{field("length", "基准长(cm)")}{field("width", "基准宽(cm)")}{field("height", "基准高(cm)")}</div></div><div className="mt-3 border border-[#dfe6ee] p-3"><div className="mb-3"><span className="text-xs text-[#8492a6]">增量参数</span><h3 className="text-sm font-medium text-[#303133]">每次增量对应的价格与物流参数</h3></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{field("parameterUnit", "计价增量", "number")}{field("suggestedPurchaseUnitPrice", "每计价增量价")}{field("grossWeight", "增量增重(kg)")}{field("length", "增量增长(cm)")}{field("width", "增量增宽(cm)")}{field("height", "增量增高(cm)")}</div><div className="mt-3 bg-[#f3f7fd] px-3 py-2 text-xs text-[#2468b5]">采购单价 = 基准采购价 +（参数值 - 基准值）÷ 计价增量 × 每计价增量价；长宽高和毛重按相同增量规则计算。</div></div><div className="mt-3 flex justify-end"><Button tone="primary" disabled={saving} type="submit"><Save size={15} />保存计价规则</Button></div></form> : <><div className="mb-3"><span className="text-xs text-[#8492a6]">规格模式</span><h3 className="text-sm font-medium text-[#303133]">独立固定规格</h3><p className="mt-1 text-xs text-[#8492a6]">每个规格会自动生成不可变的规格商品编码，规格名称修改不会影响历史报价。</p></div><StickyTable className="table-scroll overflow-auto border border-[#ebeef5]" tableKey="product-fixed-specifications"><table className="min-w-[1050px] border-collapse text-xs"><thead className="bg-[#f5f7fa]"><tr>{fixedColumns.map(([, label]) => <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-2 text-left" key={label}>{label}</th>)}<th className="border-b border-[#ebeef5] px-3 py-2 text-left">操作</th></tr></thead><tbody>{specifications.filter((item) => String(item.mode ?? "fixed") === "fixed").map((row) => <tr key={String(row.id)}>{fixedColumns.map(([key]) => <td className={`whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 ${key.includes("Code") ? "font-mono" : ""}`} key={key}>{key === "suggestedPurchaseUnitPrice" ? formatProductMoney(row[key], row.purchaseCurrency) : key === "status" ? (String(row[key] ?? "active") === "active" ? "已启用" : "已停用") : key.endsWith("At") ? formatDisplayValue(row[key], "datetime") : String(row[key] ?? "-")}</td>)}<td className="border-b border-[#ebeef5] px-3 py-3"><button className="inline-flex items-center gap-1 text-[#f56c6c]" type="button" onClick={() => onDelete(String(row.id))}><Trash2 size={14} />删除</button></td></tr>)}{!specifications.filter((item) => String(item.mode ?? "fixed") === "fixed").length ? <tr><td className="px-3 py-8 text-center text-[#909399]" colSpan={fixedColumns.length + 1}>当前型号暂无固定规格</td></tr> : null}</tbody></table></StickyTable><form className="mt-4 border border-dashed border-[#7eb3ff] bg-[#f7fbff] p-4" onSubmit={onSave}><div className="mb-3 flex items-center"><div><h3 className="text-sm font-medium text-[#303133]">新增固定规格</h3><p className="mt-1 text-xs text-[#8492a6]">规格商品编码留空时按型号编码自动生成。</p></div><Plus className="ml-auto text-[#2468b5]" size={18} /></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{field("specProductCode", "规格商品编码", "text")}{field("specName", "规格名称", "text")}{currency("参考币种")}{field("suggestedPurchaseUnitPrice", "建议采购价")}{field("length", "长(cm)")}{field("width", "宽(cm)")}{field("height", "高(cm)")}{field("grossWeight", "毛重(kg)")}</div><div className="mt-3 flex justify-end"><Button tone="primary" disabled={saving} type="submit"><Plus size={15} />新增固定规格</Button></div></form></>}</> : <div className="border border-dashed border-[#dfe6ee] p-12 text-center text-sm text-[#8492a6]"><Layers3 className="mx-auto mb-2" size={24} />请先选择品牌型号</div>}</section>
  </div>;
}

function formatProductMoney(value: Row[string], currency: Row[string]) {
  const amount = formatDisplayValue(value, "money");
  return amount === "-" ? "-" : `${String(currency ?? "USD")} ${amount}`;
}

function Metric({ label, value, suffix }: { label: string; value: number | string; suffix: string }) {
  return <div className="min-w-[110px] border-l border-[#ebeef5] pl-4"><div className="text-xs text-[#909399]">{label}</div><div className="mt-1 text-xl font-medium text-[#303133]">{value}<small className="ml-1 text-xs font-normal text-[#909399]">{suffix}</small></div></div>;
}
