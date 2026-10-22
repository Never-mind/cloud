"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { InvoiceDraftModal, type InvoiceDraftMode } from "./invoice-draft-modal";
import { CheckCircle2, ChevronDown, ChevronRight, FileDown, RefreshCw, Search, Trash2 } from "lucide-react";
import { fetchAllEntityRows } from "@/lib/client-entity-fetch";
import { formatDisplayValue } from "@/lib/display-format";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { postWorkspaceMessage } from "@/lib/tab-workspace";
import { PaginationBar } from "./pagination-bar";
import { StickyTable } from "./sticky-table";
import { TableColumnMenu, type TableFilterOption, type TableSortOrder } from "./table-column-menu";
import { useRequestGuard } from "@/lib/table-query-client";
import { Button, IconButton, Input, Panel, Select } from "./ui";
import { NumberInput } from "./number-input";
import { Modal } from "./modal";
import { confirmDialog, notify } from "./app-dialog";
import { TableStateContent } from "./table-state";
import { useWorkspaceDataRefresh } from "@/lib/workspace-events";
import { CloudAttachments } from "./cloud-attachments";
import {
  StatementFieldSettingsButton,
  StatementFieldSettingsModal,
  StatementDetailGrid,
  usePersistentColumnVisibility,
} from "./statement-field-settings";

type Row = Record<string, string | number | boolean | null>;
function partyOptionLabel(row: Row, codeKeys: string[], nameKeys: string[]) {
  const code = codeKeys.map((key) => String(row[key] ?? "").trim()).find(Boolean) ?? "";
  const name = nameKeys.map((key) => String(row[key] ?? "").trim()).find(Boolean) ?? "";
  return name && code ? `${code} - ${name}` : name || code;
}
function partyShortName(row: Row, nameKeys: string[], codeKeys: string[]) {
  return nameKeys.map((key) => String(row[key] ?? "").trim()).find(Boolean)
    ?? codeKeys.map((key) => String(row[key] ?? "").trim()).find(Boolean)
    ?? "";
}
type ListResponse = { rows: Row[]; total: number; page: number; pageSize: number; totalPages: number };
type RepaymentDraft = {
  snapshotNo: string;
  repaymentStatus: "未回款" | "已回款";
  receivingUnitId: string;
  payerCustomerId: string;
  repaymentCurrency: string;
  repaymentAmount: string;
  repaymentAmountExcludingTax: string;
  repaymentVatRate: string;
  repaymentDate: string;
};
type InvoiceDraft = {
  snapshotNo: string;
  invoiceNo: string;
  invoiceCurrency: string;
  invoiceReceivingUnitId: string;
  invoicePayerCustomerId: string;
  invoiceAmountExcludingTax: string;
  invoiceVatRate: string;
  invoiceAmountIncludingTax: string;
  receivableDate: string;
};
type ServiceFeeColumn = {
  key: string;
  label: string;
  defaultVisible?: boolean;
  sortable?: boolean;
  filterable?: boolean;
};

const columns: ServiceFeeColumn[] = [
  { key: "snapshotNo", label: "对账单号", defaultVisible: true, sortable: true, filterable: true },
  { key: "status", label: "确认状态", defaultVisible: true, sortable: true, filterable: true },
  { key: "writeOffMonth", label: "核销月份", defaultVisible: true, sortable: true, filterable: true },
  { key: "countryCode", label: "国家", defaultVisible: true, sortable: true, filterable: true },
  { key: "billingTotal", label: "月账单金额", defaultVisible: true, sortable: true, filterable: true },
  { key: "prepaymentTotal", label: "预付款金额", defaultVisible: true, sortable: true, filterable: true },
  { key: "customerReceivable", label: "客户应收", defaultVisible: true, sortable: true, filterable: true },
  { key: "serviceFeeCurrency", label: "服务费币种", defaultVisible: false, sortable: false, filterable: false },
  { key: "serviceFeeTotalExcludingTax", label: "客户应收未税", defaultVisible: false, sortable: true, filterable: true },
  { key: "vatRate", label: "客户应收税率", defaultVisible: false, sortable: false, filterable: false },
  { key: "customerReceived", label: "客户实收（含税）", defaultVisible: true, sortable: true, filterable: true },
  { key: "repaymentStatus", label: "收款状态", defaultVisible: true, sortable: true, filterable: true },
  { key: "repaymentCurrency", label: "实收币种", defaultVisible: false, sortable: true, filterable: true },
  { key: "repaymentAmountExcludingTax", label: "客户实收未税", defaultVisible: false, sortable: true, filterable: true },
  { key: "repaymentVatRate", label: "客户实收税率", defaultVisible: false, sortable: true, filterable: true },
  { key: "repaymentDate", label: "实收日期", defaultVisible: false, sortable: false, filterable: false },
  { key: "customerInvoice", label: "客户开票（含税）", defaultVisible: true, sortable: true, filterable: true },
  { key: "invoiceStatus", label: "开票状态", defaultVisible: true, sortable: true, filterable: true },
  { key: "invoiceNo", label: "发票号", defaultVisible: false, sortable: true, filterable: true },
  { key: "invoiceCurrency", label: "开票币种", defaultVisible: false, sortable: true, filterable: true },
  { key: "invoiceAmountExcludingTax", label: "客户开票未税", defaultVisible: false, sortable: true, filterable: true },
  { key: "invoiceVatRate", label: "客户开票税率", defaultVisible: false, sortable: true, filterable: true },
  { key: "receivableDate", label: "应收日期", defaultVisible: false, sortable: true, filterable: true },
  { key: "createdAt", label: "创建时间", defaultVisible: false, sortable: true, filterable: true },
  { key: "updatedAt", label: "更新时间", defaultVisible: false, sortable: true, filterable: true },
  { key: "confirmedAt", label: "确认时间", defaultVisible: false, sortable: true, filterable: true },
];

export function ServiceFeeStatementsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [keyword, setKeyword] = useState("");
  const [writeOffMonth, setWriteOffMonth] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [status, setStatus] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("");
  const [repaymentStatus, setRepaymentStatus] = useState("");
  const [undertakingUnits, setUndertakingUnits] = useState<Row[]>([]);
  const [customers, setCustomers] = useState<Row[]>([]);
  const [repaymentDraft, setRepaymentDraft] = useState<RepaymentDraft | null>(null);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft | null>(null);
  /** 开票弹层：sourceId 是对账单号（服务费对账单以 snapshotNo 为主键）。 */
  const [invoiceModal, setInvoiceModal] = useState<{ mode: InvoiceDraftMode; sourceId: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyNo, setBusyNo] = useState("");
  const [attachmentVersion, setAttachmentVersion] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showFieldSettings, setShowFieldSettings] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [sortField, setSortField] = useState("");
  const [sortOrder, setSortOrder] = useState<TableSortOrder>("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const pageSizeRef = useRef(pageSize);
  const queryMountedRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);
  const beginRequest = useRequestGuard();
  const fieldState = usePersistentColumnVisibility("service-fee-statements", columns);
  const visibleColumns = fieldState.visibleColumns;

  function buildParams(nextPage = page, nextPageSize = pageSizeRef.current) {
    const params = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize) });
    for (const [key, value] of Object.entries({ keyword, writeOffMonth, countryCode, status, invoiceStatus, repaymentStatus })) {
      if (value.trim()) params.set(key, value.trim());
    }
    if (sortField && sortOrder) { params.set("sortField", sortField); params.set("sortOrder", sortOrder); }
    for (const [key, values] of Object.entries(columnFilters)) values.forEach((value) => params.append(`filter.${key}`, value));
    return params;
  }

  async function loadData(nextPage = page, nextPageSize = pageSizeRef.current) {
    const isCurrentRequest = beginRequest();
    setLoading(true);
    try {
      const response = await fetch(`/api/service-fees/snapshots?${buildParams(nextPage, nextPageSize)}`);
      const data = (await response.json().catch(() => ({}))) as Partial<ListResponse> & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "服务费对账单加载失败");
      if (!isCurrentRequest()) return;
      setRows(data.rows ?? []);
      setTotal(Number(data.total ?? 0));
      setPage(Number(data.page ?? nextPage));
    } catch (error) {
      if (!isCurrentRequest()) return;
      setRows([]);
      setTotal(0);
      notify(error instanceof Error ? error.message : "服务费对账单加载失败", "info");
    } finally {
      if (isCurrentRequest()) setLoading(false);
    }
  }

  // 承接单位 / 客户的简称在别的标签页可能被改过，弹层下拉的选项要重新拉一次
  const loadParties = useCallback(() => Promise.all([
    fetchAllEntityRows<Row>("undertaking-units"),
    fetchAllEntityRows<Row>("customers"),
  ]).then(([unitRows, customerRows]) => {
    setUndertakingUnits(unitRows);
    setCustomers(customerRows);
  }).catch(() => undefined), []);

  useEffect(() => {
    void loadData();
    void loadParties();
  }, [loadParties]);

  useWorkspaceDataRefresh(() => { void loadParties(); });

  useEffect(() => {
    if (!queryMountedRef.current) {
      queryMountedRef.current = true;
      return;
    }
    setPage(1);
    void loadData(1);
  }, [columnFilters, sortField, sortOrder]);

  async function loadColumnOptions(field: string, optionKeyword: string): Promise<TableFilterOption[]> {
    const params = new URLSearchParams({ field });
    if (optionKeyword.trim()) params.set("keyword", optionKeyword.trim());
    for (const [key, values] of Object.entries(columnFilters)) {
      if (key === field) continue;
      for (const value of values) params.append(`filter.${key}`, value);
    }
    const response = await fetch(`/api/service-fees/snapshots?${params}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "筛选候选值加载失败");
    return (data.options ?? []) as TableFilterOption[];
  }

  function renderHeader(column: ServiceFeeColumn) {
    return <TableColumnMenu column={column} filterValues={columnFilters[column.key] ?? []} loadOptions={(keyword) => loadColumnOptions(column.key, keyword)} onFilter={(values) => { setColumnFilters((current) => ({ ...current, [column.key]: values })); setPage(1); }} onSort={(order) => { setSortField(order ? column.key : ""); setSortOrder(order); setPage(1); }} sortOrder={sortField === column.key ? sortOrder : ""} />;
  }

  function openRepayment(row: Row) {
    setRepaymentDraft({
      snapshotNo: String(row.snapshotNo ?? ""),
      repaymentStatus: String(row.repaymentStatus ?? "未回款") === "已回款" ? "已回款" : "未回款",
      receivingUnitId: firstNonBlankValue(row.receivingUnitId, row.defaultReceivingUnitId),
      payerCustomerId: firstNonBlankValue(row.payerCustomerId, row.defaultPayerCustomerId),
      repaymentCurrency: String(row.repaymentCurrency ?? row.defaultRepaymentCurrency ?? ""),
      repaymentAmount: String(row.repaymentAmount ?? row.defaultRepaymentAmount ?? row.serviceFeeTotal ?? ""),
      repaymentAmountExcludingTax: String(row.repaymentAmountExcludingTax ?? ""),
      repaymentVatRate: formatRateInput(row.repaymentVatRate),
      repaymentDate: String(row.repaymentDate ?? "").slice(0, 10),
    });
  }

  function openInvoiceInfo(row: Row) {
    setInvoiceDraft({
      snapshotNo: String(row.snapshotNo ?? ""),
      invoiceNo: String(row.invoiceNo ?? ""),
      invoiceCurrency: String(row.invoiceCurrency ?? ""),
      invoiceReceivingUnitId: firstNonBlankValue(row.invoiceReceivingUnitId, row.defaultReceivingUnitId),
      invoicePayerCustomerId: firstNonBlankValue(row.invoicePayerCustomerId, row.defaultPayerCustomerId),
      invoiceAmountExcludingTax: String(row.invoiceAmountExcludingTax ?? ""),
      invoiceVatRate: formatRateInput(row.invoiceVatRate),
      invoiceAmountIncludingTax: String(row.invoiceAmountIncludingTax ?? ""),
      receivableDate: String(row.receivableDate ?? "").slice(0, 10),
    });
  }

  function updateRepaymentTaxField(field: TaxAmountField, value: string) {
    setRepaymentDraft((current) => {
      if (!current) return current;
      const amounts = calculateTaxAmounts({
        excludingTax: current.repaymentAmountExcludingTax,
        includingTax: current.repaymentAmount,
        vatRate: current.repaymentVatRate,
      }, field, value);
      return {
        ...current,
        repaymentAmountExcludingTax: amounts.excludingTax,
        repaymentAmount: amounts.includingTax,
        repaymentVatRate: amounts.vatRate,
      };
    });
  }

  function updateInvoiceTaxField(field: TaxAmountField, value: string) {
    setInvoiceDraft((current) => {
      if (!current) return current;
      const amounts = calculateTaxAmounts({
        excludingTax: current.invoiceAmountExcludingTax,
        includingTax: current.invoiceAmountIncludingTax,
        vatRate: current.invoiceVatRate,
      }, field, value);
      return {
        ...current,
        invoiceAmountExcludingTax: amounts.excludingTax,
        invoiceAmountIncludingTax: amounts.includingTax,
        invoiceVatRate: amounts.vatRate,
      };
    });
  }

  async function saveRepayment() {
    if (!repaymentDraft) return;
    setBusyNo(repaymentDraft.snapshotNo);
    try {
      const response = await fetch(`/api/service-fees/snapshots/${encodeURIComponent(repaymentDraft.snapshotNo)}/repayment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...repaymentDraft,
          repaymentAmount: nullableNumber(repaymentDraft.repaymentAmount),
          repaymentAmountExcludingTax: nullableNumber(repaymentDraft.repaymentAmountExcludingTax),
          repaymentVatRate: parseRateInput(repaymentDraft.repaymentVatRate),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "回款信息保存失败");
      setRepaymentDraft(null);
      await loadData();
    } catch (error) {
      notify(error instanceof Error ? error.message : "回款信息保存失败", "info");
    } finally {
      setBusyNo("");
    }
  }

  async function saveInvoiceInfo() {
    if (!invoiceDraft) return;
      setBusyNo(invoiceDraft.snapshotNo);
    try {
      const response = await fetch(`/api/service-fees/snapshots/${encodeURIComponent(invoiceDraft.snapshotNo)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...invoiceDraft,
          invoiceReceivingUnitId: invoiceDraft.invoiceReceivingUnitId || null,
          invoicePayerCustomerId: invoiceDraft.invoicePayerCustomerId || null,
          invoiceAmountExcludingTax: nullableNumber(invoiceDraft.invoiceAmountExcludingTax),
          invoiceVatRate: parseRateInput(invoiceDraft.invoiceVatRate),
          invoiceAmountIncludingTax: nullableNumber(invoiceDraft.invoiceAmountIncludingTax),
          receivableDate: invoiceDraft.receivableDate || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "发票信息保存失败");
      setInvoiceDraft(null);
      await loadData();
    } catch (error) {
      notify(error instanceof Error ? error.message : "发票信息保存失败", "info");
    } finally {
      setBusyNo("");
    }
  }

  async function postAction(snapshotNo: string, action: "confirm" | "delete") {
    const prompt = action === "confirm"
      ? "确认该服务费对账单？确认后金额和明细将冻结，不能删除或退回。"
      : "确认删除该未确认服务费对账单？对账单明细和已上传附件将同时删除。";
    if (!await confirmDialog(prompt)) return;
    setBusyNo(snapshotNo);
    const endpoint = `/api/service-fees/snapshots/${encodeURIComponent(snapshotNo)}${action === "confirm" ? "/confirm" : ""}`;
    const response = await fetch(endpoint, { method: action === "confirm" ? "POST" : "DELETE" });
    const data = await response.json().catch(() => ({}));
    setBusyNo("");
    if (!response.ok) {
      notify(data.error ?? (action === "confirm" ? "确认失败" : "删除失败"), "info");
      return;
    }
    await loadData();
  }

  async function setInvoiceState(snapshotNo: string, nextStatus: "未开票" | "已开票", ask = false) {
    if (ask && !await confirmDialog(`确认将该服务费对账单标记为“${nextStatus}”？`)) return false;
    setBusyNo(snapshotNo);
    try {
      const response = await fetch(`/api/service-fees/snapshots/${encodeURIComponent(snapshotNo)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceStatus: nextStatus }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify(data.error ?? "开票状态更新失败", "info");
        return false;
      }
      setRows((current) => current.map((row) => (
        String(row.snapshotNo ?? "") === snapshotNo ? { ...row, invoiceStatus: nextStatus } : row
      )));
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "开票状态更新失败", "info");
      return false;
    } finally {
      setBusyNo("");
    }
  }

  async function setRepaymentState(row: Row, nextStatus: "未回款" | "已回款") {
    const snapshotNo = String(row.snapshotNo ?? "");
    if (!snapshotNo) return;
    setBusyNo(snapshotNo);
    try {
      const response = await fetch(`/api/service-fees/snapshots/${encodeURIComponent(snapshotNo)}/repayment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repaymentStatus: nextStatus,
          receivingUnitId: firstNonBlankValue(row.receivingUnitId, row.defaultReceivingUnitId),
          payerCustomerId: firstNonBlankValue(row.payerCustomerId, row.defaultPayerCustomerId),
          repaymentCurrency: String(row.repaymentCurrency ?? row.defaultRepaymentCurrency ?? ""),
          repaymentAmount: nullableNumber(row.repaymentAmount ?? row.defaultRepaymentAmount ?? row.serviceFeeTotal),
          repaymentAmountExcludingTax: nullableNumber(row.repaymentAmountExcludingTax),
          repaymentVatRate: parseRateInput(row.repaymentVatRate),
          repaymentDate: String(row.repaymentDate ?? "").slice(0, 10),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "回款状态更新失败");
      setRows((current) => current.map((item) => String(item.snapshotNo ?? "") === snapshotNo ? { ...item, repaymentStatus: nextStatus } : item));
    } catch (error) {
      notify(error instanceof Error ? error.message : "回款状态更新失败", "info");
    } finally {
      setBusyNo("");
    }
  }

  async function chooseInvoice(row: Row) {
    uploadTargetRef.current = String(row.snapshotNo ?? "");
    fileRef.current?.click();
  }

  async function uploadInvoiceAttachments(files: File[]) {
    const snapshotNo = uploadTargetRef.current ?? "";
    uploadTargetRef.current = null;
    if (!snapshotNo || !files.length) return;
    setBusyNo(snapshotNo);
    let uploaded = 0;
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch(`/api/cloud/attachments/service_fee_invoice/${encodeURIComponent(snapshotNo)}`, {
          method: "POST",
          body: formData,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? `“${file.name}”上传失败`);
        uploaded += 1;
      }
      notify(`已上传 ${uploaded} 个附件`, "success");
      setAttachmentVersion((current) => current + 1);
      await loadData();
    } catch (error) {
      if (uploaded) {
        setAttachmentVersion((current) => current + 1);
        await loadData();
      }
      notify(error instanceof Error ? error.message : "附件上传失败", "error");
    } finally {
      setBusyNo("");
    }
  }

  async function deleteInvoice(row: Row, ask = true) {
    const snapshotNo = String(row.snapshotNo ?? "");
    if (ask && !await confirmDialog("确认删除该发票附件？")) return;
    setBusyNo(snapshotNo);
    try {
      const response = await fetch(`/api/service-fees/snapshots/${encodeURIComponent(snapshotNo)}/invoice`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify(data.error ?? "发票附件删除失败", "info");
        return;
      }
      setRows((current) => current.map((currentRow) => (
        String(currentRow.snapshotNo ?? "") === snapshotNo
          ? { ...currentRow, invoiceOriginalName: null, invoiceMimeType: null, invoiceFileSize: null }
          : currentRow
      )));
      setAttachmentVersion((current) => current + 1);
    } catch (error) {
      notify(error instanceof Error ? error.message : "发票附件删除失败", "info");
      return;
    } finally {
      setBusyNo("");
    }
    if (String(row.invoiceStatus ?? "") === "已开票") {
      if (await confirmDialog("发票附件已删除，是否将开票状态更新为“未开票”？")) {
        await setInvoiceState(snapshotNo, "未开票");
      }
    }
  }

  function toggleExpanded(snapshotNo: string) {
    setExpanded((current) => ({ ...current, [snapshotNo]: !current[snapshotNo] }));
  }

  function toggleAllExpanded() {
    const allOpen = rows.length > 0 && rows.every((row) => expanded[String(row.snapshotNo ?? "")]);
    setExpanded(Object.fromEntries(rows.map((row) => [String(row.snapshotNo ?? ""), !allOpen])));
  }

  function renderCell(row: Row, key: string): ReactNode {
    const snapshotNo = String(row.snapshotNo ?? "");
    const serviceFeeCurrency = firstNonBlankValue(row.serviceFeeCurrency, row.defaultBillingCurrency, row.defaultRepaymentCurrency) || "USD";
    const confirmed = row.status === "已确认";
    const issued = row.invoiceStatus === "已开票";
    if (key === "snapshotNo") return <Link className="font-medium text-primary hover:underline" href={`/finance/service-fee-snapshot-items?snapshotNo=${encodeURIComponent(snapshotNo)}`} onClick={(event) => {
      event.preventDefault();
      postWorkspaceMessage({ type: "cloud-power:open-tab", route: `/finance/service-fee-snapshot-items?snapshotNo=${encodeURIComponent(snapshotNo)}`, title: "服务费对账单明细" });
    }}>{snapshotNo}</Link>;
    if (key === "status") return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${confirmed ? "bg-success-soft text-success-strong" : "bg-warning-soft text-warning-deep"}`}>{confirmed ? "已确认" : "未确认"}</span>;
    if (key === "repaymentStatus") return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${row.repaymentStatus === "已回款" ? "border-success-border bg-success-soft text-success" : "border-warning-border-soft bg-warning-soft text-warning-ink"}`}>{String(row.repaymentStatus ?? "未回款")}</span>;
    if (key === "invoiceStatus") return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${issued ? "border-success-border bg-success-soft text-success" : "border-line-soft bg-canvas text-ink-3"}`}>{issued ? "已开票" : "未开票"}</span>;
    if (key === "billingTotal") return formatAmountWithCurrency(row.billingTotal, serviceFeeCurrency);
    if (key === "prepaymentTotal") return formatAmountWithCurrency(row.prepaymentTotal, serviceFeeCurrency);
    if (key === "customerReceivable") return formatAmountWithCurrency(row.serviceFeeTotal, serviceFeeCurrency);
    if (key === "customerReceived") return formatAmountWithCurrency(row.repaymentAmount, row.repaymentCurrency);
    if (key === "customerInvoice") return formatAmountWithCurrency(row.invoiceAmountIncludingTax, row.invoiceCurrency);
    if (key === "serviceFeeTotalExcludingTax") return formatAmountWithCurrency(row.serviceFeeTotalExcludingTax, serviceFeeCurrency);
    if (key === "repaymentAmountExcludingTax") return formatAmountWithCurrency(row.repaymentAmountExcludingTax, row.repaymentCurrency);
    if (key === "invoiceAmountExcludingTax") return formatAmountWithCurrency(row.invoiceAmountExcludingTax, row.invoiceCurrency);
    if (key === "vatRate" || key === "repaymentVatRate" || key === "invoiceVatRate") return formatPercent(row[key]);
    if (key === "writeOffMonth") return formatValue(row[key], "month");
    if (key === "repaymentDate" || key === "receivableDate") return formatValue(row[key], "date");
    if (key === "createdAt" || key === "updatedAt" || key === "confirmedAt") return formatValue(row[key], "datetime");
    return formatValue(row[key]);
  }

  function renderActions(row: Row) {
    const snapshotNo = String(row.snapshotNo ?? "");
    const confirmed = row.status === "已确认";
    return <div className="flex items-center gap-1">
      {!confirmed ? <IconButton disabled={busyNo === snapshotNo} icon={<CheckCircle2 size={15} />} label="确认对账单" onClick={() => void postAction(snapshotNo, "confirm")} tone="success" /> : null}
      {!confirmed ? <IconButton disabled={busyNo === snapshotNo} icon={<Trash2 size={15} />} label="删除未确认对账单" onClick={() => void postAction(snapshotNo, "delete")} tone="danger" /> : null}
      {confirmed ? <span className="px-2 text-ink-4">-</span> : null}
    </div>;
  }

  function renderDetails(row: Row) {
    const snapshotNo = String(row.snapshotNo ?? "");
    const confirmed = row.status === "已确认";
    const hasInvoice = Boolean(row.invoiceOriginalName);
    const issued = row.invoiceStatus === "已开票";
    const serviceFeeCurrency = firstNonBlankValue(row.serviceFeeCurrency, row.defaultBillingCurrency, row.defaultRepaymentCurrency) || "USD";
    const receivableTax = differenceAmount(row.serviceFeeTotal, row.serviceFeeTotalExcludingTax);
    const repaymentTax = differenceAmount(row.repaymentAmount, row.repaymentAmountExcludingTax);
    const invoiceTax = differenceAmount(row.invoiceAmountIncludingTax, row.invoiceAmountExcludingTax);
    const groups: Array<{ title: string; fields: Array<{ label: string; value: ReactNode }>; flow?: { payer: ReactNode; payee: ReactNode } }> = [
      { title: "基本信息", fields: [
        { label: "对账单号", value: snapshotNo },
        { label: "确认状态", value: confirmed ? "已确认" : "未确认" },
        { label: "国家", value: String(row.countryCode ?? "-") },
        { label: "核销月份", value: formatValue(row.writeOffMonth, "month") || "-" },
        { label: "服务费币种", value: serviceFeeCurrency },
      ] },
      { title: "金额", fields: [
        { label: "月账单金额", value: formatAmountWithCurrency(row.billingTotal, serviceFeeCurrency) },
        { label: "预付款金额", value: formatAmountWithCurrency(row.prepaymentTotal, serviceFeeCurrency) },
      ] },
      { title: "客户应收", flow: {
        payer: String(row.customerName ?? row.payerCustomerCode ?? "客户"),
        payee: String(row.undertakingUnitName ?? row.receivingUnitCode ?? "承接单位"),
      }, fields: [
        { label: "客户应收未税", value: formatAmountWithCurrency(row.serviceFeeTotalExcludingTax, serviceFeeCurrency) },
        { label: "客户应收税率", value: formatPercent(row.vatRate) },
        { label: "客户应收税金", value: formatAmountWithCurrency(receivableTax, serviceFeeCurrency) },
        { label: "客户应收含税", value: formatAmountWithCurrency(row.serviceFeeTotal, serviceFeeCurrency) },
      ] },
      { title: "客户实收", flow: {
        payer: firstNonBlankValue(row.payerCustomerCode, row.customerName) || "客户",
        payee: firstNonBlankValue(row.receivingUnitCode, row.undertakingUnitName) || "承接单位",
      }, fields: [
        { label: "客户实收未税", value: formatAmountWithCurrency(row.repaymentAmountExcludingTax, row.repaymentCurrency) },
        { label: "客户实收税率", value: formatPercent(row.repaymentVatRate) },
        { label: "客户实收税金", value: formatAmountWithCurrency(repaymentTax, row.repaymentCurrency) },
        { label: "客户实收含税", value: formatAmountWithCurrency(row.repaymentAmount, row.repaymentCurrency) },
      ] },
      { title: "客户开票", flow: {
        payer: firstNonBlankValue(row.invoicePayerCustomerCode, row.customerName) || "客户",
        payee: firstNonBlankValue(row.invoiceReceivingUnitCode, row.undertakingUnitName) || "承接单位",
      }, fields: [
        { label: "客户开票未税", value: formatAmountWithCurrency(row.invoiceAmountExcludingTax, row.invoiceCurrency) },
        { label: "客户开票税率", value: formatPercent(row.invoiceVatRate) },
        { label: "客户开票税金", value: formatAmountWithCurrency(invoiceTax, row.invoiceCurrency) },
        { label: "客户开票含税", value: formatAmountWithCurrency(row.invoiceAmountIncludingTax, row.invoiceCurrency) },
      ] },
      { title: "收款信息", fields: [
        { label: "收款状态", value: String(row.repaymentStatus ?? "未回款") },
        { label: "实收币种", value: String(row.repaymentCurrency ?? "-") },
        { label: "实收日期", value: formatValue(row.repaymentDate) || "-" },
      ] },
      { title: "发票信息", fields: [
        { label: "发票号", value: String(row.invoiceNo ?? "-") },
        { label: "开票币种", value: String(row.invoiceCurrency ?? "-") },
        { label: "应收日期", value: formatValue(row.receivableDate) || "-" },
        { label: "开票状态", value: issued ? "已开票" : "未开票" },
      ] },
      { title: "审计", fields: [
        { label: "创建时间", value: formatValue(row.createdAt, "datetime") },
        { label: "更新时间", value: formatValue(row.updatedAt, "datetime") },
        { label: "确认时间", value: formatValue(row.confirmedAt, "datetime") },
      ] },
    ];
    return <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded border border-line-soft bg-surface-2 px-3 py-2">
        <span className="text-xs font-medium text-ink-2">本行操作</span>
        <button aria-checked={row.repaymentStatus === "已回款"} className="inline-flex h-7 items-center gap-1 rounded border border-line bg-white px-2 text-xs text-ink-2 disabled:opacity-50" disabled={busyNo === snapshotNo} role="switch" type="button" onClick={() => void setRepaymentState(row, row.repaymentStatus === "已回款" ? "未回款" : "已回款")}>
          <span className={`relative inline-flex h-4 w-7 rounded-full ${row.repaymentStatus === "已回款" ? "bg-success" : "bg-ink-4"}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow ${row.repaymentStatus === "已回款" ? "translate-x-[15px]" : "translate-x-0.5"}`} /></span>
          {row.repaymentStatus === "已回款" ? "已回款" : "未回款"}
        </button>
        <Button disabled={busyNo === snapshotNo} size="sm" onClick={() => openRepayment(row)}>编辑实收</Button>
        <button aria-checked={issued} className="inline-flex h-7 items-center gap-1 rounded border border-line bg-white px-2 text-xs text-ink-2 disabled:opacity-50" disabled={busyNo === snapshotNo} role="switch" type="button" onClick={() => void setInvoiceState(snapshotNo, issued ? "未开票" : "已开票")}>
          <span className={`relative inline-flex h-4 w-7 rounded-full ${issued ? "bg-success" : "bg-ink-4"}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow ${issued ? "translate-x-[15px]" : "translate-x-0.5"}`} /></span>
          {issued ? "已开票" : "未开票"}
        </button>
        <Button disabled={busyNo === snapshotNo} size="sm" onClick={() => openInvoiceInfo(row)}>编辑开票</Button>
        <Button disabled={busyNo === snapshotNo} size="sm" onClick={() => setInvoiceModal({ mode: "generated", sourceId: snapshotNo })}>开票</Button>
        <Button disabled={busyNo === snapshotNo} size="sm" onClick={() => setInvoiceModal({ mode: "external", sourceId: snapshotNo })}>上传外部发票</Button>
        <Button disabled={busyNo === snapshotNo} size="sm" onClick={() => chooseInvoice(row)}>上传附件</Button>
        <CloudAttachments
          extraAttachments={hasInvoice ? [{
            id: `legacy-invoice-${snapshotNo}`,
            fileName: String(row.invoiceOriginalName),
            fileSize: Number(row.invoiceFileSize ?? 0),
            fileType: String(row.invoiceMimeType ?? "application/pdf"),
            downloadHref: `/api/service-fees/snapshots/${encodeURIComponent(snapshotNo)}/invoice`,
            onDelete: () => deleteInvoice(row, false),
          }] : []}
          label="查看附件"
          ownerId={snapshotNo}
          ownerType="service_fee_invoice"
          refreshToken={attachmentVersion}
          showLabel
        />
      </div>
      {groups.map((group) => <section className="overflow-hidden rounded border border-line-soft" key={group.title}>
        <div className="border-b border-line-soft bg-canvas px-3 py-2 text-xs font-medium text-ink-2">{group.title}</div>
        <StatementDetailGrid fields={group.fields} flow={group.flow} singleRow={group.title === "基本信息"} />
      </section>)}
    </div>;
  }

  const exportParams = buildParams(1, pageSizeRef.current);
  exportParams.delete("page");
  exportParams.delete("pageSize");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-ink">服务费对账单</h1>
        <p className="mt-1 text-sm text-ink-3">按国家和核销月份保存服务费对账结果；确认后金额及明细冻结，发票和开票状态仍可维护。</p>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-4">
          <Input placeholder="对账单号/国家/附件名" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <Input aria-label="核销月份" type="month" value={writeOffMonth} onChange={(event) => setWriteOffMonth(event.target.value)} />
          <Select className="min-w-28" value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
            <option value="">全部国家</option>
            <option value="BR">BR</option>
            <option value="CL">CL</option>
            <option value="MX">MX</option>
          </Select>
          <Select className="min-w-28" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">全部状态</option>
            <option value="未确认">未确认</option>
            <option value="已确认">已确认</option>
          </Select>
          <Select className="min-w-28" value={invoiceStatus} onChange={(event) => setInvoiceStatus(event.target.value)}>
            <option value="">全部开票状态</option>
            <option value="未开票">未开票</option>
            <option value="已开票">已开票</option>
          </Select>
          <div className="flex h-9 items-center gap-1 rounded border border-line bg-white p-1" aria-label="是否回款筛选">
            {[
              ["", "全部"],
              ["未回款", "未回款"],
              ["已回款", "已回款"],
            ].map(([value, label]) => (
              <button
                className={`h-7 rounded px-2 text-xs transition ${repaymentStatus === value ? "bg-info-soft text-primary" : "text-ink-2 hover:bg-canvas"}`}
                key={value || "all"}
                type="button"
                onClick={() => setRepaymentStatus(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <Button tone="secondary" onClick={() => { setPage(1); void loadData(1); }}><Search size={15} />查询</Button>
          <Button onClick={() => void loadData()}><RefreshCw size={15} />刷新</Button>
          <a href={`/api/entities/service-fee-snapshots/export?${exportParams}`}>
            <Button tone="warning"><FileDown size={15} />导出 Excel</Button>
          </a>
          <div className="ml-auto flex items-center gap-2">
            <Button disabled={!rows.length} size="sm" onClick={toggleAllExpanded}>{rows.length > 0 && rows.every((row) => expanded[String(row.snapshotNo ?? "")]) ? "收起全部" : "展开全部"}</Button>
            <StatementFieldSettingsButton onClick={() => setShowFieldSettings(true)} />
          </div>
          <input
            ref={fileRef}
            className="hidden"
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length) void uploadInvoiceAttachments(files);
              event.currentTarget.value = "";
            }}
          />
        </div>

        <div className="overflow-auto p-3 md:hidden">
          {rows.length ? rows.map((row) => {
            const snapshotNo = String(row.snapshotNo ?? "");
            const open = Boolean(expanded[snapshotNo]);
            return <article className="mb-3 overflow-hidden rounded border border-line-soft bg-white" key={snapshotNo}>
              <div className="flex items-start gap-3 border-b border-line-soft p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-primary">{renderCell(row, "snapshotNo")}</div>
                  <div className="mt-0.5 text-xs text-ink-3">{String(row.countryCode ?? "-")} · {formatValue(row.writeOffMonth, "month") || "-"}</div>
                </div>
                {renderCell(row, "status")}
              </div>
              <div className="grid grid-cols-2 gap-px bg-line-soft">
                {visibleColumns.filter((column) => !["snapshotNo", "status"].includes(column.key)).map((column) => <div className="min-w-0 bg-white px-3 py-2" key={column.key}>
                  <div className="text-[11px] text-ink-3">{column.label}</div>
                  <div className="mt-0.5 truncate text-xs text-ink">{renderCell(row, column.key)}</div>
                </div>)}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-line-soft bg-surface-2 px-3 py-2">
                <Button size="sm" onClick={() => toggleExpanded(snapshotNo)}>{open ? "收起" : "展开"}</Button>
                <div className="ml-auto">{renderActions(row)}</div>
              </div>
              {open ? <div className="border-t border-line-soft bg-canvas p-3">{renderDetails(row)}</div> : null}
            </article>;
          }) : <TableStateContent empty="暂无服务费对账单" loading={loading} />}
        </div>

        <div className="hidden w-full min-w-0 max-w-full flex-col md:flex">
          <div className="min-w-0 max-w-full">
          <StickyTable className="table-scroll table-viewport overflow-auto" tableKey="service-fee-statements">
            <table className="w-full border-collapse text-sm" style={{ minWidth: Math.max(1320, visibleColumns.length * 138 + 130) }}>
              <thead className="bg-canvas text-ink">
                <tr>
                  {visibleColumns.map((column) => <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3 text-left font-medium" key={column.key}>{column.filterable === false ? column.label : renderHeader(column)}</th>)}
                  <th className="sticky right-0 whitespace-nowrap border-b border-line-soft bg-canvas px-3 py-3 text-left font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const snapshotNo = String(row.snapshotNo ?? "");
                  const open = Boolean(expanded[snapshotNo]);
                  return <Fragment key={snapshotNo}>
                    <tr className="hover:bg-surface-2">
                      {visibleColumns.map((column) => <td className="max-w-[280px] whitespace-nowrap border-b border-r border-line-soft px-3 py-3 align-top" key={column.key} title={String(row[column.key] ?? "")}>
                        {column.key === "snapshotNo" ? <div className="flex items-center gap-2"><button aria-label={open ? "收起明细" : "展开明细"} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-line bg-white text-ink-2 hover:border-primary hover:text-primary" title={open ? "收起明细" : "展开明细"} type="button" onClick={() => toggleExpanded(snapshotNo)}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>{renderCell(row, column.key)}</div> : <span className="block max-w-[260px] truncate">{renderCell(row, column.key)}</span>}
                      </td>)}
                      <td className="sticky right-0 whitespace-nowrap border-b border-line-soft bg-white px-3 py-3">{renderActions(row)}</td>
                    </tr>
                    {open ? <tr><td className="border-b border-line-soft bg-canvas p-3" colSpan={visibleColumns.length + 1}>{renderDetails(row)}</td></tr> : null}
                  </Fragment>;
                })}
                {!rows.length ? <tr><td className="py-12 text-center text-ink-3" colSpan={visibleColumns.length + 1}><TableStateContent empty="暂无服务费对账单" loading={loading} /></td></tr> : null}
              </tbody>
            </table>
          </StickyTable>
          </div>
        </div>
        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={(next) => { setPage(next); void loadData(next); }}
          onPageSizeChange={(next) => { pageSizeRef.current = next; setPageSize(next); setPage(1); void loadData(1, next); }}
        />
      </Panel>
      <StatementFieldSettingsModal
        columns={columns}
        onClose={() => setShowFieldSettings(false)}
        onVisibilityChange={fieldState.setVisibility}
        open={showFieldSettings}
        title="算力服务费对账单字段设置"
        visibility={fieldState.visibility}
      />
      {repaymentDraft ? (
        <Modal
          description={repaymentDraft.snapshotNo}
          footer={
            <>
              <Button onClick={() => setRepaymentDraft(null)}>取消</Button>
              <Button tone="primary" disabled={busyNo === repaymentDraft.snapshotNo} onClick={() => void saveRepayment()}>保存回款信息</Button>
            </>
          }
          onClose={() => setRepaymentDraft(null)}
          title="登记回款信息"
          widthClass="max-w-[680px]"
        >
          <div className="grid grid-cols-2 gap-4">
              <RepaymentField label="是否回款">
                <button
                  aria-checked={repaymentDraft.repaymentStatus === "已回款"}
                  aria-label={`是否回款：${repaymentDraft.repaymentStatus}`}
                  className="inline-flex h-9 items-center gap-2 text-sm text-ink-2"
                  role="switch"
                  title="点击切换回款状态"
                  type="button"
                  onClick={() => setRepaymentDraft((current) => current ? {
                    ...current,
                    repaymentStatus: current.repaymentStatus === "已回款" ? "未回款" : "已回款",
                  } : current)}
                >
                  <span className={`relative inline-flex h-5 w-10 rounded-full transition-colors ${repaymentDraft.repaymentStatus === "已回款" ? "bg-success" : "bg-ink-4"}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${repaymentDraft.repaymentStatus === "已回款" ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                  </span>
                  <span>{repaymentDraft.repaymentStatus}</span>
                </button>
              </RepaymentField>
              <div />
              <RepaymentField label="收款单位">
                <Select className="w-full" value={repaymentDraft.receivingUnitId} onChange={(event) => setRepaymentDraft((current) => current ? { ...current, receivingUnitId: event.target.value } : current)}>
                  <option value="">请选择承接单位</option>
                  {undertakingUnits.map((row) => <option key={String(row.undertakingUnitId)} value={String(row.undertakingUnitId)}>{partyOptionLabel(row, ["undertakingUnitCode", "entityCode"], ["shortName", "entityName", "name"])}</option>)}
                </Select>
              </RepaymentField>
              <RepaymentField label="付款单位">
                <Select className="w-full" value={repaymentDraft.payerCustomerId} onChange={(event) => setRepaymentDraft((current) => current ? { ...current, payerCustomerId: event.target.value } : current)}>
                  <option value="">请选择客户</option>
                  {customers.map((row) => <option key={String(row.customerId)} value={String(row.customerId)}>{partyOptionLabel(row, ["customerCode"], ["shortName", "nameCn", "name"])}</option>)}
                </Select>
              </RepaymentField>
              <RepaymentField label="回款币种">
                <Select className="w-full" value={repaymentDraft.repaymentCurrency} onChange={(event) => setRepaymentDraft((current) => current ? { ...current, repaymentCurrency: event.target.value } : current)}>
                  <option value="">请选择币种</option>{["CNY", "MXN", "CLP", "USD", "BRL"].map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                </Select>
              </RepaymentField>
              <RepaymentField label="回款未税金额">
                <NumberInput className="w-full min-w-0" step="0.01" value={repaymentDraft.repaymentAmountExcludingTax} onChange={(text) => updateRepaymentTaxField("excludingTax", text)} />
              </RepaymentField>
              <RepaymentField label="回款税率（%）">
                <NumberInput className="w-full min-w-0" min="0" step="0.01" value={repaymentDraft.repaymentVatRate} onChange={(text) => updateRepaymentTaxField("vatRate", text)} />
              </RepaymentField>
              <RepaymentField label="回款含税金额">
                <NumberInput className="w-full min-w-0" step="0.01" value={repaymentDraft.repaymentAmount} onChange={(text) => updateRepaymentTaxField("includingTax", text)} />
              </RepaymentField>
              <RepaymentField label="回款日期">
                <Input className="w-full min-w-0" type="date" value={repaymentDraft.repaymentDate} onChange={(event) => setRepaymentDraft((current) => current ? { ...current, repaymentDate: event.target.value } : current)} />
              </RepaymentField>
          </div>
        </Modal>
      ) : null}
      {invoiceDraft ? (
        <Modal
          description={invoiceDraft.snapshotNo}
          footer={
            <>
              <Button onClick={() => setInvoiceDraft(null)}>取消</Button>
              <Button tone="primary" disabled={busyNo === invoiceDraft.snapshotNo} onClick={() => void saveInvoiceInfo()}>保存发票信息</Button>
            </>
          }
          onClose={() => setInvoiceDraft(null)}
          title="编辑发票信息"
          widthClass="max-w-[680px]"
        >
          <div className="grid grid-cols-2 gap-4">
              <RepaymentField label="承接单位">
                <Select className="w-full" value={invoiceDraft.invoiceReceivingUnitId} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, invoiceReceivingUnitId: event.target.value } : current)}>
                  <option value="">请选择承接单位</option>
                  {undertakingUnits.map((row) => <option key={String(row.undertakingUnitId)} value={String(row.undertakingUnitId)}>{partyShortName(row, ["shortName", "entityName", "name"], ["undertakingUnitCode", "entityCode"])}</option>)}
                </Select>
              </RepaymentField>
              <RepaymentField label="客户">
                <Select className="w-full" value={invoiceDraft.invoicePayerCustomerId} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, invoicePayerCustomerId: event.target.value } : current)}>
                  <option value="">请选择客户</option>
                  {customers.map((row) => <option key={String(row.customerId)} value={String(row.customerId)}>{partyShortName(row, ["shortName", "nameCn", "name"], ["customerCode"])}</option>)}
                </Select>
              </RepaymentField>
              <RepaymentField label="发票号">
                <Input className="w-full min-w-0" value={invoiceDraft.invoiceNo} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, invoiceNo: event.target.value } : current)} />
              </RepaymentField>
              <RepaymentField label="发票币种">
                <Input className="w-full min-w-0" value={invoiceDraft.invoiceCurrency} placeholder="例如 USD、CNY" onChange={(event) => setInvoiceDraft((current) => current ? { ...current, invoiceCurrency: event.target.value.toUpperCase() } : current)} />
              </RepaymentField>
              <RepaymentField label="发票未税金额">
                <NumberInput className="w-full min-w-0" step="0.01" value={invoiceDraft.invoiceAmountExcludingTax} onChange={(text) => updateInvoiceTaxField("excludingTax", text)} />
              </RepaymentField>
              <RepaymentField label="发票税率（%）">
                <NumberInput className="w-full min-w-0" min="0" step="0.01" value={invoiceDraft.invoiceVatRate} onChange={(text) => updateInvoiceTaxField("vatRate", text)} />
              </RepaymentField>
              <RepaymentField label="发票含税金额">
                <NumberInput className="w-full min-w-0" step="0.01" value={invoiceDraft.invoiceAmountIncludingTax} onChange={(text) => updateInvoiceTaxField("includingTax", text)} />
              </RepaymentField>
              <RepaymentField label="应收日期">
                <Input className="w-full min-w-0" type="date" value={invoiceDraft.receivableDate} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, receivableDate: event.target.value } : current)} />
              </RepaymentField>
          </div>
        </Modal>
      ) : null}
      <InvoiceDraftModal
        mode={invoiceModal?.mode ?? "generated"}
        onClose={() => setInvoiceModal(null)}
        onSaved={() => {
          setAttachmentVersion((current) => current + 1);
          void loadData(page, pageSizeRef.current);
        }}
        open={Boolean(invoiceModal)}
        sourceId={invoiceModal?.sourceId ?? ""}
        sourceType="service_fee"
      />
    </div>
  );
}

function RepaymentField({ children, label }: { children: React.ReactNode; label: string }) {
  return <label><span className="mb-1 block text-sm font-medium text-ink-2">{label}</span>{children}</label>;
}

function formatValue(value: unknown, type?: string) {
  if (type === "month") return value ? String(value).slice(0, 7) : "";
  return formatDisplayValue(value as string | number | boolean | null | undefined, type);
}

function formatAmountWithCurrency(value: unknown, currency: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  const amount = formatValue(value, "money");
  const currencyText = String(currency ?? "").trim();
  return currencyText ? `${currencyText}：${amount}` : amount;
}

function differenceAmount(includingTax: unknown, excludingTax: unknown) {
  const total = nullableNumber(includingTax);
  const net = nullableNumber(excludingTax);
  return total === null || net === null ? null : total - net;
}

function formatPercent(value: unknown) {
  const rate = nullableNumber(value);
  return rate === null ? "-" : `${(rate * 100).toFixed(2)}%`;
}

function firstNonBlankValue(...values: unknown[]) {
  return String(values.find((value) => value !== null && value !== undefined && String(value).trim() !== "") ?? "").trim();
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

type TaxAmountField = "excludingTax" | "includingTax" | "vatRate";
type TaxAmountDraft = {
  excludingTax: string;
  includingTax: string;
  vatRate: string;
};

function calculateTaxAmounts(current: TaxAmountDraft, field: TaxAmountField, value: string): TaxAmountDraft {
  const next = { ...current, [field]: value };
  const ratePercent = nullableNumber(next.vatRate);
  const rate = ratePercent === null ? null : ratePercent / 100;

  if (field === "excludingTax") {
    const excludingTax = nullableNumber(value);
    next.includingTax = excludingTax !== null && rate !== null
      ? formatAmountInput(excludingTax * (1 + rate))
      : "";
  } else if (field === "includingTax") {
    const includingTax = nullableNumber(value);
    next.excludingTax = includingTax !== null && rate !== null && rate > -1
      ? formatAmountInput(includingTax / (1 + rate))
      : "";
  } else if (rate !== null) {
    const excludingTax = nullableNumber(next.excludingTax);
    const includingTax = nullableNumber(next.includingTax);
    if (excludingTax !== null) {
      next.includingTax = formatAmountInput(excludingTax * (1 + rate));
    } else if (includingTax !== null && rate > -1) {
      next.excludingTax = formatAmountInput(includingTax / (1 + rate));
    }
  }

  return next;
}

function formatAmountInput(value: number) {
  return Number.isFinite(value) ? String(Number(value.toFixed(4))) : "";
}

function formatRateInput(value: unknown) {
  const rate = nullableNumber(value);
  return rate === null ? "" : String(Number((rate * 100).toFixed(4)));
}

function parseRateInput(value: unknown) {
  const percent = nullableNumber(value);
  return percent === null ? null : percent / 100;
}
