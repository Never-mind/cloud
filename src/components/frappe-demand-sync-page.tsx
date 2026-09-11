"use client";

import { Fragment, useEffect, useState } from "react";
import { DatabaseZap, FileSearch, Pencil, Play, RefreshCw, Save, X } from "lucide-react";
import { Button, Input, Panel } from "./ui";
import { confirmDialog } from "./app-dialog";
import { TableStateContent } from "./table-state";
import { StickyTable } from "./sticky-table";
import { PaginationBar } from "./pagination-bar";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { formatInstanceModelType } from "@/lib/instance-model-type";

type Tab = "supplier" | "material" | "ledger";
type Row = Record<string, unknown>;
type Mapping = Row & {
  mappingId: string;
  sourceType: string;
  sourceId: string;
  sourceCode?: string | null;
  sourceName?: string | null;
  sourceData?: Row;
  status: string;
  localEntityId?: string | null;
  localDisplayName?: string | null;
  localEntityExists?: boolean | null;
  undertakingUnitId?: string | null;
  candidates?: Array<{ id: string; label: string }>;
};

type MasterSet = {
  suppliers: Row[];
  instanceModels: Row[];
};

type SyncResult = {
  status: "created" | "skipped_existing" | "blocked" | "pending_change";
  sourceOrderId: string;
  localRequestNo: string | null;
  itemCount: number;
  reason: string;
};

type SyncRun = {
  syncRunId: string;
  triggerType: string;
  status: string;
  dryRun: boolean;
  createdRequestCount: number;
  createdItemCount: number;
  skippedExistingCount: number;
  blockedItemCount: number;
  changedItemCount: number;
  startedAt: string | null;
  results: SyncResult[];
};

const emptyMasters: MasterSet = { suppliers: [], instanceModels: [] };
const tabs: Array<[Tab, string]> = [
  ["supplier", "供应商映射"],
  ["material", "实例/物料映射"],
  ["ledger", "同步台账"],
];

const ledgerCategories: Array<[string, string]> = [
  ["", "全部分类"],
  ["unhandled", "待处理（远端变更/阻断）"],
  ["local_exists", "本地已存在"],
  ["local_deleted", "本地已删除"],
  ["remote_changed", "远端已变更"],
  ["out_of_scope", "含状态变化明细"],
];

/** 未处理数量徽标（红底白字圆形），0 时不显示。 */
function UnhandledBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span
      className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium leading-none text-white"
      title={`${count} 条未处理`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

type LedgerRow = {
  sourceOrderId: string;
  localRequestNo: string | null;
  itemCount: number;
  changedCount: number;
  outOfScopeCount: number;
  blockedCount: number;
  localExists: boolean;
  lastSyncedAt: string | null;
};

type LedgerItem = {
  sourceItemId: string;
  status: string;
  reasonCode: string | null;
  errorMessage: string | null;
  localRequestItemId: string | null;
  changes: Array<{ field: string; label: string; from: string; to: string }>;
};

/** 远端物料类型（sourceDataJson.materialType）分类，仅用于实例/物料映射。 */
const materialTypeOptions: Array<[string, string]> = [
  ["EQUIPMENT", formatInstanceModelType("Equipment")],
  ["COMPONENT", formatInstanceModelType("Component")],
  ["MATERIAL", formatInstanceModelType("Material")],
];

function text(value: unknown) {
  return String(value ?? "").trim();
}

function display(value: unknown) {
  return text(value) || "-";
}

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(text(data.error) || "请求失败");
  return data as T;
}

function mappingStatus(status: string) {
  const labels: Record<string, string> = { pending: "待处理", confirmed: "已确认", conflict: "冲突", ignored: "已忽略" };
  const colors: Record<string, string> = { pending: "bg-warning-soft text-warning-deep", confirmed: "bg-success-soft text-success-strong", conflict: "bg-danger-soft text-danger", ignored: "bg-fill-soft text-ink-3" };
  return <span className={`inline-flex rounded px-2 py-1 text-xs ${colors[status] ?? colors.pending}`}>{labels[status] ?? status}</span>;
}

function syncResultStatus(status: SyncResult["status"]) {
  const labels: Record<SyncResult["status"], string> = { created: "已新建", skipped_existing: "已跳过", blocked: "待处理", pending_change: "待核对" };
  const colors: Record<SyncResult["status"], string> = { created: "bg-success-soft text-success-strong", skipped_existing: "bg-fill-soft text-ink-3", blocked: "bg-warning-soft text-warning-deep", pending_change: "bg-danger-soft text-danger" };
  return <span className={`inline-flex rounded px-2 py-1 text-xs ${colors[status]}`}>{labels[status]}</span>;
}

function formatRunTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function sourceTypeLabel(sourceType: string) {
  return ({ supplier: "供应商", material: "实例型号" } as Record<string, string>)[sourceType] ?? sourceType;
}

function ledgerItemStatus(status: string) {
  return ({
    synced: "已创建", skipped_existing: "已存在", pending_change: "远端已变更",
    blocked: "待处理", out_of_scope: "不在同步范围", reset: "待重新拉取",
  } as Record<string, string>)[status] ?? status;
}

/** 台账结构化原因的中文展示。 */
function ledgerReasonLabel(reasonCode: string | null) {
  if (!reasonCode) return "-";
  return ({
    created: "已建档", local_exists: "本地单已存在", remote_changed: "远端已变更待核对",
    blocked_mapping: "映射未完成", remote_cancelled: "远端已取消", local_cancelled: "本地已取消", out_of_scope: "状态不在同步范围",
  } as Record<string, string>)[reasonCode] ?? reasonCode;
}

function sourceDetails(mapping: Mapping) {
  const data = mapping.sourceData ?? {};
  if (mapping.sourceType === "supplier") return [data.partnerCode && `供应商编码：${text(data.partnerCode)}`, data.partnerAlias && `简称：${text(data.partnerAlias)}`].filter(Boolean).join("  ");
  if (mapping.sourceType === "material") return [data.materialType && `类型：${formatInstanceModelType(data.materialType)}`, data.customerItemCode && `设备编码：${text(data.customerItemCode)}`, data.customerPartNo && `客户料号：${text(data.customerPartNo)}`, data.materialCode && `xxll编码：${text(data.materialCode)}`].filter(Boolean).join("  ");
  return "";
}

function getTargetOptions(mapping: Mapping, masters: MasterSet) {
  if (mapping.sourceType === "supplier") return masters.suppliers.map((row) => ({ id: text(row.supplierId), label: `${text(row.supplierCode)} - ${text(row.shortName || row.nameCn)}` }));
  if (mapping.sourceType === "material") return masters.instanceModels.map((row) => ({ id: text(row.deviceCode), label: `${text(row.deviceCode)} - ${text(row.nameZh || row.modelCode || row.nameEn)}` }));
  return [];
}

export function FrappeDemandSyncPage() {
  const [tab, setTab] = useState<Tab>("supplier");
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [masters, setMasters] = useState<MasterSet>(emptyMasters);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [materialType, setMaterialType] = useState("");
  const [localEntity, setLocalEntity] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [materialTypeCounts, setMaterialTypeCounts] = useState<Record<string, number>>({});
  const [unhandled, setUnhandled] = useState<{ mappings: Record<string, number>; ledger: number }>({ mappings: {}, ledger: 0 });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Mapping | null>(null);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [ledgerCategory, setLedgerCategory] = useState("");
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [ledgerItems, setLedgerItems] = useState<LedgerItem[]>([]);

  const visibleMappings = mappings;
  const latestRun = syncRuns[0];

  async function loadUnhandled() {
    try {
      const data = await requestJson<{ mappings?: Record<string, number>; ledger?: number }>("/api/integrations/frappe-demand-sync/summary");
      setUnhandled({ mappings: data.mappings ?? {}, ledger: Number(data.ledger ?? 0) });
    } catch {
      // 徽标属于辅助信息，加载失败不打断主流程
    }
  }

  async function load(options: { page?: number; pageSize?: number; materialType?: string } = {}) {
    const targetPage = options.page ?? page;
    const targetPageSize = options.pageSize ?? pageSize;
    const targetMaterialType = options.materialType ?? materialType;
    setBusy(true);
    try {
      const params = new URLSearchParams({ tab, keyword, status, page: String(targetPage), pageSize: String(targetPageSize) });
      if (tab === "material" && targetMaterialType) params.set("materialType", targetMaterialType);
      if (localEntity) params.set("localEntity", localEntity);
      const data = await requestJson<{
        items: Mapping[]; total: number; page: number;
        counts?: Record<string, number>; materialTypeCounts?: Record<string, number>;
      }>(`/api/integrations/frappe-demand-sync/mappings?${params}`);
      setMappings(data.items);
      setTotal(Number(data.total ?? data.items.length));
      setPage(Number(data.page ?? targetPage));
      setCounts(data.counts ?? {});
      setMaterialTypeCounts(data.materialTypeCounts ?? {});
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "映射加载失败");
    } finally {
      setBusy(false);
    }
  }

  async function loadSyncRuns() {
    try {
      const data = await requestJson<{ items: SyncRun[] }>("/api/integrations/frappe-demand-sync/runs");
      setSyncRuns(data.items);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "同步结果加载失败");
    }
  }

  useEffect(() => { if (tab !== "ledger") void load({ page: 1 }); }, [tab, materialType, localEntity]);
  useEffect(() => { if (tab === "ledger") void loadLedger({ page: 1 }); }, [tab, ledgerCategory]);

  async function loadLedger(options: { page?: number; pageSize?: number; category?: string } = {}) {
    const targetPage = options.page ?? ledgerPage;
    const targetPageSize = options.pageSize ?? ledgerPageSize;
    const targetCategory = options.category ?? ledgerCategory;
    setBusy(true);
    try {
      const params = new URLSearchParams({ page: String(targetPage), pageSize: String(targetPageSize) });
      if (keyword) params.set("keyword", keyword);
      if (targetCategory) params.set("category", targetCategory);
      const data = await requestJson<{ items: LedgerRow[]; total: number; page: number }>(`/api/integrations/frappe-demand-sync/ledger?${params}`);
      setLedger(data.items ?? []);
      setLedgerTotal(Number(data.total ?? 0));
      setLedgerPage(Number(data.page ?? targetPage));
      setSelectedOrders([]);
      setExpandedOrder(null);
      setLedgerItems([]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "同步台账加载失败");
    } finally {
      setBusy(false);
    }
  }

  async function toggleLedgerOrder(sourceOrderId: string) {
    if (expandedOrder === sourceOrderId) {
      setExpandedOrder(null);
      setLedgerItems([]);
      return;
    }
    setExpandedOrder(sourceOrderId);
    try {
      const data = await requestJson<{ items: LedgerItem[] }>(`/api/integrations/frappe-demand-sync/ledger/items?sourceOrderId=${encodeURIComponent(sourceOrderId)}`);
      setLedgerItems(data.items ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "台账明细加载失败");
    }
  }

  async function rebuildSelectedOrders() {
    if (!selectedOrders.length) return;
    if (!await confirmDialog(`将从远端重新拉取并创建 ${selectedOrders.length} 张需求单草稿（本地已存在或状态不在可同步范围的会被跳过），是否继续？`)) return;
    setBusy(true);
    try {
      const result = await requestJson<{ requested: string[]; results: SyncResult[] }>("/api/integrations/frappe-demand-sync/ledger/rebuild", {
        method: "POST",
        body: JSON.stringify({ sourceOrderIds: selectedOrders }),
      });
      const created = result.results.filter((item) => item.status === "created");
      const skipped = result.results.filter((item) => item.status === "blocked" || item.status === "skipped_existing" || item.status === "pending_change");
      setNotice(`重新拉取完成：选中 ${result.requested.length} 张，新建 ${created.length} 张${skipped.length ? `，未创建 ${skipped.length} 张（${skipped.map((item) => `${item.sourceOrderId}：${item.reason}`).join("；")}）` : ""}`);
      setSelectedOrders([]);
      await loadLedger({ page: 1 });
      await loadSyncRuns();
      await loadUnhandled();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "重新拉取失败");
    } finally {
      setBusy(false);
    }
  }

  /** 人工核对后接受远端当前内容：清除该需求单的"远端已变更"提示。 */
  async function acceptOrderChanges(sourceOrderId: string) {
    if (!await confirmDialog(`确认已核对 ${sourceOrderId} 的远端变更，并按当前远端内容更新比对基线？`)) return;
    setBusy(true);
    try {
      const result = await requestJson<{ accepted: number }>("/api/integrations/frappe-demand-sync/ledger/accept", {
        method: "POST", body: JSON.stringify({ sourceOrderId }),
      });
      setNotice(`${sourceOrderId} 已核对：接受 ${result.accepted} 条明细的当前远端内容`);
      await loadLedger({ page: ledgerPage });
      await loadUnhandled();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "接受远端变更失败");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { void loadSyncRuns(); void loadUnhandled(); }, []);
  useEffect(() => {
    void requestJson<MasterSet>("/api/integrations/frappe-demand-sync/master-data").then(setMasters)
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "本地档案加载失败"));
  }, []);

  async function refresh() {
    setBusy(true);
    try {
      const result = await requestJson<{ demandItems: number; demandOrders: number }>("/api/integrations/frappe-demand-sync/mappings/refresh", { method: "POST", body: JSON.stringify({}) });
      setNotice(`远端数据已刷新：${result.demandOrders} 张需求单、${result.demandItems} 条明细`);
      await load();
      await loadUnhandled();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "远端数据刷新失败");
    } finally {
      setBusy(false);
    }
  }

  async function runSync(dryRun: boolean) {
    if (!dryRun && !await confirmDialog("将创建映射完整的本地需求草稿，是否继续？")) return;
    setBusy(true);
    try {
      const result = await requestJson<{ dryRun: boolean; createdRequests: number; createdItems: number; blockedItems: number; skippedExisting: number; changedItems: number }>("/api/integrations/frappe-demand-sync", {
        method: "POST", body: JSON.stringify({ triggerType: "manual", dryRun }),
      });
      setNotice(`${result.dryRun ? "试运行完成" : "同步完成"}：新建 ${result.createdRequests} 张需求单、${result.createdItems} 条明细；已跳过 ${result.skippedExisting} 条明细；待处理 ${result.blockedItems} 条；待核对 ${result.changedItems} 条。下方可查看逐单结果。`);
      await load();
      await loadSyncRuns();
      await loadUnhandled();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "需求同步失败");
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-2"><DatabaseZap size={22} className="text-primary" /><h1 className="text-2xl font-medium text-ink">需求同步映射</h1></div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void refresh()}><RefreshCw size={15} />刷新远端数据</Button>
        <Button disabled={busy} onClick={() => void runSync(true)}><FileSearch size={15} />试运行</Button>
        <Button disabled={busy} tone="primary" onClick={() => void runSync(false)}><Play size={15} />同步需求</Button>
      </div>
    </header>
    {notice ? <div className="flex items-center justify-between border border-info-border bg-info-soft px-3 py-2 text-sm text-primary"><span>{notice}</span><button type="button" title="关闭提示" onClick={() => setNotice("")}><X size={15} /></button></div> : null}
    {latestRun ? <Panel>
      <details open>
        <summary className="cursor-pointer list-none px-4 py-3 text-sm text-ink [&::-webkit-details-marker]:hidden">
          <span className="font-medium">本次同步结果</span><span className="ml-2 text-ink-3">{formatRunTime(latestRun.startedAt)} · {latestRun.dryRun ? "试运行" : "正式同步"} · 新建 {latestRun.createdRequestCount} 张 / {latestRun.createdItemCount} 条，跳过 {latestRun.skippedExistingCount} 条，待处理 {latestRun.blockedItemCount} 条，待核对 {latestRun.changedItemCount} 条</span>
        </summary>
        <div className="border-t border-line-soft">
          {latestRun.results.length ? <StickyTable className="max-h-72 overflow-auto" tableKey="frappe-demand-sync-results">
            <table className="min-w-[920px] border-collapse text-sm"><thead className="bg-canvas"><tr><th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">结果</th><th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">远端需求单</th><th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">本地需求单</th><th className="border-b border-r border-line-soft px-3 py-3 text-right font-medium">明细数</th><th className="border-b border-line-soft px-3 py-3 text-left font-medium">原因</th></tr></thead>
              <tbody>{latestRun.results.map((result, index) => <tr key={`${result.sourceOrderId}-${result.status}-${index}`}><td className="border-b border-r border-line-soft px-3 py-3">{syncResultStatus(result.status)}</td><td className="border-b border-r border-line-soft px-3 py-3 font-mono text-xs">{display(result.sourceOrderId)}</td><td className="border-b border-r border-line-soft px-3 py-3 font-mono text-xs">{display(result.localRequestNo)}</td><td className="border-b border-r border-line-soft px-3 py-3 text-right">{result.itemCount}</td><td className="border-b border-line-soft px-3 py-3 text-ink-2">{display(result.reason)}</td></tr>)}</tbody>
            </table>
          </StickyTable> : <div className="px-4 py-6 text-sm text-ink-3">此历史记录没有逐单结果；后续同步会保留该明细。</div>}
        </div>
      </details>
    </Panel> : null}
    <Panel>
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-3">
        {tabs.map(([key, label]) => <button className={`border-b-2 px-3 py-2 text-sm ${tab === key ? "border-primary text-primary" : "border-transparent text-ink-2"}`} type="button" key={key} onClick={() => { setTab(key); setStatus(""); }}>{label}{key === "ledger" ? null : <span className="ml-1 text-xs text-ink-3">{counts[key] ?? 0}</span>}<UnhandledBadge count={key === "ledger" ? unhandled.ledger : unhandled.mappings[key] ?? 0} /></button>)}
        <div className="ml-auto flex flex-wrap gap-2">
          {tab === "ledger" ? <>
            <select className="h-9 rounded border border-line bg-white px-3 text-sm" value={ledgerCategory} onChange={(event) => setLedgerCategory(event.target.value)}>
              {ledgerCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <Input placeholder="远端单号或本地需求单号" value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadLedger({ page: 1 }); }} />
            <Button disabled={busy} onClick={() => void loadLedger({ page: 1 })}>查询</Button>
            <Button disabled={busy || !selectedOrders.length} tone="primary" onClick={() => void rebuildSelectedOrders()}><Play size={15} />重新拉取所选（{selectedOrders.length}）</Button>
          </> : <>
            {tab === "material" ? <select className="h-9 rounded border border-line bg-white px-3 text-sm" title="按远端实例类型分类" value={materialType} onChange={(event) => setMaterialType(event.target.value)}><option value="">全部类型（{Object.values(materialTypeCounts).reduce((sum, value) => sum + value, 0)}）</option>{materialTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}（{materialTypeCounts[value] ?? 0}）</option>)}</select> : null}
            <select className="h-9 rounded border border-line bg-white px-3 text-sm" title="按本地档案是否存在筛选" value={localEntity} onChange={(event) => setLocalEntity(event.target.value)}><option value="">本地档案：全部</option><option value="exists">仅本地存在</option><option value="missing">仅本地已删除</option></select>
            <Input placeholder="远端编码、名称或本地档案" value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load({ page: 1 }); }} />
            <select className="h-9 rounded border border-line bg-white px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option><option value="pending">待处理</option><option value="confirmed">已确认</option><option value="conflict">冲突</option><option value="ignored">已忽略</option></select>
            <Button disabled={busy} onClick={() => void load({ page: 1 })}>查询</Button>
          </>}
        </div>
      </div>
      {tab === "ledger" ? <>
      <StickyTable className="max-h-[calc(100vh-280px)] overflow-auto" tableKey="frappe-demand-sync-ledger">
        <table className="min-w-[1100px] border-collapse text-sm">
          <thead className="bg-canvas"><tr>
            <th className="table-select-cell border-b border-r border-line-soft py-3 text-center font-medium [&>input]:h-4 [&>input]:w-4 [&>input]:align-middle"><input aria-label="全选需求单" checked={ledger.length > 0 && selectedOrders.length === ledger.length} type="checkbox" onChange={(event) => setSelectedOrders(event.target.checked ? ledger.map((row) => row.sourceOrderId) : [])} /></th>
            {["远端需求单号", "本地需求单号", "明细数", "本地状态", "远端变更", "最后同步", "操作"].map((label) => <th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium" key={label}>{label}</th>)}
          </tr></thead>
          <tbody>
            {ledger.map((row) => <Fragment key={row.sourceOrderId}>
              <tr className="hover:bg-surface-2">
                <td className="table-select-cell border-b border-r border-line-soft py-3 text-center [&>input]:h-4 [&>input]:w-4 [&>input]:align-middle"><input aria-label={`选择 ${row.sourceOrderId}`} checked={selectedOrders.includes(row.sourceOrderId)} type="checkbox" onChange={() => setSelectedOrders((current) => current.includes(row.sourceOrderId) ? current.filter((id) => id !== row.sourceOrderId) : [...current, row.sourceOrderId])} /></td>
                <td className="border-b border-r border-line-soft px-3 py-3 font-mono text-xs">{row.sourceOrderId}</td>
                <td className="border-b border-r border-line-soft px-3 py-3 font-mono text-xs">{display(row.localRequestNo)}</td>
                <td className="border-b border-r border-line-soft px-3 py-3 text-right">{row.itemCount}</td>
                <td className="border-b border-r border-line-soft px-3 py-3">{row.localExists ? <span className="text-success">已存在</span> : <span className="text-danger">已删除</span>}</td>
                <td className="border-b border-r border-line-soft px-3 py-3">{row.changedCount ? <span className="text-warning-deep">已变更 {row.changedCount} 条</span> : row.outOfScopeCount ? <span className="text-ink-3">{row.outOfScopeCount} 条状态变化</span> : "-"}</td>
                <td className="border-b border-r border-line-soft px-3 py-3 text-xs text-ink-3">{formatRunTime(row.lastSyncedAt)}</td>
                <td className="border-b border-line-soft px-3 py-3"><div className="flex flex-wrap gap-1"><Button onClick={() => void toggleLedgerOrder(row.sourceOrderId)}>{expandedOrder === row.sourceOrderId ? "收起明细" : "查看明细"}</Button>{row.changedCount ? <Button disabled={busy} tone="primary" onClick={() => void acceptOrderChanges(row.sourceOrderId)}>已核对</Button> : null}</div></td>
              </tr>
              {expandedOrder === row.sourceOrderId ? <tr><td className="border-b border-line-soft bg-surface-2 px-4 py-3" colSpan={8}>
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead><tr>{["明细ID", "台账状态", "原因", "本地明细", "远端变更", "说明"].map((label) => <th className="border-b border-line-soft px-3 py-2 text-left font-medium text-ink-2" key={label}>{label}</th>)}</tr></thead>
                  <tbody>{ledgerItems.map((item) => <tr key={item.sourceItemId}>
                    <td className="border-b border-line-soft px-3 py-2 font-mono text-xs">{item.sourceItemId}</td>
                    <td className="border-b border-line-soft px-3 py-2">{ledgerItemStatus(item.status)}</td>
                    <td className="border-b border-line-soft px-3 py-2">{ledgerReasonLabel(item.reasonCode)}</td>
                    <td className="border-b border-line-soft px-3 py-2 font-mono text-xs">{display(item.localRequestItemId)}</td>
                    <td className="border-b border-line-soft px-3 py-2">{item.changes.length ? item.changes.map((change) => `${change.label} ${change.from || "空"} → ${change.to || "空"}`).join("；") : "-"}</td>
                    <td className="border-b border-line-soft px-3 py-2 text-ink-2">{display(item.errorMessage)}</td>
                  </tr>)}</tbody>
                </table>
              </td></tr> : null}
            </Fragment>)}
            {!ledger.length ? <tr><td className="py-14 text-center text-ink-3" colSpan={8}><TableStateContent empty="暂无台账记录" loading={busy} /></td></tr> : null}
          </tbody>
        </table>
      </StickyTable>
      <PaginationBar page={ledgerPage} pageSize={ledgerPageSize} total={ledgerTotal} onPageChange={(next) => { setLedgerPage(next); void loadLedger({ page: next }); }} onPageSizeChange={(size) => { setLedgerPageSize(size); setLedgerPage(1); void loadLedger({ page: 1, pageSize: size }); }} />
      </> : <>
      <StickyTable className="max-h-[calc(100vh-280px)] overflow-auto" tableKey="frappe-demand-sync-mappings">
        <table className="min-w-[1260px] border-collapse text-sm"><thead className="bg-canvas"><tr><th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">远端ID</th><th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">远端信息</th><th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">自动匹配</th><th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">本地档案</th><th className="border-b border-r border-line-soft px-3 py-3 text-left font-medium">状态</th><th className="border-b border-line-soft px-3 py-3 text-left font-medium">操作</th></tr></thead>
          <tbody>{visibleMappings.map((mapping) => <tr key={mapping.mappingId}><td className="border-b border-r border-line-soft px-3 py-3 font-mono text-xs">{mapping.sourceId}</td><td className="max-w-[340px] border-b border-r border-line-soft px-3 py-3"><div>{display(mapping.sourceCode)} {mapping.sourceName ? `- ${mapping.sourceName}` : ""}</div><div className="mt-1 whitespace-normal text-xs text-ink-3">{sourceDetails(mapping) || "-"}</div></td><td className="max-w-[260px] border-b border-r border-line-soft px-3 py-3 text-ink-2">{mapping.candidates?.length === 1 ? mapping.candidates[0].label : mapping.candidates?.length ? `${mapping.candidates.length} 个候选项` : "无"}</td><td className="max-w-[260px] border-b border-r border-line-soft px-3 py-3">{display(mapping.localDisplayName)}{mapping.localEntityExists === false ? <span className="ml-1 text-danger">（本地档案已删除）</span> : null}</td><td className="border-b border-r border-line-soft px-3 py-3">{mappingStatus(mapping.status)}</td><td className="border-b border-line-soft px-3 py-3"><Button tone={mapping.status === "pending" || mapping.status === "conflict" ? "primary" : undefined} onClick={() => setEditing(mapping)}>{mapping.status === "pending" || mapping.status === "conflict" ? "去匹配" : <><Pencil size={14} />修改匹配</>}</Button></td></tr>)}{!visibleMappings.length ? <tr><td className="py-14 text-center text-ink-3" colSpan={6}>{busy ? "加载中..." : "暂无映射记录"}</td></tr> : null}</tbody>
        </table>
      </StickyTable>
      <PaginationBar
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(next) => { setPage(next); void load({ page: next }); }}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); void load({ page: 1, pageSize: size }); }}
      />
      </>}
    </Panel>
    {editing ? <MappingDialog mapping={editing} masters={masters} onCancel={() => setEditing(null)} onSave={async (body) => { try { await requestJson(`/api/integrations/frappe-demand-sync/mappings/${encodeURIComponent(editing.mappingId)}`, { method: "PATCH", body: JSON.stringify(body) }); setEditing(null); setNotice("映射已保存"); await load(); await loadUnhandled(); } catch (error) { setNotice(error instanceof Error ? error.message : "映射保存失败"); } }} /> : null}
  </div>;
}

function MappingDialog({ mapping, masters, onCancel, onSave }: { mapping: Mapping; masters: MasterSet; onCancel: () => void; onSave: (body: Row) => Promise<void> }) {
  const [localEntityId, setLocalEntityId] = useState(text(mapping.localEntityId));
  const [status, setStatus] = useState(mapping.status === "confirmed" || mapping.status === "ignored" ? mapping.status : "confirmed");
  const [saving, setSaving] = useState(false);
  const options = getTargetOptions(mapping, masters);
  const suggestions = mapping.candidates ?? [];
  const shouldSelectTarget = status === "confirmed";
  const canSave = !shouldSelectTarget || Boolean(localEntityId);
  const title = mapping.status === "pending" || mapping.status === "conflict" ? "选择本地档案并确认" : "修改映射";

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-2xl rounded border border-line-soft bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
        <h2 className="text-lg font-medium text-ink">{title}</h2>
        <button type="button" title="关闭" onClick={onCancel}><X size={17} /></button>
      </div>
      <div className="space-y-4 p-5">
        <div className="border border-line-soft bg-surface-2 p-3 text-sm text-ink-2">
          <div className="font-medium text-ink">{sourceTypeLabel(mapping.sourceType)}：{mapping.sourceId}</div>
          <div className="mt-2">{display(mapping.sourceCode)} {mapping.sourceName ? `- ${mapping.sourceName}` : ""}</div>
          <div className="mt-2 break-words text-xs text-ink-3">{sourceDetails(mapping) || "-"}</div>
        </div>
        <label className="block text-sm text-ink-2">
          <span className="mb-1 block">处理方式</span>
          <select className="h-9 w-full rounded border border-line bg-white px-3" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="confirmed">选择本地档案并确认映射</option>
            <option value="pending">解除映射，保留待处理</option>
            <option value="ignored">忽略此远端记录</option>
          </select>
        </label>
        {shouldSelectTarget ? <>
          {suggestions.length ? <div className="space-y-2 text-sm text-ink-2">
            <div>自动匹配候选</div>
            <div className="flex flex-wrap gap-2">{suggestions.map((candidate) => <button className={`border px-3 py-2 text-left text-sm ${localEntityId === candidate.id ? "border-primary bg-info-soft text-primary" : "border-line bg-white text-ink-2 hover:border-primary"}`} key={candidate.id} type="button" onClick={() => { setLocalEntityId(candidate.id); setStatus("confirmed"); }}>{candidate.label}</button>)}</div>
          </div> : null}
          <label className="block text-sm text-ink-2">
            <span className="mb-1 block">本地对应档案<b className="ml-1 text-danger">*</b></span>
            <select className="h-9 w-full rounded border border-line bg-white px-3" value={localEntityId} onChange={(event) => setLocalEntityId(event.target.value)}>
              <option value="">请选择</option>
              {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
        </> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-line-soft px-5 py-4">
        <Button disabled={saving} onClick={onCancel}>取消</Button>
        <Button tone="primary" disabled={saving || !canSave} onClick={() => { setSaving(true); void onSave({ status, localEntityId }).finally(() => setSaving(false)); }}><Save size={15} />保存</Button>
      </div>
    </div>
  </div>;
}
