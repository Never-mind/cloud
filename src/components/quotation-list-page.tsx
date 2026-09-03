"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, Edit3, Eye, FileDown, FileUp, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { formatDisplayValue } from "@/lib/display-format";
import { summarizeQuotationDetails } from "@/lib/quotation-detail-summary";
import { postWorkspaceMessage } from "@/lib/tab-workspace";
import type { EntityConfig, EntityField } from "@/lib/modules";
import { PaginationBar } from "./pagination-bar";
import { StickyTable } from "./sticky-table";
import { TableColumnMenu, type TableFilterOption, type TableSortOrder } from "./table-column-menu";
import { StatusTag } from "./status-tag";
import { AuditInfoBar, Button, Input, Panel, Textarea } from "./ui";
import { ProductMasterPicker } from "./customer-po-page";

type Value = string | number | boolean | null | undefined;
type Row = Record<string, Value>;
type QuotationListResponse = { rows?: Row[]; total?: number; page?: number; statusCounts?: Record<string, number>; error?: string };
type QuotationImportReport = { total: number; success: number; failed: Array<{ rowNumber: number; primaryKey: string; error: string }> };
type QuotationItemDrafts = Record<string, Row>;

const editableQuotationItemKeys = new Set([
  "productCode",
  "quantity",
  "purchaseCurrency",
  "purchaseUnitPrice",
  "transportType",
  "isCustomsClearance",
  "enableNom",
  "markupRate",
  "unitPrice",
]);

const itemFields: EntityField[] = [
  { key: "lineNo", label: "行号", type: "number", sortable: true, filterable: true },
  { key: "productCode", label: "产品编码", sortable: true, filterable: true },
  { key: "productName", label: "产品名称", sortable: true, filterable: true },
  { key: "brand", label: "品牌", sortable: true, filterable: true },
  { key: "quantity", label: "采购数量", type: "number", sortable: true, filterable: true },
  { key: "purchaseCurrency", label: "采购币种", sortable: true, filterable: true },
  { key: "purchaseUnitPrice", label: "不含税采购单价", type: "money", sortable: true, filterable: true },
  { key: "purchaseTotalOriginal", label: "不含税采购总价（原币）", type: "money", sortable: true, filterable: true },
  { key: "purchaseTotalUsd", label: "不含税采购总价（USD）", type: "money", sortable: true, filterable: true },
  { key: "transportType", label: "运输方式", sortable: true, filterable: true },
  { key: "isCustomsClearance", label: "是否清关", type: "boolean", sortable: true, filterable: true },
  { key: "enableNom", label: "是否NOM认证", type: "boolean", sortable: true, filterable: true },
  { key: "firstMileFreightUsd", label: "头程运费（USD）", type: "money", sortable: true, filterable: true },
  { key: "cifUsd", label: "CIF（USD）", type: "money", sortable: true, filterable: true },
  { key: "tariffRate", label: "关税税率（%）", type: "number", sortable: true, filterable: true },
  { key: "tariffUsd", label: "关税金额（USD）", type: "money", sortable: true, filterable: true },
  { key: "capitalCostUsd", label: "资金成本（USD）", type: "money", sortable: true, filterable: true },
  { key: "customsFeeUsd", label: "清关手续费（USD）", type: "money", sortable: true, filterable: true },
  { key: "nomFeeUsd", label: "NOM认证费（USD）", type: "money", sortable: true, filterable: true },
  { key: "publicFeeAllocationUsd", label: "公共费用分摊（USD）", type: "money", sortable: true, filterable: true },
  { key: "ddpTotalUsd", label: "到仓总价（USD）", type: "money", sortable: true, filterable: true },
  { key: "ddpUnitPriceUsd", label: "到仓单价（USD）", type: "money", sortable: true, filterable: true },
  { key: "markupRate", label: "加价率（%）", type: "number", sortable: true, filterable: true },
  { key: "historicalDdpQuoteUsd", label: "历史参考报价（USD）", type: "money", sortable: true, filterable: true },
  { key: "unitPrice", label: "DDP不含税单价（USD）", type: "money", sortable: true, filterable: true },
  { key: "amount", label: "DDP不含税总价（USD）", type: "money", sortable: true, filterable: true },
  { key: "operatingProfitUsd", label: "利润（USD）", type: "money", sortable: true, filterable: true },
  { key: "grossMarginRate", label: "毛利率", type: "percentage", sortable: true, filterable: true },
  { key: "remark", label: "备注" },
];

const detailSummaryFields: EntityField[] = [
  { key: "projectName", label: "项目名称" },
  { key: "customerName", label: "客户" },
  { key: "contractingUnitName", label: "承接单位" },
  { key: "sourcePoNo", label: "来源客户PO" },
  { key: "currency", label: "币种" },
  { key: "exchangeRateUsd", label: "人民币兑美元汇率" },
  { key: "exchangeRateMxn", label: "墨西哥比索兑美元汇率" },
  { key: "capitalCostRate", label: "资金成本率（%）" },
  { key: "accountPeriod", label: "账期（月）" },
  { key: "badDebtRate", label: "坏账率（%）" },
  { key: "customsFeeRate", label: "清关手续费率（%）" },
  { key: "vatOverseas", label: "海外增值税率（%）" },
  { key: "markupRate", label: "加价率（%）" },
  { key: "seaFreightRate", label: "海运费（CNY/立方米）", type: "money" },
  { key: "airFreightRate", label: "空运费（CNY/kg）", type: "money" },
  { key: "nomFee", label: "NOM认证费（USD）", type: "money" },
  { key: "customsMiscFee", label: "清关杂费（USD）", type: "money" },
  { key: "lastMileFee", label: "尾程费（USD）", type: "money" },
  { key: "storageOperationFee", label: "仓储操作费（USD）", type: "money" },
  { key: "implementationFee", label: "实施费（USD）", type: "money" },
  { key: "status", label: "状态" },
];


const editableQuotationFields: EntityField[] = [
  { key: "exchangeRateUsd", label: "人民币兑美元汇率" },
  { key: "exchangeRateMxn", label: "墨西哥比索兑美元汇率" },
  { key: "capitalCostRate", label: "资金成本率（%）" },
  { key: "accountPeriod", label: "账期（月）" },
  { key: "badDebtRate", label: "坏账率（%）" },
  { key: "customsFeeRate", label: "清关手续费率（%）" },
  { key: "vatOverseas", label: "海外增值税率（%）" },
  { key: "markupRate", label: "加价率（%）" },
  { key: "seaFreightRate", label: "海运费（CNY/立方米）" },
  { key: "airFreightRate", label: "空运费（CNY/kg）" },
  { key: "nomFee", label: "NOM认证费（USD）" },
  { key: "customsMiscFee", label: "清关杂费（USD）" },
  { key: "lastMileFee", label: "尾程费（USD）" },
  { key: "storageOperationFee", label: "仓储操作费（USD）" },
  { key: "implementationFee", label: "实施费（USD）" },
];

export function QuotationListPage({ config }: { config: EntityConfig }) {
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState({ draft: 0, confirmed: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState("");
  const [sortOrder, setSortOrder] = useState<TableSortOrder>("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        keyword: appliedKeyword,
      });
      if (status) params.set("status", status);
      if (sortField && sortOrder) {
        params.set("sortField", sortField);
        params.set("sortOrder", sortOrder);
      }
      for (const [field, values] of Object.entries(columnFilters)) {
        for (const value of values) params.append(`filter.${field}`, value);
      }
      const response = await fetch(`/api/entities/quotations?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as QuotationListResponse;
      if (!response.ok) throw new Error(data.error ?? "报价列表加载失败");
      setRows(data.rows ?? []);
      setTotal(Number(data.total ?? 0));
      setStatusCounts({
        draft: Number(data.statusCounts?.draft ?? 0),
        confirmed: Number(data.statusCounts?.confirmed ?? 0),
      });
      if (Number(data.page ?? page) !== page) setPage(Number(data.page ?? page));
    } catch (loadError) {
      setRows([]);
      setTotal(0);
      setError(loadError instanceof Error ? loadError.message : "报价列表加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function deleteQuotation(id: string, quotationNo: string) {
    if (!window.confirm(`确认删除报价单 ${quotationNo || ""}？删除后会同步删除报价明细。`)) return;
    setError("");
    try {
      const response = await fetch(`/api/entities/quotations/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "报价单删除失败");
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "报价单删除失败");
    }
  }

  useEffect(() => { void load(); }, [appliedKeyword, columnFilters, page, pageSize, sortField, sortOrder, status]);

  function openRoute(route: string, title: string) {
    postWorkspaceMessage({ type: "cloud-power:open-tab", route, title });
  }

  async function loadOptions(field: string, optionKeyword: string): Promise<TableFilterOption[]> {
    const params = new URLSearchParams({ field });
    if (optionKeyword.trim()) params.set("keyword", optionKeyword.trim());
    if (status) params.set("status", status);
    if (appliedKeyword) params.set("keyword", appliedKeyword);
    for (const [key, values] of Object.entries(columnFilters)) {
      if (key === field) continue;
      for (const value of values) params.append(`filter.${key}`, value);
    }
    const response = await fetch(`/api/entities/quotations/filter-options?${params.toString()}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "报价筛选候选值加载失败");
    return (data.options ?? []) as TableFilterOption[];
  }

  function download(path: string) {
    const link = document.createElement("a");
    link.href = path;
    link.download = "";
    link.click();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-medium text-[#303133]">报价列表</h1>
          <p className="mt-1 text-sm text-[#909399]">报价单主单与报价产品明细。</p>
        </div>
      </div>
      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#ebeef5] bg-[#fafafa] p-3">
          {[
            ["draft", "草稿", statusCounts.draft],
            ["confirmed", "已确认", statusCounts.confirmed],
          ].map(([value, label, count]) => (
            <Button
              key={value}
              tone={status === value ? "primary" : "default"}
              className="h-8 px-3"
              onClick={() => { setPage(1); setStatus((current) => current === value ? "" : String(value)); }}
            >
              {label}
              <span className={`ml-1 rounded px-1.5 text-xs ${status === value ? "bg-white/30" : "bg-[#f4f4f5] text-[#909399]"}`}>{count}</span>
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#ebeef5] p-3">
          <div className="flex min-w-[260px] max-w-xl flex-1 gap-2">
            <span className="sr-only">搜索报价单</span>
            <Input className="h-8 w-full" value={keyword} placeholder="搜索报价单号、客户、承接单位或来源PO" onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setPage(1); setAppliedKeyword(keyword.trim()); } }} />
          </div>
          <Button tone="primary" className="h-8 px-3" aria-label="查询" title="查询" onClick={() => { setPage(1); setAppliedKeyword(keyword.trim()); }}><Search size={14} />查询</Button>
          <Button className="h-8 px-3" onClick={() => void load()} disabled={loading}><RefreshCw size={14} />刷新</Button>
          <Button tone="warning" className="h-8 px-3" onClick={() => download(`/api/entities/quotations/export?status=${encodeURIComponent(status)}`)}><FileDown size={14} />导出 Excel</Button>
        </div>
        {error ? <div className="border-b border-[#fde2e2] bg-[#fef0f0] px-4 py-3 text-sm text-[#f56c6c]">{error}</div> : null}
        <StickyTable className="table-scroll overflow-auto" tableKey="quotation-list">
          <table className="min-w-[1500px] border-collapse text-sm">
            <thead className="bg-[#f5f7fa] text-[#303133]"><tr>
              {config.listFields.map((field) => (
                <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={field.key}>
                  <TableColumnMenu column={field} filterValues={columnFilters[field.key] ?? []} loadOptions={(optionKeyword) => loadOptions(field.key, optionKeyword)} onFilter={(values) => { setPage(1); setColumnFilters((current) => ({ ...current, [field.key]: values })); }} onSort={(order) => { setPage(1); setSortField(field.key); setSortOrder(order); }} sortOrder={sortField === field.key ? sortOrder : ""} />
                </th>
              ))}
              <th className="sticky right-0 border-b border-[#ebeef5] bg-[#f5f7fa] px-3 py-3 text-left font-medium">操作</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td className="px-4 py-12 text-center text-[#909399]" colSpan={config.listFields.length + 1}>加载中...</td></tr> : null}
              {!loading && rows.map((row) => {
                const id = String(row[config.primaryKey] ?? "");
                return <tr className="hover:bg-[#fafafa]" key={id}>
                  {config.listFields.map((field, index) => <td className="max-w-[250px] truncate whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3" key={field.key}>
                    {index === 0 ? <button className="text-[#1890ff] hover:underline" type="button" onClick={() => openRoute(`/quotation/list/${encodeURIComponent(id)}?returnTo=%2Fquotation%2Flist`, "报价单明细")}>{formatQuotationValue(row[field.key], field.type)}</button> : field.key === "status" ? <StatusTag status={String(row[field.key] ?? "draft")} label={formatQuotationValue(row[field.key], field.type)} /> : formatQuotationValue(row[field.key], field.type)}
                  </td>)}
                  <td className="sticky right-0 whitespace-nowrap border-b border-[#ebeef5] bg-white px-3 py-3">
                    <button className="inline-flex h-8 w-8 items-center justify-center text-[#606266] hover:text-[#1890ff]" type="button" aria-label="查看" title="查看" onClick={() => openRoute(`/quotation/list/${encodeURIComponent(id)}?returnTo=%2Fquotation%2Flist`, "报价单明细")}><Eye size={16} /></button>
                    <button className="ml-2 inline-flex h-8 w-8 items-center justify-center text-[#606266] hover:text-[#1890ff]" type="button" aria-label="导出" title="导出报价单" onClick={() => download(`/api/entities/quotations/export?filter.quotationNo=${encodeURIComponent(String(row.quotationNo ?? ""))}`)}><FileDown size={16} /></button>
                    {String(row.status ?? "draft") !== "confirmed" ? <button className="ml-2 inline-flex h-8 w-8 items-center justify-center text-[#f56c6c] hover:text-[#ff4949]" type="button" aria-label="删除" title="删除草稿" onClick={() => void deleteQuotation(id, String(row.quotationNo ?? ""))}><Trash2 size={16} /></button> : null}
                  </td>
                </tr>;
              })}
              {!loading && !rows.length ? <tr><td className="px-4 py-12 text-center text-[#909399]" colSpan={config.listFields.length + 1}>暂无报价单</td></tr> : null}
            </tbody>
          </table>
        </StickyTable>
        <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(next) => { setPage(1); setPageSize(next); }} />
      </Panel>
    </div>
  );
}

export function QuotationDetailPage({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.startsWith("/") ? searchParams.get("returnTo")! : "/quotation/list";
  const [quotation, setQuotation] = useState<Row | null>(null);
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Row>({});
  const [itemDrafts, setItemDrafts] = useState<QuotationItemDrafts>({});
  const [itemFilters, setItemFilters] = useState<Record<string, string[]>>({});
  const [itemSortField, setItemSortField] = useState("");
  const [itemSortOrder, setItemSortOrder] = useState<TableSortOrder>("");
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<QuotationImportReport | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [masterResponse, itemRows] = await Promise.all([
        fetch(`/api/entities/quotations/${encodeURIComponent(id)}`, { cache: "no-store" }),
        fetchAllQuotationItems(id),
      ]);
      const master = await masterResponse.json().catch(() => ({}));
      if (!masterResponse.ok) throw new Error(master.error ?? "报价单详情加载失败");
      setQuotation(master);
      setItems(itemRows);
    } catch (loadError) {
      setQuotation(null);
      setItems([]);
      setError(loadError instanceof Error ? loadError.message : "报价单详情加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [id]);

  async function confirmQuotation() {
    if (confirming) return;
    setConfirming(true);
    setError("");
    try {
      const response = await fetch(`/api/po/quotations/${encodeURIComponent(id)}/confirm`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "确认报价单失败");
      await load();
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "确认报价单失败");
    } finally {
      setConfirming(false);
    }
  }

  function startEditing() {
    setDraft({ ...(quotation ?? {}) });
    setItemDrafts(Object.fromEntries(items.map((item) => [String(item.id), {
      productCode: item.productCode ?? "",
      productName: item.productName ?? "",
      brand: item.brand ?? "",
      productMasterId: item.productMasterId ?? null,
      productModelId: item.productModelId ?? null,
      productSpecId: item.productSpecId ?? null,
      tariffRate: item.tariffRate ?? 0,
      quantity: item.quantity ?? "",
      purchaseCurrency: item.purchaseCurrency ?? "",
      purchaseUnitPrice: item.purchaseUnitPrice ?? "",
      transportType: item.transportType ?? "sea",
      isCustomsClearance: toBooleanValue(item.isCustomsClearance),
      enableNom: toBooleanValue(item.enableNom),
      markupRate: item.markupRate ?? quotation?.markupRate ?? "",
      unitPrice: item.unitPrice ?? "",
      pricingMode: item.ddpQuoteUnitUsd === null || item.ddpQuoteUnitUsd === undefined ? "markup" : "unitPrice",
    }])));
    setEditing(true);
    setError("");
  }

  function cancelEditing() {
    setEditing(false);
    setDraft({});
    setItemDrafts({});
  }

  async function saveQuotation() {
    if (!quotation || saving) return;
    setSaving(true);
    setError("");
    try {
      const masterResponse = await fetch(`/api/entities/quotations/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...quotation, ...draft, status: quotation.status }),
      });
      const masterData = await masterResponse.json().catch(() => ({}));
      if (!masterResponse.ok) throw new Error(masterData.error ?? "报价单保存失败");
      for (const item of items) {
        const itemId = String(item.id ?? "");
        const rawDraft = itemDrafts[itemId] ?? {};
        const productCode = String(rawDraft.productCode ?? item.productCode ?? "").trim();
        const quantity = Number(rawDraft.quantity ?? item.quantity ?? 0);
        const purchaseUnitPrice = Number(rawDraft.purchaseUnitPrice ?? item.purchaseUnitPrice ?? 0);
        const transportType = String(rawDraft.transportType ?? item.transportType ?? "sea");
        if (!productCode) throw new Error(`行号${String(item.lineNo ?? "")}的产品编码不能为空`);
        if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`行号${String(item.lineNo ?? "")}的采购数量必须为大于0的整数`);
        if (!Number.isFinite(purchaseUnitPrice) || purchaseUnitPrice < 0) throw new Error(`行号${String(item.lineNo ?? "")}的不含税采购单价不能小于0`);
        if (!["air", "sea", "none"].includes(transportType)) throw new Error(`行号${String(item.lineNo ?? "")}的运输方式无效`);
        const rawMarkupRate = rawDraft.markupRate;
        const markupRate = rawMarkupRate === "" || rawMarkupRate === null || rawMarkupRate === undefined
          ? Number(item.markupRate ?? quotation.markupRate ?? 0)
          : Number(rawMarkupRate);
        if (!Number.isFinite(markupRate) || markupRate < -100) throw new Error(`行号${String(item.lineNo ?? "")}的加价率不能小于-100%`);
        const rawUnitPrice = rawDraft.unitPrice;
        const unitPrice = rawUnitPrice === "" || rawUnitPrice === null || rawUnitPrice === undefined ? null : Number(rawUnitPrice);
        const pricingMode = String(rawDraft.pricingMode ?? "markup");
        if (pricingMode === "unitPrice" && (unitPrice === null || !Number.isFinite(unitPrice) || unitPrice < 0)) {
          throw new Error(`行号${String(item.lineNo ?? "")}的DDP不含税单价不能小于0`);
        }
        const response = await fetch(`/api/entities/quotation-items/${encodeURIComponent(itemId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...item,
            ...rawDraft,
            productCode,
            quantity,
            purchaseCurrency: String(rawDraft.purchaseCurrency ?? item.purchaseCurrency ?? "CNY").trim() || "CNY",
            purchaseUnitPrice,
            transportType,
            isCustomsClearance: toBooleanValue(rawDraft.isCustomsClearance),
            enableNom: toBooleanValue(rawDraft.enableNom),
            markupRate,
            unitPrice: unitPrice ?? item.unitPrice ?? 0,
            ddpQuoteUnitUsd: pricingMode === "unitPrice" ? unitPrice : null,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "报价明细保存失败");
      }
      cancelEditing();
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "报价单保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function importQuotationItems(file: File) {
    if (importing) return;
    setImporting(true);
    setError("");
    setImportReport(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/po/quotations/${encodeURIComponent(id)}/items/import`, { method: "POST", body: formData });
      const data = await response.json().catch(() => ({})) as QuotationImportReport & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "报价明细导入失败");
      setImportReport(data);
      if (data.success > 0) {
        // The import endpoint persists and recalculates rows immediately. Clear any
        // stale edit drafts so a later save cannot overwrite the imported values.
        setEditing(false);
        setDraft({});
        setItemDrafts({});
        await load();
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "报价明细导入失败");
    } finally {
      setImporting(false);
    }
  }

  const visibleItems = useMemo(() => {
    const filtered = items.filter((row) => Object.entries(itemFilters).every(([field, values]) => !values.length || values.includes(String(row[field] ?? ""))));
    if (!itemSortField || !itemSortOrder) return filtered;
    return [...filtered].sort((left, right) => compareValues(left[itemSortField], right[itemSortField], itemSortOrder));
  }, [itemFilters, itemSortField, itemSortOrder, items]);

  function loadItemOptions(field: string, keyword: string) {
    const counts = new Map<string, number>();
    for (const row of items) {
      const value = String(row[field] ?? "").trim();
      if (!value || (keyword && !value.toLowerCase().includes(keyword.toLowerCase()))) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return Promise.resolve(Array.from(counts, ([value, count]) => ({ value, label: formatQuotationValue(value, itemFields.find((fieldConfig) => fieldConfig.key === field)?.type), count })));
  }

  function updateItemDraft(itemId: string, field: string, value: Value) {
    setItemDrafts((current) => ({ ...current, [itemId]: { ...(current[itemId] ?? {}), [field]: value } }));
  }

  function updatePricingDraft(itemId: string, field: "markupRate" | "unitPrice", value: Value) {
    const item = items.find((row) => String(row.id ?? "") === itemId);
    const warehouseUnitPrice = Number(item?.ddpUnitPriceUsd ?? 0);
    const parsed = value === "" || value === null || value === undefined ? null : Number(value);
    const hasNumber = parsed !== null && Number.isFinite(parsed);
    const nextValues: Row = { [field]: value, pricingMode: field === "unitPrice" ? "unitPrice" : "markup" };

    if (field === "markupRate") {
      nextValues.unitPrice = hasNumber ? Number((warehouseUnitPrice * (1 + parsed / 100)).toFixed(4)) : "";
    } else if (hasNumber) {
      nextValues.markupRate = warehouseUnitPrice > 0
        ? Number(((parsed / warehouseUnitPrice - 1) * 100).toFixed(4))
        : "";
    } else {
      nextValues.markupRate = "";
    }

    setItemDrafts((current) => ({
      ...current,
      [itemId]: { ...(current[itemId] ?? {}), ...nextValues },
    }));
  }

  function renderItemValue(row: Row, field: EntityField) {
    const itemId = String(row.id ?? "");
    const itemDraft = itemDrafts[itemId];
    const value = itemDraft && Object.prototype.hasOwnProperty.call(itemDraft, field.key)
      ? itemDraft[field.key]
      : row[field.key] ?? "";
    if (!editing) return formatQuotationValue(row[field.key], field.type);
    if (!editableQuotationItemKeys.has(field.key)) {
      const followsProduct = ["productName", "brand", "tariffRate"].includes(field.key) && itemDraft && Object.prototype.hasOwnProperty.call(itemDraft, field.key);
      return formatQuotationValue(followsProduct ? value : row[field.key], field.type);
    }
    if (field.key === "productCode") {
      return <ProductMasterPicker
        disabled={false}
        value={String(value ?? "")}
        label={String(itemDraft?.productName ?? row.productName ?? "")}
        onChange={(product) => {
          updateItemDraft(itemId, "productCode", product?.productCode ?? "");
          updateItemDraft(itemId, "productName", product?.productName ?? "");
          updateItemDraft(itemId, "brand", product?.brand ?? "");
          updateItemDraft(itemId, "productMasterId", product?.productMasterId ?? null);
          updateItemDraft(itemId, "productModelId", product?.productModelId ?? null);
          updateItemDraft(itemId, "productSpecId", product?.productSpecId ?? null);
          updateItemDraft(itemId, "tariffRate", product?.tariffRate ?? 0);
          updateItemDraft(itemId, "enableNom", toBooleanValue(product?.needNom));
        }}
      />;
    }
    if (field.key === "transportType") {
      return <select className="h-8 w-28 border border-[#dcdfe6] bg-white px-2 text-sm" value={String(value)} onChange={(event) => updateItemDraft(itemId, field.key, event.target.value)}><option value="air">空运</option><option value="sea">海运</option><option value="none">无运输</option></select>;
    }
    if (field.key === "isCustomsClearance" || field.key === "enableNom") {
      return <select className="h-8 w-24 border border-[#dcdfe6] bg-white px-2 text-sm" value={toBooleanValue(value) ? "1" : "0"} onChange={(event) => updateItemDraft(itemId, field.key, event.target.value === "1")}><option value="0">否</option><option value="1">是</option></select>;
    }
    const type = ["quantity", "purchaseUnitPrice", "markupRate", "unitPrice"].includes(field.key) ? "number" : "text";
    const step = field.key === "quantity" ? "1" : type === "number" ? "0.0001" : undefined;
    if (field.key === "markupRate" || field.key === "unitPrice") {
      return <Input className="h-8 w-32" type="number" min={field.key === "markupRate" ? "-100" : "0"} step={step} value={String(value)} onChange={(event) => updatePricingDraft(itemId, field.key as "markupRate" | "unitPrice", event.target.value)} />;
    }
    return <Input className={type === "number" ? "h-8 w-32" : "h-8 w-40"} type={type} min={field.key === "quantity" ? "1" : undefined} step={step} value={String(value)} onChange={(event) => updateItemDraft(itemId, field.key, event.target.value)} />;
  }

  if (loading) return <div className="p-5 text-sm text-[#909399]">加载中...</div>;
  if (!quotation) return <div className="space-y-4 p-5"><Button onClick={() => postWorkspaceMessage({ type: "cloud-power:route", route: returnTo, title: "报价列表" })}><ArrowLeft size={15} />返回报价列表</Button><Panel><div className="p-6 text-sm text-[#f56c6c]">{error || "报价单不存在"}</div></Panel></div>;

  const totalQuantity = items.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
  const quotationSummary = summarizeQuotationDetails(visibleItems);
  const summaryCards = [
    { label: "总数量", value: formatQuotationValue(totalQuantity, "number") },
    { label: "公共费用合计（USD）", value: formatQuotationValue(quotation.publicFeeTotal, "money") },
    { label: "CIF合计（USD）", value: formatQuotationValue(quotation.totalCifUsd, "money") },
    { label: "到仓总价（USD）", value: formatQuotationValue(quotation.totalDdpUsd, "money") },
    { label: "收入合计（USD）", value: formatQuotationValue(quotation.totalRevenueUsd ?? quotation.totalAmount, "money") },
    { label: "利润合计（USD）", value: formatQuotationValue(quotation.totalProfit ?? quotation.totalProfitUsd, "money") },
    { label: "综合毛利率", value: formatQuotationValue(quotation.grossMarginRate, "percentage") },
  ];
  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => postWorkspaceMessage({ type: "cloud-power:route", route: returnTo, title: "报价列表" })}><ArrowLeft size={15} />返回报价列表</Button>
        <div className="mr-auto"><h1 className="text-xl font-medium text-[#303133]">{String(quotation.quotationNo ?? "报价单详情")}</h1><p className="mt-1 text-sm text-[#909399]">报价单主单与产品明细。</p></div>
        {String(quotation.status ?? "") === "draft" ? <>{editing ? <><Button onClick={cancelEditing} disabled={saving}><X size={15} />取消</Button><Button tone="primary" onClick={() => void saveQuotation()} disabled={saving}><Save size={15} />{saving ? "保存中..." : "保存"}</Button></> : <Button onClick={startEditing}><Edit3 size={15} />修改</Button>}<Button tone="success" disabled={confirming || editing} onClick={() => void confirmQuotation()}><CheckCircle2 size={15} />{confirming ? "确认中" : "确认报价单"}</Button></> : null}
        {String(quotation.status ?? "") === "draft" ? <>
          <Button onClick={() => { const link = document.createElement("a"); link.href = `/api/po/quotations/${encodeURIComponent(id)}/items/template`; link.download = ""; link.click(); }}><Download size={15} />下载明细模板</Button>
          <Button onClick={() => importInputRef.current?.click()} disabled={importing}><FileUp size={15} />{importing ? "导入中..." : "导入明细"}</Button>
          <input ref={importInputRef} className="hidden" type="file" accept=".xlsx,.xls" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importQuotationItems(file); }} />
        </> : null}
        <Button onClick={() => { const link = document.createElement("a"); link.href = `/api/po/quotations/${encodeURIComponent(id)}/items/export`; link.download = ""; link.click(); }}><FileDown size={15} />导出明细</Button>
        <Button onClick={() => { const link = document.createElement("a"); link.href = `/api/entities/quotations/export?filter.quotationNo=${encodeURIComponent(String(quotation.quotationNo ?? ""))}`; link.download = ""; link.click(); }}><FileDown size={15} />导出主单</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {summaryCards.map((card) => <div className="min-w-0 min-h-[84px] rounded border border-[#d9e2ec] bg-white px-4 py-3 shadow-sm" key={card.label}><div className="truncate text-xs text-[#909399]" title={card.label}>{card.label}</div><div className="mt-2 truncate text-xl font-semibold text-[#303133]" title={card.value}>{card.value}</div></div>)}
      </div>
      {error ? <div className="border border-[#fde2e2] bg-[#fef0f0] px-4 py-3 text-sm text-[#f56c6c]">{error}</div> : null}
      {importReport ? <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-[#ebeef5] px-4 py-3 text-sm"><strong>导入结果</strong><span className="text-[#606266]">共 {importReport.total} 条，成功 {importReport.success} 条，失败 {importReport.failed.length} 条</span><button className="ml-auto text-[#909399] hover:text-[#303133]" type="button" aria-label="关闭导入结果" title="关闭" onClick={() => setImportReport(null)}><X size={16} /></button></div>
        {importReport.failed.length ? <div className="overflow-auto"><table className="w-full border-collapse text-sm"><thead className="bg-[#f5f7fa]"><tr><th className="border-b border-r border-[#ebeef5] px-3 py-2 text-left">Excel行号</th><th className="border-b border-r border-[#ebeef5] px-3 py-2 text-left">匹配标识</th><th className="border-b border-[#ebeef5] px-3 py-2 text-left">失败原因</th></tr></thead><tbody>{importReport.failed.map((failure) => <tr key={`${failure.rowNumber}-${failure.primaryKey}-${failure.error}`}><td className="border-b border-r border-[#ebeef5] px-3 py-2">{failure.rowNumber}</td><td className="border-b border-r border-[#ebeef5] px-3 py-2">{failure.primaryKey || "-"}</td><td className="border-b border-[#ebeef5] px-3 py-2 text-[#f56c6c]">{failure.error}</td></tr>)}</tbody></table></div> : null}
      </Panel> : null}
      {editing ? <Panel>
        <div className="border-b border-[#ebeef5] px-4 py-3 font-medium text-[#303133]">报价参数</div>
        <div className="grid gap-3 p-4 md:grid-cols-4 lg:grid-cols-6">
          {editableQuotationFields.map((field) => <label key={field.key}><span className="mb-1 block text-xs text-[#606266]">{field.label}</span><Input className="w-full" type="number" step="0.0001" value={String(draft[field.key] ?? "")} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value === "" ? null : Number(event.target.value) }))} /></label>)}
          <label className="md:col-span-3 lg:col-span-4"><span className="mb-1 block text-xs text-[#606266]">备注</span><Textarea className="w-full" value={String(draft.remark ?? "")} onChange={(event) => setDraft((current) => ({ ...current, remark: event.target.value }))} /></label>
        </div>
      </Panel> : null}
      <Panel>
        <div className="border-b border-[#ebeef5] px-4 py-3 font-medium text-[#303133]">报价参数</div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-8">
          {detailSummaryFields.map((field) => <div className="min-w-0 min-h-[66px] rounded border border-[#d9e2ec] bg-[#f8fafc] px-3 py-2.5" key={field.key}><div className="break-words text-xs leading-5 text-[#909399]">{field.label}</div><div className="mt-1 break-words text-sm font-semibold text-[#303133]">{formatQuotationValue(quotation[field.key], field.type, ["exchangeRateUsd", "exchangeRateMxn", "badDebtRate"].includes(field.key))}</div></div>)}
        </div>
      </Panel>
      <Panel>
        <div className="flex items-center border-b border-[#ebeef5] p-4"><div><h2 className="font-medium text-[#303133]">报价明细</h2><p className="mt-1 text-xs text-[#909399]">共 {items.length} 条，数量合计 {formatQuotationValue(totalQuantity, "number")}。</p></div></div>
        <StickyTable className="table-scroll overflow-auto" tableKey="quotation-detail-items">
          <table className="w-max min-w-full table-auto border-collapse text-sm"><thead className="bg-[#f5f7fa] text-[#303133]"><tr>{itemFields.map((field) => <th className={`whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium ${field.key === "lineNo" ? "w-[72px] min-w-[72px] max-w-[72px]" : ""}`} key={field.key}><TableColumnMenu column={field} filterValues={itemFilters[field.key] ?? []} loadOptions={(keyword) => loadItemOptions(field.key, keyword)} onFilter={(values) => setItemFilters((current) => ({ ...current, [field.key]: values }))} onSort={(order) => { setItemSortField(field.key); setItemSortOrder(order); }} sortOrder={itemSortField === field.key ? itemSortOrder : ""} /></th>)}</tr></thead>
            <tbody>{visibleItems.map((row) => <tr className="hover:bg-[#fafafa]" key={String(row.id)}>{itemFields.map((field) => <td className={`max-w-[240px] truncate whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 ${field.key === "lineNo" ? "w-[72px] min-w-[72px] max-w-[72px]" : ""}`} key={field.key}>{renderItemValue(row, field)}</td>)}</tr>)}{!visibleItems.length ? <tr><td className="px-4 py-10 text-center text-[#909399]" colSpan={itemFields.length}>暂无报价明细</td></tr> : null}</tbody>
            <tfoot><tr>{itemFields.map((field) => <td className="whitespace-nowrap border-t border-r border-[#ebeef5] bg-[#fcfcfd] px-3 py-3 font-medium" key={field.key}>{formatQuotationSummaryValue(field, quotationSummary)}</td>)}</tr></tfoot>
          </table>
        </StickyTable>
       </Panel>
       <AuditInfoBar createdBy={quotation.createdByName} createdAt={quotation.createdAt} updatedBy={quotation.updatedByName} updatedAt={quotation.updatedAt} confirmedBy={quotation.confirmedByName} confirmedAt={quotation.confirmedAt} />
     </div>
  );
}

async function fetchAllQuotationItems(quotationId: string) {
  const rows: Row[] = [];
  let page = 1;
  let total = 0;
  do {
    const params = new URLSearchParams({ page: String(page), pageSize: "100", quotationId });
    const response = await fetch(`/api/entities/quotation-items?${params.toString()}`, { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as { rows?: Row[]; total?: number; error?: string };
    if (!response.ok) throw new Error(data.error ?? "报价明细加载失败");
    rows.push(...(data.rows ?? []));
    total = Number(data.total ?? rows.length);
    page += 1;
  } while (rows.length < total);
  return rows;
}

function formatQuotationValue(value: Value, type?: string, fixedTwoDecimals = false) {
  if (fixedTwoDecimals && value !== null && value !== undefined && value !== "") {
    const number = Number(value);
    if (Number.isFinite(number)) return type === "percentage" ? `${(number * 100).toFixed(2)}%` : number.toFixed(2);
  }
  if (value === "draft") return "草稿";
  if (value === "confirmed") return "已完成";
  if (value === "air") return "空运";
  if (value === "sea") return "海运";
  if (value === "none") return "无运输";
  return formatDisplayValue(value, type);
}

function formatQuotationSummaryValue(field: EntityField, summary: ReturnType<typeof summarizeQuotationDetails>) {
  if (field.key === "lineNo") return "合计";
  if (field.key === "quantity") return formatQuotationValue(summary.quantity, "number");
  if (field.key === "purchaseTotalOriginal") {
    return formatCurrencyTotals(summary.purchaseTotalOriginalByCurrency);
  }
  if ([
    "purchaseTotalUsd",
    "firstMileFreightUsd",
    "cifUsd",
    "tariffUsd",
    "capitalCostUsd",
    "customsFeeUsd",
    "nomFeeUsd",
    "publicFeeAllocationUsd",
    "ddpTotalUsd",
    "amount",
    "operatingProfitUsd",
  ].includes(field.key)) {
    return formatQuotationValue(summary.totals[field.key] ?? 0, "money");
  }
  return "";
}

function formatCurrencyTotals(amounts: Record<string, number>) {
  const keys = Object.keys(amounts).sort();
  return keys.length ? keys.map((currency) => `${currency} ${formatQuotationValue(amounts[currency], "money")}`).join(" / ") : "";
}

function toBooleanValue(value: Value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["1", "true", "yes", "是"].includes(String(value ?? "").trim().toLowerCase());
}

function compareValues(left: Value, right: Value, order: TableSortOrder) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const result = !Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)
    ? leftNumber - rightNumber
    : String(left ?? "").localeCompare(String(right ?? ""), "zh-CN");
  return order === "desc" ? -result : result;
}
