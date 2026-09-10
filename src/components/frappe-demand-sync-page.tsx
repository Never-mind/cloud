"use client";

import { useEffect, useState } from "react";
import { DatabaseZap, FileSearch, Pencil, Play, RefreshCw, Save, X } from "lucide-react";
import { Button, Input, Panel } from "./ui";
import { StickyTable } from "./sticky-table";

type Tab = "supplier" | "material";
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
  undertakingUnitId?: string | null;
  candidates?: Array<{ id: string; label: string }>;
};

type MasterSet = {
  suppliers: Row[];
  instanceModels: Row[];
  datacenters: Row[];
  locations: Row[];
  contacts: Row[];
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

const emptyMasters: MasterSet = { suppliers: [], instanceModels: [], datacenters: [], locations: [], contacts: [] };
const tabs: Array<[Tab, string]> = [
  ["supplier", "供应商映射"],
  ["material", "实例/物料映射"],
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
  const colors: Record<string, string> = { pending: "bg-[#fdf6ec] text-[#e6a23c]", confirmed: "bg-[#f0f9eb] text-[#67c23a]", conflict: "bg-[#fef0f0] text-[#f56c6c]", ignored: "bg-[#f4f4f5] text-[#909399]" };
  return <span className={`inline-flex rounded px-2 py-1 text-xs ${colors[status] ?? colors.pending}`}>{labels[status] ?? status}</span>;
}

function syncResultStatus(status: SyncResult["status"]) {
  const labels: Record<SyncResult["status"], string> = { created: "已新建", skipped_existing: "已跳过", blocked: "待处理", pending_change: "待核对" };
  const colors: Record<SyncResult["status"], string> = { created: "bg-[#f0f9eb] text-[#67c23a]", skipped_existing: "bg-[#f4f4f5] text-[#909399]", blocked: "bg-[#fdf6ec] text-[#e6a23c]", pending_change: "bg-[#fef0f0] text-[#f56c6c]" };
  return <span className={`inline-flex rounded px-2 py-1 text-xs ${colors[status]}`}>{labels[status]}</span>;
}

function formatRunTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function sourceTypeLabel(sourceType: string) {
  return ({ datacenter: "机房", delivery_location: "收货地址", delivery_recipient_list: "收件人" } as Record<string, string>)[sourceType] ?? sourceType;
}

function sourceDetails(mapping: Mapping) {
  const data = mapping.sourceData ?? {};
  if (mapping.sourceType === "supplier") return [data.partnerCode && `供应商编码：${text(data.partnerCode)}`, data.partnerAlias && `简称：${text(data.partnerAlias)}`].filter(Boolean).join("  ");
  if (mapping.sourceType === "material") return [data.customerItemCode && `设备编码：${text(data.customerItemCode)}`, data.customerPartNo && `客户料号：${text(data.customerPartNo)}`, data.materialCode && `xxll编码：${text(data.materialCode)}`].filter(Boolean).join("  ");
  if (mapping.sourceType === "datacenter") return [data.datacenterCode && `机房编码：${text(data.datacenterCode)}`, data.country && `国家：${text(data.country)}`, data.deliveryLocationId && `收货地址：${text(data.deliveryLocationId)}`].filter(Boolean).join("  ");
  if (mapping.sourceType === "delivery_location") return [data.locationType && `类型：${text(data.locationType)}`, data.address && `地址：${text(data.address)}`].filter(Boolean).join("  ");
  return [data.rawContact && `联系人：${text(data.rawContact)}`, data.rawPhone && `电话：${text(data.rawPhone)}`].filter(Boolean).join("  ");
}

function getTargetOptions(mapping: Mapping, masters: MasterSet) {
  if (mapping.sourceType === "supplier") return masters.suppliers.map((row) => ({ id: text(row.supplierId), label: `${text(row.supplierCode)} - ${text(row.shortName || row.nameCn)}` }));
  if (mapping.sourceType === "material") return masters.instanceModels.map((row) => ({ id: text(row.deviceCode), label: `${text(row.deviceCode)} - ${text(row.nameZh || row.modelCode || row.nameEn)}` }));
  if (mapping.sourceType === "datacenter") return masters.datacenters.map((row) => ({ id: text(row.dcCode), label: `${text(row.dcCode)} - ${text(row.nameZh || row.nameEn)}` }));
  if (mapping.sourceType === "delivery_location") return masters.locations.map((row) => ({ id: text(row.locationId), label: `${text(row.locationId)} - ${text(row.nameZh || row.fullAddress || row.nameEn)}` }));
  return masters.contacts.map((row) => ({ id: text(row.contactId), label: `${text(row.contactId)} - ${text(row.name)}${text(row.phone) ? ` (${text(row.phone)})` : ""}` }));
}

export function FrappeDemandSyncPage() {
  const [tab, setTab] = useState<Tab>("supplier");
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [masters, setMasters] = useState<MasterSet>(emptyMasters);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Mapping | null>(null);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);

  const visibleMappings = mappings;
  const latestRun = syncRuns[0];

  async function load() {
    setBusy(true);
    try {
      const params = new URLSearchParams({ tab, keyword, status });
      const data = await requestJson<{ items: Mapping[] }>(`/api/integrations/frappe-demand-sync/mappings?${params}`);
      setMappings(data.items);
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

  useEffect(() => { void load(); }, [tab]);
  useEffect(() => { void loadSyncRuns(); }, []);
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
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "远端数据刷新失败");
    } finally {
      setBusy(false);
    }
  }

  async function runSync(dryRun: boolean) {
    if (!dryRun && !window.confirm("将创建映射完整的本地需求草稿，是否继续？")) return;
    setBusy(true);
    try {
      const result = await requestJson<{ dryRun: boolean; createdRequests: number; createdItems: number; blockedItems: number; skippedExisting: number; changedItems: number }>("/api/integrations/frappe-demand-sync", {
        method: "POST", body: JSON.stringify({ triggerType: "manual", dryRun }),
      });
      setNotice(`${result.dryRun ? "试运行完成" : "同步完成"}：新建 ${result.createdRequests} 张需求单、${result.createdItems} 条明细；已跳过 ${result.skippedExisting} 条明细；待处理 ${result.blockedItems} 条；待核对 ${result.changedItems} 条。下方可查看逐单结果。`);
      await load();
      await loadSyncRuns();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "需求同步失败");
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-2"><DatabaseZap size={22} className="text-[#1890ff]" /><h1 className="text-2xl font-medium text-[#303133]">需求同步映射</h1></div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void refresh()}><RefreshCw size={15} />刷新远端数据</Button>
        <Button disabled={busy} onClick={() => void runSync(true)}><FileSearch size={15} />试运行</Button>
        <Button disabled={busy} tone="primary" onClick={() => void runSync(false)}><Play size={15} />同步需求</Button>
      </div>
    </header>
    {notice ? <div className="flex items-center justify-between border border-[#b3d8ff] bg-[#ecf5ff] px-3 py-2 text-sm text-[#1890ff]"><span>{notice}</span><button type="button" title="关闭提示" onClick={() => setNotice("")}><X size={15} /></button></div> : null}
    {latestRun ? <Panel>
      <details open>
        <summary className="cursor-pointer list-none px-4 py-3 text-sm text-[#303133] [&::-webkit-details-marker]:hidden">
          <span className="font-medium">本次同步结果</span><span className="ml-2 text-[#909399]">{formatRunTime(latestRun.startedAt)} · {latestRun.dryRun ? "试运行" : "正式同步"} · 新建 {latestRun.createdRequestCount} 张 / {latestRun.createdItemCount} 条，跳过 {latestRun.skippedExistingCount} 条，待处理 {latestRun.blockedItemCount} 条，待核对 {latestRun.changedItemCount} 条</span>
        </summary>
        <div className="border-t border-[#ebeef5]">
          {latestRun.results.length ? <StickyTable className="max-h-72 overflow-auto" tableKey="frappe-demand-sync-results">
            <table className="min-w-[920px] border-collapse text-sm"><thead className="bg-[#f5f7fa]"><tr><th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">结果</th><th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">远端需求单</th><th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">本地需求单</th><th className="border-b border-r border-[#ebeef5] px-3 py-3 text-right font-medium">明细数</th><th className="border-b border-[#ebeef5] px-3 py-3 text-left font-medium">原因</th></tr></thead>
              <tbody>{latestRun.results.map((result, index) => <tr key={`${result.sourceOrderId}-${result.status}-${index}`}><td className="border-b border-r border-[#ebeef5] px-3 py-3">{syncResultStatus(result.status)}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3 font-mono text-xs">{display(result.sourceOrderId)}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3 font-mono text-xs">{display(result.localRequestNo)}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3 text-right">{result.itemCount}</td><td className="border-b border-[#ebeef5] px-3 py-3 text-[#606266]">{display(result.reason)}</td></tr>)}</tbody>
            </table>
          </StickyTable> : <div className="px-4 py-6 text-sm text-[#909399]">此历史记录没有逐单结果；后续同步会保留该明细。</div>}
        </div>
      </details>
    </Panel> : null}
    <Panel>
      <div className="flex flex-wrap items-center gap-2 border-b border-[#ebeef5] p-3">
        {tabs.map(([key, label]) => <button className={`border-b-2 px-3 py-2 text-sm ${tab === key ? "border-[#1890ff] text-[#1890ff]" : "border-transparent text-[#606266]"}`} type="button" key={key} onClick={() => { setTab(key); setStatus(""); }}>{label}</button>)}
        <div className="ml-auto flex flex-wrap gap-2"><Input placeholder="远端编码、名称或本地档案" value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(); }} /><select className="h-9 rounded border border-[#dcdfe6] bg-white px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option><option value="pending">待处理</option><option value="confirmed">已确认</option><option value="conflict">冲突</option><option value="ignored">已忽略</option></select><Button disabled={busy} onClick={() => void load()}>查询</Button></div>
      </div>
      <StickyTable className="max-h-[calc(100vh-280px)] overflow-auto" tableKey="frappe-demand-sync-mappings">
        <table className="min-w-[1260px] border-collapse text-sm"><thead className="bg-[#f5f7fa]"><tr><th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">远端ID</th><th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">远端信息</th><th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">自动匹配</th><th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">本地档案</th><th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">状态</th><th className="border-b border-[#ebeef5] px-3 py-3 text-left font-medium">操作</th></tr></thead>
          <tbody>{visibleMappings.map((mapping) => <tr key={mapping.mappingId}><td className="border-b border-r border-[#ebeef5] px-3 py-3 font-mono text-xs">{mapping.sourceId}</td><td className="max-w-[340px] border-b border-r border-[#ebeef5] px-3 py-3"><div>{display(mapping.sourceCode)} {mapping.sourceName ? `- ${mapping.sourceName}` : ""}</div><div className="mt-1 whitespace-normal text-xs text-[#909399]">{sourceDetails(mapping) || "-"}</div></td><td className="max-w-[260px] border-b border-r border-[#ebeef5] px-3 py-3 text-[#606266]">{mapping.candidates?.length === 1 ? mapping.candidates[0].label : mapping.candidates?.length ? `${mapping.candidates.length} 个候选项` : "无"}</td><td className="max-w-[260px] border-b border-r border-[#ebeef5] px-3 py-3">{display(mapping.localDisplayName)}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3">{mappingStatus(mapping.status)}</td><td className="border-b border-[#ebeef5] px-3 py-3"><Button tone={mapping.status === "pending" || mapping.status === "conflict" ? "primary" : undefined} onClick={() => setEditing(mapping)}>{mapping.status === "pending" || mapping.status === "conflict" ? "去匹配" : <><Pencil size={14} />修改匹配</>}</Button></td></tr>)}{!visibleMappings.length ? <tr><td className="py-14 text-center text-[#909399]" colSpan={6}>{busy ? "加载中..." : "暂无映射记录"}</td></tr> : null}</tbody>
        </table>
      </StickyTable>
    </Panel>
    {editing ? <MappingDialog mapping={editing} masters={masters} onCancel={() => setEditing(null)} onSave={async (body) => { try { await requestJson(`/api/integrations/frappe-demand-sync/mappings/${encodeURIComponent(editing.mappingId)}`, { method: "PATCH", body: JSON.stringify(body) }); setEditing(null); setNotice("映射已保存"); await load(); } catch (error) { setNotice(error instanceof Error ? error.message : "映射保存失败"); } }} /> : null}
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

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-2xl bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-[#ebeef5] px-5 py-4">
        <h2 className="text-lg font-medium text-[#303133]">{title}</h2>
        <button type="button" title="关闭" onClick={onCancel}><X size={17} /></button>
      </div>
      <div className="space-y-4 p-5">
        <div className="border border-[#ebeef5] bg-[#fafafa] p-3 text-sm text-[#606266]">
          <div className="font-medium text-[#303133]">{sourceTypeLabel(mapping.sourceType)}：{mapping.sourceId}</div>
          <div className="mt-2">{display(mapping.sourceCode)} {mapping.sourceName ? `- ${mapping.sourceName}` : ""}</div>
          <div className="mt-2 break-words text-xs text-[#909399]">{sourceDetails(mapping) || "-"}</div>
        </div>
        <label className="block text-sm text-[#606266]">
          <span className="mb-1 block">处理方式</span>
          <select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-3" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="confirmed">选择本地档案并确认映射</option>
            <option value="pending">解除映射，保留待处理</option>
            <option value="ignored">忽略此远端记录</option>
          </select>
        </label>
        {shouldSelectTarget ? <>
          {suggestions.length ? <div className="space-y-2 text-sm text-[#606266]">
            <div>自动匹配候选</div>
            <div className="flex flex-wrap gap-2">{suggestions.map((candidate) => <button className={`border px-3 py-2 text-left text-sm ${localEntityId === candidate.id ? "border-[#1890ff] bg-[#ecf5ff] text-[#1890ff]" : "border-[#dcdfe6] bg-white text-[#606266] hover:border-[#1890ff]"}`} key={candidate.id} type="button" onClick={() => { setLocalEntityId(candidate.id); setStatus("confirmed"); }}>{candidate.label}</button>)}</div>
          </div> : null}
          <label className="block text-sm text-[#606266]">
            <span className="mb-1 block">本地对应档案<b className="ml-1 text-[#f56c6c]">*</b></span>
            <select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-3" value={localEntityId} onChange={(event) => setLocalEntityId(event.target.value)}>
              <option value="">请选择</option>
              {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
        </> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-[#ebeef5] px-5 py-4">
        <Button disabled={saving} onClick={onCancel}>取消</Button>
        <Button tone="primary" disabled={saving || !canSave} onClick={() => { setSaving(true); void onSave({ status, localEntityId }).finally(() => setSaving(false)); }}><Save size={15} />保存</Button>
      </div>
    </div>
  </div>;
}
