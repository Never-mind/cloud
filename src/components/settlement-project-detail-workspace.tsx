"use client";

import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Download, FilePlus2, FileUp, Paperclip, Pencil, Save, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { postWorkspaceMessage } from "@/lib/tab-workspace";
import { calculateSettlementPurchaseAmounts, summarizeSettlementPurchases } from "@/lib/settlement-purchase-summary";
import { calculateSettlementEntryAmounts, summarizeSettlementEntries } from "@/lib/settlement-entry-summary";
import { AuditInfoBar, Button, Input, Panel } from "./ui";
import { PaginationBar } from "./pagination-bar";
import { StickyTable } from "./sticky-table";
import { TableColumnMenu, type TableFilterOption, type TableSortOrder } from "./table-column-menu";

type Item = {
  id: string; productCode: string; productName: string; brand: string | null; plannedQty: number; purchaseQty: number;
  purchaseUnitPrice: number; currency: string; priceType: string; taxRate: number; quotedWarehouseCostUsd: number;
  quotedSalesRevenueUsd: number; purchasedCostUsd: number; invoiceNo: string | null; ordered: boolean;
  createdAt: string; updatedAt: string;
};
type Expense = { id: string; type: string; description: string | null; amount: number; currency: string; priceType: string; taxRate: number; costUsd: number; invoiceNo: string | null; createdAt: string; updatedAt: string };
type Sale = { id: string; description: string | null; amount: number; currency: string; priceType: string; taxRate: number; receivedRevenueTaxIncludedUsd: number; receivedRevenueUsd: number; invoiceNo: string | null; receivedAt: string | null; createdAt: string; updatedAt: string };
type Attachment = { id: string; projectId: string; invoiceId: string | null; fileName: string; fileType: string | null; fileSize: number; description: string | null; uploadedByName: string | null; uploadedAt: string; createdAt: string; updatedAt: string };
type Invoice = { id: string; type: string; accountPeriod: string | null; accountingDate: string | null; companyEntity: string | null; invoiceEntity: string | null; invoiceDate: string | null; invoiceNo: string | null; invoiceTotal: number; invoiceTaxExcludedTotal: number; taxRate: number; invoiceTaxAmount: number; currency: string; exchangeRate: number; usdAmount: number; isPaid: boolean; isInvoiced: boolean; attachments?: Attachment[]; createdAt: string; updatedAt: string };
type Project = { id: string; projectNo: string; quotationId: string; quotationNo: string; projectName: string | null; customerName: string | null; contractingUnitName: string | null; remark: string | null; exchangeRateUsd: number; exchangeRateMxn: number; quotedPurchaseCostUsd: number; purchasedCostUsd: number; quotedSalesRevenueUsd: number; receivedRevenueTaxIncludedUsd: number; receivedRevenueUsd: number; grossProfitUsd: number; status: string; createdByName: string | null; updatedByName: string | null; confirmedByName: string | null; createdAt: string; updatedAt: string; confirmedAt: string | null };
type Detail = { project: Project; items: Item[]; unpurchasedItems: Item[]; purchasedItems: Item[]; expenses: Expense[]; sales: Sale[]; invoices: Invoice[]; attachments: Attachment[] };
type TableRow = Record<string, unknown>;
type TableKey = "unpurchased" | "purchased" | "expenses" | "sales" | "invoices" | "attachments";
type TableState = { sortField: string; sortOrder: TableSortOrder; filters: Record<string, string[]> };
type PageState = Record<TableKey, number>;
type PageSizeState = Record<TableKey, number>;

type Column = { key: string; label: string; type?: string; sortable?: boolean; filterable?: boolean };

const currencies = ["CNY", "USD", "MXN"];
const blankExpense = { type: "first_mile_freight", description: "", amount: "", currency: "CNY", priceType: "tax_included", taxRate: "0", invoiceNo: "" };
const blankSale = { description: "", amount: "", currency: "USD", priceType: "tax_included", taxRate: "0", invoiceNo: "", receivedAt: new Date().toISOString().slice(0, 10) };
const blankInvoice = { type: "cost", accountPeriod: "", accountingDate: "", companyEntity: "", invoiceEntity: "", invoiceDate: "", invoiceNo: "", invoiceTotal: "", taxRate: "0", currency: "CNY", exchangeRate: "1", isPaid: false, isInvoiced: false };

const columns: Record<TableKey, Column[]> = {
  unpurchased: [
    { key: "productCode", label: "产品编码", sortable: true, filterable: true }, { key: "productName", label: "产品名称", sortable: true, filterable: true }, { key: "brand", label: "品牌", sortable: true, filterable: true },
    { key: "plannedQty", label: "报价数量", type: "number", sortable: true, filterable: true }, { key: "purchaseQty", label: "采购数量", type: "number", sortable: true, filterable: true }, { key: "purchaseUnitPrice", label: "采购单价", type: "money", sortable: true, filterable: true },
    { key: "currency", label: "币种", sortable: true, filterable: true }, { key: "priceType", label: "价格方式", sortable: true, filterable: true }, { key: "taxRate", label: "税率(%)", type: "money", sortable: true, filterable: true }, { key: "invoiceNo", label: "发票号", sortable: true, filterable: true },
    { key: "createdAt", label: "创建时间", type: "date", sortable: true, filterable: true }, { key: "updatedAt", label: "更新时间", type: "date", sortable: true, filterable: true },
  ],
  purchased: [
    { key: "productCode", label: "产品编码", sortable: true, filterable: true }, { key: "productName", label: "产品名称", sortable: true, filterable: true }, { key: "brand", label: "品牌", sortable: true, filterable: true },
    { key: "plannedQty", label: "报价数量", type: "number", sortable: true, filterable: true }, { key: "purchaseQty", label: "采购数量", type: "number", sortable: true, filterable: true }, { key: "purchaseUnitPrice", label: "采购单价", type: "money", sortable: true, filterable: true },
    { key: "currency", label: "币种", sortable: true, filterable: true }, { key: "priceType", label: "价格方式", sortable: true, filterable: true }, { key: "taxRate", label: "税率(%)", type: "money", sortable: true, filterable: true }, { key: "invoiceNo", label: "发票号", sortable: true, filterable: true },
    { key: "createdAt", label: "创建时间", type: "date", sortable: true, filterable: true }, { key: "updatedAt", label: "更新时间", type: "date", sortable: true, filterable: true },
  ],
  expenses: [
    { key: "type", label: "费用类型", sortable: true, filterable: true }, { key: "description", label: "说明", sortable: true, filterable: true }, { key: "amount", label: "金额", type: "money", sortable: true, filterable: true }, { key: "currency", label: "币种", sortable: true, filterable: true },
    { key: "priceType", label: "价格方式", sortable: true, filterable: true }, { key: "taxRate", label: "税率(%)", type: "money", sortable: true, filterable: true }, { key: "invoiceNo", label: "发票号", sortable: true, filterable: true }, { key: "createdAt", label: "创建时间", type: "date", sortable: true, filterable: true }, { key: "updatedAt", label: "更新时间", type: "date", sortable: true, filterable: true },
  ],
  sales: [
    { key: "description", label: "收入说明", sortable: true, filterable: true }, { key: "amount", label: "金额", type: "money", sortable: true, filterable: true }, { key: "currency", label: "币种", sortable: true, filterable: true }, { key: "priceType", label: "价格方式", sortable: true, filterable: true },
    { key: "taxRate", label: "税率(%)", type: "money", sortable: true, filterable: true }, { key: "invoiceNo", label: "发票号", sortable: true, filterable: true }, { key: "receivedAt", label: "收款日期", type: "date", sortable: true, filterable: true }, { key: "createdAt", label: "创建时间", type: "date", sortable: true, filterable: true }, { key: "updatedAt", label: "更新时间", type: "date", sortable: true, filterable: true },
  ],
  invoices: [
    { key: "type", label: "类型", sortable: true, filterable: true }, { key: "accountPeriod", label: "账期", type: "date", sortable: true, filterable: true }, { key: "accountingDate", label: "财务记账日期", type: "date", sortable: true, filterable: true }, { key: "companyEntity", label: "公司主体", sortable: true, filterable: true }, { key: "invoiceEntity", label: "发票主体", sortable: true, filterable: true }, { key: "invoiceDate", label: "发票日期", type: "date", sortable: true, filterable: true }, { key: "invoiceNo", label: "发票号", sortable: true, filterable: true },
    { key: "currency", label: "发票币种", sortable: true, filterable: true }, { key: "isPaid", label: "是否支付", sortable: true, filterable: true }, { key: "isInvoiced", label: "是否开票", sortable: true, filterable: true }, { key: "createdAt", label: "创建时间", type: "date", sortable: true, filterable: true }, { key: "updatedAt", label: "更新时间", type: "date", sortable: true, filterable: true },
  ],
  attachments: [
    { key: "fileName", label: "文件名", sortable: true, filterable: true }, { key: "fileType", label: "类型", sortable: true, filterable: true }, { key: "fileSize", label: "大小", type: "fileSize", sortable: true, filterable: true }, { key: "description", label: "说明", sortable: true, filterable: true }, { key: "uploadedByName", label: "上传人", sortable: true, filterable: true }, { key: "uploadedAt", label: "上传时间", type: "date", sortable: true, filterable: true },
  ],
};

const initialTableState = (): Record<TableKey, TableState> => Object.fromEntries((Object.keys(columns) as TableKey[]).map((key) => [key, { sortField: "", sortOrder: "", filters: {} }])) as Record<TableKey, TableState>;
const initialPageState: PageState = { unpurchased: 1, purchased: 1, expenses: 1, sales: 1, invoices: 1, attachments: 1 };
const initialPageSizeState: PageSizeState = { unpurchased: 10, purchased: 10, expenses: 10, sales: 10, invoices: 10, attachments: 10 };

export function SettlementProjectDetailWorkspace() {
  const { id } = useParams<{ id: string }>();
  const projectId = decodeURIComponent(id || "");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<"detail" | "invoices" | "attachments">("detail");
  const [selected, setSelected] = useState<string[]>([]);
  const [itemDrafts, setItemDrafts] = useState<Record<string, Record<string, string>>>({});
  const [expenseDraft, setExpenseDraft] = useState({ ...blankExpense });
  const [saleDraft, setSaleDraft] = useState({ ...blankSale });
  const [invoiceDraft, setInvoiceDraft] = useState({ ...blankInvoice });
  const [editingExpense, setEditingExpense] = useState<Record<string, Record<string, string>>>({});
  const [editingSale, setEditingSale] = useState<Record<string, Record<string, string>>>({});
  const [editingItemRows, setEditingItemRows] = useState<Record<string, boolean>>({});
  const [editingInvoice, setEditingInvoice] = useState<Record<string, Record<string, string | boolean>>>({});
  const [tableStates, setTableStates] = useState<Record<TableKey, TableState>>(initialTableState);
  const [pages, setPages] = useState<PageState>(initialPageState);
  const [pageSizes, setPageSizes] = useState<PageSizeState>(initialPageSizeState);
  const [attachmentDescription, setAttachmentDescription] = useState("");
  const [invoiceAttachmentDescriptions, setInvoiceAttachmentDescriptions] = useState<Record<string, string>>({});
  const [importingItems, setImportingItems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function applyDetail(next: Detail) {
    setDetail(next);
    setItemDrafts(Object.fromEntries(next.items.map((item) => [item.id, draftItem(item)])));
    setEditingExpense({});
    setEditingSale({});
    setEditingItemRows({});
    setEditingInvoice(Object.fromEntries(next.invoices.map((item) => [item.id, draftInvoice(item)])));
    setSelected([]);
    setPages((current) => ({ ...current, unpurchased: 1, purchased: 1, expenses: 1, sales: 1, invoices: 1, attachments: Math.min(current.attachments, 1) }));
  }

  async function load() {
    if (!projectId) return;
    try {
      const response = await fetch(`/api/po/settlement-projects/${encodeURIComponent(projectId)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "项目结算加载失败");
      applyDetail(data as Detail);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "项目结算加载失败");
    }
  }

  useEffect(() => { void load(); }, [projectId]);

  async function write(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "保存失败");
      applyDetail(data as Detail);
      return data as Detail;
    } catch (writeError) {
      setError(writeError instanceof Error ? writeError.message : "保存失败");
      throw writeError;
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(() => {
    if (!detail) return {} as Record<TableKey, TableRow[]>;
    return {
      unpurchased: transformRows(detail.unpurchasedItems as unknown as TableRow[], tableStates.unpurchased),
      purchased: transformRows(detail.purchasedItems as unknown as TableRow[], tableStates.purchased),
      expenses: transformRows(detail.expenses as unknown as TableRow[], tableStates.expenses),
      sales: transformRows(detail.sales as unknown as TableRow[], tableStates.sales),
      invoices: transformRows(detail.invoices as unknown as TableRow[], tableStates.invoices),
      attachments: transformRows(detail.attachments.filter((item) => !item.invoiceId) as unknown as TableRow[], tableStates.attachments),
    };
  }, [detail, tableStates]);

  if (!detail) return <Panel className="p-8 text-sm text-[#909399]">{error || "加载中..."}</Panel>;

  const project = detail.project;
  const readOnly = project.status === "closed";
  const nextStatus = project.status === "purchasing" ? "procurement_completed" : project.status === "procurement_completed" ? "accepting" : project.status === "accepting" ? "closed" : "";
  const canCompleteProcurement = project.status === "purchasing" && detail.items.length > 0 && detail.items.every((item) => item.ordered);
  const unpurchasedPage = pageInfo(visible.unpurchased, pages.unpurchased, pageSizes.unpurchased, detail.unpurchasedItems as unknown as TableRow[]);
  const purchasedPage = pageInfo(visible.purchased, pages.purchased, pageSizes.purchased, detail.purchasedItems as unknown as TableRow[]);
  const expensesPage = pageInfo(visible.expenses, pages.expenses, pageSizes.expenses, detail.expenses as unknown as TableRow[]);
  const salesPage = pageInfo(visible.sales, pages.sales, pageSizes.sales, detail.sales as unknown as TableRow[]);
  const invoicesPage = pageInfo(visible.invoices, pages.invoices, pageSizes.invoices, detail.invoices as unknown as TableRow[]);
  const attachmentsPage = pageInfo(visible.attachments, pages.attachments, pageSizes.attachments, detail.attachments.filter((item) => !item.invoiceId) as unknown as TableRow[]);

  async function orderItems() {
    if (!selected.length) { setError("请先选择要确认采购的明细"); return; }
    await write(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/order`, "POST", { items: selected.map((itemId) => ({ itemId, ...itemDrafts[itemId], purchaseQty: Number(itemDrafts[itemId]?.purchaseQty || 0), purchaseUnitPrice: Number(itemDrafts[itemId]?.purchaseUnitPrice || 0), taxRate: Number(itemDrafts[itemId]?.taxRate || 0) })) });
  }

  async function importUnpurchasedItems(file: File) {
    setImportingItems(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/items/import`, { method: "POST", body: formData });
      const data = await response.json().catch(() => ({})) as { total?: number; success?: number; failed?: Array<{ rowNumber: number; error: string }>; error?: string };
      if (!response.ok) throw new Error(data.error ?? "未采购商品导入失败");
      setNotice(`未采购商品导入完成：成功 ${data.success ?? 0}/${data.total ?? 0} 条${data.failed?.length ? `，失败 ${data.failed.length} 条` : ""}`);
      if (data.failed?.length) setError(data.failed.map((row) => `第${row.rowNumber}行：${row.error}`).join("；"));
      await load();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "未采购商品导入失败");
    } finally {
      setImportingItems(false);
    }
  }

  async function changeStatus() {
    if (!nextStatus) return;
    if (nextStatus === "closed" && !window.confirm("确认完结该项目结算？完结后主从数据将变为只读。")) return;
    await write(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/status`, "POST", { status: nextStatus });
  }

  async function addExpense() { await write(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/expenses`, "POST", toExpense(expenseDraft)); setExpenseDraft({ ...blankExpense }); }
  async function addSale() { await write(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/sales`, "POST", toSale(saleDraft)); setSaleDraft({ ...blankSale }); }
  async function addInvoice() { await write(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/invoices`, "POST", toInvoice(invoiceDraft)); setInvoiceDraft({ ...blankInvoice }); }

  async function uploadAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    await write(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/attachments`, "POST", { fileName: file.name, fileType: file.type, fileSize: file.size, dataUrl: await fileToDataUrl(file), description: attachmentDescription });
    setAttachmentDescription("");
  }

  async function uploadInvoiceAttachment(invoiceId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    await write(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/invoices/${encodeURIComponent(invoiceId)}/attachments`, "POST", { fileName: file.name, fileType: file.type, fileSize: file.size, dataUrl: await fileToDataUrl(file), description: invoiceAttachmentDescriptions[invoiceId] || "" });
    setInvoiceAttachmentDescriptions((current) => ({ ...current, [invoiceId]: "" }));
  }

  function updateTableState(key: TableKey, patch: Partial<TableState>) {
    setTableStates((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
    setPages((current) => ({ ...current, [key]: 1 }));
  }

  function openRoute(route: string, title: string) { postWorkspaceMessage({ type: "cloud-power:open-tab", route, title }); }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button className="inline-flex items-center gap-1 text-sm text-[#1890ff] hover:underline" type="button" onClick={() => openRoute("/po/settlement-projects", "项目结算")}><ArrowLeft size={15} />返回项目结算</button>
        <span className="text-[#dcdfe6]">/</span><h1 className="text-xl font-medium text-[#303133]">{project.projectNo}</h1><span className={`rounded px-2 py-1 text-xs ${statusClass(project.status)}`}>{statusLabel(project.status)}</span>
        <div className="ml-auto flex gap-2"><a className="inline-flex h-9 items-center gap-1 rounded border border-[#dcdfe6] bg-white px-3 text-sm text-[#606266] hover:opacity-85" href={`/api/po/settlement-projects/${encodeURIComponent(projectId)}/export`}><Download size={15} />导出</a>{nextStatus ? <Button tone={nextStatus === "closed" ? "success" : "primary"} disabled={busy || (nextStatus === "procurement_completed" && !canCompleteProcurement)} onClick={() => void changeStatus()}><Check size={15} />{nextStatus === "procurement_completed" ? "采购完成" : nextStatus === "accepting" ? "进入验收" : "完结项目"}</Button> : null}</div>
      </div>
      {error ? <div className="border border-[#ffb4ab] bg-[#ffdad6] px-3 py-2 text-sm text-[#93000a]">{error}<button className="ml-3 underline" type="button" onClick={() => setError("")}>关闭</button></div> : null}
      {notice ? <div className="border border-[#c2e7b0] bg-[#f0f9eb] px-3 py-2 text-sm text-[#67c23a]">{notice}</div> : null}
      <Panel>
        <div className="border-b border-[#ebeef5] p-4"><h2 className="font-medium text-[#303133]">项目结算主单</h2></div>
        <div className="grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-6">{[["采购成本（未税 USD）", money(project.quotedPurchaseCostUsd)], ["已采购成本（未税 USD）", money(project.purchasedCostUsd)], ["销售收入（未税 USD）", money(project.quotedSalesRevenueUsd)], ["已销售收入（含税 USD）", money(project.receivedRevenueTaxIncludedUsd)], ["已销售收入（未税 USD）", money(project.receivedRevenueUsd)], ["项目毛利（未税 USD）", money(project.grossProfitUsd)]].map(([label, value]) => <div className="border border-[#ebeef5] bg-[#fafafa] p-3" key={label}><span className="block text-xs text-[#909399]">{label}</span><strong className="mt-1 block text-base text-[#303133]">{value}</strong></div>)}</div>
        <div className="grid gap-3 border-t border-[#ebeef5] p-4 text-sm md:grid-cols-3"><Info label="报价单号" value={project.quotationNo} link={() => openRoute(`/quotation/list?keyword=${encodeURIComponent(project.quotationNo)}`, "报价列表")} /><Info label="客户" value={project.customerName || "-"} /><Info label="承接单位" value={project.contractingUnitName || "-"} /><Info label="项目名称" value={project.projectName || "-"} /><Info label="备注" value={project.remark || "-"} /></div>
      </Panel>
      <div className="flex border-b border-[#dcdfe6]"><TabButton active={tab === "detail"} onClick={() => setTab("detail")}>结算详情</TabButton><TabButton active={tab === "invoices"} onClick={() => setTab("invoices")}>发票管理（{detail.invoices.length}）</TabButton><TabButton active={tab === "attachments"} onClick={() => setTab("attachments")}>附件管理（{detail.attachments.filter((item) => !item.invoiceId).length}）</TabButton></div>
      {tab === "detail" ? <fieldset disabled={readOnly} className="min-w-0"><DetailSections detail={detail} itemDrafts={itemDrafts} editingItemRows={editingItemRows} selected={selected} busy={busy} importingItems={importingItems} expenseDraft={expenseDraft} saleDraft={saleDraft} editingExpense={editingExpense} editingSale={editingSale} unpurchased={unpurchasedPage} purchased={purchasedPage} expenses={expensesPage} sales={salesPage} pageSizes={pageSizes} states={tableStates} onState={updateTableState} onPage={(key, page) => setPages((current) => ({ ...current, [key]: page }))} onPageSize={(key, pageSize) => { setPageSizes((current) => ({ ...current, [key]: pageSize })); setPages((current) => ({ ...current, [key]: 1 })); }} onSelect={setSelected} onItemChange={(itemId, key, value) => setItemDrafts((current) => ({ ...current, [itemId]: { ...current[itemId], [key]: value } }))} onEditItem={(itemId) => { const item = detail.purchasedItems.find((candidate) => candidate.id === itemId); if (!item) return; setItemDrafts((current) => ({ ...current, [itemId]: draftItem(item) })); setEditingItemRows((current) => ({ ...current, [itemId]: true })); }} onOrder={() => void orderItems()} onImportItems={(file) => void importUnpurchasedItems(file)} onSaveItem={(itemId) => void write(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemId)}`, "PUT", { ...itemDrafts[itemId], purchaseQty: Number(itemDrafts[itemId]?.purchaseQty || 0), purchaseUnitPrice: Number(itemDrafts[itemId]?.purchaseUnitPrice || 0), taxRate: Number(itemDrafts[itemId]?.taxRate || 0) })} onReturn={(itemId) => void write(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemId)}`, "DELETE")} onExpenseChange={(id, key, value) => setEditingExpense((current) => ({ ...current, [id]: { ...current[id], [key]: value } }))} onEditExpense={(entry) => setEditingExpense((current) => ({ ...current, [entry.id]: draftExpense(entry) }))} onSaleChange={(id, key, value) => setEditingSale((current) => ({ ...current, [id]: { ...current[id], [key]: value } }))} onEditSale={(entry) => setEditingSale((current) => ({ ...current, [entry.id]: draftSale(entry) }))} onSaveExpense={(id) => void write(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/expenses/${encodeURIComponent(id)}`, "PUT", toExpense(editingExpense[id]))} onDeleteExpense={(id) => void write(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/expenses/${encodeURIComponent(id)}`, "DELETE")} onSaveSale={(id) => void write(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/sales/${encodeURIComponent(id)}`, "PUT", toSale(editingSale[id]))} onDeleteSale={(id) => void write(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/sales/${encodeURIComponent(id)}`, "DELETE")} onExpenseDraftChange={(key, value) => setExpenseDraft((current) => ({ ...current, [key]: value }))} onSaleDraftChange={(key, value) => setSaleDraft((current) => ({ ...current, [key]: value }))} onAddExpense={() => void addExpense()} onAddSale={() => void addSale()} /></fieldset> : null}
      {tab === "invoices" ? <div className="space-y-5"><fieldset disabled={readOnly} className="min-w-0"><InvoiceSection invoices={invoicesPage} allInvoices={detail.invoices} pageSize={pageSizes.invoices} draft={invoiceDraft} editing={editingInvoice} busy={busy} readOnly={readOnly} attachmentDescriptions={invoiceAttachmentDescriptions} onAttachmentDescriptionChange={(invoiceId, value) => setInvoiceAttachmentDescriptions((current) => ({ ...current, [invoiceId]: value }))} onUpload={uploadInvoiceAttachment} onDeleteAttachment={(attachmentId) => void write(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/attachments/${encodeURIComponent(attachmentId)}`, "DELETE")} state={tableStates.invoices} onState={(patch) => updateTableState("invoices", patch)} onPage={(page) => setPages((current) => ({ ...current, invoices: page }))} onPageSize={(pageSize) => { setPageSizes((current) => ({ ...current, invoices: pageSize })); setPages((current) => ({ ...current, invoices: 1 })); }} onDraftChange={(key, value) => setInvoiceDraft((current) => ({ ...current, [key]: value }))} onEditingChange={(id, key, value) => setEditingInvoice((current) => ({ ...current, [id]: { ...current[id], [key]: value } }))} onAdd={() => void addInvoice()} onSave={(id) => void write(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/invoices/${encodeURIComponent(id)}`, "PUT", toInvoice(editingInvoice[id]))} onDelete={(id) => void write(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/invoices/${encodeURIComponent(id)}`, "DELETE")} /></fieldset></div> : null}
       {tab === "attachments" ? <AttachmentSection readOnly={readOnly} attachments={attachmentsPage} state={tableStates.attachments} onState={(patch) => updateTableState("attachments", patch)} onPage={(page) => setPages((current) => ({ ...current, attachments: page }))} onPageSize={(pageSize) => { setPageSizes((current) => ({ ...current, attachments: pageSize })); setPages((current) => ({ ...current, attachments: 1 })); }} description={attachmentDescription} onDescriptionChange={setAttachmentDescription} onUpload={uploadAttachment} onDelete={(attachmentId) => void write(`/api/po/settlement-projects/${encodeURIComponent(projectId)}/attachments/${encodeURIComponent(attachmentId)}`, "DELETE")} /> : null}
       <AuditInfoBar createdBy={project.createdByName} createdAt={formatDate(project.createdAt)} updatedBy={project.updatedByName} updatedAt={formatDate(project.updatedAt)} confirmedBy={project.confirmedByName} confirmedAt={formatDate(project.confirmedAt)} />
     </div>
  );
}

type FilterRows = TableRow[] & { allRows?: TableRow[] };
type PagedRows = { rows: FilterRows; summaryRows: TableRow[]; page: number; pageSize: number; total: number; totalPages: number };
type DetailSectionsProps = { detail: Detail; itemDrafts: Record<string, Record<string, string>>; editingItemRows: Record<string, boolean>; selected: string[]; busy: boolean; importingItems: boolean; expenseDraft: Record<string, string>; saleDraft: Record<string, string>; editingExpense: Record<string, Record<string, string>>; editingSale: Record<string, Record<string, string>>; unpurchased: PagedRows; purchased: PagedRows; expenses: PagedRows; sales: PagedRows; pageSizes: PageSizeState; states: Record<TableKey, TableState>; onState: (key: TableKey, patch: Partial<TableState>) => void; onPage: (key: TableKey, page: number) => void; onPageSize: (key: TableKey, pageSize: number) => void; onSelect: (ids: string[]) => void; onItemChange: (id: string, key: string, value: string) => void; onEditItem: (id: string) => void; onOrder: () => void; onImportItems: (file: File) => void; onSaveItem: (id: string) => void; onReturn: (id: string) => void; onExpenseChange: (id: string, key: string, value: string) => void; onEditExpense: (entry: Expense) => void; onSaleChange: (id: string, key: string, value: string) => void; onEditSale: (entry: Sale) => void; onSaveExpense: (id: string) => void; onDeleteExpense: (id: string) => void; onSaveSale: (id: string) => void; onDeleteSale: (id: string) => void; onExpenseDraftChange: (key: string, value: string) => void; onSaleDraftChange: (key: string, value: string) => void; onAddExpense: () => void; onAddSale: () => void };

function DetailSections(props: DetailSectionsProps) {
  const { detail } = props;
  return <div className="space-y-5"><PurchaseTable title="未采购商品" tableKey="unpurchased" rows={props.unpurchased} selected={props.selected} itemDrafts={props.itemDrafts} editingRows={props.editingItemRows} busy={props.busy} importingItems={props.importingItems} project={detail.project} selectable onSelect={props.onSelect} onChange={props.onItemChange} onOrder={props.onOrder} onImportItems={props.onImportItems} state={props.states.unpurchased} onState={(patch) => props.onState("unpurchased", patch)} onPage={(page) => props.onPage("unpurchased", page)} onPageSize={(pageSize) => props.onPageSize("unpurchased", pageSize)} /><PurchaseTable title="已采购商品" tableKey="purchased" rows={props.purchased} selected={props.selected} itemDrafts={props.itemDrafts} editingRows={props.editingItemRows} busy={props.busy} importingItems={false} project={detail.project} onChange={props.onItemChange} onEdit={props.onEditItem} onSave={props.onSaveItem} onReturn={props.onReturn} state={props.states.purchased} onState={(patch) => props.onState("purchased", patch)} onPage={(page) => props.onPage("purchased", page)} onPageSize={(pageSize) => props.onPageSize("purchased", pageSize)} /><EntrySection title="其他成本费用" tableKey="expenses" entries={props.expenses} draft={props.expenseDraft} editing={props.editingExpense} kind="expense" project={detail.project} state={props.states.expenses} onState={(patch) => props.onState("expenses", patch)} onPage={(page) => props.onPage("expenses", page)} onPageSize={(pageSize) => props.onPageSize("expenses", pageSize)} onDraftChange={props.onExpenseDraftChange} onEditingChange={props.onExpenseChange} onEdit={(entry) => props.onEditExpense(entry as Expense)} onSave={props.onSaveExpense} onDelete={props.onDeleteExpense} onAdd={props.onAddExpense} /><EntrySection title="销售收入明细" tableKey="sales" entries={props.sales} draft={props.saleDraft} editing={props.editingSale} kind="sale" project={detail.project} state={props.states.sales} onState={(patch) => props.onState("sales", patch)} onPage={(page) => props.onPage("sales", page)} onPageSize={(pageSize) => props.onPageSize("sales", pageSize)} onDraftChange={props.onSaleDraftChange} onEditingChange={props.onSaleChange} onEdit={(entry) => props.onEditSale(entry as Sale)} onSave={props.onSaveSale} onDelete={props.onDeleteSale} onAdd={props.onAddSale} /></div>;
}

type PurchaseTableProps = {
  title: string;
  tableKey: "unpurchased" | "purchased";
  rows: PagedRows;
  selected: string[];
  itemDrafts: Record<string, Record<string, string>>;
  editingRows?: Record<string, boolean>;
  project: Project;
  busy: boolean;
  importingItems: boolean;
  selectable?: boolean;
  onSelect?: (ids: string[]) => void;
  onChange: (id: string, key: string, value: string) => void;
  onOrder?: () => void;
  onImportItems?: (file: File) => void;
  onEdit?: (id: string) => void;
  onSave?: (id: string) => void;
  onReturn?: (id: string) => void;
  state: TableState;
  onState: (patch: Partial<TableState>) => void;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
};

function PurchaseTable({ title, tableKey, rows, selected, itemDrafts, editingRows, project, busy, importingItems, selectable, onSelect, onChange, onOrder, onImportItems, onEdit, onSave, onReturn, state, onState, onPage, onPageSize }: PurchaseTableProps) {
  const itemRows = rows.rows as unknown as Item[];
  const importInputRef = useRef<HTMLInputElement>(null);
  const allSelected = selectable && itemRows.length > 0 && itemRows.every((item) => selected.includes(item.id));
  const summary = summarizeSettlementPurchases(
    (rows.summaryRows as Item[]).map((item) => previewPurchaseItem(item, itemDrafts[item.id] || draftItem(item), Boolean(selectable || editingRows?.[item.id]))),
    project,
  );
  const action = selectable ? <div className="flex flex-wrap justify-end gap-2"><a className="inline-flex h-9 items-center gap-1 rounded border border-[#dcdfe6] bg-white px-3 text-sm text-[#606266] hover:border-[#c0c4cc]" href={"/api/po/settlement-projects/" + encodeURIComponent(project.id) + "/items/template"}><Download size={15} />下载模板</a><a className="inline-flex h-9 items-center gap-1 rounded border border-[#dcdfe6] bg-white px-3 text-sm text-[#606266] hover:border-[#c0c4cc]" href={"/api/po/settlement-projects/" + encodeURIComponent(project.id) + "/items/export"}><Download size={15} />导出未采购</a><Button disabled={busy || importingItems} onClick={() => importInputRef.current?.click()}><FileUp size={15} />{importingItems ? "导入中..." : "导入未采购"}</Button><input ref={importInputRef} className="hidden" type="file" accept=".xlsx,.xls" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onImportItems?.(file); }} /><Button tone="primary" disabled={busy || !selected.length} onClick={onOrder}><Check size={15} />确认采购</Button></div> : undefined;

  return <Panel><SectionTitle title={title} action={action} /><TableScroll tableKey={"settlement-" + tableKey}><table className="min-w-[1900px] border-collapse text-sm"><thead className="bg-[#f5f7fa]"><tr>{selectable ? <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium"><input aria-label="全选" type="checkbox" checked={Boolean(allSelected)} onChange={(event) => { const ids = itemRows.map((item) => item.id); onSelect?.(event.target.checked ? Array.from(new Set([...selected, ...ids])) : selected.filter((id) => !ids.includes(id))); }} /></th> : null}{columns[tableKey].map((column) => <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={column.key}><ColumnHeader tableKey={tableKey} column={column} rows={rows.rows} state={state} onState={onState} /></th>)}<th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">采购总价</th><th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">不含税采购金额（USD）</th><th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium">含税采购金额（USD）</th>{onSave ? <th className="whitespace-nowrap border-b border-[#ebeef5] px-3 py-3 text-left font-medium">操作</th> : null}</tr></thead><tbody>{itemRows.map((item) => { const draft = itemDrafts[item.id] || draftItem(item); const editing = Boolean(editingRows?.[item.id]); const inputMode = Boolean(selectable || editing); const preview = previewPurchaseItem(item, draft, inputMode); const amounts = purchaseBreakdown(preview, project); return <tr className="hover:bg-[#fafafa]" key={item.id}>{selectable ? <td className="border-b border-r border-[#ebeef5] px-3 py-3"><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => onSelect?.(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} /></td> : null}{columns[tableKey].map((column) => <td className="max-w-[230px] truncate whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3" key={column.key}>{editablePurchaseField(column.key) && inputMode ? <PurchaseInput item={preview} draft={draft} field={column.key} onChange={(value) => onChange(item.id, column.key, value)} /> : formatColumnValue(column.key, item[column.key as keyof Item], column.type)}</td>)}<td className="numeric-cell border-b border-r border-[#ebeef5] px-3 py-3">{money(preview.purchaseQty * preview.purchaseUnitPrice)}</td><td className="numeric-cell border-b border-r border-[#ebeef5] px-3 py-3">{money(amounts.taxExcludedUsd)}</td><td className="numeric-cell border-b border-r border-[#ebeef5] px-3 py-3">{money(amounts.taxIncludedUsd)}</td>{onSave ? <td className="whitespace-nowrap border-b border-[#ebeef5] px-3 py-3">{editing ? <Button disabled={busy} onClick={() => onSave(item.id)}><Save size={14} />保存</Button> : <Button disabled={busy} onClick={() => onEdit?.(item.id)}><Pencil size={14} />修改</Button>}<Button className="ml-2" tone="danger" disabled={busy} onClick={() => onReturn?.(item.id)}><ArrowLeft size={14} />退回</Button></td> : null}</tr>; })}{!itemRows.length ? <Empty colSpan={(selectable ? 1 : 0) + columns[tableKey].length + 3 + (onSave ? 1 : 0)} text={selectable ? "暂无未采购商品" : "暂无已采购商品"} /> : null}</tbody>{rows.summaryRows.length ? <tfoot><tr><td className="border-t border-[#ebeef5] px-3 py-3 font-medium" colSpan={(selectable ? 1 : 0) + 3}>合计</td><td className="numeric-cell border-t border-r border-[#ebeef5] px-3 py-3">{formatQuantity(summary.plannedQty)}</td><td className="numeric-cell border-t border-r border-[#ebeef5] px-3 py-3">{formatQuantity(summary.purchaseQty)}</td><td className="border-t border-r border-[#ebeef5] px-3 py-3" colSpan={7} /><td className="numeric-cell border-t border-r border-[#ebeef5] px-3 py-3">{formatCurrencyTotals(summary.purchaseTotalsByCurrency)}</td><td className="numeric-cell border-t border-r border-[#ebeef5] px-3 py-3">{money(summary.taxExcludedUsd)}</td><td className="numeric-cell border-t border-r border-[#ebeef5] px-3 py-3">{money(summary.taxIncludedUsd)}</td>{onSave ? <td className="border-t border-[#ebeef5] px-3 py-3" /> : null}</tr></tfoot> : null}</table></TableScroll><PaginationBar page={rows.page} pageSize={rows.pageSize} total={rows.total} onPageChange={onPage} onPageSizeChange={onPageSize} /></Panel>;
}

function EntrySection({ title, tableKey, entries, draft, editing, kind, project, state, onState, onPage, onPageSize, onDraftChange, onEditingChange, onEdit, onSave, onDelete, onAdd }: { title: string; tableKey: "expenses" | "sales"; entries: PagedRows; draft: Record<string, string>; editing: Record<string, Record<string, string>>; kind: "expense" | "sale"; project: Project; state: TableState; onState: (patch: Partial<TableState>) => void; onPage: (page: number) => void; onPageSize: (pageSize: number) => void; onDraftChange: (key: string, value: string) => void; onEditingChange: (id: string, key: string, value: string) => void; onEdit: (entry: Expense | Sale) => void; onSave: (id: string) => void; onDelete: (id: string) => void; onAdd: () => void }) {
  const isExpense = kind === "expense";
  const items = entries.rows as unknown as Array<Expense | Sale>;
  const summary = summarizeSettlementEntries(
    entries.summaryRows.map((entry) => {
      const sourceEntry = entry as unknown as Expense | Sale;
      const source = editing[sourceEntry.id] || (isExpense ? draftExpense(sourceEntry as Expense) : draftSale(sourceEntry as Sale));
      return {
        amount: Number(source.amount || 0),
        currency: source.currency,
        priceType: source.priceType,
        taxRate: Number(source.taxRate || 0),
      };
    }),
    project,
  );
  const formGrid = isExpense
    ? "grid gap-3 border-b border-[#ebeef5] bg-[#fcfcfd] p-4 md:grid-cols-3 xl:grid-cols-[minmax(170px,1.35fr)_minmax(150px,1.2fr)_minmax(140px,1.1fr)_minmax(120px,1fr)_max-content_minmax(100px,.75fr)_minmax(130px,1fr)]"
    : "grid gap-3 border-b border-[#ebeef5] bg-[#fcfcfd] p-4 md:grid-cols-3 xl:grid-cols-[minmax(180px,1.35fr)_minmax(145px,1.1fr)_minmax(130px,1fr)_max-content_minmax(100px,.75fr)_minmax(130px,1fr)]";
  return <Panel><SectionTitle title={title} action={<Button tone="primary" onClick={onAdd}><FilePlus2 size={15} />新增</Button>} /><div className={formGrid}>{isExpense ? <Field label="费用类型" required><select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-2" value={draft.type} onChange={(event) => onDraftChange("type", event.target.value)}><option value="first_mile_freight">头程运费</option><option value="customs_fee">清关费</option><option value="labor_fee">人力费</option><option value="equipment_service_fee">设备服务费</option><option value="other">其他</option></select></Field> : null}<Field label={isExpense ? "说明" : "收入说明"}><Input className="w-full" value={draft.description || ""} onChange={(event) => onDraftChange("description", event.target.value)} /></Field><Field label={isExpense ? "金额" : "收入金额"} required><Input className="w-full" type="number" value={draft.amount || ""} onChange={(event) => onDraftChange("amount", event.target.value)} /></Field><Field label="币种" required><select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-2" value={draft.currency} onChange={(event) => onDraftChange("currency", event.target.value)}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></Field><Field label="价格方式" required><PriceType value={draft.priceType} onChange={(value) => onDraftChange("priceType", value)} /></Field><Field label="税率（%）" required><Input className="w-full" type="number" value={draft.taxRate} onChange={(event) => onDraftChange("taxRate", event.target.value)} /></Field><Field label={isExpense ? "发票号" : "收款日期"} required={!isExpense}><Input className="w-full" placeholder={isExpense ? "可选" : "请选择日期"} type={isExpense ? "text" : "date"} value={isExpense ? draft.invoiceNo : draft.receivedAt} onChange={(event) => onDraftChange(isExpense ? "invoiceNo" : "receivedAt", event.target.value)} /></Field></div><TableScroll tableKey={`settlement-${tableKey}`}><table className="min-w-[1650px] border-collapse text-sm"><thead className="bg-[#f5f7fa]"><tr>{columns[tableKey].map((column) => <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={column.key}><ColumnHeader tableKey={tableKey} column={column} rows={entries.rows} state={state} onState={onState} /></th>)}<th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3">{isExpense ? "不含税成本（USD）" : "不含税销售收入（USD）"}</th><th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3">{isExpense ? "含税成本（USD）" : "含税销售收入（USD）"}</th><th className="whitespace-nowrap border-b border-[#ebeef5] px-3 py-3">操作</th></tr></thead><tbody>{items.map((entry) => { const isEditing = Boolean(editing[entry.id]); const value = editing[entry.id] || (isExpense ? draftExpense(entry as Expense) : draftSale(entry as Sale)); const preview = isEditing ? { ...entry, ...value, amount: Number(value.amount || 0), taxRate: Number(value.taxRate || 0) } as Expense | Sale : entry; const amounts = entryBreakdown(preview, project); return <tr className="hover:bg-[#fafafa]" key={entry.id}>{columns[tableKey].map((column) => <td className="max-w-[220px] truncate whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3" key={column.key}>{editableEntryField(column.key) && isEditing ? <EntryInput entry={preview} value={value} field={column.key} kind={kind} onChange={(next) => onEditingChange(entry.id, column.key, next)} /> : formatColumnValue(column.key, entry[column.key as keyof typeof entry], column.type)}</td>)}<td className="numeric-cell border-b border-r border-[#ebeef5] px-3 py-3">{money(amounts.taxExcludedUsd)}</td><td className="numeric-cell border-b border-r border-[#ebeef5] px-3 py-3">{money(amounts.taxIncludedUsd)}</td><td className="whitespace-nowrap border-b border-[#ebeef5] px-3 py-3">{isEditing ? <Button onClick={() => onSave(entry.id)}><Save size={14} />保存</Button> : <Button onClick={() => onEdit(entry)}><Pencil size={14} />修改</Button>}<Button className="ml-2" tone="danger" onClick={() => onDelete(entry.id)}><Trash2 size={14} />删除</Button></td></tr>; })}{!items.length ? <Empty colSpan={columns[tableKey].length + 3} text={isExpense ? "暂无成本费用" : "暂无销售收入明细"} /> : null}</tbody>{entries.summaryRows.length ? <tfoot><tr><td className="border-t border-[#ebeef5] px-3 py-3 font-medium" colSpan={2}>合计</td><td className="numeric-cell border-t border-r border-[#ebeef5] px-3 py-3">{formatCurrencyTotals(summary.amountTotalsByCurrency)}</td><td className="border-t border-r border-[#ebeef5] px-3 py-3" colSpan={6} /><td className="numeric-cell border-t border-r border-[#ebeef5] px-3 py-3">{money(summary.taxExcludedUsd)}</td><td className="numeric-cell border-t border-r border-[#ebeef5] px-3 py-3">{money(summary.taxIncludedUsd)}</td><td className="border-t border-[#ebeef5] px-3 py-3" /></tr></tfoot> : null}</table></TableScroll><PaginationBar page={entries.page} pageSize={entries.pageSize} total={entries.total} onPageChange={onPage} onPageSizeChange={onPageSize} /></Panel>;
}

function InvoiceSection({ invoices, allInvoices, pageSize, draft, editing, busy, readOnly, attachmentDescriptions, onAttachmentDescriptionChange, onUpload, onDeleteAttachment, state, onState, onPage, onPageSize, onDraftChange, onEditingChange, onAdd, onSave, onDelete }: { invoices: PagedRows; allInvoices: Invoice[]; pageSize: number; draft: Record<string, string | boolean>; editing: Record<string, Record<string, string | boolean>>; busy: boolean; readOnly: boolean; attachmentDescriptions: Record<string, string>; onAttachmentDescriptionChange: (invoiceId: string, value: string) => void; onUpload: (invoiceId: string, event: ChangeEvent<HTMLInputElement>) => void; onDeleteAttachment: (id: string) => void; state: TableState; onState: (patch: Partial<TableState>) => void; onPage: (page: number) => void; onPageSize: (pageSize: number) => void; onDraftChange: (key: string, value: string | boolean) => void; onEditingChange: (id: string, key: string, value: string | boolean) => void; onAdd: () => void; onSave: (id: string) => void; onDelete: (id: string) => void }) {
  const rows = invoices.rows as unknown as Invoice[];
  return <Panel><SectionTitle title="发票管理" action={<Button tone="primary" onClick={onAdd}><FilePlus2 size={15} />新增发票</Button>} /><InvoiceFormFields draft={draft} onChange={onDraftChange} /><TableScroll tableKey="settlement-invoices"><table className="min-w-[2500px] border-collapse text-sm"><thead className="bg-[#f5f7fa]"><tr>{columns.invoices.map((column) => <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={column.key}><ColumnHeader tableKey="invoices" column={column} rows={allInvoices as unknown as TableRow[]} state={state} onState={onState} /></th>)}<th>发票总额</th><th>发票不含税总额</th><th>税率(%)</th><th>发票税金</th><th>发票汇率</th><th>USD金额</th><th>发票附件</th><th>操作</th></tr></thead><tbody>{rows.map((invoice) => { const value = editing[invoice.id] || draftInvoice(invoice); const preview = invoiceBreakdown(invoice, value); const attachments = invoice.attachments ?? []; return <tr className="hover:bg-[#fafafa]" key={invoice.id}>{columns.invoices.map((column) => <td className="max-w-[210px] truncate whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3" key={column.key}>{editableInvoiceField(column.key) ? <InvoiceInput invoice={invoice} value={value} field={column.key} onChange={(next) => onEditingChange(invoice.id, column.key, next)} /> : formatColumnValue(column.key, invoice[column.key as keyof Invoice], column.type)}</td>)}<td className="numeric-cell border-b border-r border-[#ebeef5] px-3 py-3"><InvoiceInput invoice={invoice} value={value} field="invoiceTotal" onChange={(next) => onEditingChange(invoice.id, "invoiceTotal", next)} /></td><td className="numeric-cell border-b border-r border-[#ebeef5] px-3 py-3">{money(preview.invoiceTaxExcludedTotal)}</td><td className="numeric-cell border-b border-r border-[#ebeef5] px-3 py-3"><InvoiceInput invoice={invoice} value={value} field="taxRate" onChange={(next) => onEditingChange(invoice.id, "taxRate", next)} /></td><td className="numeric-cell border-b border-r border-[#ebeef5] px-3 py-3">{money(preview.invoiceTaxAmount)}</td><td className="numeric-cell border-b border-r border-[#ebeef5] px-3 py-3"><InvoiceInput invoice={invoice} value={value} field="exchangeRate" onChange={(next) => onEditingChange(invoice.id, "exchangeRate", next)} /></td><td className="numeric-cell border-b border-r border-[#ebeef5] px-3 py-3">{money(preview.usdAmount)}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3"><div className="space-y-2">{attachments.map((attachment) => <div className="flex max-w-[280px] items-center gap-2" key={attachment.id}><span className="min-w-0 flex-1 truncate" title={attachment.fileName}>{attachment.fileName}</span><a className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-[#1890ff] hover:text-[#147dcc]" aria-label="下载附件" title="下载附件" href={`/api/po/settlement-projects/${attachment.projectId}/invoices/${invoice.id}/attachments/${attachment.id}/download`}><Download size={15} /></a>{!readOnly ? <button className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-[#f56c6c] hover:text-[#ff4949]" type="button" aria-label="删除附件" title="删除附件" onClick={() => onDeleteAttachment(attachment.id)}><Trash2 size={15} /></button> : null}</div>)}{!readOnly ? <div className="flex items-center gap-2"><Input className="min-w-[150px]" placeholder="附件说明" value={attachmentDescriptions[invoice.id] ?? ""} onChange={(event) => onAttachmentDescriptionChange(invoice.id, event.target.value)} /><label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1 rounded border border-[#1890ff] px-3 text-sm text-[#1890ff]"><Paperclip size={15} />上传<input className="hidden" type="file" onChange={(event) => void onUpload(invoice.id, event)} /></label></div> : null}{!attachments.length && readOnly ? <span className="text-[#909399]">暂无附件</span> : null}</div></td><td className="whitespace-nowrap border-b border-[#ebeef5] px-3 py-3"><Button disabled={busy} onClick={() => onSave(invoice.id)}><Save size={14} />保存</Button><Button className="ml-2" tone="danger" disabled={busy} onClick={() => onDelete(invoice.id)}><Trash2 size={14} />删除</Button></td></tr>; })}{!rows.length ? <Empty colSpan={columns.invoices.length + 8} text="暂无发票" /> : null}</tbody></table></TableScroll><PaginationBar page={invoices.page} pageSize={invoices.pageSize} total={invoices.total} onPageChange={onPage} onPageSizeChange={onPageSize} /></Panel>;
}

function InvoiceFormFields({ draft, onChange }: { draft: Record<string, string | boolean>; onChange: (key: string, value: string | boolean) => void }) {
  const total = Number(draft.invoiceTotal || 0); const rate = Number(draft.taxRate || 0) / 100; const excluded = total / (1 + rate || 1); const tax = total - excluded;
  return <div className="grid grid-cols-1 gap-3 border-b border-[#ebeef5] bg-[#fcfcfd] p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6"><Field label="类型"><select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-2" value={String(draft.type)} onChange={(event) => onChange("type", event.target.value)}><option value="cost">成本</option><option value="income">收入</option></select></Field><Field label="账期"><Input className="w-full" type="date" value={String(draft.accountPeriod)} onChange={(event) => onChange("accountPeriod", event.target.value)} /></Field><Field label="财务记账日期"><Input className="w-full" type="date" value={String(draft.accountingDate)} onChange={(event) => onChange("accountingDate", event.target.value)} /></Field><Field label="公司主体"><Input className="w-full" value={String(draft.companyEntity)} onChange={(event) => onChange("companyEntity", event.target.value)} /></Field><Field label="发票主体"><Input className="w-full" value={String(draft.invoiceEntity)} onChange={(event) => onChange("invoiceEntity", event.target.value)} /></Field><Field label="发票日期"><Input className="w-full" type="date" value={String(draft.invoiceDate)} onChange={(event) => onChange("invoiceDate", event.target.value)} /></Field><Field label="发票号"><Input className="w-full" value={String(draft.invoiceNo)} onChange={(event) => onChange("invoiceNo", event.target.value)} /></Field><Field label="发票总额"><Input className="w-full" type="number" value={String(draft.invoiceTotal)} onChange={(event) => onChange("invoiceTotal", event.target.value)} /></Field><Field label="不含税总额"><Input className="w-full" readOnly value={money(excluded)} /></Field><Field label="税率(%)"><Input className="w-full" type="number" value={String(draft.taxRate)} onChange={(event) => onChange("taxRate", event.target.value)} /></Field><Field label="发票税金"><Input className="w-full" readOnly value={money(tax)} /></Field><Field label="发票币种"><select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-2" value={String(draft.currency)} onChange={(event) => onChange("currency", event.target.value)}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></Field><Field label="发票汇率"><Input className="w-full" type="number" value={String(draft.exchangeRate)} onChange={(event) => onChange("exchangeRate", event.target.value)} /></Field><Field label="是否支付"><Toggle checked={Boolean(draft.isPaid)} onChange={(checked) => onChange("isPaid", checked)} label="支付" /></Field><Field label="是否开票"><Toggle checked={Boolean(draft.isInvoiced)} onChange={(checked) => onChange("isInvoiced", checked)} label="开票" /></Field></div>;
}


function AttachmentSection({ attachments, description, readOnly, state, onState, onPage, onPageSize, onDescriptionChange, onUpload, onDelete }: { attachments: PagedRows; description: string; readOnly: boolean; state: TableState; onState: (patch: Partial<TableState>) => void; onPage: (page: number) => void; onPageSize: (pageSize: number) => void; onDescriptionChange: (value: string) => void; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onDelete: (id: string) => void }) {
  const rows = attachments.rows as unknown as Attachment[];
  return <Panel><SectionTitle title="附件管理" action={!readOnly ? <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded border border-[#1890ff] bg-[#1890ff] px-3 text-sm text-white"><Paperclip size={15} />上传附件<input className="hidden" type="file" onChange={onUpload} /></label> : undefined} /><div className="border-b border-[#ebeef5] p-4"><Input disabled={readOnly} placeholder="附件说明" value={description} onChange={(event) => onDescriptionChange(event.target.value)} /></div><TableScroll tableKey="settlement-attachments"><table className="min-w-[1200px] border-collapse text-sm"><thead className="bg-[#f5f7fa]"><tr>{columns.attachments.map((column) => <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={column.key}><ColumnHeader tableKey="attachments" column={column} rows={attachments.rows} state={state} onState={onState} /></th>)}<th className="border-b border-[#ebeef5] px-3 py-3 text-left font-medium">操作</th></tr></thead><tbody>{rows.map((attachment) => <tr key={attachment.id}>{columns.attachments.map((column) => <td className="max-w-[240px] truncate whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3" key={column.key}>{formatColumnValue(column.key, attachment[column.key as keyof Attachment], column.type)}</td>)}<td className="border-b border-[#ebeef5] px-3 py-3"><a className="mr-3 inline-flex items-center gap-1 text-[#1890ff]" href={`/api/po/settlement-projects/${attachment.projectId}/attachments/${attachment.id}/download`}><Download size={14} />下载</a>{!readOnly ? <button className="inline-flex items-center gap-1 text-[#f56c6c]" type="button" onClick={() => onDelete(attachment.id)}><Trash2 size={14} />删除</button> : null}</td></tr>)}{!rows.length ? <Empty colSpan={columns.attachments.length + 1} text="暂无附件" /> : null}</tbody></table></TableScroll><PaginationBar page={attachments.page} pageSize={attachments.pageSize} total={attachments.total} onPageChange={onPage} onPageSizeChange={onPageSize} /></Panel>;
}

function ColumnHeader({ tableKey, column, rows, state, onState }: { tableKey: TableKey; column: Column; rows: TableRow[]; state: TableState; onState: (patch: Partial<TableState>) => void }) {
  return <TableColumnMenu column={column} filterValues={state.filters[column.key] ?? []} sortOrder={state.sortField === column.key ? state.sortOrder : ""} loadOptions={(keyword) => Promise.resolve(filterOptions(rows, column, keyword, state.filters))} onSort={(order) => onState({ sortField: column.key, sortOrder: order })} onFilter={(values) => onState({ filters: { ...state.filters, [column.key]: values } })} />;
}

function transformRows(rows: TableRow[], state: TableState) {
  const filtered = rows.filter((row) => Object.entries(state.filters).every(([field, values]) => !values.length || values.includes(String(row[field] ?? ""))));
  if (!state.sortField || !state.sortOrder) return filtered;
  return [...filtered].sort((left, right) => compare(left[state.sortField], right[state.sortField], state.sortOrder));
}

function filterOptions(rows: TableRow[], column: Column, keyword: string, filters: Record<string, string[]> = {}) {
  const values = new Map<string, number>();
  const sourceRows = (rows as FilterRows).allRows ?? rows;
  for (const row of sourceRows) {
    if (Object.entries(filters).some(([field, selected]) => field !== column.key && selected.length > 0 && !selected.includes(String(row[field] ?? "")))) continue;
    const value = String(row[column.key] ?? "").trim();
    const label = formatColumnValue(column.key, row[column.key], column.type);
    if (!value || (keyword && !value.toLowerCase().includes(keyword.toLowerCase()) && !label.toLowerCase().includes(keyword.toLowerCase()))) continue;
    values.set(value, (values.get(value) ?? 0) + 1);
  }
  return [...values.entries()].map(([value, count]) => ({ value, label: formatColumnValue(column.key, value, column.type), count }));
}

function compare(left: unknown, right: unknown, order: TableSortOrder) {
  const a = typeof left === "number" ? left : String(left ?? ""); const b = typeof right === "number" ? right : String(right ?? ""); const result = a < b ? -1 : a > b ? 1 : 0; return order === "desc" ? -result : result;
}

function pageInfo(rows: TableRow[], requestedPage: number, pageSize: number, allRows = rows): PagedRows { const total = rows.length; const totalPages = Math.max(1, Math.ceil(total / pageSize)); const page = Math.min(Math.max(1, requestedPage), totalPages); const pageRows = rows.slice((page - 1) * pageSize, page * pageSize) as FilterRows; pageRows.allRows = allRows; return { rows: pageRows, summaryRows: rows, page, pageSize, total, totalPages }; }
function editablePurchaseField(key: string) { return ["purchaseQty", "purchaseUnitPrice", "currency", "priceType", "taxRate", "invoiceNo"].includes(key); }
function editableEntryField(key: string) { return ["type", "description", "amount", "currency", "priceType", "taxRate", "invoiceNo", "receivedAt"].includes(key); }
function editableInvoiceField(key: string) { return ["type", "accountPeriod", "accountingDate", "companyEntity", "invoiceEntity", "invoiceDate", "invoiceNo", "currency", "isPaid", "isInvoiced", "invoiceTotal", "taxRate", "exchangeRate"].includes(key); }
function formatColumnValue(key: string, value: unknown, type?: string): string { if (value === null || value === undefined || value === "") return "-"; if (key === "type") return String(value) === "income" ? "收入" : ["first_mile_freight", "customs_fee", "labor_fee", "equipment_service_fee", "other"].includes(String(value)) ? expenseLabel(String(value)) : String(value); if (key === "priceType") return String(value) === "tax_included" ? "含税价" : "未税价"; if (key === "isPaid") return value ? "已支付" : "未支付"; if (key === "isInvoiced") return value ? "已开票" : "未开票"; if (type === "money" || key === "amount" || key === "taxRate") return money(Number(value)); if (type === "number") return Number(value).toLocaleString("en-US"); if (type === "fileSize") return formatFileSize(Number(value)); if (type === "date" || key.endsWith("At") || key.endsWith("Date")) return formatDate(String(value)); return String(value); }
function previewPurchaseItem(item: Item, draft: Record<string, string>, editable: boolean) { return editable ? { ...item, ...draft, purchaseQty: Number(draft.purchaseQty || 0), purchaseUnitPrice: Number(draft.purchaseUnitPrice || 0), taxRate: Number(draft.taxRate || 0) } as Item : item; }
function purchaseBreakdown(item: Item, project: Project) { const amounts = calculateSettlementPurchaseAmounts(item, project); return { taxIncludedUsd: amounts.taxIncludedUsd, taxExcludedUsd: amounts.taxExcludedUsd }; }
function formatQuantity(value: number) { return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 }); }
function formatCurrencyTotals(amounts: Record<string, number>) { const keys = Object.keys(amounts).sort((left, right) => currencies.indexOf(left) - currencies.indexOf(right)); return keys.length ? keys.map((currency) => `${currency} ${money(amounts[currency])}`).join(" / ") : money(0); }
function entryBreakdown(entry: Expense | Sale, project: Project) { return calculateSettlementEntryAmounts(entry, project); }
function invoiceBreakdown(invoice: Invoice, value: Record<string, string | boolean>) { const total = Number(value.invoiceTotal ?? invoice.invoiceTotal) || 0; const taxRate = Number(value.taxRate ?? invoice.taxRate) || 0; const excluded = total / (1 + taxRate / 100 || 1); const tax = total - excluded; const exchangeRate = Number(value.exchangeRate ?? invoice.exchangeRate) || 1; const usdAmount = (String(value.type ?? invoice.type) === "cost" ? -1 : 1) * excluded / exchangeRate; return { invoiceTaxExcludedTotal: moneyNumber(excluded), invoiceTaxAmount: moneyNumber(tax), usdAmount: moneyNumber(usdAmount) }; }
function convertUsd(amount: number, currency: string, project?: Project) { if (currency === "USD") return moneyNumber(amount); if (currency === "MXN") return moneyNumber(amount * Number(project?.exchangeRateMxn || 1)); return moneyNumber(amount / Number(project?.exchangeRateUsd || 1)); }
function moneyNumber(value: number) { return Math.round(Number(value || 0) * 10000) / 10000; }
function draftItem(item: Item) { return { purchaseQty: String(item.purchaseQty || item.plannedQty || ""), purchaseUnitPrice: String(item.purchaseUnitPrice || ""), currency: item.currency || "USD", priceType: item.priceType || "tax_excluded", taxRate: String(item.taxRate || 0), invoiceNo: item.invoiceNo || "" }; }
function draftExpense(item: Expense) { return { type: item.type, description: item.description || "", amount: String(item.amount), currency: item.currency, priceType: item.priceType, taxRate: String(item.taxRate), invoiceNo: item.invoiceNo || "" }; }
function draftSale(item: Sale) { return { description: item.description || "", amount: String(item.amount), currency: item.currency, priceType: item.priceType, taxRate: String(item.taxRate), invoiceNo: item.invoiceNo || "", receivedAt: item.receivedAt ? String(item.receivedAt).slice(0, 10) : "" }; }
function draftInvoice(item: Invoice) { return { type: item.type, accountPeriod: item.accountPeriod || "", accountingDate: item.accountingDate || "", companyEntity: item.companyEntity || "", invoiceEntity: item.invoiceEntity || "", invoiceDate: item.invoiceDate || "", invoiceNo: item.invoiceNo || "", invoiceTotal: String(item.invoiceTotal), taxRate: String(item.taxRate), currency: item.currency, exchangeRate: String(item.exchangeRate), isPaid: item.isPaid, isInvoiced: item.isInvoiced }; }
function toExpense(value: Record<string, string>) { return { type: value.type || "other", description: value.description || "", amount: Number(value.amount || 0), currency: value.currency || "CNY", priceType: value.priceType || "tax_included", taxRate: Number(value.taxRate || 0), invoiceNo: value.invoiceNo || "" }; }
function toSale(value: Record<string, string>) { return { description: value.description || "", amount: Number(value.amount || 0), currency: value.currency || "USD", priceType: value.priceType || "tax_included", taxRate: Number(value.taxRate || 0), invoiceNo: value.invoiceNo || "", receivedAt: value.receivedAt || "" }; }
function toInvoice(value: Record<string, string | boolean>) { return { type: value.type || "cost", accountPeriod: value.accountPeriod || "", accountingDate: value.accountingDate || "", companyEntity: value.companyEntity || "", invoiceEntity: value.invoiceEntity || "", invoiceDate: value.invoiceDate || "", invoiceNo: value.invoiceNo || "", invoiceTotal: Number(value.invoiceTotal || 0), taxRate: Number(value.taxRate || 0), currency: value.currency || "CNY", exchangeRate: Number(value.exchangeRate || 1), isPaid: Boolean(value.isPaid), isInvoiced: Boolean(value.isInvoiced) }; }
function fileToDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(new Error("附件读取失败")); reader.readAsDataURL(file); }); }
function money(value: number) { return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatDate(value: string | null | undefined) { return value ? String(value).slice(0, 16).replace("T", " ") : "-"; }
function formatFileSize(value: number) { const size = Number(value || 0); return size >= 1024 * 1024 ? `${money(size / 1024 / 1024)} MB` : size >= 1024 ? `${money(size / 1024)} KB` : `${Math.round(size)} B`; }
function expenseLabel(value: string) { return ({ first_mile_freight: "头程运费", customs_fee: "清关费", labor_fee: "人力费", equipment_service_fee: "设备服务费", other: "其他" } as Record<string, string>)[value] || value; }
function statusLabel(status: string) { return ({ purchasing: "采购中", procurement_completed: "采购完成", accepting: "验收中", closed: "已完结" } as Record<string, string>)[status] || status || "-"; }
function statusClass(status: string) { return status === "closed" ? "bg-[#dcfce7] text-[#166534]" : status === "accepting" ? "bg-[#e0e7ff] text-[#4338ca]" : status === "procurement_completed" ? "bg-[#dbeafe] text-[#1d4ed8]" : "bg-[#fef3c7] text-[#92400e]"; }
function SectionTitle({ title, action }: { title: string; action?: ReactNode }) { return <div className="flex items-center border-b border-[#ebeef5] p-4"><h2 className="font-medium text-[#303133]">{title}</h2><div className="ml-auto">{action}</div></div>; }
function TableScroll({ children, tableKey }: { children: ReactNode; tableKey: string }) { return <StickyTable className="table-scroll overflow-auto" tableKey={tableKey}>{children}</StickyTable>; }
function Empty({ colSpan, text }: { colSpan: number; text: string }) { return <tr><td className="px-4 py-10 text-center text-[#909399]" colSpan={colSpan}>{text}</td></tr>; }
function Info({ label, value, link }: { label: string; value: string; link?: () => void }) { return <div><span className="block text-xs text-[#909399]">{label}</span>{link ? <button className="mt-1 font-normal text-[#1890ff] hover:underline" type="button" onClick={link}>{value}</button> : <strong className="mt-1 block font-normal text-[#303133]">{value}</strong>}</div>; }
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button className={`border-b-2 px-4 py-3 text-sm ${active ? "border-[#1890ff] text-[#1890ff]" : "border-transparent text-[#606266]"}`} type="button" onClick={onClick}>{children}</button>; }
function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) { return <div className="min-w-0"><span className="mb-1 block text-xs text-[#606266]">{label}{required ? <span className="ml-0.5 text-[#f56c6c]">*</span> : null}</span>{children}</div>; }
function PriceType({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <select className="h-9 rounded border border-[#dcdfe6] bg-white px-2" value={value} onChange={(event) => onChange(event.target.value)}><option value="tax_excluded">未税价</option><option value="tax_included">含税价</option></select>; }

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <button className="inline-flex h-9 items-center gap-2 rounded border border-[#dcdfe6] bg-white px-2.5 text-sm text-[#606266]" type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}><span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? "bg-[#67c23a]" : "bg-[#c0c4cc]"}`}><span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} /></span><span>{checked ? `已${label}` : `未${label}`}</span></button>;
}

function PurchaseInput({ item, draft, field, onChange }: { item: Item; draft: Record<string, string>; field: string; onChange: (value: string) => void }) {
  if (["purchaseQty", "purchaseUnitPrice", "taxRate"].includes(field)) return <Input className="min-w-[92px]" type="number" value={draft[field] || ""} onChange={(event) => onChange(event.target.value)} />;
  if (field === "currency") return <select className="h-9 rounded border border-[#dcdfe6] bg-white px-2" value={draft.currency || item.currency} onChange={(event) => onChange(event.target.value)}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select>;
  if (field === "priceType") return <PriceType value={draft.priceType || item.priceType} onChange={onChange} />;
  if (field === "invoiceNo") return <Input className="min-w-[120px]" value={draft.invoiceNo || ""} onChange={(event) => onChange(event.target.value)} />;
  return <span>{formatColumnValue(field, item[field as keyof Item], undefined)}</span>;
}

function EntryInput({ entry, value, field, kind, onChange }: { entry: Expense | Sale; value: Record<string, string>; field: string; kind: "expense" | "sale"; onChange: (value: string) => void }) {
  if (["amount", "taxRate"].includes(field)) return <Input type="number" value={value[field] || ""} onChange={(event) => onChange(event.target.value)} />;
  if (field === "currency") return <select className="h-9 rounded border border-[#dcdfe6]" value={value.currency} onChange={(event) => onChange(event.target.value)}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select>;
  if (field === "priceType") return <PriceType value={value.priceType} onChange={onChange} />;
  if (field === "type" && kind === "expense") return <select className="h-9 rounded border border-[#dcdfe6]" value={value.type} onChange={(event) => onChange(event.target.value)}><option value="first_mile_freight">头程运费</option><option value="customs_fee">清关费</option><option value="labor_fee">人力费</option><option value="equipment_service_fee">设备服务费</option><option value="other">其他</option></select>;
  if (field === "receivedAt") return <Input type="date" value={value.receivedAt || ""} onChange={(event) => onChange(event.target.value)} />;
  return <Input value={value[field] || ""} onChange={(event) => onChange(event.target.value)} />;
}

function InvoiceInput({ invoice, value, field, onChange }: { invoice: Invoice; value: Record<string, string | boolean>; field: string; onChange: (value: string | boolean) => void }) {
  if (field === "type") return <select className="h-9 rounded border border-[#dcdfe6]" value={String(value.type)} onChange={(event) => onChange(event.target.value)}><option value="cost">成本</option><option value="income">收入</option></select>;
  if (field === "currency") return <select className="h-9 rounded border border-[#dcdfe6]" value={String(value.currency || invoice.currency)} onChange={(event) => onChange(event.target.value)}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select>;
  if (field === "isPaid") return <Toggle checked={Boolean(value.isPaid)} onChange={(checked) => onChange(checked)} label="支付" />;
  if (field === "isInvoiced") return <Toggle checked={Boolean(value.isInvoiced)} onChange={(checked) => onChange(checked)} label="开票" />;
  if (["accountPeriod", "accountingDate", "invoiceDate"].includes(field)) return <Input type="date" value={String(value[field] || "").slice(0, 10)} onChange={(event) => onChange(event.target.value)} />;
  return <Input value={String(value[field] ?? "")} onChange={(event) => onChange(event.target.value)} />;
}
