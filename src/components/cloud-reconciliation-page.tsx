"use client";
import { InvoiceRecognitionReview } from "./invoice-recognition-review";
import type { InvoiceRecognition } from "@/lib/invoice-recognition-service";
import { updateInvoiceReviewAmounts, validateInvoiceReview } from "@/lib/invoice-review";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Banknote, Check, ChevronDown, ChevronRight, Cloud, Download, FileText, FileUp, Pencil, Plus, RefreshCw, ScanLine, Search, Trash2, X } from "lucide-react";
import { Button, IconButton, Input, Panel, UploadIconButton } from "./ui";
import { EmptyState } from "./table-state";
import { Modal } from "./modal";
import { CostPaymentApprovalModal } from "./cost-payment-approval-modal";
import { PaginationBar } from "./pagination-bar";
import { SearchSelect } from "./search-select";
import { NumberInput } from "./number-input";
import { computeCloudSettlementGrossProfit } from "@/lib/cloud-gross-profit";
import { isCloudRowConfirmed, pickCloudFinancialFields } from "@/lib/cloud-row-edit-policy";
import { prefillReceiptFromSource, receiptInvoiceCurrencyMismatch } from "@/lib/receipt-prefill";
import { buildSupplierPaymentInvoicePatch } from "@/lib/supplier-payment-invoice-recognition";
import { collectionAmount, collectionCurrency, collectionStatus, collectionUsdAmount } from "@/lib/cloud-collection";
import { addDaysToDateOnly } from "@/lib/date-only";
import { confirmDialog } from "./app-dialog";
import { CloudAttachments } from "./cloud-attachments";
import { StickyTable } from "./sticky-table";
import { TableColumnMenu, type TableFilterOption, type TableSortOrder } from "./table-column-menu";
import { calculateCloudTaxGroup, CLOUD_TAX_GROUPS, type CloudTaxField, type CloudTaxGroup } from "@/lib/cloud-tax";
import { formatDisplayValue, formatMoneyValue } from "@/lib/display-format";
import { paymentApprovalStatusClass, paymentApprovalStatusLabel } from "@/lib/payment-approval-status";
import { invoiceApprovalStatusLabel } from "@/lib/invoice-approval-status";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { fetchTableFilterOptions } from "@/lib/table-query-client";
import { useWorkspaceDataRefresh } from "@/lib/workspace-events";
import { CloudCrmInvoicesPanel } from "./cloud-crm-invoices-panel";
import { CrmInvoicePicker } from "./crm-invoice-picker";
import { CrmInvoiceAllocationModal } from "./crm-invoice-allocation-modal";
import { InvoiceDraftModal, type InvoiceDraftMode } from "./invoice-draft-modal";
import { StatementInvoiceSummary } from "./statement-invoice-summary";
import { getCloudPeriodRangeError } from "@/lib/cloud-period-filter";
import {
  StatementFieldSettingsButton,
  StatementFieldSettingsModal,
  StatementDetailGrid,
  usePersistentColumnVisibility,
} from "./statement-field-settings";

type Tab = "reconciliation" | "crm-invoices" | "mapping" | "supplier-payments";
type LedgerView = "ledger" | "collection";
type Row = Record<string, unknown> & { id?: string };
type Master = { id: string; code?: string; name: string; shortName?: string; taxNumber?: string; nameEn?: string; nameCn?: string; entityName?: string };
type MasterSet = { suppliers: Master[]; undertakingUnits: Master[]; customers: Master[] };
type LedgerColumn = {
  key: string;
  label: string;
  group: string;
  defaultVisible?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  percent?: boolean;
};

const tabs: Array<[Tab, string]> = [["reconciliation", "跨月对账台账"], ["crm-invoices", "账期发票（CRM）"], ["mapping", "服务映射"], ["supplier-payments", "供应商付款"]];
const columns: LedgerColumn[] = [
  { key: "period", label: "账期", group: "基本信息", defaultVisible: true, sortable: true, filterable: true },
  { key: "customer", label: "客户 / 账号", group: "基本信息", defaultVisible: true, sortable: true, filterable: true },
  { key: "account", label: "华为ID", group: "基本信息", defaultVisible: false, sortable: true, filterable: true },
  { key: "cloudReconciler", label: "华为对账人", group: "基本信息", defaultVisible: false, sortable: true, filterable: true },
  { key: "supplierCurrency", label: "账单币种", group: "基本信息", defaultVisible: true, sortable: false, filterable: false },
  { key: "catalogAmount", label: "目录价", group: "金额", defaultVisible: true, sortable: true, filterable: true },
  { key: "partnerAmount", label: "伙伴结算金额", group: "金额", defaultVisible: true, sortable: true, filterable: true },
  { key: "voucherCustomerAmount", label: "代金券-客户", group: "金额", defaultVisible: false, sortable: true, filterable: true },
  { key: "voucherSupplierAmount", label: "代金券-供应商", group: "金额", defaultVisible: false, sortable: true, filterable: true },
  { key: "supplierPayableNetAmount", label: "供应商应付（未税）", group: "供应商应付", defaultVisible: false, sortable: true, filterable: true },
  { key: "supplierTaxRate", label: "供应商应付税率", group: "供应商应付", defaultVisible: false, sortable: true, filterable: true, percent: true },
  { key: "supplierTaxAmount", label: "供应商应付税金", group: "供应商应付", defaultVisible: false, sortable: true, filterable: true },
  { key: "supplierPayableTotalAmount", label: "供应商应付（含税）", group: "供应商应付", defaultVisible: true, sortable: true, filterable: true },
  { key: "customerReceivablePayer", label: "应收付款单位", group: "客户应收", defaultVisible: false, sortable: false, filterable: false },
  { key: "customerReceivablePayee", label: "应收收款单位", group: "客户应收", defaultVisible: false, sortable: false, filterable: false },
  { key: "customerCurrency", label: "应收币种", group: "客户应收", defaultVisible: false, sortable: false, filterable: false },
  { key: "customerReceivableNetAmount", label: "客户应收（未税）", group: "客户应收", defaultVisible: false, sortable: true, filterable: true },
  { key: "customerTaxRate", label: "客户应收税率", group: "客户应收", defaultVisible: false, sortable: true, filterable: true, percent: true },
  { key: "customerReceivableTaxAmount", label: "客户应收税金", group: "客户应收", defaultVisible: false, sortable: true, filterable: true },
  { key: "customerReceivableTotalAmount", label: "客户应收（含税）", group: "客户应收", defaultVisible: true, sortable: true, filterable: true },
  { key: "collectionPayer", label: "实收付款单位", group: "客户实收", defaultVisible: false, sortable: false, filterable: false },
  { key: "collectionPayee", label: "实收收款单位", group: "客户实收", defaultVisible: false, sortable: false, filterable: false },
  { key: "collectionCurrency", label: "实收币种", group: "客户实收", defaultVisible: false, sortable: false, filterable: false },
  { key: "collectionNetAmount", label: "客户实收（未税）", group: "客户实收", defaultVisible: false, sortable: true, filterable: true },
  { key: "collectionTaxRate", label: "客户实收税率", group: "客户实收", defaultVisible: false, sortable: true, filterable: true, percent: true },
  { key: "collectionTaxAmount", label: "客户实收税金", group: "客户实收", defaultVisible: false, sortable: true, filterable: true },
  { key: "collectionTotalAmount", label: "客户实收（含税）", group: "客户实收", defaultVisible: true, sortable: true, filterable: true },
  { key: "collectionDate", label: "实收日期", group: "客户实收", defaultVisible: false, sortable: true, filterable: true },
  { key: "invoicePayer", label: "开票客户单位", group: "客户开票", defaultVisible: false, sortable: false, filterable: false },
  { key: "invoicePayee", label: "开票承接单位", group: "客户开票", defaultVisible: false, sortable: false, filterable: false },
  { key: "invoiceNo", label: "发票号", group: "客户开票", defaultVisible: false, sortable: true, filterable: true },
  { key: "invoiceCurrency", label: "开票币种", group: "客户开票", defaultVisible: false, sortable: false, filterable: false },
  { key: "invoiceNetAmount", label: "客户开票（未税）", group: "客户开票", defaultVisible: false, sortable: true, filterable: true },
  { key: "invoiceTaxRate", label: "客户开票税率", group: "客户开票", defaultVisible: false, sortable: true, filterable: true, percent: true },
  { key: "invoiceTaxAmount", label: "客户开票税金", group: "客户开票", defaultVisible: false, sortable: true, filterable: true },
  { key: "invoiceTotalAmount", label: "客户开票（含税）", group: "客户开票", defaultVisible: true, sortable: true, filterable: true },
  { key: "invoiceDate", label: "开票日期", group: "客户开票", defaultVisible: false, sortable: true, filterable: true },
  { key: "receivableDate", label: "应收日期", group: "客户开票", defaultVisible: false, sortable: true, filterable: true },
  { key: "theoreticalGrossProfit", label: "万众理论毛利（未税）", group: "毛利", defaultVisible: true, sortable: true, filterable: true },
  { key: "settlementGrossProfit", label: "万众实际毛利（未税）", group: "毛利", defaultVisible: true, sortable: true, filterable: true },
  { key: "customerDiscount", label: "客户折扣", group: "其他", defaultVisible: false, sortable: true, filterable: true },
  { key: "remark", label: "备注", group: "其他", defaultVisible: false, sortable: true, filterable: true },
  { key: "createdAt", label: "创建时间", group: "审计", defaultVisible: false, sortable: true, filterable: true },
  { key: "updatedAt", label: "更新时间", group: "审计", defaultVisible: false, sortable: true, filterable: true },
  { key: "confirmedAt", label: "确认时间", group: "审计", defaultVisible: false, sortable: true, filterable: true },
  { key: "status", label: "确认状态", group: "状态", defaultVisible: true, sortable: true, filterable: true },
  { key: "collectionInvoice", label: "开票状态", group: "状态", defaultVisible: true, sortable: true, filterable: true },
  { key: "collected", label: "收款状态", group: "状态", defaultVisible: true, sortable: true, filterable: true },
];
const mappingColumns: Array<[string, string]> = [["supplierName", "供应商"], ["undertakingUnitName", "承接单位"], ["customerName", "客户"], ["accounts", "账号"], ["reconciler", "对账人"], ["calculationLogic", "计算逻辑"], ["userDiscount", "客户折扣"]];
const paymentColumns: Array<[string, string]> = [
  ["period", "账期"], ["supplierName", "供应商"], ["accountCount", "账号数"],
  ["supplierPayableNetAmount", "应付未税金额"],
  ["supplierTaxRate", "应付税率"], ["supplierTaxAmount", "应付税金"], ["supplierPayableTotalAmount", "应付含税金额"],
  ["paymentNetAmount", "实付未税金额"], ["paymentExchangeRate", "实付汇率"], ["paymentTaxRate", "实付税率"], ["paymentTaxAmount", "实付税金"], ["paymentTotalAmount", "实付含税金额"], ["invoiceCurrency", "开票币种"], ["invoiceNetAmount", "开票未税金额"],
  ["invoiceExchangeRate", "开票汇率"], ["invoiceTaxRate", "开票税率"], ["invoiceTaxAmount", "开票税金"], ["invoiceTotalAmount", "开票含税金额"],
  ["paymentDate", "实际付款日期"], ["receivableDate", "预计付款日期"],
  ["paymentApprovalStatus", "审批状态"], ["paid", "付款状态"], ["invoiceStatus", "开票状态"], ["updatedAt", "更新时间"],
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
  if (typeof value === "number") return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return String(value);
}

export function CloudReconciliationPage() {
  const [tab, setTab] = useState<Tab>("reconciliation");
  const [ledgerView, setLedgerView] = useState<LedgerView>("ledger");
  const [collectionFilter, setCollectionFilter] = useState<"open" | "all">("open");
  const [collectionSummary, setCollectionSummary] = useState({
    receivable: 0,
    collected: 0,
    outstanding: 0,
    overdueCount: 0,
    collectionByCurrency: [] as Array<{ currency: string; amount: number; usdAmount: number; missingRateCount: number }>,
    missingRateCount: 0,
  });
  const [collectionCounts, setCollectionCounts] = useState({ total: 0, open: 0, paid: 0 });
  const [rows, setRows] = useState<Row[]>([]);
  const [mappings, setMappings] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [defaultPayerUnit, setDefaultPayerUnit] = useState<{ id: string; name: string } | null>(null);

  async function loadDefaultPayerUnit() {
    try {
      const data = await requestJson<{ payerUnit: { id: string; name: string } | null }>("/api/cloud/supplier-payments/payer-unit");
      setDefaultPayerUnit(data.payerUnit ?? null);
    } catch {
      // 默认付款单位属于辅助信息，加载失败不打断主流程
    }
  }

  async function saveDefaultPayerUnit(undertakingUnitId: string) {
    try {
      const result = await requestJson<{ undertakingUnitId: string; undertakingUnitName: string; filledRows: number }>("/api/cloud/supplier-payments/payer-unit", { method: "POST", body: JSON.stringify({ undertakingUnitId }) });
      setDefaultPayerUnit({ id: result.undertakingUnitId, name: result.undertakingUnitName });
      setNotice(`默认付款单位已设为 ${result.undertakingUnitName}` + (result.filledRows ? `，并补齐 ${result.filledRows} 条付款记录` : ""));
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "默认付款单位保存失败");
    }
  }

  useEffect(() => { void loadDefaultPayerUnit(); }, []);
  useEffect(() => {
    void fetch("/api/payments/cost-approval/huawei/sync", { cache: "no-store" }).catch(() => undefined);
  }, []);
  const [masters, setMasters] = useState<MasterSet>({ suppliers: [], undertakingUnits: [], customers: [] });
  const [keyword, setKeyword] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [importPeriod, setImportPeriod] = useState("");
  const periodError = getCloudPeriodRangeError(periodFrom, periodTo);
  const singlePeriod = periodFrom && periodFrom === periodTo ? periodFrom : "";
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [currencyTotals, setCurrencyTotals] = useState<Row[]>([]);
  // 附件上传后自增，通知附件按钮重新拉取列表
  const [attachmentVersion, setAttachmentVersion] = useState(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [mappingForm, setMappingForm] = useState<Row | null>(null);
  const [rowForm, setRowForm] = useState<Row | null>(null);
  const [collectionForm, setCollectionForm] = useState<Row | null>(null);
  const [invoiceForm, setInvoiceForm] = useState<Row | null>(null);
  /** 开票弹层：从「客户开票」列的按钮进入，sourceId 就是本行对账行 ID。 */
  const [invoiceModal, setInvoiceModal] = useState<{ mode: InvoiceDraftMode; sourceId: string } | null>(null);
  const [supplierPaymentForm, setSupplierPaymentForm] = useState<Row | null>(null);
  /** 成本款付款申请：选中的供应商付款行（弹层里发起飞书审批）。 */
  const [paymentApprovalOwnerIds, setPaymentApprovalOwnerIds] = useState<string[] | null>(null);
  const [allocationTarget, setAllocationTarget] = useState<{ crmInvoiceId: number | string; rowId?: string } | null>(null);
  const [ledgerExpanded, setLedgerExpanded] = useState<Record<string, boolean>>({});
  const [showLedgerFieldSettings, setShowLedgerFieldSettings] = useState(false);
  const [queries, setQueries] = useState<Record<Tab, QueryState>>({
    reconciliation: emptyQuery(), "crm-invoices": emptyQuery(), mapping: emptyQuery(), "supplier-payments": emptyQuery(),
  });

  const activeQuery = queries[tab];
  const latestLoad = useRef(0);
  const ledgerFieldState = usePersistentColumnVisibility("cloud-reconciliation-ledger-v2", columns);
  const allLedgerExpanded = rows.length > 0 && rows.every((row) => ledgerExpanded[String(row.id ?? "")]);

  function toggleLedgerRow(row: Row) {
    const id = String(row.id ?? "");
    setLedgerExpanded((current) => ({ ...current, [id]: !current[id] }));
  }

  function toggleAllLedgerRows() {
    setLedgerExpanded(Object.fromEntries(rows.map((row) => [String(row.id ?? ""), !allLedgerExpanded])));
  }

  async function load(options?: { query?: QueryState; targetTab?: Tab; targetPage?: number }) {
    const loadId = ++latestLoad.current;
    const targetTab = options?.targetTab ?? tab;
    const targetQuery = options?.query ?? queries[targetTab];
    const targetPage = options?.targetPage ?? page;
    // 「账期发票（CRM）」有自己的数据源与状态，走组件内部加载，不走这里的实时计算列表
    if (targetTab === "crm-invoices" || (targetTab !== "mapping" && periodError)) { setBusy(false); return; }
    setBusy(true);
    try {
      if (targetTab === "mapping") {
        const params = new URLSearchParams({ keyword, page: String(targetPage), pageSize: String(pageSize) });
        appendQueryParams(params, targetQuery);
        const data = await requestJson<{ items: Row[]; total: number }>(`/api/cloud/mappings?${params}`);
        if (loadId !== latestLoad.current) return;
        setMappings(data.items); setTotal(Number(data.total ?? 0));
      } else if (targetTab === "supplier-payments") {
        const params = new URLSearchParams({ keyword, periodFrom, periodTo, page: String(targetPage), pageSize: String(pageSize) });
        appendQueryParams(params, targetQuery);
        const data = await requestJson<{ items: Row[]; total: number }>(`/api/cloud/supplier-payments?${params}`);
        if (loadId !== latestLoad.current) return;
        setPayments(data.items); setTotal(data.total);
      } else {
        const params = new URLSearchParams({ keyword, periodFrom, periodTo, page: String(targetPage), pageSize: String(pageSize) });
        if (targetTab === "reconciliation" && ledgerView === "collection" && collectionFilter === "open") params.set("collectionStatus", "open");
        appendQueryParams(params, targetQuery);
        const data = await requestJson<{
          items: Row[];
          total: number;
          currencyTotals?: Row[];
          summary?: {
            receivable: number;
            collected: number;
            outstanding: number;
            overdueCount: number;
            collectionByCurrency?: Array<{ currency: string; amount: number; usdAmount: number; missingRateCount: number }>;
            missingRateCount?: number;
          };
          collectionCounts?: { total: number; open: number; paid: number };
        }>(`/api/cloud/rows?${params}`);
        if (loadId !== latestLoad.current) return;
        setRows(data.items); setTotal(data.total); setCurrencyTotals(Array.isArray(data.currencyTotals) ? data.currencyTotals : []);
        setCollectionSummary(data.summary ? {
          ...data.summary,
          collectionByCurrency: data.summary.collectionByCurrency ?? [],
          missingRateCount: data.summary.missingRateCount ?? 0,
        } : { receivable: 0, collected: 0, outstanding: 0, overdueCount: 0, collectionByCurrency: [], missingRateCount: 0 });
        setCollectionCounts(data.collectionCounts ?? { total: data.total, open: 0, paid: 0 });
      }
    } catch (error) { if (loadId === latestLoad.current) setNotice(error instanceof Error ? error.message : "加载失败"); }
    finally { if (loadId === latestLoad.current) setBusy(false); }
  }

  useEffect(() => { void load(); }, [tab, page, pageSize, periodFrom, periodTo, queries, ledgerView, collectionFilter]);

  /**
   * 基础资料（供应商 / 承接单位 / 客户）是弹层下拉的选项来源。
   * 标签页是常驻 iframe，不会重新挂载，所以必须在"切回本标签页"或
   * "别的标签页改了档案"时重新拉取，否则点开修改还是改名前的旧简称。
   */
  const loadMasters = useCallback(async () => {
    try { setMasters(await requestJson<typeof masters>("/api/cloud/master-data")); } catch { /* 保留上一次的选项，避免下拉变空 */ }
  }, []);
  useEffect(() => { void loadMasters(); }, [loadMasters]);
  useWorkspaceDataRefresh((message) => {
    void loadMasters();
    if (message.type === "cloud-power:master-data-changed") return;
    // 切回标签页时顺带刷新列表，列表里按 ID 关联的名称也是最新的
    void load();
  });

  /** 手动同步飞书审批状态：在飞书里撤回 / 被驳回 / 审批通过之后，不用等定时任务。 */
  async function syncApprovalStatus() {
    setBusy(true);
    try {
      const response = await fetch("/api/invoices/approval/sync", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { checked?: number; updated?: number; error?: string; errors?: string[] };
      if (!response.ok) throw new Error(data.error ?? "同步飞书审批状态失败");
      setNotice(`飞书审批状态已同步：检查 ${data.checked ?? 0} 条${data.errors?.length ? `，${data.errors.length} 条失败` : ""}`);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "同步飞书审批状态失败");
    } finally {
      setBusy(false);
    }
  }

  async function importWorkbook() {
    if (!importFile) return;
    const form = new FormData(); form.set("file", importFile); form.set("period", importPeriod);
    setBusy(true);
    try {
      const response = await fetch("/api/cloud/import", { method: "POST", body: form });
      const data = await response.json(); if (!response.ok) throw new Error(String(data.error ?? "导入失败"));
       const unmapped: string[] = Array.isArray(data.unmappedHeaders) ? data.unmappedHeaders : [];
       const skipped: { period: string; account: string }[] = Array.isArray(data.skippedConfirmed) ? data.skippedConfirmed : [];
       setNotice(`账单已导入：${data.batchCode}，共${data.rowCount}行（新增 ${data.created ?? 0}，更新 ${data.updated ?? 0}，跳过已确认 ${skipped.length}）${skipped.length ? `；已确认账单未覆盖：${skipped.map((row) => `${row.period} / ${row.account}`).join("、")}。开票和实收请通过对应编辑入口维护` : ""}${unmapped.length ? `；未识别列（数据未导入）：${unmapped.join("、")}` : ""}`); setImportFile(null); await load();
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
    const patch = pickCloudFinancialFields(collectionForm, "collection");
    try {
      await requestJson(`/api/cloud/rows/${encodeURIComponent(String(collectionForm.id))}`, { method: "PATCH", body: JSON.stringify(patch) });
      setCollectionForm(null); setNotice("客户实收已保存"); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "客户实收保存失败"); }
  }

  async function saveInvoice() {
    if (!invoiceForm?.id) return;
    const patch = pickCloudFinancialFields(invoiceForm, "invoice");
    try {
      await requestJson(`/api/cloud/rows/${encodeURIComponent(String(invoiceForm.id))}`, { method: "PATCH", body: JSON.stringify(patch) });
      /**
       * 弹层里选过 CRM 发票：发票号没被改动时建立匹配关系，
       * 顺便把发票 PDF 挂到本行的「客户开票附件」下（远端已下载过就直接复用）。
       */
      const crmInvoiceId = String(invoiceForm.crmInvoiceId ?? "");
      const crmInvoiceNo = String(invoiceForm.crmInvoiceNo ?? "");
      let linked = false;
      if (crmInvoiceId && crmInvoiceNo && crmInvoiceNo === String(invoiceForm.invoiceNo ?? "")) {
        const result = await requestJson<{ attachmentLinked?: boolean }>("/api/cloud/crm-invoices/match", {
          method: "POST",
          body: JSON.stringify({ crmInvoiceId, rowId: invoiceForm.id, applyFields: false }),
        });
        linked = Boolean(result.attachmentLinked);
      }
      if (linked) setAttachmentVersion((current) => current + 1);
      setInvoiceForm(null);
      setNotice(crmInvoiceId && crmInvoiceNo
        ? `客户开票信息已保存，并已匹配 CRM 发票 ${crmInvoiceNo}${linked ? "（发票 PDF 已挂到本行开票附件）" : ""}`
        : "客户开票信息已保存");
      await load();
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
    const confirmed = isCloudRowConfirmed(row.confirmed);
    if (!await confirmDialog(confirmed ? "取消该账单的确认？取消后可修改账单金额及明细，已登记的开票和实收信息保留。" : "确认该对账单？确认后，账单金额及明细将锁定；开票、实收和相关附件仍可继续维护。")) return;
    try { await requestJson(`/api/cloud/rows/${encodeURIComponent(String(row.id ?? ""))}/confirm`, { method: "POST", body: JSON.stringify({ confirmed: !confirmed }) }); setNotice("确认状态已更新"); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "确认失败"); }
  }

  async function deleteRow(row: Row) {
    if (!await confirmDialog(`确认删除 ${display(row.customer)} / ${display(row.account)} 吗？`)) return;
    try { await requestJson(`/api/cloud/rows/${encodeURIComponent(String(row.id ?? ""))}`, { method: "DELETE" }); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "删除失败"); }
  }

  async function attachRow(row: Row, file: File) {
    const form = new FormData(); form.set("file", file);
    try {
      const response = await fetch(`/api/cloud/attachments/invoice/${encodeURIComponent(String(row.id ?? ""))}`, { method: "POST", body: form });
      const data = await response.json(); if (!response.ok) throw new Error(String(data.error ?? "附件上传失败"));
      setNotice(`附件“${file.name}”已关联`); setAttachmentVersion((value) => value + 1);
    } catch (error) { setNotice(error instanceof Error ? error.message : "附件上传失败"); }
  }

  /** 供应商付款发票附件：上传到 supplier_payment 名下，与客户开票附件同一套附件表。 */
  async function attachSupplierPaymentInvoice(row: Row, file: File) {
    const form = new FormData(); form.set("file", file);
    try {
      const response = await fetch(`/api/cloud/attachments/supplier_payment/${encodeURIComponent(String(row.id ?? ""))}`, { method: "POST", body: form });
      const data = await response.json(); if (!response.ok) throw new Error(String(data.error ?? "附件上传失败"));
      setNotice(`供应商发票“${file.name}”已关联`); setAttachmentVersion((value) => value + 1);
      return true;
    } catch (error) { setNotice(error instanceof Error ? error.message : "附件上传失败"); }
    return false;
  }

  async function saveMapping() {
    if (!mappingForm) return;
    try { await requestJson(mappingForm.id ? `/api/cloud/mappings/${mappingForm.id}` : "/api/cloud/mappings", { method: mappingForm.id ? "PATCH" : "POST", body: JSON.stringify(mappingForm) }); setMappingForm(null); setNotice("服务映射已保存"); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "保存失败"); }
  }

  async function updatePayment(row: Row, patch: Row) {
    try {
      await requestJson(`/api/cloud/supplier-payments/${encodeURIComponent(String(row.id ?? ""))}`, { method: "PATCH", body: JSON.stringify({ period: row.period, supplierId: row.supplierId ?? "", supplierName: row.supplierName, ...patch }) });
      setNotice("供应商付款信息已更新"); await load(); return true;
    }
    catch (error) { setNotice(error instanceof Error ? error.message : "付款保存失败"); return false; }
  }

  async function saveSupplierPayment(file?: File | null, recognitionFacts?: Record<string, string>) {
    if (!supplierPaymentForm?.id) return;
    const patch = Object.fromEntries(Object.entries(supplierPaymentForm).filter(([key]) => key.startsWith("payment") || key.startsWith("invoice") || ["payerUnitId", "payerUnitName", "currency", "paid", "invoiceStatus", "receivableDate"].includes(key)));
    if (!await updatePayment(supplierPaymentForm, { ...patch, recognitionFacts })) throw new Error("付款信息保存失败，请重试");
    if (file && !await attachSupplierPaymentInvoice(supplierPaymentForm, file)) throw new Error("字段已保存，附件上传失败，请重试保存以补传附件");
    setSupplierPaymentForm(null);
  }

  function updateQuery(patch: Partial<QueryState>) {
    setQueries((current) => ({ ...current, [tab]: { ...current[tab], ...patch } }));
    setPage(1);
  }

  function columnOptions(endpoint: string, field: string, optionKeyword: string) {
    if (tab !== "mapping" && periodError) return Promise.resolve([]);
    const extra: Record<string, string> = tab === "mapping" ? {} : { periodFrom, periodTo };
    if (endpoint === "/api/cloud/rows" && keyword.trim()) extra.listKeyword = keyword.trim();
    return fetchTableFilterOptions(endpoint, field, optionKeyword, extra, activeQuery.filters);
  }

  function amountFormDefaults(row: Row, prefix: "collection" | "invoice") {
    const invoiceIssued = row.collectionInvoice === "issued";
    const source = invoiceIssued ? {
      currency: row.invoiceCurrency,
      net: row.invoiceNetAmount,
      rate: row.invoiceTaxRate,
      total: row.invoiceTotalAmount,
      tax: row.invoiceTaxAmount,
    } : {
      // 华为云客户应收固定按账单 USD 口径展示；customerCurrency 若由历史数据提供则优先使用。
      currency: row.customerCurrency || "USD",
      net: row.customerReceivableNetAmount ?? row.customerReceivable,
      rate: row.customerTaxRate,
      total: row.customerReceivableTotalAmount ?? row.customerReceivable,
      tax: row.customerReceivableTaxAmount,
    };
    const amounts = prefix === "collection" ? prefillReceiptFromSource({
      currency: row.collectionCurrency, net: row.collectionNetAmount, rate: row.collectionTaxRate,
      total: row.collectionTotalAmount, tax: row.collectionTaxAmount,
    }, source) : null;
    const payerName = prefix === "collection" ? row.collectionPayer : row.invoicePayer;
    const payeeName = prefix === "collection" ? row.collectionPayee : row.invoicePayee;
    return {
      ...row,
      ...(amounts ? { collectionCurrency: amounts.currency, collectionNetAmount: amounts.net,
        collectionTaxRate: amounts.rate, collectionTotalAmount: amounts.total, collectionTaxAmount: amounts.tax } : {}),
      [`${prefix}PayerCustomerId`]: row[`${prefix}PayerCustomerId`] ?? row.customerId ?? "",
      [`${prefix}PayeeUndertakingUnitId`]: row[`${prefix}PayeeUndertakingUnitId`] ?? row.undertakingUnitId ?? "",
      [`${prefix}PayerCustomerName`]: row[`${prefix}PayerCustomerName`] ?? payerName ?? row.customerReceivablePayer ?? row.customer ?? "",
      [`${prefix}PayeeUndertakingUnitName`]: row[`${prefix}PayeeUndertakingUnitName`] ?? payeeName ?? row.customerReceivablePayee ?? "承接单位",
      ...(prefix === "collection" ? { collectionPayer: payerName ?? row.customerReceivablePayer ?? row.customer ?? "", collectionPayee: payeeName ?? row.customerReceivablePayee ?? "承接单位" } : { invoicePayer: payerName ?? row.customerReceivablePayer ?? row.customer ?? "", invoicePayee: payeeName ?? row.customerReceivablePayee ?? "承接单位" }),
      ...(prefix === "collection" ? { collectionPrefillSource: invoiceIssued ? "开票信息" : "客户应收", collectionPrefillCurrency: String(source.currency ?? "") } : {}),
    };
  }

  return <div className="flex h-[calc(var(--app-viewport-height)-40px)] flex-col gap-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><Cloud size={22} className="text-primary" /><h1 className="text-2xl font-medium text-ink">华为云业务</h1></div><p className="mt-2 text-sm text-ink-3">月度账单、服务映射、跨月收款和供应商付款</p>{tab === "reconciliation" ? <p className="mt-1 text-xs text-ink-3">确认后账单金额及明细锁定，开票、实收和相关附件仍可维护。</p> : null}</div>
      {tab === "crm-invoices" ? null : <div className="flex flex-wrap gap-2">{tab === "reconciliation" && ledgerView === "ledger" ? <Button tone="primary" onClick={() => setRowForm({ period: singlePeriod || new Date().toISOString().slice(0, 7).replace("-", ""), batchCode: "", customer: "", account: "", cloudReconciler: "", catalogAmount: "", partnerAmount: "", voucherCustomerAmount: "", voucherSupplierAmount: "", supplierPayablePayer: "", supplierPayablePayee: "", supplierPayableNetAmount: "", supplierTaxRate: "0.16", supplierTaxAmount: "", supplierPayableTotalAmount: "", customerReceivablePayer: "", customerReceivablePayee: "", customerReceivableNetAmount: "", customerTaxRate: "", customerReceivableTaxAmount: "", customerReceivableTotalAmount: "", theoreticalGrossProfit: "", settlementGrossProfit: "", customerDiscount: "", remark: "" })}><Plus size={15} />手动新增</Button> : null}<label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded border border-line bg-white px-3 text-sm text-ink-2"><FileUp size={15} />导入账单<input className="hidden" type="file" accept=".xlsx,.xls" onChange={(event) => { setImportFile(event.target.files?.[0] ?? null); setImportPeriod(singlePeriod); }} /></label><a href="/api/cloud/template"><Button type="button"><Download size={15} />下载导入模板</Button></a>{importFile ? <><label className="flex items-center gap-2 text-sm text-ink-2">导入默认账期<Input type="month" aria-label="导入默认账期" title="文件缺少账期时使用；留空沿用文件账期或当前月份" value={importPeriod} onChange={(event) => setImportPeriod(event.target.value)} /></label><Button tone="primary" disabled={busy} onClick={() => void importWorkbook()}>确认导入</Button></> : null}<Button disabled={Boolean(periodError)} onClick={() => window.open(`/api/cloud/rows/export?keyword=${encodeURIComponent(keyword)}&periodFrom=${encodeURIComponent(periodFrom)}&periodTo=${encodeURIComponent(periodTo)}`, "_blank")}><Download size={15} />导出数据</Button><Button disabled={busy} onClick={() => void syncApprovalStatus()}><RefreshCw size={15} />同步审批状态</Button></div>}
    </header>
    {notice ? <div className="flex items-center justify-between border border-info-border bg-info-soft px-3 py-2 text-sm text-primary">{notice}<button type="button" title="关闭提示" onClick={() => setNotice("")}><X size={15} /></button></div> : null}
    <Panel className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-3">{tabs.map(([key, label]) => <button className={`border-b-2 px-3 py-2 text-sm ${tab === key ? "border-primary text-primary" : "border-transparent text-ink-2"}`} key={key} type="button" onClick={() => { setTab(key); setPage(1); }}>{label}{key === "reconciliation" ? <span className="ml-1 rounded bg-info-soft px-1.5 py-0.5 text-[10px] font-normal text-primary">含收款</span> : null}</button>)}{/* items-end：这一排里「默认付款单位」是标签在上+输入框在下两行高，底部对齐才不会显得错位 */}
        {tab === "crm-invoices" ? null : <div className="ml-auto flex flex-wrap items-end gap-2">{tab === "supplier-payments" ? <div className="w-[260px]"><PartnerSelect kind="undertakingUnits" label="默认付款单位" idValue={defaultPayerUnit?.id} nameValue={defaultPayerUnit?.name} masters={masters} onChange={(selected) => void saveDefaultPayerUnit(selected.id)} /></div> : null}<Input placeholder="搜索客户、账号、批次或供应商" value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setPage(1); void load({ targetPage: 1 }); } }} /><div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="账期范围"><Input aria-label="开始账期" title="开始账期（含当月）" type="month" className="w-[150px] min-w-0" value={periodFrom} max={periodTo || undefined} onChange={(event) => { setPeriodFrom(event.target.value); setPage(1); }} /><span className="text-sm text-ink-3">至</span><Input aria-label="结束账期" title="结束账期（含当月）" type="month" className="w-[150px] min-w-0" value={periodTo} min={periodFrom || undefined} onChange={(event) => { setPeriodTo(event.target.value); setPage(1); }} />{periodFrom || periodTo ? <IconButton icon={<X size={14} />} label="清除账期范围" onClick={() => { setPeriodFrom(""); setPeriodTo(""); setPage(1); }} /> : null}{periodError ? <span className="text-xs text-danger" role="alert">{periodError}</span> : null}</div><Button tone="secondary" disabled={tab !== "mapping" && Boolean(periodError)} onClick={() => { setPage(1); void load({ targetPage: 1 }); }}><Search size={15} />查询</Button>{tab === "mapping" ? <Button tone="primary" onClick={() => setMappingForm({ accounts: "", calculationLogic: "catalog" })}><Plus size={15} />新增服务映射</Button> : null}</div>}</div>
      {tab === "reconciliation" ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-surface-2 px-3 py-2">
          <div className="inline-flex rounded border border-line bg-white p-0.5">
            <button
              className={`h-7 rounded px-2.5 text-xs ${ledgerView === "ledger" ? "bg-white font-medium text-primary shadow-sm" : "text-ink-2 hover:text-primary"}`}
              onClick={() => { setLedgerView("ledger"); setPage(1); }}
              type="button"
            >
              对账视图
            </button>
            <button
              className={`h-7 rounded px-2.5 text-xs ${ledgerView === "collection" ? "bg-white font-medium text-primary shadow-sm" : "text-ink-2 hover:text-primary"}`}
              onClick={() => { setLedgerView("collection"); setPage(1); }}
              type="button"
            >
              收款视图
              <span className="ml-1 rounded bg-info-soft px-1.5 py-0.5 text-[10px]">{collectionCounts.open}</span>
            </button>
          </div>
          {ledgerView === "collection" ? (
            <div className="flex items-center gap-1.5">
              <button
                className={`h-7 rounded-full border px-2.5 text-xs ${collectionFilter === "open" ? "border-info-border bg-info-soft text-primary" : "border-line bg-white text-ink-2"}`}
                onClick={() => { setCollectionFilter("open"); setPage(1); }}
                type="button"
              >
                未收/部分收 <b>{collectionCounts.open}</b>
              </button>
              <button
                className={`h-7 rounded-full border px-2.5 text-xs ${collectionFilter === "all" ? "border-info-border bg-info-soft text-primary" : "border-line bg-white text-ink-2"}`}
                onClick={() => { setCollectionFilter("all"); setPage(1); }}
                type="button"
              >
                全部 <b>{collectionCounts.total}</b>
              </button>
            </div>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {ledgerView === "collection" ? (
              <Button disabled={Boolean(periodError)} onClick={() => window.open(`/api/cloud/rows/export?keyword=${encodeURIComponent(keyword)}&periodFrom=${encodeURIComponent(periodFrom)}&periodTo=${encodeURIComponent(periodTo)}&view=collection${collectionFilter === "open" ? "&collectionStatus=open" : ""}`, "_blank")} title="按当前筛选导出收款清单">
                <Download size={15} />导出收款清单
              </Button>
            ) : <>
              <Button disabled={!rows.length} size="sm" onClick={toggleAllLedgerRows}>{allLedgerExpanded ? "收起全部" : "展开全部"}</Button>
              <StatementFieldSettingsButton onClick={() => setShowLedgerFieldSettings(true)} />
            </>}
          </div>
        </div>
      ) : null}
      {tab === "crm-invoices" ? <CloudCrmInvoicesPanel /> : <>
        {tab === "reconciliation" && ledgerView === "collection" ? (
          <>
            <CollectionSummary counts={collectionCounts} summary={collectionSummary} />
            <div className="grid min-h-0 flex-1 grid-rows-1">
              <CollectionTable
                onEditCollection={(row) => setCollectionForm(amountFormDefaults(row, "collection"))}
                onEditInvoice={(row) => setInvoiceForm(amountFormDefaults(row, "invoice"))}
                onIssueInvoice={(row) => setInvoiceModal({ mode: "generated", sourceId: String(row.id ?? "") })}
                onUploadInvoice={(row) => setInvoiceModal({ mode: "external", sourceId: String(row.id ?? "") })}
                rows={rows}
              />
            </div>
          </>
        ) : (
          <div className="grid min-h-0 flex-1 grid-rows-1">{tab === "mapping" ? <MappingTable rows={mappings} onEdit={setMappingForm} query={activeQuery} onQueryChange={updateQuery} loadOptions={(field, optionKeyword) => columnOptions("/api/cloud/mappings", field, optionKeyword)} /> : tab === "supplier-payments" ? <PaymentTable attachmentVersion={attachmentVersion} rows={payments} onAttach={attachSupplierPaymentInvoice} onPay={(row) => setPaymentApprovalOwnerIds([String(row.id ?? "")])} onUpdate={(row) => setSupplierPaymentForm(row)} onTogglePaid={(row) => void updatePayment(row, { paid: row.paid ? 0 : 1 })} onToggleInvoice={(row) => void updatePayment(row, { invoiceStatus: row.invoiceStatus === "issued" ? "not_issued" : "issued" })} query={activeQuery} onQueryChange={updateQuery} loadOptions={(field, optionKeyword) => columnOptions("/api/cloud/supplier-payments", field, optionKeyword)} /> : <RowTable attachmentVersion={attachmentVersion} currencyTotals={currencyTotals} expanded={ledgerExpanded} onToggleExpanded={toggleLedgerRow} rows={rows} visibleColumns={ledgerFieldState.visibleColumns} onAttach={attachRow} onConfirm={confirmRow} onDelete={deleteRow} onToggleCollection={toggleCollection} onToggleInvoice={toggleInvoice} onEditRow={setRowForm} onEditCollection={(row) => setCollectionForm(amountFormDefaults(row, "collection"))} onEditInvoice={(row) => setInvoiceForm(amountFormDefaults(row, "invoice"))} onIssueInvoice={(row) => setInvoiceModal({ mode: "generated", sourceId: String(row.id ?? "") })} onUploadInvoice={(row) => setInvoiceModal({ mode: "external", sourceId: String(row.id ?? "") })} query={activeQuery} onQueryChange={updateQuery} loadOptions={(field, optionKeyword) => columnOptions("/api/cloud/rows", field, optionKeyword)} />}</div>
        )}
        <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(next) => { setPageSize(next); setPage(1); }} />
      </>}
    </Panel>
    <StatementFieldSettingsModal
      columns={columns}
      onClose={() => setShowLedgerFieldSettings(false)}
      onVisibilityChange={ledgerFieldState.setVisibility}
      open={showLedgerFieldSettings}
      title="华为云对账字段设置"
      visibility={ledgerFieldState.visibility}
    />
    {mappingForm ? <MappingForm value={mappingForm} masters={masters} onChange={setMappingForm} onCancel={() => setMappingForm(null)} onSave={() => void saveMapping()} /> : null}
    {rowForm ? <CloudRowForm value={rowForm} masters={masters} onChange={setRowForm} onCancel={() => setRowForm(null)} onSave={() => void saveRow()} /> : null}
    {collectionForm ? <CloudAmountForm mode="collection" value={collectionForm} masters={masters} onChange={setCollectionForm} onCancel={() => setCollectionForm(null)} onSave={() => void saveCollection()} /> : null}
    {invoiceForm ? <CloudAmountForm mode="invoice" value={invoiceForm} masters={masters} onChange={setInvoiceForm} onCancel={() => setInvoiceForm(null)} onRequestAllocation={(crmInvoiceId) => setAllocationTarget({ crmInvoiceId, rowId: String(invoiceForm.id ?? "") })} onSave={() => void saveInvoice()} /> : null}
    {paymentApprovalOwnerIds?.length ? (
      <CostPaymentApprovalModal
        branch="huawei"
        onClose={() => setPaymentApprovalOwnerIds(null)}
        onSubmitted={() => { setPaymentApprovalOwnerIds(null); void load(); }}
        ownerIds={paymentApprovalOwnerIds}
      />
    ) : null}
    {supplierPaymentForm ? <SupplierPaymentForm value={supplierPaymentForm} masters={masters} onChange={setSupplierPaymentForm} onCancel={() => setSupplierPaymentForm(null)} onSave={saveSupplierPayment} /> : null}
    {allocationTarget ? (
      <CrmInvoiceAllocationModal
        crmInvoiceId={allocationTarget.crmInvoiceId}
        focusRowId={allocationTarget.rowId}
        onClose={() => setAllocationTarget(null)}
        onSaved={() => { void load(); }}
      />
    ) : null}
    <InvoiceDraftModal
      mode={invoiceModal?.mode ?? "generated"}
      onClose={() => { setInvoiceModal(null); setAttachmentVersion(current => current + 1); void load(); }}
      onSaved={() => {
        // 开票会回填本行开票字段，并把票面挂到本行开票附件下，所以行和附件都要刷新
        setAttachmentVersion((current) => current + 1);
        setNotice("已开票，本行开票信息已回填");
        void load();
      }}
      open={Boolean(invoiceModal)}
      sourceId={invoiceModal?.sourceId ?? ""}
      sourceType="cloud_row"
    />
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
  const formatted = Number.isFinite(Number(value)) ? formatMoneyValue(value) : String(value);
  return `${currency ? `${currency}：` : ""}${formatted}`;
}

function exchangeRateText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : String(value);
}

function integerText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed).toLocaleString("en-US") : String(value);
}

function dateInputValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  const raw = String(value);
  if (raw.includes("T") || /\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d/.test(raw)) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      const pad = (part: number) => String(part).padStart(2, "0");
      return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
    }
  }
  const match = raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  return raw.slice(0, 10);
}

function dateOnlyText(value: unknown) {
  return dateInputValue(value) || "-";
}

function periodText(value: unknown) {
  const raw = String(value ?? "");
  if (/^\d{6}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}$/.test(raw)) return raw.replace("-", "");
  return display(value);
}

function rateText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  return `${(parsed <= 1 ? parsed * 100 : parsed).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

type CollectionSummaryData = {
  receivable: number;
  collected: number;
  outstanding: number;
  overdueCount: number;
  collectionByCurrency: Array<{ currency: string; amount: number; usdAmount: number; missingRateCount: number }>;
  missingRateCount: number;
};

function CollectionSummary({ summary, counts }: { summary: CollectionSummaryData; counts: { total: number; open: number; paid: number } }) {
  const rate = summary.receivable > 0 ? (summary.collected / summary.receivable) * 100 : 0;
  const amount = (value: number) => formatMoneyValue(value);
  const collectionGroups = summary.collectionByCurrency.filter((row) => row.amount !== 0 || row.usdAmount !== 0);
  const collectionMain = collectionGroups.length === 1
    ? `${collectionGroups[0].currency} ${amount(collectionGroups[0].amount)}`
    : collectionGroups.length > 1
      ? `${collectionGroups.length} 个币种`
      : "0.00";
  const collectionDetail = collectionGroups.length
    ? collectionGroups.map((row) => `${row.currency} ${amount(row.amount)}`).join(" / ")
    : "暂无收款";
  return <div className="grid gap-2 border-b border-line-soft bg-surface-2 p-3 sm:grid-cols-2 xl:grid-cols-4">
    <div className="rounded border border-line-soft border-l-[3px] border-l-primary bg-white p-3">
      <div className="text-xs text-ink-3">客户应收合计（含税）</div>
      <div className="mt-1 truncate text-xl font-medium tabular-nums text-ink">{amount(summary.receivable)}<span className="ml-1 text-xs font-normal text-ink-3">USD</span></div>
      <div className="mt-1 text-xs text-ink-3">全部 {counts.total} 笔对账</div>
    </div>
    <div className="rounded border border-line-soft border-l-[3px] border-l-success bg-white p-3">
      <div className="text-xs text-ink-3">客户实收合计（含税/原币）</div>
      <div className="mt-1 truncate text-xl font-medium tabular-nums text-ink" title={collectionDetail}>{collectionMain}</div>
      <div className="mt-1 truncate text-xs text-ink-3" title={collectionDetail}>
        {collectionGroups.length > 1 ? collectionDetail : `折合 USD ${amount(summary.collected)}`}
        {summary.missingRateCount ? ` · ${summary.missingRateCount} 笔缺汇率` : ""}
      </div>
    </div>
    <div className="rounded border border-line-soft border-l-[3px] border-l-danger bg-white p-3">
      <div className="text-xs text-ink-3">未收余额</div>
      <div className="mt-1 truncate text-xl font-medium tabular-nums text-danger">{amount(summary.outstanding)}<span className="ml-1 text-xs font-normal text-ink-3">USD</span></div>
      <div className="mt-1 text-xs text-ink-3">待收 {counts.open} 笔{summary.overdueCount ? ` · 逾期 ${summary.overdueCount} 笔` : ""}{summary.missingRateCount ? ` · ${summary.missingRateCount} 笔缺汇率` : ""}</div>
    </div>
    <div className="rounded border border-line-soft border-l-[3px] border-l-warning bg-white p-3">
      <div className="text-xs text-ink-3">收款完成率</div>
      <div className="mt-1 text-xl font-medium tabular-nums text-ink">{rate.toFixed(1)}<span className="ml-0.5 text-xs font-normal text-ink-3">%</span></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-success" style={{ width: `${Math.min(100, Math.max(0, rate))}%` }} /></div>
    </div>
  </div>;
}

function collectionState(row: Row) {
  const key = collectionStatus(row);
  if (key === "paid") return { key, label: "已收款", className: "border-success-border bg-success-soft text-success" };
  if (key === "partial") return { key, label: "部分收款", className: "border-info-border bg-info-soft text-primary" };
  return { key: "open", label: "未收款", className: "border-warning-border-soft bg-warning-soft text-warning-ink" };
}

function CollectionTable({ rows, onEditCollection, onEditInvoice, onIssueInvoice, onUploadInvoice }: {
  rows: Row[];
  onEditCollection: (row: Row) => void;
  onEditInvoice: (row: Row) => void;
  onIssueInvoice: (row: Row) => void;
  onUploadInvoice: (row: Row) => void;
}) {
  return <StickyTable className="table-scroll h-full w-full overflow-auto" tableKey="cloud-collections">
    <table className="w-full min-w-[1500px] border-collapse text-sm">
      <thead className="bg-canvas">
        <tr>
          {["账期", "客户", "华为ID", "客户应收（含税 USD）", "客户实收（含税/原币）", "未收余额（USD）", "收款状态", "应收日期", "实收日期", "开票状态", "发票号", "操作"].map((label) => (
            <th className={`whitespace-nowrap border-b border-r border-line-soft px-3 py-3 text-left font-medium ${label.includes("USD") ? "text-right" : ""}`} key={label}>{label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const receivable = Number(row.customerReceivableTotalAmount ?? row.customerReceivable ?? 0) || 0;
          const currency = collectionCurrency(row);
          const collected = collectionAmount(row);
          const collectedUsd = collectionUsdAmount(row);
          const outstanding = collectedUsd === null ? null : Math.max(receivable - collectedUsd, 0);
          const state = collectionState(row);
          const invoiced = String(row.collectionInvoice ?? "") === "issued";
          return <tr className="hover:bg-surface-2" key={String(row.id)}>
            <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3">{periodText(row.period)}</td>
            <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3 font-medium text-ink">{display(row.customer)}</td>
            <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3 font-mono text-xs text-ink-3">{display(row.account)}</td>
            <td className="numeric-cell whitespace-nowrap border-b border-r border-line-soft px-3 py-3">{money(receivable, "")}</td>
            <td className="numeric-cell whitespace-nowrap border-b border-r border-line-soft px-3 py-3">
              <div>{money(collected, currency)}</div>
              {currency !== "USD" ? <div className={`text-[11px] ${collectedUsd === null ? "text-warning-ink" : "text-ink-3"}`}>{collectedUsd === null ? "缺收款汇率" : `≈ USD ${money(collectedUsd, "")}`}</div> : null}
            </td>
            <td className={`numeric-cell whitespace-nowrap border-b border-r border-line-soft px-3 py-3 ${outstanding !== null && outstanding > 0 ? "font-medium text-danger" : outstanding === null ? "text-warning-ink" : "text-success"}`} title={outstanding === null ? "缺少收款汇率，无法折算 USD" : undefined}>{outstanding === null ? "-" : money(outstanding, "")}</td>
            <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3"><span className={`inline-flex h-6 items-center rounded-full border px-2 text-xs ${state.className}`}>{state.label}</span></td>
            <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3">{dateOnlyText(row.receivableDate)}</td>
            <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3">{dateOnlyText(row.collectionDate)}</td>
            <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3"><span className={`inline-flex h-6 items-center rounded-full border px-2 text-xs ${invoiced ? "border-success-border bg-success-soft text-success" : "border-line-soft bg-canvas text-ink-3"}`}>{invoiced ? "已开票" : "未开票"}</span></td>
            <td className="max-w-[160px] truncate whitespace-nowrap border-b border-r border-line-soft px-3 py-3 text-xs" title={display(row.invoiceNo)}>{display(row.invoiceNo)}</td>
            <td className="whitespace-nowrap border-b border-line-soft px-3 py-3">
              <div className="flex items-center gap-1">
                <button className="inline-flex h-7 items-center rounded px-1.5 text-xs text-primary hover:bg-canvas" onClick={() => onEditCollection(row)} type="button">{state.key === "paid" ? "调整收款" : "登记收款"}</button>
                {invoiced
                  ? <button className="inline-flex h-7 items-center rounded px-1.5 text-xs text-primary hover:bg-canvas" onClick={() => onEditInvoice(row)} type="button">查看发票</button>
                  : <button className="inline-flex h-7 items-center rounded px-1.5 text-xs text-primary hover:bg-canvas" onClick={() => onIssueInvoice(row)} type="button">开票</button>}
                <IconButton icon={<FileUp size={14} />} label="上传并识别" onClick={() => onUploadInvoice(row)} />
              </div>
            </td>
          </tr>;
        })}
        {!rows.length ? <tr><td className="py-12 text-center text-ink-3" colSpan={12}><EmptyState title="暂无待收明细" /></td></tr> : null}
      </tbody>
    </table>
  </StickyTable>;
}

function RowTable({ attachmentVersion, currencyTotals, expanded, onToggleExpanded, rows, visibleColumns, onAttach, onConfirm, onDelete, onToggleCollection, onToggleInvoice, onEditRow, onEditCollection, onEditInvoice, onIssueInvoice, onUploadInvoice, query, onQueryChange, loadOptions }: { rows: Row[]; visibleColumns: LedgerColumn[]; expanded: Record<string, boolean>; onToggleExpanded: (row: Row) => void; onAttach: (row: Row, file: File) => void; onConfirm: (row: Row) => void; onDelete: (row: Row) => void; onToggleCollection: (row: Row) => void; onToggleInvoice: (row: Row) => void; onEditRow: (row: Row) => void; onEditCollection: (row: Row) => void; onEditInvoice: (row: Row) => void; onIssueInvoice: (row: Row) => void; onUploadInvoice: (row: Row) => void; query: QueryState; onQueryChange: (patch: Partial<QueryState>) => void; loadOptions: (field: string, keyword: string) => Promise<TableFilterOption[]>; currencyTotals?: Row[]; attachmentVersion?: number }) {

  function cell(row: Row, key: string) {
    const cellRow = cloudRowWithAmounts(row);
    if (key === "period") return periodText(row.period);
    if (key === "customer") {
      return <div className="min-w-[130px]"><div className="font-medium text-ink">{display(cellRow.customer)}</div><div className="mt-0.5 font-mono text-[11px] text-ink-3">{display(cellRow.account)}</div></div>;
    }
    if (["supplierCurrency", "customerCurrency", "collectionCurrency", "invoiceCurrency"].includes(key)) return <span className="font-medium text-ink">{display(cellRow[key] || "USD")}</span>;
    if (["customerReceivablePayer", "collectionPayer", "invoicePayer"].includes(key)) return display(cellRow[key] || cellRow.customer || "客户");
    if (["customerReceivablePayee", "collectionPayee", "invoicePayee"].includes(key)) return display(cellRow[key] || cellRow.undertakingUnitName || "承接单位");
    if (key === "status" || key === "collected" || key === "collectionInvoice") {
      const active = key === "collectionInvoice" ? cellRow.collectionInvoice === "issued" : Number(cellRow[key === "status" ? "confirmed" : "collected"]) === 1;
      const label = key === "status" ? (active ? "已确认" : "未确认") : key === "collected" ? (active ? "已收款" : "未收款") : (active ? "已开票" : "未开票");
      const color = active ? "border-success-border bg-success-soft text-success" : key === "collectionInvoice" ? "border-line-soft bg-canvas text-ink-3" : "border-warning-border-soft bg-warning-soft text-warning-ink";
      return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${color}`}>{label}</span>;
    }
    if (key === "supplierTaxRate" || key === "customerTaxRate" || key === "collectionTaxRate" || key === "invoiceTaxRate") return rateText(cellRow[key]);
    if (key === "createdAt" || key === "updatedAt" || key === "confirmedAt") return formatDisplayValue(cellRow[key] as never, "datetime");
    if (["invoiceDate", "receivableDate", "collectionDate"].includes(key)) return dateOnlyText(cellRow[key]);
    if (["catalogAmount", "partnerAmount", "voucherCustomerAmount", "voucherSupplierAmount", "supplierPayableNetAmount", "supplierTaxAmount", "supplierPayableTotalAmount", "theoreticalGrossProfit", "settlementGrossProfit"].includes(key)) return money(cellRow[key], String(cellRow.supplierCurrency || "USD"));
    if (["customerReceivableNetAmount", "customerReceivableTaxAmount", "customerReceivableTotalAmount"].includes(key)) return money(cellRow[key], String(cellRow.customerCurrency || "USD"));
    if (["collectionNetAmount", "collectionTaxAmount", "collectionTotalAmount"].includes(key)) return money(cellRow[key], String(cellRow.collectionCurrency || "USD"));
    if (["invoiceNetAmount", "invoiceTaxAmount", "invoiceTotalAmount"].includes(key)) return money(cellRow[key], String(cellRow.invoiceCurrency || "USD"));
    return display(cellRow[key]);
  }

  function actionButtons(row: Row) {
    return <div className="flex items-center gap-1">
      <IconButton icon={<Banknote size={14} />} label="编辑客户实收" onClick={() => onEditCollection(row)} />
      <IconButton icon={<FileText size={14} />} label="编辑客户开票" onClick={() => onEditInvoice(row)} />
      <IconButton disabled={isCloudRowConfirmed(row.confirmed)} icon={<Pencil size={14} />} label="修改华为云对账单" onClick={() => onEditRow(row)} />
      <IconButton icon={<Check size={14} />} label={isCloudRowConfirmed(row.confirmed) ? "取消确认" : "确认"} onClick={() => onConfirm(row)} tone="success" />
      <IconButton disabled={isCloudRowConfirmed(row.confirmed)} icon={<Trash2 size={14} />} label="删除华为云对账单" onClick={() => onDelete(row)} tone="danger" />
    </div>;
  }

  return <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col">
    <div className="min-h-0 flex-1 overflow-auto p-3 md:hidden">
      {rows.length ? rows.map((row) => {
        const id = String(row.id ?? "");
        const open = Boolean(expanded[id]);
        return <article className="mb-3 overflow-hidden rounded border border-line-soft bg-white" key={id}>
          <div className="flex items-start gap-3 border-b border-line-soft p-3">
            <div className="min-w-0 flex-1">
              {visibleColumns.some((column) => column.key === "period") ? <div className="font-medium text-ink">{periodText(row.period)}</div> : null}
              {visibleColumns.some((column) => column.key === "customer") ? <div className="mt-0.5 truncate text-xs text-ink-3">{display(row.customer)} · {display(row.account)}</div> : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-line-soft">
            {visibleColumns.filter((column) => !["period", "customer"].includes(column.key) && column.group !== "状态").map((column) => <div className="min-w-0 bg-white px-3 py-2" key={column.key}>
              <div className="text-[11px] text-ink-3">{column.label}</div>
              <div className="mt-0.5 truncate text-xs text-ink" title={String(row[column.key] ?? "")}>{cell(row, column.key)}</div>
            </div>)}
            {visibleColumns.some((column) => column.group === "状态") ? <div aria-label="账单状态" className="col-span-full grid grid-cols-3 gap-px" role="group">
              {visibleColumns.filter((column) => column.group === "状态").map((column) => <div className="min-w-0 bg-white px-3 py-2" key={column.key}>
                <div className="text-[11px] text-ink-3">{column.label}</div>
                <div className="mt-0.5 text-xs text-ink">{cell(row, column.key)}</div>
              </div>)}
            </div> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line-soft bg-surface-2 px-3 py-2">
            <Button size="sm" onClick={() => onToggleExpanded(row)}>{open ? "收起" : "展开"}</Button>
            <div className="ml-auto">{actionButtons(row)}</div>
          </div>
          {open ? <div className="border-t border-line-soft bg-canvas p-3"><CloudLedgerDetails row={row} attachmentVersion={attachmentVersion} onAttach={onAttach} onToggleCollection={onToggleCollection} onToggleInvoice={onToggleInvoice} onEditCollection={onEditCollection} onEditInvoice={onEditInvoice} onIssueInvoice={onIssueInvoice} onUploadInvoice={onUploadInvoice} /></div> : null}
        </article>;
      }) : <EmptyState title="暂无数据" />}
    </div>

    <div className="hidden min-h-0 min-w-0 max-w-full flex-1 flex-col md:flex">
      <div className="min-h-0 min-w-0 flex-1 [container-type:inline-size]">
        <StickyTable className="table-scroll h-full w-full overflow-auto" tableKey="cloud-rows">
          <table className="w-full border-collapse text-sm" style={{ minWidth: Math.max(1500, visibleColumns.length * 145 + 160) }}>
          <thead className="bg-canvas">
            <tr>
              {visibleColumns.map((column) => <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3 text-left font-medium" key={column.key}>
                {column.filterable === false ? column.label : <HeaderMenu field={column.key} label={column.label} query={query} onQueryChange={onQueryChange} loadOptions={loadOptions} />}
              </th>)}
              <th className="sticky right-0 whitespace-nowrap border-b border-line-soft bg-canvas px-3 py-3 text-left font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = String(row.id ?? "");
              const open = Boolean(expanded[id]);
              return <Fragment key={id}>
                <tr className="hover:bg-surface-2">
                  {visibleColumns.map((column, index) => <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3 align-top" key={column.key}>
                    {index === 0 ? <div className="flex items-center gap-2"><button aria-label={open ? "收起明细" : "展开明细"} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-line bg-white text-ink-2 hover:border-primary hover:text-primary" title={open ? "收起明细" : "展开明细"} type="button" onClick={() => onToggleExpanded(row)}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button><span>{cell(row, column.key)}</span></div> : cell(row, column.key)}
                  </td>)}
                  <td className="sticky right-0 whitespace-nowrap border-b border-line-soft bg-white px-3 py-2 align-top">{actionButtons(row)}</td>
                </tr>
                {open ? <tr><td className="border-b border-line-soft bg-canvas p-3" colSpan={visibleColumns.length + 1}><div className="sticky left-3 w-[calc(100cqw-1.5rem)] max-w-4xl"><CloudLedgerDetails row={row} attachmentVersion={attachmentVersion} onAttach={onAttach} onToggleCollection={onToggleCollection} onToggleInvoice={onToggleInvoice} onEditCollection={onEditCollection} onEditInvoice={onEditInvoice} onIssueInvoice={onIssueInvoice} onUploadInvoice={onUploadInvoice} /></div></td></tr> : null}
              </Fragment>;
            })}
            {!rows.length ? <tr><td className="py-12 text-center text-ink-3" colSpan={visibleColumns.length + 1}><EmptyState title="暂无数据" /></td></tr> : null}
          </tbody>
          {currencyTotals?.length ? <tfoot>{currencyTotals.map((totals) => <tr key={String(totals.currency)}>
            {visibleColumns.map((column, index) => <td className="sticky bottom-0 whitespace-nowrap border-t-2 border-line bg-canvas-deep px-3 py-3 align-top font-medium text-ink" key={column.key}>{index === 0 ? <div className="text-xs">合计（{display(totals.currency)}）</div> : null}{totals[column.key] === undefined || totals[column.key] === null ? "" : money(totals[column.key], "")}</td>)}
            <td className="sticky bottom-0 border-t-2 border-line bg-canvas-deep px-3 py-3" />
          </tr>)}</tfoot> : null}
          </table>
        </StickyTable>
      </div>
    </div>

  </div>;
}

function cloudRowWithAmounts(row: Row): Row {
  const supplierNet = row.supplierPayableNetAmount ?? row.supplierPayable;
  const supplierTaxRate = row.supplierTaxRate;
  const supplierTax = row.supplierTaxAmount ?? (supplierNet !== null && supplierNet !== undefined && supplierTaxRate !== null && supplierTaxRate !== undefined ? Number(supplierNet) * Number(supplierTaxRate) : null);
  const customerNet = row.customerReceivableNetAmount ?? row.customerReceivable;
  const customerTaxRate = row.customerTaxRate;
  const customerTax = row.customerReceivableTaxAmount ?? (customerNet !== null && customerNet !== undefined && customerTaxRate !== null && customerTaxRate !== undefined ? Number(customerNet) * Number(customerTaxRate) : null);
  return {
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
}

function CloudLedgerDetails({ row, attachmentVersion, onAttach, onToggleCollection, onToggleInvoice, onEditCollection, onEditInvoice, onIssueInvoice, onUploadInvoice }: {
  row: Row;
  attachmentVersion?: number;
  onAttach: (row: Row, file: File) => void;
  onToggleCollection: (row: Row) => void;
  onToggleInvoice: (row: Row) => void;
  onEditCollection: (row: Row) => void;
  onEditInvoice: (row: Row) => void;
  onIssueInvoice: (row: Row) => void;
  onUploadInvoice: (row: Row) => void;
}) {
  const detailRow = cloudRowWithAmounts(row);
  const groups: Array<{ title: string; fields: Array<{ label: string; value: React.ReactNode }>; flow?: { payer: React.ReactNode; payee: React.ReactNode } }> = [
    { title: "基本信息", fields: [
      { label: "账期", value: periodText(detailRow.period) },
      { label: "客户名称", value: display(detailRow.customer) },
      { label: "华为ID", value: display(detailRow.account) },
      { label: "华为对账人", value: display(detailRow.cloudReconciler) },
      { label: "账单币种", value: display(detailRow.supplierCurrency || "USD") },
    ] },
    { title: "金额", fields: [
      { label: "目录价", value: money(detailRow.catalogAmount, String(detailRow.supplierCurrency || "USD")) },
      { label: "代金券-客户", value: money(detailRow.voucherCustomerAmount, String(detailRow.supplierCurrency || "USD")) },
      { label: "代金券-供应商", value: money(detailRow.voucherSupplierAmount, String(detailRow.supplierCurrency || "USD")) },
      { label: "伙伴结算金额", value: money(detailRow.partnerAmount, String(detailRow.supplierCurrency || "USD")) },
    ] },
    { title: "供应商应付", fields: [
      { label: "供应商应付未税", value: money(detailRow.supplierPayableNetAmount, String(detailRow.supplierCurrency || "USD")) },
      { label: "供应商税率", value: rateText(detailRow.supplierTaxRate) },
      { label: "供应商税金", value: money(detailRow.supplierTaxAmount, String(detailRow.supplierCurrency || "USD")) },
      { label: "供应商应付含税", value: money(detailRow.supplierPayableTotalAmount, String(detailRow.supplierCurrency || "USD")) },
    ] },
    { title: "客户应收", flow: {
      payer: display(detailRow.customerReceivablePayer || detailRow.customer || "客户"),
      payee: display(detailRow.customerReceivablePayee || detailRow.undertakingUnitName || "承接单位"),
    }, fields: [
      { label: "客户应付未税", value: money(detailRow.customerReceivableNetAmount, String(detailRow.customerCurrency || "USD")) },
      { label: "客户应付税率", value: rateText(detailRow.customerTaxRate) },
      { label: "客户应付税金", value: money(detailRow.customerReceivableTaxAmount, String(detailRow.customerCurrency || "USD")) },
      { label: "客户应付含税", value: money(detailRow.customerReceivableTotalAmount, String(detailRow.customerCurrency || "USD")) },
    ] },
    { title: "客户实收", flow: {
      payer: display(detailRow.collectionPayer || detailRow.customer || "客户"),
      payee: display(detailRow.collectionPayee || detailRow.undertakingUnitName || "承接单位"),
    }, fields: [
      { label: "客户实付未税", value: money(detailRow.collectionNetAmount, String(detailRow.collectionCurrency || "USD")) },
      { label: "客户实付税率", value: rateText(detailRow.collectionTaxRate) },
      { label: "客户实付税金", value: money(detailRow.collectionTaxAmount, String(detailRow.collectionCurrency || "USD")) },
      { label: "客户实付含税", value: money(detailRow.collectionTotalAmount, String(detailRow.collectionCurrency || "USD")) },
    ] },
    { title: "客户开票", flow: {
      payer: display(detailRow.invoicePayer || detailRow.customer || "客户"),
      payee: display(detailRow.invoicePayee || detailRow.undertakingUnitName || "承接单位"),
    }, fields: [
      { label: "客户开票未税", value: money(detailRow.invoiceNetAmount, String(detailRow.invoiceCurrency || "USD")) },
      { label: "客户开票税率", value: rateText(detailRow.invoiceTaxRate) },
      { label: "客户开票税金", value: money(detailRow.invoiceTaxAmount, String(detailRow.invoiceCurrency || "USD")) },
      { label: "客户开票含税", value: money(detailRow.invoiceTotalAmount, String(detailRow.invoiceCurrency || "USD")) },
    ] },
    { title: "毛利与其他", fields: [
      { label: "万众理论毛利（未税）", value: money(detailRow.theoreticalGrossProfit, String(detailRow.supplierCurrency || "USD")) },
      { label: "万众实际毛利（未税）", value: money(detailRow.settlementGrossProfit, String(detailRow.supplierCurrency || "USD")) },
      { label: "客户折扣", value: display(detailRow.customerDiscount) },
      { label: "备注", value: display(detailRow.remark) },
    ] },
    { title: "审计", fields: [
      { label: "创建时间", value: formatDisplayValue(detailRow.createdAt as never, "datetime") },
      { label: "更新时间", value: formatDisplayValue(detailRow.updatedAt as never, "datetime") },
      { label: "确认时间", value: formatDisplayValue(detailRow.confirmedAt as never, "datetime") },
    ] },
  ];
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2 rounded border border-line-soft bg-surface-2 px-3 py-2">
      <span className="text-xs font-medium text-ink-2">本行操作</span>
      <button aria-checked={Boolean(row.collected)} className="inline-flex h-7 items-center gap-1 rounded border border-line bg-white px-2 text-xs text-ink-2 disabled:opacity-50" role="switch" type="button" onClick={() => onToggleCollection(row)}><span className={`relative inline-flex h-4 w-7 rounded-full ${row.collected ? "bg-success" : "bg-ink-4"}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow ${row.collected ? "translate-x-[15px]" : "translate-x-0.5"}`} /></span>{row.collected ? "已收款" : "未收款"}</button>
      <Button size="sm" onClick={() => onEditCollection(row)}>编辑实收</Button>
      <button aria-checked={row.collectionInvoice === "issued"} className="inline-flex h-7 items-center gap-1 rounded border border-line bg-white px-2 text-xs text-ink-2 disabled:opacity-50" role="switch" type="button" onClick={() => onToggleInvoice(row)}><span className={`relative inline-flex h-4 w-7 rounded-full ${row.collectionInvoice === "issued" ? "bg-success" : "bg-ink-4"}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow ${row.collectionInvoice === "issued" ? "translate-x-[15px]" : "translate-x-0.5"}`} /></span>{row.collectionInvoice === "issued" ? "已开票" : "未开票"}</button>
      <Button size="sm" onClick={() => onEditInvoice(row)}>编辑开票</Button>
      <Button size="sm" onClick={() => onIssueInvoice(row)}>开票</Button>
      <Button size="sm" onClick={() => onUploadInvoice(row)}>上传并识别</Button>
      <UploadIconButton icon={<FileUp size={13} />} label="上传客户发票附件" onFile={(event) => { const file = event.target.files?.[0]; if (file) onAttach(row, file); event.target.value = ""; }} />
      <CloudAttachments ownerId={String(row.id ?? "")} ownerType="invoice" refreshToken={attachmentVersion} />
      <InvoiceApprovalBadge row={row} />
    </div>
    <StatementInvoiceSummary invoiceNo={row.invoiceNo} invoiceDate={row.invoiceDate} receivableDate={row.receivableDate} collectionDate={row.collectionDate} />
    {groups.map((group) => <section className="overflow-hidden rounded border border-line-soft" key={group.title}>
      <div className="border-b border-line-soft bg-canvas px-3 py-2 text-xs font-medium text-ink-2">{group.title}</div>
      <StatementDetailGrid fields={group.fields} flow={group.flow} singleRow={group.title === "基本信息"} />
    </section>)}
  </div>;
}

function MappingTable({ rows, onEdit, query, onQueryChange, loadOptions }: { rows: Row[]; onEdit: (row: Row) => void; query: QueryState; onQueryChange: (patch: Partial<QueryState>) => void; loadOptions: (field: string, keyword: string) => Promise<TableFilterOption[]> }) {
  return <StickyTable className="table-scroll h-full w-full overflow-auto" tableKey="cloud-mappings"><table className="w-full min-w-[1100px] border-collapse text-sm"><thead className="bg-canvas"><tr>{mappingColumns.map(([field, label]) => <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3 text-left font-medium" key={field}><HeaderMenu field={field} label={label} query={query} onQueryChange={onQueryChange} loadOptions={loadOptions} /></th>)}<th className="whitespace-nowrap border-b border-line-soft px-3 py-3 text-left font-medium">操作</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{mappingColumns.map(([field]) => <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3" key={field}>{display(row[field])}</td>)}<td className="border-b border-line-soft px-3 py-3"><IconButton icon={<Pencil size={14} />} label="修改" onClick={() => onEdit(row)} /></td></tr>)}{!rows.length ? <tr><td className="py-12 text-center text-ink-3" colSpan={mappingColumns.length + 1}><EmptyState title="暂无映射" /></td></tr> : null}</tbody></table></StickyTable>;
}

function PaymentTable({ attachmentVersion, rows, onAttach, onPay, onUpdate, onTogglePaid, onToggleInvoice, query, onQueryChange, loadOptions }: { rows: Row[]; onAttach: (row: Row, file: File) => void; onPay: (row: Row) => void; onUpdate: (row: Row) => void; onTogglePaid: (row: Row) => void; onToggleInvoice: (row: Row) => void; query: QueryState; onQueryChange: (patch: Partial<QueryState>) => void; loadOptions: (field: string, keyword: string) => Promise<TableFilterOption[]>; attachmentVersion?: number }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  function cell(row: Row, key: string) {
    if (key === "period") {
      const id = String(row.id);
      return <div className="flex items-center gap-2"><button aria-label={expanded[id] ? "收起账号明细" : "展开账号明细"} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line bg-white text-ink-2 hover:border-primary hover:text-primary" title={expanded[id] ? "收起账号明细" : "展开账号明细"} type="button" onClick={() => setExpanded((current) => ({ ...current, [id]: !current[id] }))}>{expanded[id] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button><span>{periodText(row[key])}</span></div>;
    }
    if (key === "supplierPayableCurrency") return display(row[key] || "USD");
    if (["supplierPayableNetAmount", "supplierTaxAmount", "supplierPayableTotalAmount"].includes(key)) return money(row[key], String(row.supplierPayableCurrency || "USD"));
    if (key === "supplierTaxRate" || key === "invoiceTaxRate") return rateText(row[key]);
    if (["paymentNetAmount", "paymentTaxAmount", "paymentTotalAmount"].includes(key)) return money(row[key], String(row.currency || "USD"));
    if (key === "currency") return display(row[key] || "USD");
    if (key === "paymentExchangeRate") return exchangeRateText(row[key]);
    if (key === "paymentTaxRate") return rateText(row[key]);
    if (["invoiceNetAmount", "invoiceTaxAmount", "invoiceTotalAmount"].includes(key)) return money(row[key], String(row.invoiceCurrency || "USD"));
    if (key === "invoiceCurrency") return display(row[key]);
    if (key === "invoiceExchangeRate") return exchangeRateText(row[key]);
    if (key === "accountCount") return integerText(row[key]);
    if (key === "paymentApprovalStatus") {
      const label = paymentApprovalStatusLabel(row[key]);
      if (!label) return "-";
      const title = [
        `审批状态：${label}`,
        row.paymentApprovalNo ? `单号：${String(row.paymentApprovalNo)}` : "",
        row.paymentConfirmedAt ? `确认到账：${formatDisplayValue(row.paymentConfirmedAt as never, "datetime")}` : "",
      ].filter(Boolean).join(" · ");
      return <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${paymentApprovalStatusClass(row[key])}`} title={title}>{label}</span>;
    }
    if (key === "paid") return <StatusSwitch checked={Boolean(row.paid)} onClick={() => onTogglePaid(row)} onLabel="已付款" offLabel="未付款" title="点击切换付款状态" />;
    if (key === "invoiceStatus") return <StatusSwitch checked={row.invoiceStatus === "issued"} onClick={() => onToggleInvoice(row)} onLabel="已开票" offLabel="未开票" title="点击切换开票状态" />;
     if (key === "updatedAt") return formatDisplayValue(row[key] as never, "datetime");
     if (["paymentDate", "receivableDate", "invoiceDate"].includes(key)) return dateOnlyText(row[key]);
    return display(row[key]);
  }
  return <StickyTable className="table-scroll h-full w-full overflow-auto" tableKey="cloud-payments"><table className="w-full min-w-[1800px] border-collapse text-sm"><thead className="bg-canvas"><tr>{paymentColumns.map(([field, label]) => <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3 text-left font-medium" key={field}><HeaderMenu field={field} label={label} query={query} onQueryChange={onQueryChange} loadOptions={loadOptions} /></th>)}<th className="whitespace-nowrap border-b border-line-soft px-3 py-3 text-left font-medium">操作</th></tr></thead><tbody>{rows.map((row) => { const children = Array.isArray(row.children) ? row.children as Row[] : []; return <Fragment key={String(row.id)}><tr className="hover:bg-surface-2">{paymentColumns.map(([key]) => <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3 align-top" key={key}>{cell(row, key)}</td>)}<td className="border-b border-line-soft px-3 py-2 align-top"><div className="flex items-center gap-1"><IconButton icon={<Pencil size={14} />} label="编辑供应商实付和开票" onClick={() => onUpdate(row)} /><Button aria-label="发起成本款付款申请" className="h-8 px-2.5 text-xs" onClick={() => onPay(row)} size="sm" title="发起成本款付款申请（飞书审批）" tone="secondary"><Banknote size={13} />发起付款</Button><UploadIconButton icon={<FileUp size={14} />} label="上传供应商付款发票" onFile={(event) => { const file = event.target.files?.[0]; if (file) onAttach(row, file); event.target.value = ""; }} /><CloudAttachments ownerId={String(row.id ?? "")} ownerType="supplier_payment" refreshToken={attachmentVersion} /></div></td></tr>{expanded[String(row.id)] ? <tr><td className="border-b border-line-soft bg-surface-2 px-10 py-3" colSpan={paymentColumns.length + 1}><table className="w-full min-w-[1000px] border-collapse text-sm"><thead><tr>{["客户", "华为云账号", "供应商应付未税", "税金", "供应商应付含税", "创建时间", "更新时间"].map((label) => <th className="whitespace-nowrap border-b border-line-soft px-3 py-3 text-left font-medium text-ink-2" key={label}>{label}</th>)}</tr></thead><tbody>{children.map((child) => <tr key={String(child.id)}><td className="border-b border-line-soft px-3 py-2">{display(child.customer)}</td><td className="border-b border-line-soft px-3 py-2 text-ink-2">{display(child.account)}</td><td className="border-b border-line-soft px-3 py-2">{money(child.supplierPayableNetAmount, String(child.supplierPayableCurrency || "USD"))}</td><td className="border-b border-line-soft px-3 py-2">{money(child.supplierTaxAmount, String(child.supplierPayableCurrency || "USD"))}</td><td className="border-b border-line-soft px-3 py-2">{money(child.supplierPayableTotalAmount, String(child.supplierPayableCurrency || "USD"))}</td><td className="whitespace-nowrap border-b border-line-soft px-3 py-2">{formatDisplayValue(child.createdAt as never, "datetime")}</td><td className="whitespace-nowrap border-b border-line-soft px-3 py-2">{formatDisplayValue(child.updatedAt as never, "datetime")}</td></tr>)}</tbody></table></td></tr> : null}</Fragment>; })}{!rows.length ? <tr><td className="py-12 text-center text-ink-3" colSpan={paymentColumns.length + 1}><EmptyState title="暂无供应商付款" /></td></tr> : null}</tbody></table></StickyTable>;
}

function StatusSwitch({ checked, onClick, onLabel, offLabel, title }: { checked: boolean; onClick: () => void; onLabel: string; offLabel: string; title: string }) {
  return <button aria-checked={checked} className="inline-flex items-center gap-1 text-xs text-ink-2" role="switch" title={title} type="button" onClick={onClick}><span className={`relative inline-flex h-4 w-7 rounded-full ${checked ? "bg-success" : "bg-ink-4"}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[15px]" : "translate-x-0.5"}`} /></span><span>{checked ? onLabel : offLabel}</span></button>;
}

function InvoiceApprovalBadge({ row }: { row: Row }) {
  const status = String(row.invoiceApprovalStatus ?? "").trim();
  if (!status) return null;
  const label = invoiceApprovalStatusLabel(status, row.invoiceApprovalInvoiceId, row.invoiceApprovalInvoiceStatus);
  const tone = status === "approved"
    ? "border-success bg-success-soft text-success"
    : status === "rejected"
      ? "border-danger-border-strong bg-danger-soft text-danger"
      : status === "canceled" || status === "cancelled"
        ? "border-line bg-canvas text-ink-2"
        : "border-warning bg-warning-soft text-warning";
  const title = [
    `飞书开票审批：${label}`,
    row.invoiceApprovalNo ? `单号：${String(row.invoiceApprovalNo)}` : "",
    row.invoiceApprovalAt ? `提交于：${String(row.invoiceApprovalAt)}` : "",
  ].filter(Boolean).join(" · ");
  return <span className={`inline-flex h-6 items-center rounded border px-1.5 text-xs ${tone}`} title={title}>{label}</span>;
}

function CloudRowForm({ value, masters, onChange, onCancel, onSave }: { value: Row; masters: MasterSet; onChange: (value: Row) => void; onCancel: () => void; onSave: () => void }) {
  const fields: Array<[string, string, string?]> = [
    ["period", "账期", "month"], ["batchCode", "批次号"], ["account", "华为ID"], ["cloudReconciler", "华为对账人"],
    ["catalogAmount", "目录价（USD）", "number"], ["partnerAmount", "伙伴结算金额（USD）", "number"], ["voucherCustomerAmount", "代金券-客户（USD）", "number"],
    ["voucherSupplierAmount", "代金券-供应商（USD）", "number"], ["supplierPayablePayer", "供应商应付-承接单位"], ["supplierPayablePayee", "供应商应付-供应商"],
    ["supplierPayableNetAmount", "供应商应付（不含税）", "number"], ["supplierTaxRate", "供应商税率", "number"], ["supplierTaxAmount", "供应商税金", "number"],
    ["supplierPayableTotalAmount", "供应商应付（含税）", "number"], ["customerReceivablePayer", "客户应收-客户"], ["customerReceivablePayee", "客户应收-承接单位"],
    ["customerReceivableNetAmount", "客户应收（不含税）", "number"], ["customerTaxRate", "客户承担税率", "number"], ["customerReceivableTaxAmount", "客户税金", "number"],
    ["customerReceivableTotalAmount", "客户应收（含税）", "number"], ["theoreticalGrossProfit", "万众理论毛利（USD）", "number"], ["settlementGrossProfit", "万众结算毛利（USD）", "number"],
    ["customerDiscount", "特殊折扣（文本）"], ["calculationLogic", "计算逻辑"],
  ];
  const changeField = (key: string, type: string | undefined, input: string) => {
    let next: Row | null = null;
    if (type === "number") {
      for (const group of ["supplierPayable", "customerReceivable"] as const) {
        const field = cloudTaxInputField(group, key);
        if (field) {
          next = updateCloudTaxValue(value, group, field, input);
          break;
        }
      }
    }
    const result = next ?? { ...value, [key]: input };
    // 应收/应付一改，若"万众结算毛利"还是空的，就按 应收（不含税） − 应付（不含税） 自动带出。
    // 已经填过的值（导入或人工改过）不动，避免把带额外扣减的行算错。
    if (key !== "customerReceivableNetAmount" && key !== "supplierPayableNetAmount") return result;
    if (String(result.settlementGrossProfit ?? "").trim() !== "") return result;
    const auto = computeCloudSettlementGrossProfit({
      customerReceivableNet: result.customerReceivableNetAmount,
      supplierPayableNet: result.supplierPayableNetAmount,
    });
    return auto === null ? result : { ...result, settlementGrossProfit: String(auto) };
  };
  return <Modal footer={<><Button onClick={onCancel}>取消</Button><Button onClick={onSave} tone="primary">保存</Button></>} onClose={onCancel} title={`${value.id ? "修改" : "手动新增"}华为云对账单`} widthClass="max-w-4xl"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><PartnerSelect required kind="customers" label="客户名称" idValue={value.customerId} nameValue={value.customer} masters={masters} onChange={(selected) => onChange({ ...value, customerId: selected.id, customer: selected.name })} />{fields.map(([key, label, type]) => <label className="space-y-1 text-sm text-ink-2" key={key}><span>{label}{key === "period" || key === "account" ? <b className="ml-1 text-danger">*</b> : null}</span><Input autoFocus={key === "account" && !value.id} className="w-full" type={type ?? "text"} value={String(value[key] ?? "")} onChange={(event) => onChange(changeField(key, type, event.target.value))} /></label>)}<label className="space-y-1 text-sm text-ink-2 sm:col-span-2 lg:col-span-3"><span>备注</span><textarea className="min-h-20 w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary" value={String(value.remark ?? "")} onChange={(event) => onChange({ ...value, remark: event.target.value })} /></label></div></Modal>;
}

function SupplierPaymentForm({ value, masters, onChange, onCancel, onSave }: {
  value: Row;
  masters: MasterSet;
  onChange: (value: Row) => void;
  onCancel: () => void;
  onSave: (file?: File | null, recognitionFacts?: Record<string, string>) => Promise<void>;
}) {
  const paymentFields: Array<[string, string, string?]> = [
    ["currency", "实付币种"], ["paymentExchangeRate", "实付汇率", "number"], ["paymentNetAmount", "实付未税金额", "number"],
    ["paymentTaxRate", "实付税率", "number"], ["paymentTaxAmount", "实付税金", "number"], ["paymentTotalAmount", "实付含税金额", "number"], ["paymentDate", "实际付款日期", "date"],
  ];
  const invoiceFields: Array<[string, string, string?]> = [
    ["invoiceNo", "发票号"], ["invoiceCurrency", "发票币种"], ["invoiceExchangeRate", "发票汇率", "number"], ["invoiceNetAmount", "发票未税金额", "number"],
    ["invoiceTaxRate", "发票税率（%）", "number"], ["invoiceTaxAmount", "发票税金", "number"], ["invoiceTotalAmount", "发票含税金额", "number"], ["invoiceDate", "开票日期", "date"], ["receivableDate", "预计付款日期", "date"],
  ];
  const changeField = (key: string, type: string | undefined, input: string) => {
    if (key === "invoiceDate") {
      return { ...value, invoiceDate: input, receivableDate: value.receivableDate || addDaysToDateOnly(input, 30) };
    }
    if (type === "number" && ["payment", "invoice"].some((prefix) => key.startsWith(prefix)) && ["NetAmount", "TaxRate", "TaxAmount", "TotalAmount"].some((suffix) => key.endsWith(suffix))) {
      const prefix = key.startsWith("payment") ? "payment" : "invoice";
      if (prefix === "invoice") {
        const field = key.endsWith("NetAmount") ? "amountExcludingTax" : key.endsWith("TaxAmount") ? "taxAmount" : key.endsWith("TotalAmount") ? "amountIncludingTax" : "taxRate";
        const next = updateInvoiceReviewAmounts(reviewValues, field, input);
        return { ...value, invoiceNetAmount: next.amountExcludingTax, invoiceTaxRate: next.taxRate === "" ? "" : String(Number(next.taxRate) / 100), invoiceTaxAmount: next.taxAmount, invoiceTotalAmount: next.amountIncludingTax };
      }
      return updateCloudTaxValue(value, prefix, key.endsWith("NetAmount") ? "net" : key.endsWith("TaxAmount") ? "tax" : key.endsWith("TotalAmount") ? "total" : "rate", input);
    }
    return { ...value, [key]: input };
  };
  const recognizeInputRef = useRef<HTMLInputElement>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [recognizeMessage, setRecognizeMessage] = useState("");
  const [recognizeWarnings, setRecognizeWarnings] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [recognitionResult, setRecognitionResult] = useState<InvoiceRecognition | null>(null);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const reviewValues = { invoiceNo: String(value.invoiceNo ?? ""), invoiceDate: dateInputValue(value.invoiceDate), currency: String(value.invoiceCurrency ?? ""), exchangeRate: String(value.invoiceExchangeRate ?? ""), amountExcludingTax: String(value.invoiceNetAmount ?? ""), taxRate: value.invoiceTaxRate === null || value.invoiceTaxRate === undefined || value.invoiceTaxRate === "" ? "" : String(Number(value.invoiceTaxRate) * 100), taxAmount: String(value.invoiceTaxAmount ?? ""), amountIncludingTax: String(value.invoiceTotalAmount ?? "") };
  const close = () => { if (!lock.current) onCancel(); };
  async function save() {
    if (lock.current) return;
    if (pendingFile && !(value.invoiceSupplierId ?? value.supplierId)) { setRecognizeWarnings("请先选择实际开票供应商"); return; }
    const error = pendingFile ? validateInvoiceReview(reviewValues) : "";
    if (error) { setRecognizeWarnings(error); return; }
    lock.current = true; setSaving(true);
    try { await onSave(pendingFile, recognitionResult?.facts); }
    catch (error) { setRecognizeWarnings(error instanceof Error ? error.message : "保存失败"); }
    finally { lock.current = false; setSaving(false); }
  }

  async function recognizeInvoice(file: File) {
    if (lock.current) return;
    if (file.size > 20 * 1024 * 1024) { setRecognizeWarnings("文件不能超过 20 MB"); return; }
    lock.current = true; setPendingFile(file); setRecognitionResult(null);
    onChange({ ...value, invoiceSupplierId: "", invoiceSupplierName: "", invoiceNo: "", invoiceDate: "", invoiceNetAmount: "", invoiceTaxRate: "", invoiceTaxAmount: "", invoiceTotalAmount: "" });
    setRecognizing(true);
    setRecognizeMessage("");
    setRecognizeWarnings("");
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/cloud/supplier-payments/recognize", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data.error ?? "发票识别失败"));
      const recognition = data.recognition ?? {};
      setRecognitionResult(recognition);
      const { patch, warnings: mappingWarnings } = buildSupplierPaymentInvoicePatch(recognition.form ?? {}, { supplierId: value.supplierId, receivableDate: value.receivableDate });
      onChange({ ...value, invoiceNo: "", invoiceDate: "", invoiceNetAmount: "", invoiceTaxRate: "", invoiceTaxAmount: "", invoiceTotalAmount: "", invoiceExchangeRate: recognition.form?.currency === value.invoiceCurrency ? value.invoiceExchangeRate : "", ...patch });

      const warnings: string[] = [
        ...(Array.isArray(recognition.warnings) ? recognition.warnings : []),
        ...mappingWarnings,
      ];
      setRecognizeMessage("识别完成，待确认保存");
      if (warnings.length) setRecognizeWarnings(warnings.join("；"));
    } catch (error) {
      setRecognizeWarnings(`${error instanceof Error ? error.message : "发票识别失败"}，可手工补充后确认`);
    } finally {
      lock.current = false; setRecognizing(false);
    }
  }
  return <Modal description="供应商付款按账期和供应商汇总，明细账号只展示供应商应付金额" footer={<><Button disabled={saving || recognizing} onClick={close}>取消</Button><Button disabled={saving || recognizing} onClick={() => void save()} tone="primary">{saving ? "保存中…" : "确认保存"}</Button></>} onClose={close} title="编辑供应商实付和开票" widthClass="max-w-4xl">
    <fieldset disabled={saving || recognizing}>
      <div className="grid gap-3 border-b border-line-soft pb-4 sm:grid-cols-2">
        <PartnerSelect kind="undertakingUnits" label="付款单位" idValue={value.payerUnitId} nameValue={value.payerUnitName} masters={masters} onChange={(selected) => onChange({ ...value, payerUnitId: selected.id, payerUnitName: selected.name })} />
      </div>
      <section className="mt-4">
        <h3 className="mb-3 text-sm font-medium text-ink">供应商实付</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{paymentFields.map(([key, label, type]) => <label className="space-y-1 text-sm text-ink-2" key={key}><span>{label}</span><Input className="w-full" type={type ?? "text"} value={type === "date" ? dateInputValue(value[key]) : String(value[key] ?? "")} onChange={(event) => onChange(changeField(key, type, event.target.value))} /></label>)}</div>
        <div className="mt-3"><StatusSwitch checked={Boolean(value.paid)} onClick={() => onChange({ ...value, paid: value.paid ? 0 : 1 })} onLabel="已付款" offLabel="未付款" title="点击切换付款状态" /></div>
      </section>
      <section className="mt-5 border-t border-line-soft pt-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-ink">供应商开票</h3>
          <Button size="sm" disabled={recognizing || saving} onClick={() => recognizeInputRef.current?.click()} title="选择发票并识别"><ScanLine size={14} />{recognizing ? "上传识别中…" : "上传并识别"}</Button>
          <input ref={recognizeInputRef} className="hidden" type="file" accept=".pdf,.ofd,.xml,application/pdf,text/xml,application/xml" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void recognizeInvoice(file); }} />
          {pendingFile ? <span className="text-xs text-ink-3">待确认</span> : null}
        </div>
        {recognizeMessage ? <div className="mb-3 rounded border border-info-border bg-info-soft px-3 py-2 text-xs text-primary">{recognizeMessage}</div> : null}
        {recognizeWarnings ? <div className="mb-3 rounded border border-warning-border-soft bg-warning-soft px-3 py-2 text-xs text-warning-ink">{recognizeWarnings}</div> : null}
        <InvoiceRecognitionReview recognition={recognitionResult} file={pendingFile} values={reviewValues} />
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <PartnerSelect kind="suppliers" label="实际开票供应商" idValue={value.invoiceSupplierId ?? value.supplierId} nameValue={value.invoiceSupplierName ?? value.supplierName} masters={masters} onChange={selected => onChange({ ...value, invoiceSupplierId: selected.id, invoiceSupplierName: selected.name })} />
          <p className="self-end text-xs text-ink-3">业务供应商：{String(value.supplierName ?? "—")}。更换开票供应商仅影响本次发票登记。</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{invoiceFields.map(([key, label, type]) => <label className="space-y-1 text-sm text-ink-2" key={key}><span>{label}</span><Input className="w-full" type={type ?? "text"} value={key === "invoiceTaxRate" ? reviewValues.taxRate : type === "date" ? dateInputValue(value[key]) : String(value[key] ?? "")} onChange={(event) => onChange(changeField(key, type, event.target.value))} /></label>)}</div>
        <div className="mt-3"><StatusSwitch checked={value.invoiceStatus === "issued"} onClick={() => onChange({ ...value, invoiceStatus: value.invoiceStatus === "issued" ? "not_issued" : "issued" })} onLabel="已开票" offLabel="未开票" title="点击切换开票状态" /></div>
      </section>
    </fieldset>
  </Modal>;
}

function cloudTaxInputField(group: CloudTaxGroup, key: string): CloudTaxField | null {
  const { netKey, rateKey, taxKey, totalKey } = CLOUD_TAX_GROUPS[group];
  if (key === netKey) return "net";
  if (key === rateKey) return "rate";
  if (key === taxKey) return "tax";
  return key === totalKey ? "total" : null;
}

function updateCloudTaxValue(value: Row, group: CloudTaxGroup, field: CloudTaxField, input: string) {
  const next = { ...value };
  const { netKey, rateKey, taxKey, totalKey } = CLOUD_TAX_GROUPS[group];
  next[field === "net" ? netKey : field === "tax" ? taxKey : field === "total" ? totalKey : rateKey] = input;
  const calculation = calculateCloudTaxGroup(next, group, [field === "net" ? netKey : field === "tax" ? taxKey : field === "total" ? totalKey : rateKey]);
  if (calculation.source === "net-rate") {
    next[taxKey] = String(calculation.tax);
    next[totalKey] = String(calculation.total);
  } else if (calculation.source === "total") {
    next[netKey] = String(calculation.net);
    next[taxKey] = String(calculation.tax);
  } else if (calculation.source === "tax") {
    next[totalKey] = String(calculation.total);
  }
  return next;
}

/**
 * 默认付款单位 / 客户等伙伴选择：统一走 SearchSelect。
 * 选项来自 `masters`，输入关键词时再走一次远端搜索（/api/cloud/master-data）。
 */
function PartnerSelect({ kind, label, idValue, nameValue, masters, onChange, required = false }: { kind: keyof MasterSet; label: string; idValue: unknown; nameValue: unknown; masters: MasterSet; onChange: (value: { id: string; name: string }) => void; required?: boolean }) {
  const [options, setOptions] = useState<Master[]>(masters[kind]);
  const searchTimer = useRef<number | null>(null);
  const searchRequest = useRef(0);
  useEffect(() => setOptions(masters[kind]), [kind, masters]);
  useEffect(() => () => { searchRequest.current += 1; if (searchTimer.current) window.clearTimeout(searchTimer.current); }, []);

  const selectedId = String(idValue ?? "");
  const selectedName = String(nameValue ?? "");
  const known = options.find((item) => item.id === selectedId);
  // 已保存的值不在当前选项里时补一条占位，避免回显成空白
  const withSelected: Master[] = known || !selectedId
    ? options.map(item => item.id === selectedId && selectedName ? { ...item, shortName: selectedName } : item)
    : [{ id: selectedId, name: selectedName || selectedId, shortName: selectedName }, ...options];

  function handleSearch(keyword: string) {
    const request = ++searchRequest.current;
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    const trimmed = keyword.trim();
    /**
     * 每次展开下拉都重新拉一次基础资料：标签页常驻时 `masters` 可能是改名前的旧数据，
     * 直接复用会让"列表已显示新简称、弹层还显示旧简称"。拉取失败才退回内存里的列表。
     */
    searchTimer.current = window.setTimeout(() => {
      void requestJson<MasterSet>(`/api/cloud/master-data?keyword=${encodeURIComponent(trimmed)}`)
        .then((data) => { if (request === searchRequest.current) setOptions(data[kind]); })
        .catch(() => { if (request === searchRequest.current && !trimmed) setOptions(masters[kind]); });
    }, trimmed ? 180 : 0);
  }

  return (
    <label className="space-y-1 text-sm text-ink-2">
      <span>{label}{required ? <b className="ml-1 text-danger">*</b> : null}</span>
      <SearchSelect
        className="w-full"
        options={withSelected.map((item) => ({
          value: item.id,
          label: item.shortName || item.name,
          code: item.code,
          hint: item.name,
          keywords: [item.taxNumber, item.name, item.nameEn, item.nameCn, item.entityName].filter(Boolean).join(" "),
        }))}
        placeholder="输入名称、编码或税号搜索"
        value={selectedId}
        onChange={(value) => {
          const picked = withSelected.find((item) => item.id === value);
          onChange({ id: value, name: picked ? picked.shortName || picked.name : "" });
        }}
        onSearch={handleSearch}
      />
    </label>
  );
}

function CloudAmountForm({ mode, value, masters, onChange, onCancel, onSave, onRequestAllocation }: { mode: "collection" | "invoice"; value: Row; masters: MasterSet; onChange: (value: Row) => void; onCancel: () => void; onSave: () => void; onRequestAllocation?: (crmInvoiceId: string) => void }) {
  const invoice = mode === "invoice";
  const prefix = invoice ? "invoice" : "collection";
  const fields: Array<[string, string, string?]> = invoice
    ? [["invoiceNo", "发票号"], ["invoiceCurrency", "发票币种"], ["invoiceExchangeRate", "汇率", "number"], ["invoiceNetAmount", "未税金额", "number"], ["invoiceTaxRate", "税率", "number"], ["invoiceTaxAmount", "税金", "number"], ["invoiceTotalAmount", "含税金额", "number"], ["invoiceDate", "开票日期", "date"], ["receivableDate", "应收日期", "date"]]
    : [["collectionCurrency", "币种"], ["collectionExchangeRate", "汇率", "number"], ["collectionNetAmount", "未税金额", "number"], ["collectionTaxRate", "税率", "number"], ["collectionTaxAmount", "税金", "number"], ["collectionTotalAmount", "含税金额", "number"], ["collectionDate", "收款日期", "date"]];
  const partner = (kind: "customers" | "undertakingUnits", label: string, idKey: string, nameKey: string) => <PartnerSelect kind={kind} label={label} idValue={value[idKey]} nameValue={value[nameKey]} masters={masters} onChange={(selected) => onChange({ ...value, [idKey]: selected.id, [nameKey]: selected.name, [kind === "customers" ? `${prefix}Payer` : `${prefix}Payee`]: selected.name })} />;
  const changeField = (key: string, type: string | undefined, input: string) => {
    if (type === "number" && ["NetAmount", "TaxRate", "TaxAmount", "TotalAmount"].some((suffix) => key.endsWith(suffix))) {
      return updateCloudTaxValue(value, prefix, key.endsWith("NetAmount") ? "net" : key.endsWith("TaxAmount") ? "tax" : key.endsWith("TotalAmount") ? "total" : "rate", input);
    }
    return { ...value, [key]: input };
  };
  const description = invoice
    ? "付款单位从客户档案选择，收款单位从承接单位档案选择，支持按编码或简称搜索"
    : `空白的币种、未税金额、税率和含税金额按${String(value.collectionPrefillSource ?? "客户应收")}补充，可修改后确认保存。`;
  return <Modal description={description} footer={<><Button onClick={onCancel}>取消</Button><Button tone="primary" onClick={onSave}>{invoice ? "保存" : "确认保存"}</Button></>} onClose={onCancel} title={invoice ? "编辑客户开票" : "编辑客户实收"} widthClass="max-w-3xl"><div className="grid gap-3 border-b border-line-soft pb-4 sm:grid-cols-2">{partner("customers", "付款单位", `${prefix}PayerCustomerId`, `${prefix}PayerCustomerName`)}{partner("undertakingUnits", "收款单位", `${prefix}PayeeUndertakingUnitId`, `${prefix}PayeeUndertakingUnitName`)}</div>{!invoice && receiptInvoiceCurrencyMismatch(value.collectionCurrency, value.collectionPrefillCurrency) ? <p className="mt-3 text-xs text-warning-ink">实收币种与{String(value.collectionPrefillSource ?? "来源")}币种不同，请按实际收款币种核对金额；系统不自动换算。</p> : null}{invoice ? <div className="mt-4 border-b border-line-soft pb-4"><div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-sm text-ink-2">从 CRM 发票匹配</span><span className="text-xs text-ink-3">按发票号 / 客户 / 主体搜索；选中后自动带出开票信息，保存时把发票 PDF 挂到本行「客户开票附件」</span></div><CrmInvoicePicker customerId={String(value.customerId ?? "")} onPick={(picked) => onChange({ ...value, invoiceNo: String(picked.invoiceNo ?? ""), invoiceCurrency: String(picked.currency ?? ""), invoiceNetAmount: (picked.amountTaxExcluded ?? "") as string | number, invoiceTaxAmount: (picked.taxAmount ?? "") as string | number, invoiceTotalAmount: (picked.amountTaxIncluded ?? "") as string | number, invoiceDate: String(picked.invoiceDate ?? ""), collectionInvoice: "issued", crmInvoiceId: String(picked.crmInvoiceId), crmInvoiceNo: String(picked.invoiceNo ?? "") })} rowId={String(value.id ?? "")} value={String(value.crmInvoiceId ?? "")} />{value.crmInvoiceId && onRequestAllocation ? <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-3"><span>这张发票如果覆盖多个月或多个华为账号，可以按账期拆分：</span><Button onClick={() => onRequestAllocation(String(value.crmInvoiceId))} type="button">拆分到多账期</Button></div> : null}</div> : null}<div className="mt-4 grid gap-3 sm:grid-cols-2">{fields.map(([key, label, type]) => <label className="space-y-1 text-sm text-ink-2" key={key}><span>{label}</span><Input className="w-full" type={type ?? "text"} value={type === "date" ? dateInputValue(value[key]) : String(value[key] ?? "")} onChange={(event) => onChange(changeField(key, type, event.target.value))} /></label>)}</div>{invoice ? <label className="mt-3 flex items-center gap-2 text-sm text-ink-2"><input checked={value.collectionInvoice === "issued"} type="checkbox" onChange={(event) => onChange({ ...value, collectionInvoice: event.target.checked ? "issued" : "not_issued" })} />已开票</label> : <label className="mt-3 flex items-center gap-2 text-sm text-ink-2"><input checked={Boolean(value.collected)} type="checkbox" onChange={(event) => onChange({ ...value, collected: event.target.checked ? 1 : 0 })} />已收款</label>}</Modal>;
}

function MappingForm({ value, masters, onChange, onCancel, onSave }: { value: Row; masters: { suppliers: Master[]; undertakingUnits: Master[]; customers: Master[] }; onChange: (value: Row) => void; onCancel: () => void; onSave: () => void }) {
  const field = (key: string, label: string) => <label className="space-y-1 text-sm text-ink-2"><span>{label}</span><Input className="w-full" value={String(value[key] ?? "")} onChange={(event) => onChange({ ...value, [key]: event.target.value })} /></label>;
  /** 供应商 / 承接单位 / 客户都改成统一的搜索选择：选项按 ID 取档案当前名称，改名后弹层回显也跟着变。 */
  return <Modal footer={<><Button onClick={onCancel}>取消</Button><Button onClick={onSave} tone="primary">保存</Button></>} onClose={onCancel} title={value.id ? "修改服务映射" : "新增服务映射"} widthClass="max-w-2xl"><div className="grid gap-3 sm:grid-cols-2"><PartnerSelect kind="suppliers" label="供应商" idValue={value.supplierId} nameValue={value.supplierName} masters={masters} onChange={(selected) => onChange({ ...value, supplierId: selected.id, supplierName: selected.name })} /><PartnerSelect kind="undertakingUnits" label="承接单位" idValue={value.undertakingUnitId} nameValue={value.undertakingUnitName} masters={masters} onChange={(selected) => onChange({ ...value, undertakingUnitId: selected.id, undertakingUnitName: selected.name })} /><PartnerSelect kind="customers" label="客户" idValue={value.customerId} nameValue={value.customerName} masters={masters} onChange={(selected) => onChange({ ...value, customerId: selected.id, customerName: selected.name })} />{field("reconciler", "对账人")}{field("calculationLogic", "计算逻辑")}<label className="space-y-1 text-sm text-ink-2"><span>华为云账号（逗号分隔）</span><Input className="w-full" value={String(value.accounts ?? "")} onChange={(event) => onChange({ ...value, accounts: event.target.value })} /></label><label className="space-y-1 text-sm text-ink-2"><span>客户折扣</span><NumberInput className="w-full" value={value.userDiscount as string | number | null | undefined} onChange={(text) => onChange({ ...value, userDiscount: text })} /></label></div></Modal>;
}
