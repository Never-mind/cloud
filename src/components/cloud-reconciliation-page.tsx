"use client";

import { useEffect, useState } from "react";
import { Check, Cloud, Download, FileUp, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Button, Input, Panel } from "./ui";
import { StickyTable } from "./sticky-table";

type Tab = "reconciliation" | "mapping" | "collections" | "supplier-payments";
type Row = Record<string, unknown> & { id?: string };
type Master = { id: string; code?: string; name: string };

const tabs: Array<[Tab, string]> = [["reconciliation", "跨月对账台账"], ["mapping", "服务映射"], ["collections", "收款管理"], ["supplier-payments", "供应商付款"]];
const columns: Array<[string, string]> = [["period", "账期"], ["batchCode", "批次号"], ["customer", "客户"], ["account", "华为云账号"], ["supplierName", "供应商"], ["undertakingUnitName", "承接单位"], ["catalogAmount", "目录金额"], ["customerReceivable", "客户应收"], ["grossProfit", "毛利"], ["collectionInvoice", "收款发票"], ["collected", "已收款"], ["confirmed", "已确认"]];

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data.error ?? "请求失败"));
  return data as T;
}

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return String(value);
}

export function CloudReconciliationPage() {
  const [tab, setTab] = useState<Tab>("reconciliation");
  const [rows, setRows] = useState<Row[]>([]);
  const [mappings, setMappings] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [masters, setMasters] = useState<{ suppliers: Master[]; undertakingUnits: Master[]; customers: Master[] }>({ suppliers: [], undertakingUnits: [], customers: [] });
  const [keyword, setKeyword] = useState("");
  const [period, setPeriod] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [mappingForm, setMappingForm] = useState<Row | null>(null);

  async function load() {
    setBusy(true);
    try {
      if (tab === "mapping") {
        const data = await requestJson<{ items: Row[] }>(`/api/cloud/mappings?keyword=${encodeURIComponent(keyword)}&page=${page}`);
        setMappings(data.items);
      } else if (tab === "supplier-payments") {
        const data = await requestJson<{ items: Row[]; total: number }>(`/api/cloud/supplier-payments?keyword=${encodeURIComponent(keyword)}&period=${encodeURIComponent(period)}&page=${page}`);
        setPayments(data.items); setTotal(data.total);
      } else {
        const data = await requestJson<{ items: Row[]; total: number }>(`/api/cloud/rows?keyword=${encodeURIComponent(keyword)}&period=${encodeURIComponent(period)}&page=${page}`);
        setRows(data.items); setTotal(data.total);
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "加载失败"); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, [tab, page, period]);
  useEffect(() => { void requestJson<typeof masters>("/api/cloud/master-data").then(setMasters).catch(() => undefined); }, []);

  async function importWorkbook() {
    if (!importFile) return;
    const form = new FormData(); form.set("file", importFile); form.set("period", period);
    setBusy(true);
    try {
      const response = await fetch("/api/cloud/import", { method: "POST", body: form });
      const data = await response.json(); if (!response.ok) throw new Error(String(data.error ?? "导入失败"));
      setNotice(`账单已导入：${data.batchCode}，共${data.rowCount}行`); setImportFile(null); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "导入失败"); }
    finally { setBusy(false); }
  }

  async function updateRow(row: Row, patch: Row) {
    try { await requestJson(`/api/cloud/rows/${encodeURIComponent(String(row.id ?? ""))}`, { method: "PATCH", body: JSON.stringify(patch) }); setNotice("对账明细已更新"); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "保存失败"); }
  }

  async function confirmRow(row: Row) {
    try { await requestJson(`/api/cloud/rows/${encodeURIComponent(String(row.id ?? ""))}/confirm`, { method: "POST", body: JSON.stringify({ confirmed: !row.confirmed }) }); setNotice("确认状态已更新"); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "确认失败"); }
  }

  async function deleteRow(row: Row) {
    if (!window.confirm(`确认删除 ${display(row.customer)} / ${display(row.account)} 吗？`)) return;
    try { await requestJson(`/api/cloud/rows/${encodeURIComponent(String(row.id ?? ""))}`, { method: "DELETE" }); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "删除失败"); }
  }

  async function attachRow(row: Row, file: File) {
    const form = new FormData(); form.set("file", file);
    try {
      const response = await fetch(`/api/cloud/attachments/collection/${encodeURIComponent(String(row.id ?? ""))}`, { method: "POST", body: form });
      const data = await response.json(); if (!response.ok) throw new Error(String(data.error ?? "附件上传失败"));
      setNotice(`附件“${file.name}”已关联`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "附件上传失败"); }
  }

  async function saveMapping() {
    if (!mappingForm) return;
    try { await requestJson(mappingForm.id ? `/api/cloud/mappings/${mappingForm.id}` : "/api/cloud/mappings", { method: mappingForm.id ? "PATCH" : "POST", body: JSON.stringify(mappingForm) }); setMappingForm(null); setNotice("服务映射已保存"); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "保存失败"); }
  }

  async function updatePayment(row: Row) {
    try { await requestJson(`/api/cloud/supplier-payments/${encodeURIComponent(String(row.id ?? ""))}`, { method: "PATCH", body: JSON.stringify({ paid: !row.paid, invoiceStatus: row.invoiceStatus === "issued" ? "not_issued" : "issued" }) }); setNotice("供应商付款状态已更新"); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "付款保存失败"); }
  }

  return <div className="space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><Cloud size={22} className="text-[#1890ff]" /><h1 className="text-2xl font-medium text-[#303133]">华为云业务</h1></div><p className="mt-2 text-sm text-[#909399]">月度账单、服务映射、跨月收款和供应商付款</p></div>
      <div className="flex flex-wrap gap-2"><label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded border border-[#dcdfe6] bg-white px-3 text-sm text-[#606266]"><FileUp size={15} />导入账单<input className="hidden" type="file" accept=".xlsx,.xls" onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} /></label><a href="/api/cloud/template"><Button type="button"><Download size={15} />下载导入模板</Button></a>{importFile ? <Button tone="primary" disabled={busy} onClick={() => void importWorkbook()}>确认导入</Button> : null}<Button onClick={() => window.open(`/api/cloud/rows/export?keyword=${encodeURIComponent(keyword)}&period=${encodeURIComponent(period)}`, "_blank")}><Download size={15} />导出数据</Button></div>
    </header>
    {notice ? <div className="flex items-center justify-between border border-[#b3d8ff] bg-[#ecf5ff] px-3 py-2 text-sm text-[#1890ff]">{notice}<button type="button" title="关闭提示" onClick={() => setNotice("")}><X size={15} /></button></div> : null}
    <Panel>
      <div className="flex flex-wrap items-center gap-2 border-b border-[#ebeef5] p-3">{tabs.map(([key, label]) => <button className={`border-b-2 px-3 py-2 text-sm ${tab === key ? "border-[#1890ff] text-[#1890ff]" : "border-transparent text-[#606266]"}`} key={key} type="button" onClick={() => { setTab(key); setPage(1); }}>{label}</button>)}<div className="ml-auto flex flex-wrap gap-2"><Input placeholder="搜索客户、账号、批次或供应商" value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(); }} /><Input className="min-w-[130px]" placeholder="账期 YYYY-MM" value={period} onChange={(event) => setPeriod(event.target.value)} /><Button onClick={() => { setPage(1); void load(); }}><Search size={15} />查询</Button></div></div>
      {tab === "mapping" ? <MappingTable rows={mappings} onEdit={setMappingForm} onAdd={() => setMappingForm({ accounts: "", calculationLogic: "catalog" })} /> : tab === "supplier-payments" ? <PaymentTable rows={payments} onUpdate={updatePayment} /> : <RowTable rows={rows} onAttach={attachRow} onConfirm={confirmRow} onDelete={deleteRow} onUpdate={updateRow} collections={tab === "collections"} />}
      {tab !== "mapping" ? <div className="flex items-center justify-between border-t border-[#ebeef5] px-4 py-3 text-sm text-[#909399]"><span>{busy ? "加载中..." : `共 ${total} 条`}</span><div className="flex gap-2"><Button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</Button><span className="px-2 py-2">第 {page} 页</span><Button disabled={rows.length < 20 && payments.length < 20} onClick={() => setPage((value) => value + 1)}>下一页</Button></div></div> : null}
    </Panel>
    {mappingForm ? <MappingForm value={mappingForm} masters={masters} onChange={setMappingForm} onCancel={() => setMappingForm(null)} onSave={() => void saveMapping()} /> : null}
  </div>;
}

function RowTable({ rows, collections, onAttach, onConfirm, onDelete, onUpdate }: { rows: Row[]; collections: boolean; onAttach: (row: Row, file: File) => void; onConfirm: (row: Row) => void; onDelete: (row: Row) => void; onUpdate: (row: Row, patch: Row) => void }) {
  return <StickyTable className="max-h-[calc(100vh-270px)] overflow-auto" tableKey="cloud-rows"><table className="w-full min-w-[1500px] border-collapse text-sm"><thead className="sticky top-0 z-10 bg-[#f5f7fa]"><tr>{columns.map(([, label]) => <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={label}>{label}</th>)}<th className="border-b border-[#ebeef5] px-3 py-3 text-left">操作</th></tr></thead><tbody>{rows.map((row) => <tr className="hover:bg-[#fafafa]" key={String(row.id)}>{columns.map(([key]) => <td className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3" key={key}>{key === "collected" || key === "confirmed" ? (row[key] ? "是" : "否") : key === "collectionInvoice" ? (row[key] === "issued" ? "已开" : "未开") : display(row[key])}</td>)}<td className="whitespace-nowrap border-b border-[#ebeef5] px-3 py-2"><div className="flex gap-1"><Button onClick={() => onConfirm(row)}><Check size={14} />{row.confirmed ? "取消确认" : "确认"}</Button>{collections ? <Button onClick={() => onUpdate(row, { collected: !row.collected, collectionInvoice: row.collectionInvoice === "issued" ? "not_issued" : "issued" })}><Pencil size={14} />收款/开票</Button> : null}<label className="inline-flex h-9 cursor-pointer items-center justify-center gap-1 rounded border border-[#dcdfe6] bg-white px-3 text-sm text-[#606266]"><FileUp size={14} />附件<input className="hidden" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) onAttach(row, file); event.target.value = ""; }} /></label><Button tone="danger" onClick={() => onDelete(row)}><Trash2 size={14} />删除</Button></div></td></tr>)}{!rows.length ? <tr><td className="py-12 text-center text-[#909399]" colSpan={columns.length + 1}>暂无数据</td></tr> : null}</tbody></table></StickyTable>;
}

function MappingTable({ rows, onEdit, onAdd }: { rows: Row[]; onEdit: (row: Row) => void; onAdd: () => void }) {
  return <div><div className="flex justify-end p-3"><Button tone="primary" onClick={onAdd}><Plus size={15} />新增服务映射</Button></div><StickyTable className="max-h-[calc(100vh-320px)] overflow-auto" tableKey="cloud-mappings"><table className="w-full min-w-[1100px] border-collapse text-sm"><thead className="bg-[#f5f7fa]"><tr>{["供应商", "承接单位", "客户", "账号", "对账人", "计算逻辑", "客户折扣", "操作"].map((label) => <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td className="border-b border-r border-[#ebeef5] px-3 py-3">{display(row.supplierName)}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3">{display(row.undertakingUnitName)}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3">{display(row.customerName)}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3">{display(row.accounts)}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3">{display(row.reconciler)}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3">{display(row.calculationLogic)}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3">{display(row.userDiscount)}</td><td className="border-b border-[#ebeef5] px-3 py-3"><Button onClick={() => onEdit(row)}><Pencil size={14} />修改</Button></td></tr>)}{!rows.length ? <tr><td className="py-12 text-center text-[#909399]" colSpan={8}>暂无映射</td></tr> : null}</tbody></table></StickyTable></div>;
}

function PaymentTable({ rows, onUpdate }: { rows: Row[]; onUpdate: (row: Row) => void }) {
  return <StickyTable className="max-h-[calc(100vh-270px)] overflow-auto" tableKey="cloud-payments"><table className="w-full min-w-[1120px] border-collapse text-sm"><thead className="bg-[#f5f7fa]"><tr>{["账期", "供应商", "付款主体", "币种", "付款未税金额", "付款含税金额", "发票状态", "已付款", "付款日期", "操作"].map((label) => <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)}>{["period", "supplierName", "payerUnitName", "currency", "paymentNetAmount", "paymentTotalAmount", "invoiceStatus", "paid", "paymentDate"].map((key) => <td className="border-b border-r border-[#ebeef5] px-3 py-3" key={key}>{key === "paid" ? (row[key] ? "是" : "否") : display(row[key])}</td>)}<td className="border-b border-[#ebeef5] px-3 py-2"><Button onClick={() => onUpdate(row)}><Pencil size={14} />更新付款/发票</Button></td></tr>)}{!rows.length ? <tr><td className="py-12 text-center text-[#909399]" colSpan={10}>暂无供应商付款</td></tr> : null}</tbody></table></StickyTable>;
}

function MappingForm({ value, masters, onChange, onCancel, onSave }: { value: Row; masters: { suppliers: Master[]; undertakingUnits: Master[]; customers: Master[] }; onChange: (value: Row) => void; onCancel: () => void; onSave: () => void }) {
  const field = (key: string, label: string, options?: Master[]) => <label className="space-y-1 text-sm text-[#606266]"><span>{label}</span>{options ? <select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-2" value={String(value[key] ?? "")} onChange={(event) => { const selected = options.find((item) => item.id === event.target.value); onChange({ ...value, [key]: event.target.value, [`${key.replace("Id", "Name")}`]: selected?.name ?? "" }); }}><option value="">请选择</option>{options.map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} - ` : ""}{item.name}</option>)}</select> : <Input className="w-full" value={String(value[key] ?? "")} onChange={(event) => onChange({ ...value, [key]: event.target.value })} />}</label>;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-2xl bg-white p-5 shadow-xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg text-[#303133]">{value.id ? "修改服务映射" : "新增服务映射"}</h2><button type="button" title="关闭" onClick={onCancel}><X size={17} /></button></div><div className="grid gap-3 sm:grid-cols-2">{field("supplierId", "供应商", masters.suppliers)}{field("undertakingUnitId", "承接单位", masters.undertakingUnits)}{field("customerId", "客户", masters.customers)}{field("reconciler", "对账人")}{field("calculationLogic", "计算逻辑")}<label className="space-y-1 text-sm text-[#606266]"><span>华为云账号（逗号分隔）</span><Input className="w-full" value={String(value.accounts ?? "")} onChange={(event) => onChange({ ...value, accounts: event.target.value })} /></label><label className="space-y-1 text-sm text-[#606266]"><span>客户折扣</span><Input className="w-full" type="number" value={String(value.userDiscount ?? "")} onChange={(event) => onChange({ ...value, userDiscount: event.target.value })} /></label></div><div className="mt-5 flex justify-end gap-2"><Button onClick={onCancel}>取消</Button><Button tone="primary" onClick={onSave}>保存</Button></div></div></div>;
}
