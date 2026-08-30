"use client";

import { Fragment, useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, Cloud, Download, FileUp, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Button, Input, Panel } from "./ui";
import { StickyTable } from "./sticky-table";
import { TableColumnMenu, type TableFilterOption, type TableSortOrder } from "./table-column-menu";
import { fetchTableFilterOptions } from "@/lib/table-query-client";

type Tab = "reconciliation" | "mapping" | "collections" | "supplier-payments";
type Row = Record<string, unknown> & { id?: string };
type Master = { id: string; code?: string; name: string; shortName?: string };
type MasterSet = { suppliers: Master[]; undertakingUnits: Master[]; customers: Master[] };

const tabs: Array<[Tab, string]> = [["reconciliation", "跨月对账台账"], ["mapping", "服务映射"], ["collections", "收款管理"], ["supplier-payments", "供应商付款"]];
const columns: Array<[string, string]> = [
  ["period", "账期"], ["customer", "客户名称"], ["account", "华为ID"], ["cloudReconciler", "华为对账人"],
  ["catalogAmount", "目录价（USD）"], ["partnerAmount", "伙伴结算金额（USD）"], ["voucherCustomerAmount", "代金券-客户（USD）"],
  ["voucherSupplierAmount", "代金券-供应商（USD）"], ["supplierPayableTotalAmount", "供应商应付"], ["customerReceivableTotalAmount", "客户应收"],
  ["collectionTotalAmount", "客户实收"], ["invoiceTotalAmount", "客户开票"], ["theoreticalGrossProfit", "万众理论毛利（USD）"],
  ["settlementGrossProfit", "万众结算毛利（USD）"], ["customerDiscount", "客户折扣"], ["remark", "备注"],
  ["createdAt", "创建日期"], ["updatedAt", "更新日期"], ["confirmedAt", "确认日期"],
];
const mappingColumns: Array<[string, string]> = [["supplierName", "供应商"], ["undertakingUnitName", "承接单位"], ["customerName", "客户"], ["accounts", "账号"], ["reconciler", "对账人"], ["calculationLogic", "计算逻辑"], ["userDiscount", "客户折扣"]];
const paymentColumns: Array<[string, string]> = [
  ["period", "账期"], ["supplierName", "供应商"], ["accountCount", "账号数"],
  ["supplierPayableCurrency", "应付币种"], ["supplierPayableNetAmount", "应付未税金额"], ["supplierPayableExchangeRate", "应付汇率"],
  ["supplierTaxRate", "应付税率"], ["supplierTaxAmount", "应付税金"], ["supplierPayableTotalAmount", "应付含税金额"],
  ["paymentTotalAmount", "供应商实付含税金额"], ["invoiceCurrency", "开票币种"], ["invoiceNetAmount", "开票未税金额"],
  ["invoiceExchangeRate", "开票汇率"], ["invoiceTaxRate", "开票税率"], ["invoiceTaxAmount", "开票税金"], ["invoiceTotalAmount", "开票含税金额"],
  ["paymentDate", "付款日期"],
  ["paid", "付款状态"], ["invoiceStatus", "开票状态"], ["updatedAt", "更新时间"],
];
type QueryState = { sortField: string; sortOrder: TableSortOrder; filters: Record<string, string[]> };
const emptyQuery = (): QueryState => ({ sortField: "", sortOrder: "", filters: {} });

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
  const [masters, setMasters] = useState<MasterSet>({ suppliers: [], undertakingUnits: [], customers: [] });
  const [keyword, setKeyword] = useState("");
  const [period, setPeriod] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [mappingForm, setMappingForm] = useState<Row | null>(null);
  const [rowForm, setRowForm] = useState<Row | null>(null);
  const [collectionForm, setCollectionForm] = useState<Row | null>(null);
  const [invoiceForm, setInvoiceForm] = useState<Row | null>(null);
  const [supplierPaymentForm, setSupplierPaymentForm] = useState<Row | null>(null);
  const [queries, setQueries] = useState<Record<Tab, QueryState>>({
    reconciliation: emptyQuery(), mapping: emptyQuery(), collections: emptyQuery(), "supplier-payments": emptyQuery(),
  });

  const activeQuery = queries[tab];

  async function load(options?: { query?: QueryState; targetTab?: Tab; targetPage?: number }) {
    const targetTab = options?.targetTab ?? tab;
    const targetQuery = options?.query ?? queries[targetTab];
    const targetPage = options?.targetPage ?? page;
    setBusy(true);
    try {
      if (targetTab === "mapping") {
        const params = new URLSearchParams({ keyword, page: String(targetPage) });
        appendQueryParams(params, targetQuery);
        const data = await requestJson<{ items: Row[] }>(`/api/cloud/mappings?${params}`);
        setMappings(data.items);
      } else if (targetTab === "supplier-payments") {
        const params = new URLSearchParams({ keyword, period, page: String(targetPage) });
        appendQueryParams(params, targetQuery);
        const data = await requestJson<{ items: Row[]; total: number }>(`/api/cloud/supplier-payments?${params}`);
        setPayments(data.items); setTotal(data.total);
      } else {
        const params = new URLSearchParams({ keyword, period, page: String(targetPage) });
        appendQueryParams(params, targetQuery);
        const data = await requestJson<{ items: Row[]; total: number }>(`/api/cloud/rows?${params}`);
        setRows(data.items); setTotal(data.total);
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "加载失败"); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, [tab, page, period, queries]);
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

  async function saveRow() {
    if (!rowForm) return;
    try {
      const editing = Boolean(rowForm.id);
      await requestJson(editing ? `/api/cloud/rows/${encodeURIComponent(String(rowForm.id))}` : "/api/cloud/rows", { method: editing ? "PATCH" : "POST", body: JSON.stringify(rowForm) });
      setRowForm(null);
      setNotice(editing ? "华为云对账单已更新" : "华为云对账单已新增");
      await load({ targetTab: "reconciliation", targetPage: 1 });
    } catch (error) { setNotice(error instanceof Error ? error.message : "新增对账单失败"); }
  }

  async function saveCollection() {
    if (!collectionForm?.id) return;
    const patch = Object.fromEntries(Object.entries(collectionForm).filter(([key]) => key.startsWith("collection") || key === "collected"));
    try {
      await requestJson(`/api/cloud/rows/${encodeURIComponent(String(collectionForm.id))}`, { method: "PATCH", body: JSON.stringify(patch) });
      setCollectionForm(null); setNotice("客户实收已保存"); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "客户实收保存失败"); }
  }

  async function saveInvoice() {
    if (!invoiceForm?.id) return;
    const patch = Object.fromEntries(Object.entries(invoiceForm).filter(([key]) => key.startsWith("invoice") || key === "collectionInvoice"));
    try {
      await requestJson(`/api/cloud/rows/${encodeURIComponent(String(invoiceForm.id))}`, { method: "PATCH", body: JSON.stringify(patch) });
      setInvoiceForm(null); setNotice("客户开票信息已保存"); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "客户开票保存失败"); }
  }

  async function updateRow(row: Row, patch: Row) {
    try { await requestJson(`/api/cloud/rows/${encodeURIComponent(String(row.id ?? ""))}`, { method: "PATCH", body: JSON.stringify(patch) }); setNotice("对账明细已更新"); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "保存失败"); }
  }

  async function toggleCollection(row: Row) {
    await updateRow(row, { collected: row.collected ? 0 : 1 });
  }

  async function toggleInvoice(row: Row) {
    await updateRow(row, { collectionInvoice: row.collectionInvoice === "issued" ? "not_issued" : "issued" });
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
      const response = await fetch(`/api/cloud/attachments/invoice/${encodeURIComponent(String(row.id ?? ""))}`, { method: "POST", body: form });
      const data = await response.json(); if (!response.ok) throw new Error(String(data.error ?? "附件上传失败"));
      setNotice(`附件“${file.name}”已关联`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "附件上传失败"); }
  }

  async function saveMapping() {
    if (!mappingForm) return;
    try { await requestJson(mappingForm.id ? `/api/cloud/mappings/${mappingForm.id}` : "/api/cloud/mappings", { method: mappingForm.id ? "PATCH" : "POST", body: JSON.stringify(mappingForm) }); setMappingForm(null); setNotice("服务映射已保存"); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "保存失败"); }
  }

  async function updatePayment(row: Row, patch: Row) {
    try {
      await requestJson(`/api/cloud/supplier-payments/${encodeURIComponent(String(row.id ?? ""))}`, { method: "PATCH", body: JSON.stringify({ period: row.period, supplierId: row.supplierId ?? "", supplierName: row.supplierName, ...patch }) });
      setNotice("供应商付款信息已更新"); await load();
    }
    catch (error) { setNotice(error instanceof Error ? error.message : "付款保存失败"); }
  }

  async function saveSupplierPayment() {
    if (!supplierPaymentForm?.id) return;
    const patch = Object.fromEntries(Object.entries(supplierPaymentForm).filter(([key]) => key.startsWith("payment") || key.startsWith("invoice") || ["payerUnitId", "payerUnitName", "currency", "paid", "invoiceStatus"].includes(key)));
    await updatePayment(supplierPaymentForm, patch);
    setSupplierPaymentForm(null);
  }

  function updateQuery(patch: Partial<QueryState>) {
    setQueries((current) => ({ ...current, [tab]: { ...current[tab], ...patch } }));
    setPage(1);
  }

  function columnOptions(endpoint: string, field: string, optionKeyword: string) {
    const extra: Record<string, string> = tab === "mapping" ? {} : { period };
    return fetchTableFilterOptions(endpoint, field, optionKeyword, extra, activeQuery.filters);
  }

  function amountFormDefaults(row: Row, prefix: "collection" | "invoice") {
    const payerName = prefix === "collection" ? row.collectionPayer : row.invoicePayer;
    const payeeName = prefix === "collection" ? row.collectionPayee : row.invoicePayee;
    return {
      ...row,
      [`${prefix}PayerCustomerId`]: row[`${prefix}PayerCustomerId`] ?? row.customerId ?? "",
      [`${prefix}PayeeUndertakingUnitId`]: row[`${prefix}PayeeUndertakingUnitId`] ?? row.undertakingUnitId ?? "",
      [`${prefix}PayerCustomerName`]: row[`${prefix}PayerCustomerName`] ?? payerName ?? row.customerReceivablePayer ?? row.customer ?? "",
      [`${prefix}PayeeUndertakingUnitName`]: row[`${prefix}PayeeUndertakingUnitName`] ?? payeeName ?? row.customerReceivablePayee ?? "承接单位",
      ...(prefix === "collection" ? { collectionPayer: payerName ?? row.customerReceivablePayer ?? row.customer ?? "", collectionPayee: payeeName ?? row.customerReceivablePayee ?? "承接单位" } : { invoicePayer: payerName ?? row.customerReceivablePayer ?? row.customer ?? "", invoicePayee: payeeName ?? row.customerReceivablePayee ?? "承接单位" }),
    };
  }

  return <div className="space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><Cloud size={22} className="text-[#1890ff]" /><h1 className="text-2xl font-medium text-[#303133]">华为云业务</h1></div><p className="mt-2 text-sm text-[#909399]">月度账单、服务映射、跨月收款和供应商付款</p></div>
      <div className="flex flex-wrap gap-2">{tab === "reconciliation" ? <Button tone="primary" onClick={() => setRowForm({ period: period || new Date().toISOString().slice(0, 7), batchCode: "", customer: "", account: "", cloudReconciler: "", catalogAmount: "", partnerAmount: "", voucherCustomerAmount: "", voucherSupplierAmount: "", supplierPayablePayer: "", supplierPayablePayee: "", supplierPayableNetAmount: "", supplierTaxRate: "0.16", supplierTaxAmount: "", supplierPayableTotalAmount: "", customerReceivablePayer: "", customerReceivablePayee: "", customerReceivableNetAmount: "", customerTaxRate: "", customerReceivableTaxAmount: "", customerReceivableTotalAmount: "", theoreticalGrossProfit: "", settlementGrossProfit: "", customerDiscount: "", remark: "" })}><Plus size={15} />手动新增</Button> : null}<label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded border border-[#dcdfe6] bg-white px-3 text-sm text-[#606266]"><FileUp size={15} />导入账单<input className="hidden" type="file" accept=".xlsx,.xls" onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} /></label><a href="/api/cloud/template"><Button type="button"><Download size={15} />下载导入模板</Button></a>{importFile ? <Button tone="primary" disabled={busy} onClick={() => void importWorkbook()}>确认导入</Button> : null}<Button onClick={() => window.open(`/api/cloud/rows/export?keyword=${encodeURIComponent(keyword)}&period=${encodeURIComponent(period)}`, "_blank")}><Download size={15} />导出数据</Button></div>
    </header>
    {notice ? <div className="flex items-center justify-between border border-[#b3d8ff] bg-[#ecf5ff] px-3 py-2 text-sm text-[#1890ff]">{notice}<button type="button" title="关闭提示" onClick={() => setNotice("")}><X size={15} /></button></div> : null}
    <Panel>
      <div className="flex flex-wrap items-center gap-2 border-b border-[#ebeef5] p-3">{tabs.map(([key, label]) => <button className={`border-b-2 px-3 py-2 text-sm ${tab === key ? "border-[#1890ff] text-[#1890ff]" : "border-transparent text-[#606266]"}`} key={key} type="button" onClick={() => { setTab(key); setPage(1); }}>{label}</button>)}<div className="ml-auto flex flex-wrap gap-2"><Input placeholder="搜索客户、账号、批次或供应商" value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setPage(1); void load({ targetPage: 1 }); } }} /><Input className="min-w-[130px]" placeholder="账期 YYYY-MM" value={period} onChange={(event) => setPeriod(event.target.value)} /><Button onClick={() => { setPage(1); void load({ targetPage: 1 }); }}><Search size={15} />查询</Button></div></div>
      {tab === "mapping" ? <MappingTable rows={mappings} onEdit={setMappingForm} onAdd={() => setMappingForm({ accounts: "", calculationLogic: "catalog" })} query={activeQuery} onQueryChange={updateQuery} loadOptions={(field, optionKeyword) => columnOptions("/api/cloud/mappings", field, optionKeyword)} /> : tab === "supplier-payments" ? <PaymentTable rows={payments} onUpdate={(row) => setSupplierPaymentForm(row)} onTogglePaid={(row) => void updatePayment(row, { paid: row.paid ? 0 : 1 })} onToggleInvoice={(row) => void updatePayment(row, { invoiceStatus: row.invoiceStatus === "issued" ? "not_issued" : "issued" })} query={activeQuery} onQueryChange={updateQuery} loadOptions={(field, optionKeyword) => columnOptions("/api/cloud/supplier-payments", field, optionKeyword)} /> : <RowTable rows={rows} onAttach={attachRow} onConfirm={confirmRow} onDelete={deleteRow} onToggleCollection={toggleCollection} onToggleInvoice={toggleInvoice} onEditRow={setRowForm} onEditCollection={(row) => setCollectionForm(amountFormDefaults(row, "collection"))} onEditInvoice={(row) => setInvoiceForm(amountFormDefaults(row, "invoice"))} query={activeQuery} onQueryChange={updateQuery} loadOptions={(field, optionKeyword) => columnOptions("/api/cloud/rows", field, optionKeyword)} />}
      {tab !== "mapping" ? <div className="flex items-center justify-between border-t border-[#ebeef5] px-4 py-3 text-sm text-[#909399]"><span>{busy ? "加载中..." : `共 ${total} 条`}</span><div className="flex gap-2"><Button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</Button><span className="px-2 py-2">第 {page} 页</span><Button disabled={rows.length < 20 && payments.length < 20} onClick={() => setPage((value) => value + 1)}>下一页</Button></div></div> : null}
    </Panel>
    {mappingForm ? <MappingForm value={mappingForm} masters={masters} onChange={setMappingForm} onCancel={() => setMappingForm(null)} onSave={() => void saveMapping()} /> : null}
    {rowForm ? <CloudRowForm value={rowForm} onChange={setRowForm} onCancel={() => setRowForm(null)} onSave={() => void saveRow()} /> : null}
    {collectionForm ? <CloudAmountForm mode="collection" value={collectionForm} masters={masters} onChange={setCollectionForm} onCancel={() => setCollectionForm(null)} onSave={() => void saveCollection()} /> : null}
    {invoiceForm ? <CloudAmountForm mode="invoice" value={invoiceForm} masters={masters} onChange={setInvoiceForm} onCancel={() => setInvoiceForm(null)} onSave={() => void saveInvoice()} /> : null}
    {supplierPaymentForm ? <SupplierPaymentForm value={supplierPaymentForm} masters={masters} onChange={setSupplierPaymentForm} onCancel={() => setSupplierPaymentForm(null)} onSave={() => void saveSupplierPayment()} /> : null}
  </div>;
}

function appendQueryParams(params: URLSearchParams, query: QueryState) {
  if (query.sortField && query.sortOrder) { params.set("sortField", query.sortField); params.set("sortOrder", query.sortOrder); }
  for (const [field, values] of Object.entries(query.filters)) for (const value of values) params.append(`filter.${field}`, value);
}

function HeaderMenu({ field, label, query, onQueryChange, loadOptions }: { field: string; label: string; query: QueryState; onQueryChange: (patch: Partial<QueryState>) => void; loadOptions: (field: string, keyword: string) => Promise<TableFilterOption[]> }) {
  return <TableColumnMenu column={{ key: field, label, sortable: true, filterable: true }} sortOrder={query.sortField === field ? query.sortOrder : ""} filterValues={query.filters[field] ?? []} loadOptions={(keyword) => loadOptions(field, keyword)} onSort={(order) => onQueryChange({ sortField: order ? field : "", sortOrder: order })} onFilter={(values) => onQueryChange({ filters: { ...query.filters, [field]: values } })} />;
}

function money(value: unknown, currency = "USD") {
  if (value === null || value === undefined || value === "") return "-";
  const parsed = Number(value);
  return `${currency ? `${currency} ` : ""}${Number.isFinite(parsed) ? parsed.toLocaleString("en-US", { maximumFractionDigits: 4 }) : String(value)}`;
}

function dateTimeText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value).replace("T", " ").slice(0, 19);
}

function periodText(value: unknown) {
  const raw = String(value ?? "");
  if (/^\d{6}$/.test(raw)) return `${raw.slice(0, 4)}年${Number(raw.slice(4))}月`;
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw.slice(0, 4)}年${Number(raw.slice(5))}月`;
  return display(value);
}

function rateText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  return `税率 ${(parsed <= 1 ? parsed * 100 : parsed).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;
}

function flow(row: Row, payerKey: string, payeeKey: string, payerFallback: string, payeeFallback: string) {
  const payer = display(row[payerKey]) === "-" ? payerFallback : display(row[payerKey]);
  const payee = display(row[payeeKey]) === "-" ? payeeFallback : display(row[payeeKey]);
  return `${payer} → ${payee}`;
}

function CloudAmountCell({ row, payerKey, payeeKey, payerFallback, payeeFallback, currencyKey, netKey, taxRateKey, taxKey, totalKey, exchangeRateKey, parties, action }: { row: Row; payerKey: string; payeeKey: string; payerFallback: string; payeeFallback: string; currencyKey: string; netKey: string; taxRateKey: string; taxKey: string; totalKey: string; exchangeRateKey?: string; parties?: Array<[string, string]>; action?: React.ReactNode }) {
  return <div className="min-w-[210px] space-y-0.5 py-1 text-xs leading-5"><div className="truncate text-[#909399]" title={flow(row, payerKey, payeeKey, payerFallback, payeeFallback)}>{flow(row, payerKey, payeeKey, payerFallback, payeeFallback)}</div>{parties?.map(([label, key]) => row[key] ? <div className="truncate text-[#909399]" key={key}>{label}：{String(row[key])}</div> : null)}<div className="font-medium text-[#303133]">{money(row[currencyKey] || "USD", "")}</div>{exchangeRateKey && row[exchangeRateKey] ? <div className="text-[#909399]">汇率 <span className="text-[#606266]">{display(row[exchangeRateKey])}</span></div> : null}<div className="text-[#909399]">未税 <span className="text-[#606266]">{money(row[netKey], "")}</span></div><div className="text-[#909399]">{rateText(row[taxRateKey])}</div><div className="text-[#909399]">税金 <span className="text-[#606266]">{money(row[taxKey], "")}</span></div><div className="text-[#606266]">含税 <span className="font-medium text-[#303133]">{money(row[totalKey], "")}</span></div>{action ? <div className="mt-1 flex items-center gap-1 border-t border-[#f0f2f5] pt-1">{action}</div> : null}</div>;
}

function RowTable({ rows, onAttach, onConfirm, onDelete, onToggleCollection, onToggleInvoice, onEditRow, onEditCollection, onEditInvoice, query, onQueryChange, loadOptions }: { rows: Row[]; onAttach: (row: Row, file: File) => void; onConfirm: (row: Row) => void; onDelete: (row: Row) => void; onToggleCollection: (row: Row) => void; onToggleInvoice: (row: Row) => void; onEditRow: (row: Row) => void; onEditCollection: (row: Row) => void; onEditInvoice: (row: Row) => void; query: QueryState; onQueryChange: (patch: Partial<QueryState>) => void; loadOptions: (field: string, keyword: string) => Promise<TableFilterOption[]> }) {
  function cell(row: Row, key: string) {
    const supplierNet = row.supplierPayableNetAmount ?? row.supplierPayable;
    const supplierTaxRate = row.supplierTaxRate;
    const supplierTax = row.supplierTaxAmount ?? (supplierNet !== null && supplierNet !== undefined && supplierTaxRate !== null && supplierTaxRate !== undefined ? Number(supplierNet) * Number(supplierTaxRate) : null);
    const customerNet = row.customerReceivableNetAmount ?? row.customerReceivable;
    const customerTaxRate = row.customerTaxRate;
    const customerTax = row.customerReceivableTaxAmount ?? (customerNet !== null && customerNet !== undefined && customerTaxRate !== null && customerTaxRate !== undefined ? Number(customerNet) * Number(customerTaxRate) : null);
    const cellRow: Row = {
      ...row,
      supplierPayableNetAmount: supplierNet,
      supplierTaxAmount: supplierTax,
      supplierPayableTotalAmount: row.supplierPayableTotalAmount ?? (supplierNet !== null && supplierNet !== undefined && supplierTax !== null ? Number(supplierNet) + Number(supplierTax) : null),
      customerReceivableNetAmount: customerNet,
      customerReceivableTaxAmount: customerTax,
      customerReceivableTotalAmount: row.customerReceivableTotalAmount ?? (customerNet !== null && customerNet !== undefined && customerTax !== null ? Number(customerNet) + Number(customerTax) : null),
      theoreticalGrossProfit: row.theoreticalGrossProfit ?? row.grossProfit,
      settlementGrossProfit: row.settlementGrossProfit ?? row.grossProfit,
    };
    if (key === "supplierPayableTotalAmount") return <CloudAmountCell row={cellRow} payerKey="supplierPayablePayer" payeeKey="supplierPayablePayee" payerFallback="承接单位" payeeFallback="供应商" currencyKey="supplierCurrency" netKey="supplierPayableNetAmount" taxRateKey="supplierTaxRate" taxKey="supplierTaxAmount" totalKey="supplierPayableTotalAmount" />;
    if (key === "customerReceivableTotalAmount") return <CloudAmountCell row={cellRow} payerKey="customerReceivablePayer" payeeKey="customerReceivablePayee" payerFallback={display(row.customer) === "-" ? "客户" : display(row.customer)} payeeFallback="承接单位" currencyKey="customerCurrency" netKey="customerReceivableNetAmount" taxRateKey="customerTaxRate" taxKey="customerReceivableTaxAmount" totalKey="customerReceivableTotalAmount" />;
    if (key === "collectionTotalAmount") return <CloudAmountCell row={cellRow} payerKey="collectionPayer" payeeKey="collectionPayee" payerFallback={display(row.customer) === "-" ? "客户" : display(row.customer)} payeeFallback="承接单位" currencyKey="collectionCurrency" exchangeRateKey="collectionExchangeRate" netKey="collectionNetAmount" taxRateKey="collectionTaxRate" taxKey="collectionTaxAmount" totalKey="collectionTotalAmount" action={<><button aria-checked={Boolean(row.collected)} aria-label={`客户实收状态：${row.collected ? "已收款" : "未收款"}`} className="inline-flex h-6 items-center gap-1 rounded text-xs text-[#606266] disabled:cursor-not-allowed disabled:opacity-50" disabled={Boolean(row.confirmed)} role="switch" title={`点击切换为${row.collected ? "未收款" : "已收款"}`} type="button" onClick={() => onToggleCollection(row)}><span className={`relative inline-flex h-4 w-7 rounded-full ${row.collected ? "bg-[#13ce66]" : "bg-[#c0c4cc]"}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow ${row.collected ? "translate-x-[15px]" : "translate-x-0.5"}`} /></span><span>{row.collected ? "已收款" : "未收款"}</span></button>{!row.confirmed ? <button aria-label="编辑客户实收" className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded text-[#909399] hover:bg-[#f5f7fa] hover:text-[#1890ff]" title="编辑客户实收" type="button" onClick={() => onEditCollection(row)}><Pencil size={13} /></button> : null}</>} />;
    if (key === "invoiceTotalAmount") return <CloudAmountCell row={cellRow} payerKey="invoicePayer" payeeKey="invoicePayee" payerFallback={display(row.customer) === "-" ? "客户" : display(row.customer)} payeeFallback="承接单位" currencyKey="invoiceCurrency" exchangeRateKey="invoiceExchangeRate" netKey="invoiceNetAmount" taxRateKey="invoiceTaxRate" taxKey="invoiceTaxAmount" totalKey="invoiceTotalAmount" action={<><button aria-checked={row.collectionInvoice === "issued"} aria-label={`客户开票状态：${row.collectionInvoice === "issued" ? "已开票" : "未开票"}`} className="inline-flex h-6 items-center gap-1 rounded text-xs text-[#606266] disabled:cursor-not-allowed disabled:opacity-50" disabled={Boolean(row.confirmed)} role="switch" title={`点击切换为${row.collectionInvoice === "issued" ? "未开票" : "已开票"}`} type="button" onClick={() => onToggleInvoice(row)}><span className={`relative inline-flex h-4 w-7 rounded-full ${row.collectionInvoice === "issued" ? "bg-[#13ce66]" : "bg-[#c0c4cc]"}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow ${row.collectionInvoice === "issued" ? "translate-x-[15px]" : "translate-x-0.5"}`} /></span><span>{row.collectionInvoice === "issued" ? "已开票" : "未开票"}</span></button>{!row.confirmed ? <button aria-label="编辑客户开票" className="inline-flex h-6 w-6 items-center justify-center rounded text-[#909399] hover:bg-[#f5f7fa] hover:text-[#1890ff]" title="编辑客户开票" type="button" onClick={() => onEditInvoice(row)}><Pencil size={13} /></button> : null}<label aria-label="上传客户发票附件" className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#909399] hover:bg-[#f5f7fa] hover:text-[#1890ff]" title="上传客户发票附件"><FileUp size={13} /><input className="hidden" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) onAttach(row, file); event.target.value = ""; }} /></label></>} />;
    if (key === "createdAt" || key === "updatedAt" || key === "confirmedAt") return dateTimeText(cellRow[key]);
    if (key === "catalogAmount" || key === "partnerAmount" || key === "voucherCustomerAmount" || key === "voucherSupplierAmount" || key === "theoreticalGrossProfit" || key === "settlementGrossProfit") return money(cellRow[key]);
    return display(cellRow[key]);
  }
  return <StickyTable className="max-h-[calc(100vh-270px)] overflow-auto" tableKey="cloud-rows"><table className="w-full min-w-[3300px] border-collapse text-sm"><thead className="sticky top-0 z-10 bg-[#f5f7fa]"><tr>{columns.map(([field, label]) => <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={field}><HeaderMenu field={field} label={label} query={query} onQueryChange={onQueryChange} loadOptions={loadOptions} /></th>)}<th className="border-b border-[#ebeef5] px-3 py-3 text-left">操作</th></tr></thead><tbody>{rows.map((row) => <tr className="hover:bg-[#fafafa]" key={String(row.id)}>{columns.map(([key]) => <td className="border-b border-r border-[#ebeef5] px-3 py-3 align-top" key={key}>{cell(row, key)}</td>)}<td className="border-b border-[#ebeef5] px-3 py-2 align-top"><div className="flex items-center gap-1"><button aria-label="修改华为云对账单" className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#dcdfe6] bg-white text-[#606266] hover:border-[#1890ff] hover:text-[#1890ff] disabled:cursor-not-allowed disabled:opacity-50" disabled={Boolean(row.confirmed)} title="修改华为云对账单" type="button" onClick={() => onEditRow(row)}><Pencil size={14} /></button><button aria-label={row.confirmed ? "取消确认" : "确认"} className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#dcdfe6] bg-white text-[#13ce66] hover:border-[#13ce66] disabled:cursor-not-allowed disabled:opacity-50" title={row.confirmed ? "取消确认" : "确认"} type="button" onClick={() => onConfirm(row)}><Check size={14} /></button><button aria-label="删除华为云对账单" className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#fbc4c4] bg-white text-[#f56c6c] hover:bg-[#fff0f0]" title="删除华为云对账单" type="button" onClick={() => onDelete(row)}><Trash2 size={14} /></button></div></td></tr>)}{!rows.length ? <tr><td className="py-12 text-center text-[#909399]" colSpan={columns.length + 1}>暂无数据</td></tr> : null}</tbody></table></StickyTable>;
}

function MappingTable({ rows, onEdit, onAdd, query, onQueryChange, loadOptions }: { rows: Row[]; onEdit: (row: Row) => void; onAdd: () => void; query: QueryState; onQueryChange: (patch: Partial<QueryState>) => void; loadOptions: (field: string, keyword: string) => Promise<TableFilterOption[]> }) {
  return <div><div className="flex justify-end p-3"><Button tone="primary" onClick={onAdd}><Plus size={15} />新增服务映射</Button></div><StickyTable className="max-h-[calc(100vh-320px)] overflow-auto" tableKey="cloud-mappings"><table className="w-full min-w-[1100px] border-collapse text-sm"><thead className="bg-[#f5f7fa]"><tr>{mappingColumns.map(([field, label]) => <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={field}><HeaderMenu field={field} label={label} query={query} onQueryChange={onQueryChange} loadOptions={loadOptions} /></th>)}<th className="border-b border-[#ebeef5] px-3 py-3 text-left font-medium">操作</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{mappingColumns.map(([field]) => <td className="border-b border-r border-[#ebeef5] px-3 py-3" key={field}>{display(row[field])}</td>)}<td className="border-b border-[#ebeef5] px-3 py-3"><Button onClick={() => onEdit(row)}><Pencil size={14} />修改</Button></td></tr>)}{!rows.length ? <tr><td className="py-12 text-center text-[#909399]" colSpan={mappingColumns.length + 1}>暂无映射</td></tr> : null}</tbody></table></StickyTable></div>;
}

function PaymentTable({ rows, onUpdate, onTogglePaid, onToggleInvoice, query, onQueryChange, loadOptions }: { rows: Row[]; onUpdate: (row: Row) => void; onTogglePaid: (row: Row) => void; onToggleInvoice: (row: Row) => void; query: QueryState; onQueryChange: (patch: Partial<QueryState>) => void; loadOptions: (field: string, keyword: string) => Promise<TableFilterOption[]> }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  function cell(row: Row, key: string) {
    if (key === "period") {
      const id = String(row.id);
      return <div className="flex items-center gap-2"><button aria-label={expanded[id] ? "收起账号明细" : "展开账号明细"} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#dcdfe6] bg-white text-[#606266] hover:border-[#1890ff] hover:text-[#1890ff]" title={expanded[id] ? "收起账号明细" : "展开账号明细"} type="button" onClick={() => setExpanded((current) => ({ ...current, [id]: !current[id] }))}>{expanded[id] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button><span>{periodText(row[key])}</span></div>;
    }
    if (key === "supplierPayableCurrency") return display(row[key] || "USD");
    if (["supplierPayableNetAmount", "supplierTaxAmount", "supplierPayableTotalAmount"].includes(key)) return money(row[key], "");
    if (key === "supplierPayableExchangeRate") return display(row[key]);
    if (key === "supplierTaxRate" || key === "invoiceTaxRate") return rateText(row[key]);
    if (key === "paymentTotalAmount") return money(row[key], String(row.currency || "USD"));
    if (["invoiceNetAmount", "invoiceTaxAmount", "invoiceTotalAmount"].includes(key)) return money(row[key], "");
    if (key === "invoiceCurrency") return display(row[key]);
    if (key === "invoiceExchangeRate") return display(row[key]);
    if (key === "paid") return <button aria-checked={Boolean(row.paid)} className={`rounded border px-3 py-1 text-xs ${row.paid ? "border-[#b3e19d] bg-[#f0f9eb] text-[#67c23a]" : "border-[#dcdfe6] bg-white text-[#909399]"}`} role="switch" title="点击切换付款状态" type="button" onClick={() => onTogglePaid(row)}>{row.paid ? "已付款" : "未付款"}</button>;
    if (key === "invoiceStatus") return <button aria-checked={row.invoiceStatus === "issued"} className={`rounded border px-3 py-1 text-xs ${row.invoiceStatus === "issued" ? "border-[#b3e19d] bg-[#f0f9eb] text-[#67c23a]" : "border-[#f5dab1] bg-[#fdf6ec] text-[#e6a23c]"}`} role="switch" title="点击切换开票状态" type="button" onClick={() => onToggleInvoice(row)}>{row.invoiceStatus === "issued" ? "已开票" : "未开票"}</button>;
    if (key === "paymentDate" || key === "updatedAt") return dateTimeText(row[key]);
    return display(row[key]);
  }
  return <StickyTable className="max-h-[calc(100vh-270px)] overflow-auto" tableKey="cloud-payments"><table className="w-full min-w-[1800px] border-collapse text-sm"><thead className="bg-[#f5f7fa]"><tr>{paymentColumns.map(([field, label]) => <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={field}><HeaderMenu field={field} label={label} query={query} onQueryChange={onQueryChange} loadOptions={loadOptions} /></th>)}<th className="border-b border-[#ebeef5] px-3 py-3 text-left font-medium">操作</th></tr></thead><tbody>{rows.map((row) => { const children = Array.isArray(row.children) ? row.children as Row[] : []; return <Fragment key={String(row.id)}><tr className="hover:bg-[#fafafa]">{paymentColumns.map(([key]) => <td className="border-b border-r border-[#ebeef5] px-3 py-3 align-top" key={key}>{cell(row, key)}</td>)}<td className="border-b border-[#ebeef5] px-3 py-2 align-top"><button aria-label="编辑供应商实付和开票" className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#dcdfe6] bg-white text-[#606266] hover:border-[#1890ff] hover:text-[#1890ff]" title="编辑供应商实付和开票" type="button" onClick={() => onUpdate(row)}><Pencil size={14} /></button></td></tr>{expanded[String(row.id)] ? <tr><td className="border-b border-[#ebeef5] bg-[#fafafa] px-10 py-3" colSpan={paymentColumns.length + 1}><table className="w-full min-w-[1000px] border-collapse text-sm"><thead><tr>{["客户", "华为云账号", "供应商应付未税（USD）", "税金（USD）", "供应商应付含税（USD）", "创建时间", "更新时间"].map((label) => <th className="border-b border-[#ebeef5] px-3 py-2 text-left font-medium text-[#606266]" key={label}>{label}</th>)}</tr></thead><tbody>{children.map((child) => <tr key={String(child.id)}><td className="border-b border-[#ebeef5] px-3 py-2">{display(child.customer)}</td><td className="border-b border-[#ebeef5] px-3 py-2 text-[#606266]">{display(child.account)}</td><td className="border-b border-[#ebeef5] px-3 py-2">{money(child.supplierPayableNetAmount)}</td><td className="border-b border-[#ebeef5] px-3 py-2">{money(child.supplierTaxAmount)}</td><td className="border-b border-[#ebeef5] px-3 py-2">{money(child.supplierPayableTotalAmount)}</td><td className="border-b border-[#ebeef5] px-3 py-2">{dateTimeText(child.createdAt)}</td><td className="border-b border-[#ebeef5] px-3 py-2">{dateTimeText(child.updatedAt)}</td></tr>)}</tbody></table></td></tr> : null}</Fragment>; })}{!rows.length ? <tr><td className="py-12 text-center text-[#909399]" colSpan={paymentColumns.length + 1}>暂无供应商付款</td></tr> : null}</tbody></table></StickyTable>;
}

function CloudRowForm({ value, onChange, onCancel, onSave }: { value: Row; onChange: (value: Row) => void; onCancel: () => void; onSave: () => void }) {
  const fields: Array<[string, string, string?]> = [
    ["period", "账期", "month"], ["batchCode", "批次号"], ["customer", "客户名称"], ["account", "华为ID"], ["cloudReconciler", "华为对账人"],
    ["catalogAmount", "目录价（USD）", "number"], ["partnerAmount", "伙伴结算金额（USD）", "number"], ["voucherCustomerAmount", "代金券-客户（USD）", "number"],
    ["voucherSupplierAmount", "代金券-供应商（USD）", "number"], ["supplierPayablePayer", "供应商应付-承接单位"], ["supplierPayablePayee", "供应商应付-供应商"],
    ["supplierPayableNetAmount", "供应商应付（不含税）", "number"], ["supplierTaxRate", "供应商税率", "number"], ["supplierTaxAmount", "供应商税金", "number"],
    ["supplierPayableTotalAmount", "供应商应付（含税）", "number"], ["customerReceivablePayer", "客户应收-客户"], ["customerReceivablePayee", "客户应收-承接单位"],
    ["customerReceivableNetAmount", "客户应收（不含税）", "number"], ["customerTaxRate", "客户承担税率", "number"], ["customerReceivableTaxAmount", "客户税金", "number"],
    ["customerReceivableTotalAmount", "客户应收（含税）", "number"], ["theoreticalGrossProfit", "万众理论毛利（USD）", "number"], ["settlementGrossProfit", "万众结算毛利（USD）", "number"],
    ["customerDiscount", "客户折扣", "number"], ["calculationLogic", "计算逻辑"],
  ];
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="max-h-[90vh] w-full max-w-4xl overflow-auto bg-white p-5 shadow-xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg text-[#303133]">{value.id ? "修改" : "手动新增"}华为云对账单</h2><button type="button" title="关闭" onClick={onCancel}><X size={17} /></button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fields.map(([key, label, type]) => <label className="space-y-1 text-sm text-[#606266]" key={key}><span>{label}{key === "period" || key === "customer" || key === "account" ? <b className="ml-1 text-[#f56c6c]">*</b> : null}</span><Input autoFocus={key === "customer" && !value.id} className="w-full" type={type ?? "text"} value={String(value[key] ?? "")} onChange={(event) => onChange({ ...value, [key]: event.target.value })} /></label>)}<label className="space-y-1 text-sm text-[#606266] sm:col-span-2 lg:col-span-3"><span>备注</span><textarea className="min-h-20 w-full rounded border border-[#dcdfe6] px-3 py-2 text-sm outline-none focus:border-[#1890ff]" value={String(value.remark ?? "")} onChange={(event) => onChange({ ...value, remark: event.target.value })} /></label></div><div className="mt-5 flex justify-end gap-2"><Button onClick={onCancel}>取消</Button><Button tone="primary" onClick={onSave}>保存</Button></div></div></div>;
}

function numericValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numericRate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw.endsWith("%") ? raw.slice(0, -1) : raw);
  if (!Number.isFinite(parsed)) return null;
  if (raw.endsWith("%")) return parsed / 100;
  return parsed > 1 ? parsed / 100 : parsed;
}

function SupplierPaymentForm({ value, masters, onChange, onCancel, onSave }: { value: Row; masters: MasterSet; onChange: (value: Row) => void; onCancel: () => void; onSave: () => void }) {
  const paymentFields: Array<[string, string, string?]> = [
    ["currency", "实付币种"], ["paymentExchangeRate", "实付汇率", "number"], ["paymentNetAmount", "实付未税金额", "number"],
    ["paymentTaxRate", "实付税率", "number"], ["paymentTaxAmount", "实付税金", "number"], ["paymentTotalAmount", "实付含税金额", "number"], ["paymentDate", "实付日期", "date"],
  ];
  const invoiceFields: Array<[string, string, string?]> = [
    ["invoiceNo", "发票号"], ["invoiceCurrency", "发票币种"], ["invoiceExchangeRate", "发票汇率", "number"], ["invoiceNetAmount", "发票未税金额", "number"],
    ["invoiceTaxRate", "发票税率", "number"], ["invoiceTaxAmount", "发票税金", "number"], ["invoiceTotalAmount", "发票含税金额", "number"], ["invoiceDate", "开票日期", "date"],
  ];
  const changeField = (key: string, type: string | undefined, input: string) => {
    if (type === "number" && ["payment", "invoice"].some((prefix) => key.startsWith(prefix)) && ["NetAmount", "TaxRate", "TaxAmount", "TotalAmount"].some((suffix) => key.endsWith(suffix))) {
      const prefix = key.startsWith("payment") ? "payment" : "invoice";
      return updateCloudTaxValue(value, prefix, key.endsWith("NetAmount") ? "net" : key.endsWith("TaxAmount") ? "tax" : key.endsWith("TotalAmount") ? "total" : "rate", input);
    }
    return { ...value, [key]: input };
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="max-h-[90vh] w-full max-w-4xl overflow-auto bg-white p-5 shadow-xl"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg text-[#303133]">编辑供应商实付和开票</h2><p className="mt-1 text-xs text-[#909399]">供应商付款按账期和供应商汇总，明细账号只展示供应商应付金额</p></div><button type="button" title="关闭" onClick={onCancel}><X size={17} /></button></div><div className="grid gap-3 border-b border-[#ebeef5] pb-4 sm:grid-cols-2"><PartnerSelect kind="undertakingUnits" label="付款单位" idValue={value.payerUnitId} nameValue={value.payerUnitName} masters={masters} onChange={(selected) => onChange({ ...value, payerUnitId: selected.id, payerUnitName: selected.name })} /></div><section className="mt-4"><h3 className="mb-3 text-sm font-medium text-[#303133]">供应商实付</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{paymentFields.map(([key, label, type]) => <label className="space-y-1 text-sm text-[#606266]" key={key}><span>{label}</span><Input className="w-full" type={type ?? "text"} value={String(value[key] ?? "")} onChange={(event) => onChange(changeField(key, type, event.target.value))} /></label>)}</div><label className="mt-3 flex items-center gap-2 text-sm text-[#606266]"><input checked={Boolean(value.paid)} type="checkbox" onChange={(event) => onChange({ ...value, paid: event.target.checked ? 1 : 0 })} />已付款</label></section><section className="mt-5 border-t border-[#ebeef5] pt-4"><h3 className="mb-3 text-sm font-medium text-[#303133]">供应商开票</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{invoiceFields.map(([key, label, type]) => <label className="space-y-1 text-sm text-[#606266]" key={key}><span>{label}</span><Input className="w-full" type={type ?? "text"} value={String(value[key] ?? "")} onChange={(event) => onChange(changeField(key, type, event.target.value))} /></label>)}</div><label className="mt-3 flex items-center gap-2 text-sm text-[#606266]"><input checked={value.invoiceStatus === "issued"} type="checkbox" onChange={(event) => onChange({ ...value, invoiceStatus: event.target.checked ? "issued" : "not_issued" })} />已开票</label></section><div className="mt-5 flex justify-end gap-2"><Button onClick={onCancel}>取消</Button><Button tone="primary" onClick={onSave}>保存</Button></div></div></div>;
}

function updateCloudTaxValue(value: Row, prefix: "collection" | "invoice" | "payment", field: "net" | "tax" | "total" | "rate", input: string) {
  const next = { ...value };
  const netKey = `${prefix}NetAmount`;
  const taxKey = `${prefix}TaxAmount`;
  const totalKey = `${prefix}TotalAmount`;
  const rateKey = `${prefix}TaxRate`;
  next[field === "net" ? netKey : field === "tax" ? taxKey : field === "total" ? totalKey : rateKey] = input;
  const taxRate = numericRate(next[rateKey]);
  if (taxRate !== null) {
    if (field === "net" || field === "rate") {
      const net = numericValue(next[netKey]);
      if (net !== null) { next[taxKey] = String(net * taxRate); next[totalKey] = String(net * (1 + taxRate)); }
    } else if (field === "total") {
      const total = numericValue(next[totalKey]);
      if (total !== null) { next[netKey] = String(total / (1 + taxRate)); next[taxKey] = String(total - total / (1 + taxRate)); }
    }
  }
  return next;
}

function PartnerSelect({ kind, label, idValue, nameValue, masters, onChange }: { kind: keyof MasterSet; label: string; idValue: unknown; nameValue: unknown; masters: MasterSet; onChange: (value: { id: string; name: string }) => void }) {
  const [keyword, setKeyword] = useState("");
  const [options, setOptions] = useState<Master[]>(masters[kind]);
  useEffect(() => setOptions(masters[kind]), [kind, masters]);
  useEffect(() => {
    if (!keyword.trim()) return;
    const timer = window.setTimeout(() => {
      void requestJson<MasterSet>(`/api/cloud/master-data?keyword=${encodeURIComponent(keyword.trim())}`).then((data) => setOptions(data[kind])).catch(() => undefined);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [keyword, kind]);
  const selectedId = String(idValue ?? "");
  const selectedName = String(nameValue ?? "");
  return <label className="space-y-1 text-sm text-[#606266]"><span>{label}</span><Input className="w-full" placeholder="输入编码或简称搜索" value={keyword} onChange={(event) => setKeyword(event.target.value)} /><select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-2" value={selectedId} onChange={(event) => { const selected = options.find((item) => item.id === event.target.value); onChange({ id: event.target.value, name: selected?.shortName || selected?.name || "" }); }}><option value="">{selectedName || "请选择"}</option>{options.map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} - ` : ""}{item.shortName || item.name}</option>)}</select>{selectedName ? <span className="block truncate text-xs text-[#909399]">当前：{selectedName}</span> : null}</label>;
}

function CloudAmountForm({ mode, value, masters, onChange, onCancel, onSave }: { mode: "collection" | "invoice"; value: Row; masters: MasterSet; onChange: (value: Row) => void; onCancel: () => void; onSave: () => void }) {
  const invoice = mode === "invoice";
  const prefix = invoice ? "invoice" : "collection";
  const fields: Array<[string, string, string?]> = invoice
    ? [["invoiceNo", "发票号"], ["invoiceCurrency", "发票币种"], ["invoiceExchangeRate", "汇率", "number"], ["invoiceNetAmount", "未税金额", "number"], ["invoiceTaxRate", "税率", "number"], ["invoiceTaxAmount", "税金", "number"], ["invoiceTotalAmount", "含税金额", "number"], ["invoiceDate", "开票日期", "date"]]
    : [["collectionCurrency", "币种"], ["collectionExchangeRate", "汇率", "number"], ["collectionNetAmount", "未税金额", "number"], ["collectionTaxRate", "税率", "number"], ["collectionTaxAmount", "税金", "number"], ["collectionTotalAmount", "含税金额", "number"], ["collectionDate", "收款日期", "date"]];
  const partner = (kind: "customers" | "undertakingUnits", label: string, idKey: string, nameKey: string) => <PartnerSelect kind={kind} label={label} idValue={value[idKey]} nameValue={value[nameKey]} masters={masters} onChange={(selected) => onChange({ ...value, [idKey]: selected.id, [nameKey]: selected.name, [kind === "customers" ? `${prefix}Payer` : `${prefix}Payee`]: selected.name })} />;
  const changeField = (key: string, type: string | undefined, input: string) => {
    if (type === "number" && ["NetAmount", "TaxRate", "TaxAmount", "TotalAmount"].some((suffix) => key.endsWith(suffix))) {
      return updateCloudTaxValue(value, prefix, key.endsWith("NetAmount") ? "net" : key.endsWith("TaxAmount") ? "tax" : key.endsWith("TotalAmount") ? "total" : "rate", input);
    }
    return { ...value, [key]: input };
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="max-h-[90vh] w-full max-w-3xl overflow-auto bg-white p-5 shadow-xl"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg text-[#303133]">{invoice ? "编辑客户开票" : "编辑客户实收"}</h2><p className="mt-1 text-xs text-[#909399]">付款单位从客户档案选择，收款单位从承接单位档案选择，支持按编码或简称搜索</p></div><button type="button" title="关闭" onClick={onCancel}><X size={17} /></button></div><div className="grid gap-3 border-b border-[#ebeef5] pb-4 sm:grid-cols-2">{partner("customers", "付款单位", `${prefix}PayerCustomerId`, `${prefix}PayerCustomerName`)}{partner("undertakingUnits", "收款单位", `${prefix}PayeeUndertakingUnitId`, `${prefix}PayeeUndertakingUnitName`)}</div><div className="mt-4 grid gap-3 sm:grid-cols-2">{fields.map(([key, label, type]) => <label className="space-y-1 text-sm text-[#606266]" key={key}><span>{label}</span><Input className="w-full" type={type ?? "text"} value={String(value[key] ?? "")} onChange={(event) => onChange(changeField(key, type, event.target.value))} /></label>)}</div>{invoice ? <label className="mt-3 flex items-center gap-2 text-sm text-[#606266]"><input checked={value.collectionInvoice === "issued"} type="checkbox" onChange={(event) => onChange({ ...value, collectionInvoice: event.target.checked ? "issued" : "not_issued" })} />已开票</label> : <label className="mt-3 flex items-center gap-2 text-sm text-[#606266]"><input checked={Boolean(value.collected)} type="checkbox" onChange={(event) => onChange({ ...value, collected: event.target.checked ? 1 : 0 })} />已收款</label>}<div className="mt-5 flex justify-end gap-2"><Button onClick={onCancel}>取消</Button><Button tone="primary" onClick={onSave}>保存</Button></div></div></div>;
}

function MappingForm({ value, masters, onChange, onCancel, onSave }: { value: Row; masters: { suppliers: Master[]; undertakingUnits: Master[]; customers: Master[] }; onChange: (value: Row) => void; onCancel: () => void; onSave: () => void }) {
  const field = (key: string, label: string, options?: Master[]) => <label className="space-y-1 text-sm text-[#606266]"><span>{label}</span>{options ? <select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-2" value={String(value[key] ?? "")} onChange={(event) => { const selected = options.find((item) => item.id === event.target.value); onChange({ ...value, [key]: event.target.value, [`${key.replace("Id", "Name")}`]: selected?.name ?? "" }); }}><option value="">请选择</option>{options.map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} - ` : ""}{item.name}</option>)}</select> : <Input className="w-full" value={String(value[key] ?? "")} onChange={(event) => onChange({ ...value, [key]: event.target.value })} />}</label>;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-2xl bg-white p-5 shadow-xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg text-[#303133]">{value.id ? "修改服务映射" : "新增服务映射"}</h2><button type="button" title="关闭" onClick={onCancel}><X size={17} /></button></div><div className="grid gap-3 sm:grid-cols-2">{field("supplierId", "供应商", masters.suppliers)}{field("undertakingUnitId", "承接单位", masters.undertakingUnits)}{field("customerId", "客户", masters.customers)}{field("reconciler", "对账人")}{field("calculationLogic", "计算逻辑")}<label className="space-y-1 text-sm text-[#606266]"><span>华为云账号（逗号分隔）</span><Input className="w-full" value={String(value.accounts ?? "")} onChange={(event) => onChange({ ...value, accounts: event.target.value })} /></label><label className="space-y-1 text-sm text-[#606266]"><span>客户折扣</span><Input className="w-full" type="number" value={String(value.userDiscount ?? "")} onChange={(event) => onChange({ ...value, userDiscount: event.target.value })} /></label></div><div className="mt-5 flex justify-end gap-2"><Button onClick={onCancel}>取消</Button><Button tone="primary" onClick={onSave}>保存</Button></div></div></div>;
}
