"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, FileDown, FileText, Pencil, RefreshCw, Search, Trash2, Upload, X } from "lucide-react";
import { fetchAllEntityRows } from "@/lib/client-entity-fetch";
import { formatDisplayValue } from "@/lib/display-format";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { postWorkspaceMessage } from "@/lib/tab-workspace";
import { PaginationBar } from "./pagination-bar";
import { StickyTable } from "./sticky-table";
import { TableColumnMenu, type TableFilterOption, type TableSortOrder } from "./table-column-menu";
import { useRequestGuard } from "@/lib/table-query-client";
import { Button, Input, Panel } from "./ui";

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
};

const columns: Array<{ key: string; label: string; type?: string }> = [
  { key: "snapshotNo", label: "对账单号" },
  { key: "writeOffMonth", label: "核销月份", type: "month" },
  { key: "countryCode", label: "国家" },
  { key: "billingTotal", label: "月账单金额（USD）", type: "money" },
  { key: "prepaymentTotal", label: "预付款金额（USD）", type: "money" },
  { key: "customerReceivable", label: "客户应收" },
  { key: "customerReceived", label: "客户实收" },
  { key: "customerInvoice", label: "客户开票" },
  { key: "createdAt", label: "创建日期", type: "date" },
  { key: "updatedAt", label: "更新日期", type: "date" },
  { key: "confirmedAt", label: "确认日期", type: "date" },
  { key: "status", label: "确认状态" },
];
const tableColumns = columns.map((column) => ({ ...column, sortable: true, filterable: true }));

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
  const [loading, setLoading] = useState(false);
  const [busyNo, setBusyNo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [sortField, setSortField] = useState("");
  const [sortOrder, setSortOrder] = useState<TableSortOrder>("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const pageSizeRef = useRef(pageSize);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<{ snapshotNo: string; invoiceStatus: string } | null>(null);
  const beginRequest = useRequestGuard();

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
      alert(error instanceof Error ? error.message : "服务费对账单加载失败");
    } finally {
      if (isCurrentRequest()) setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    void Promise.all([fetchAllEntityRows<Row>("undertaking-units"), fetchAllEntityRows<Row>("customers")])
      .then(([unitRows, customerRows]) => {
        setUndertakingUnits(unitRows);
        setCustomers(customerRows);
      });
  }, []);

  useEffect(() => {
    if (!Object.keys(columnFilters).length && !sortField && !sortOrder) return;
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

  function renderHeader(column: (typeof tableColumns)[number]) {
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
      alert(error instanceof Error ? error.message : "回款信息保存失败");
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
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "发票信息保存失败");
      setInvoiceDraft(null);
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : "发票信息保存失败");
    } finally {
      setBusyNo("");
    }
  }

  async function postAction(snapshotNo: string, action: "confirm" | "delete") {
    const prompt = action === "confirm"
      ? "确认该服务费对账单？确认后金额和明细将冻结，不能删除或退回。"
      : "确认删除该未确认服务费对账单？对账单明细和已上传附件将同时删除。";
    if (!confirm(prompt)) return;
    setBusyNo(snapshotNo);
    const endpoint = `/api/service-fees/snapshots/${encodeURIComponent(snapshotNo)}${action === "confirm" ? "/confirm" : ""}`;
    const response = await fetch(endpoint, { method: action === "confirm" ? "POST" : "DELETE" });
    const data = await response.json().catch(() => ({}));
    setBusyNo("");
    if (!response.ok) {
      alert(data.error ?? (action === "confirm" ? "确认失败" : "删除失败"));
      return;
    }
    await loadData();
  }

  async function setInvoiceState(snapshotNo: string, nextStatus: "未开票" | "已开票", ask = false) {
    if (ask && !confirm(`确认将该服务费对账单标记为“${nextStatus}”？`)) return false;
    setBusyNo(snapshotNo);
    try {
      const response = await fetch(`/api/service-fees/snapshots/${encodeURIComponent(snapshotNo)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceStatus: nextStatus }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(data.error ?? "开票状态更新失败");
        return false;
      }
      setRows((current) => current.map((row) => (
        String(row.snapshotNo ?? "") === snapshotNo ? { ...row, invoiceStatus: nextStatus } : row
      )));
      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : "开票状态更新失败");
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
      alert(error instanceof Error ? error.message : "回款状态更新失败");
    } finally {
      setBusyNo("");
    }
  }

  function chooseInvoice(row: Row) {
    if (row.invoiceOriginalName && !confirm("该对账单已有发票附件，继续上传将替换原附件。是否继续？")) return;
    uploadTargetRef.current = {
      snapshotNo: String(row.snapshotNo ?? ""),
      invoiceStatus: String(row.invoiceStatus ?? "未开票"),
    };
    fileRef.current?.click();
  }

  async function uploadInvoice(file: File) {
    const target = uploadTargetRef.current;
    uploadTargetRef.current = null;
    const snapshotNo = target?.snapshotNo ?? "";
    if (!snapshotNo) return;
    setBusyNo(snapshotNo);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/service-fees/snapshots/${encodeURIComponent(snapshotNo)}/invoice`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(data.error ?? "发票附件上传失败");
        return;
      }
      setRows((current) => current.map((row) => (
        String(row.snapshotNo ?? "") === snapshotNo
          ? { ...row, invoiceOriginalName: data.invoiceOriginalName ?? file.name, invoiceMimeType: data.invoiceMimeType ?? file.type, invoiceFileSize: data.invoiceFileSize ?? file.size }
          : row
      )));
    } catch (error) {
      alert(error instanceof Error ? error.message : "发票附件上传失败");
      return;
    } finally {
      setBusyNo("");
    }
    if (target?.invoiceStatus !== "已开票") {
      if (confirm("发票附件已上传，是否将开票状态更新为“已开票”？")) {
        await setInvoiceState(snapshotNo, "已开票");
      }
    }
  }

  async function deleteInvoice(row: Row) {
    const snapshotNo = String(row.snapshotNo ?? "");
    if (!confirm("确认删除该发票附件？")) return;
    setBusyNo(snapshotNo);
    try {
      const response = await fetch(`/api/service-fees/snapshots/${encodeURIComponent(snapshotNo)}/invoice`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(data.error ?? "发票附件删除失败");
        return;
      }
      setRows((current) => current.map((currentRow) => (
        String(currentRow.snapshotNo ?? "") === snapshotNo
          ? { ...currentRow, invoiceOriginalName: null, invoiceMimeType: null, invoiceFileSize: null }
          : currentRow
      )));
    } catch (error) {
      alert(error instanceof Error ? error.message : "发票附件删除失败");
      return;
    } finally {
      setBusyNo("");
    }
    if (String(row.invoiceStatus ?? "") === "已开票") {
      if (confirm("发票附件已删除，是否将开票状态更新为“未开票”？")) {
        await setInvoiceState(snapshotNo, "未开票");
      }
    }
  }

  const exportParams = buildParams(1, pageSizeRef.current);
  exportParams.delete("page");
  exportParams.delete("pageSize");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-[#303133]">服务费对账单</h1>
        <p className="mt-1 text-sm text-[#909399]">按国家和核销月份保存服务费对账结果；确认后金额及明细冻结，发票和开票状态仍可维护。</p>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#ebeef5] p-4">
          <Input placeholder="对账单号/国家/附件名" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <Input aria-label="核销月份" type="month" value={writeOffMonth} onChange={(event) => setWriteOffMonth(event.target.value)} />
          <select className="h-9 min-w-28 rounded border border-[#dcdfe6] bg-white px-3 text-sm" value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
            <option value="">全部国家</option>
            <option value="BR">BR</option>
            <option value="CL">CL</option>
            <option value="MX">MX</option>
          </select>
          <select className="h-9 min-w-28 rounded border border-[#dcdfe6] bg-white px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">全部状态</option>
            <option value="未确认">未确认</option>
            <option value="已确认">已确认</option>
          </select>
          <select className="h-9 min-w-28 rounded border border-[#dcdfe6] bg-white px-3 text-sm" value={invoiceStatus} onChange={(event) => setInvoiceStatus(event.target.value)}>
            <option value="">全部开票状态</option>
            <option value="未开票">未开票</option>
            <option value="已开票">已开票</option>
          </select>
          <div className="flex h-9 items-center gap-1 rounded border border-[#dcdfe6] bg-white p-1" aria-label="是否回款筛选">
            {[
              ["", "全部"],
              ["未回款", "未回款"],
              ["已回款", "已回款"],
            ].map(([value, label]) => (
              <button
                className={`h-7 rounded px-2 text-xs transition ${repaymentStatus === value ? "bg-[#ecf5ff] text-[#1890ff]" : "text-[#606266] hover:bg-[#f5f7fa]"}`}
                key={value || "all"}
                type="button"
                onClick={() => setRepaymentStatus(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <Button tone="primary" onClick={() => { setPage(1); void loadData(1); }}><Search size={15} />查询</Button>
          <Button onClick={() => void loadData()}><RefreshCw size={15} />刷新</Button>
          <a className="ml-auto" href={`/api/entities/service-fee-snapshots/export?${exportParams}`}>
            <Button tone="warning"><FileDown size={15} />导出 Excel</Button>
          </a>
          <input
            ref={fileRef}
            className="hidden"
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadInvoice(file);
              event.currentTarget.value = "";
            }}
          />
        </div>

        <StickyTable className="table-scroll overflow-auto" tableKey="service-fee-statements">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-[#f5f7fa] text-[#303133]">
              <tr>
                {tableColumns.map((column) => <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={column.key}>{renderHeader(column)}</th>)}
                <th className="sticky right-0 min-w-[150px] border-b border-[#ebeef5] bg-[#f5f7fa] px-3 py-3 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const snapshotNo = String(row.snapshotNo ?? "");
                const confirmed = row.status === "已确认";
                const hasInvoice = Boolean(row.invoiceOriginalName);
                const issued = row.invoiceStatus === "已开票";
                return (
                  <tr className="hover:bg-[#fafafa]" key={snapshotNo}>
                    {columns.map((column) => {
                      const value = row[column.key];
                      return (
                        <td className="max-w-[280px] whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3" key={column.key} title={String(value ?? "")}>
                          {column.key === "snapshotNo" ? (
                            <Link
                              className="font-medium text-[#1890ff] hover:underline"
                              href={`/finance/service-fee-snapshot-items?snapshotNo=${encodeURIComponent(snapshotNo)}`}
                              onClick={(event) => {
                                event.preventDefault();
                                postWorkspaceMessage({
                                  type: "cloud-power:open-tab",
                                  route: `/finance/service-fee-snapshot-items?snapshotNo=${encodeURIComponent(snapshotNo)}`,
                                  title: "服务费对账单明细",
                                });
                              }}
                            >
                              {snapshotNo}
                            </Link>
                          ) : column.key === "status" ? (
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${confirmed ? "bg-[#f0f9eb] text-[#67c23a]" : "bg-[#fff7e6] text-[#e6a23c]"}`}>
                              {confirmed ? "已确认" : "未确认"}
                            </span>
                          ) : column.key === "customerReceivable" ? (
                            <AmountSummary
                              currency={row.defaultBillingCurrency}
                              excludingTax={row.serviceFeeTotalExcludingTax}
                              vatRate={row.vatRate}
                              includingTax={row.serviceFeeTotal}
                              partyFlow={formatPartyFlow(row.customerName, row.undertakingUnitName)}
                            />
                          ) : column.key === "customerReceived" ? (
                            <AmountSummary
                              currency={row.repaymentCurrency}
                              excludingTax={row.repaymentAmountExcludingTax}
                              vatRate={row.repaymentVatRate}
                              includingTax={row.repaymentAmount}
                              partyFlow={formatPartyFlow(
                                firstNonBlankValue(row.payerCustomerCode, row.customerName),
                                firstNonBlankValue(row.receivingUnitCode, row.undertakingUnitName),
                              )}
                              action={<RepaymentStatusAction row={row} busy={busyNo === snapshotNo} onToggle={() => void setRepaymentState(row, row.repaymentStatus === "已回款" ? "未回款" : "已回款")} onEdit={() => openRepayment(row)} />}
                            />
                          ) : column.key === "customerInvoice" ? (
                            <div className="min-w-[165px]">
                              <AmountSummary
                                currency={row.invoiceCurrency}
                                excludingTax={row.invoiceAmountExcludingTax}
                                vatRate={row.invoiceVatRate}
                                includingTax={row.invoiceAmountIncludingTax}
                                partyFlow={formatPartyFlow(
                                  firstNonBlankValue(row.invoicePayerCustomerCode, row.customerName),
                                  firstNonBlankValue(row.invoiceReceivingUnitCode, row.undertakingUnitName),
                                )}
                              />
                              <div className="mt-1 flex items-center gap-1 border-t border-[#f0f2f5] pt-1">
                                <button
                                  aria-checked={issued}
                                  aria-label={`开票状态：${issued ? "已开票" : "未开票"}`}
                                  className="inline-flex h-6 items-center gap-1 rounded-full text-xs text-[#606266] disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={busyNo === snapshotNo}
                                  role="switch"
                                  title={`点击切换为${issued ? "未开票" : "已开票"}`}
                                  type="button"
                                  onClick={() => void setInvoiceState(snapshotNo, issued ? "未开票" : "已开票")}
                                >
                                  <span className={`relative inline-flex h-4 w-7 rounded-full transition-colors ${issued ? "bg-[#13ce66]" : "bg-[#c0c4cc]"}`}>
                                    <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${issued ? "translate-x-[15px]" : "translate-x-0.5"}`} />
                                  </span>
                                  <span>{issued ? "已开票" : "未开票"}</span>
                                </button>
                                <button
                                  aria-label="编辑发票信息"
                                  className="inline-flex h-6 w-6 items-center justify-center rounded text-[#909399] hover:bg-[#f5f7fa] hover:text-[#1890ff] disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={busyNo === snapshotNo}
                                  title="编辑发票信息"
                                  type="button"
                                  onClick={() => openInvoiceInfo(row)}
                                >
                                  <FileText size={13} />
                                </button>
                                <button
                                  aria-label={hasInvoice ? "替换发票附件" : "上传发票附件"}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded text-[#909399] hover:bg-[#f5f7fa] hover:text-[#1890ff] disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={busyNo === snapshotNo}
                                  title={hasInvoice ? "替换发票附件" : "上传发票附件"}
                                  type="button"
                                  onClick={() => chooseInvoice(row)}
                                >
                                  <Upload size={13} />
                                </button>
                                {hasInvoice ? (
                                  <>
                                    <a
                                      aria-label="下载发票附件"
                                      className="max-w-[80px] truncate text-xs text-[#1890ff] hover:underline"
                                      href={`/api/service-fees/snapshots/${encodeURIComponent(snapshotNo)}/invoice`}
                                      title={`下载 ${String(row.invoiceOriginalName)}`}
                                    >
                                      附件
                                    </a>
                                    <button
                                      aria-label="删除发票附件"
                                      className="inline-flex h-6 w-6 items-center justify-center rounded text-[#f56c6c] hover:bg-[#fff0f0] disabled:cursor-not-allowed disabled:opacity-50"
                                      disabled={busyNo === snapshotNo}
                                      title="删除发票附件"
                                      type="button"
                                      onClick={() => void deleteInvoice(row)}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          ) : (
                            <span className="block max-w-[260px] truncate">{formatValue(value, column.type)}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="sticky right-0 whitespace-nowrap border-b border-[#ebeef5] bg-white px-3 py-3">
                      <div className="flex items-center gap-1">
                        {!confirmed ? (
                          <button
                            aria-label="确认对账单"
                            className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#13ce66] bg-white text-[#13ce66] transition hover:bg-[#f0fff4] disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={busyNo === snapshotNo}
                            title="确认对账单"
                            type="button"
                            onClick={() => void postAction(snapshotNo, "confirm")}
                          >
                            <CheckCircle2 size={15} />
                          </button>
                        ) : null}
                        {!confirmed ? (
                          <button
                            aria-label="删除对账单"
                            className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#f56c6c] bg-white text-[#f56c6c] transition hover:bg-[#fff0f0] disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={busyNo === snapshotNo}
                            title="删除未确认对账单"
                            type="button"
                            onClick={() => void postAction(snapshotNo, "delete")}
                          >
                            <Trash2 size={15} />
                          </button>
                        ) : null}
                        {confirmed ? <span className="px-2 text-[#c0c4cc]">-</span> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? <tr><td className="py-12 text-center text-[#909399]" colSpan={columns.length + 1}>{loading ? "加载中..." : "暂无服务费对账单"}</td></tr> : null}
            </tbody>
          </table>
        </StickyTable>
        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={(next) => { setPage(next); void loadData(next); }}
          onPageSizeChange={(next) => { pageSizeRef.current = next; setPageSize(next); setPage(1); void loadData(1, next); }}
        />
      </Panel>
      {repaymentDraft ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-label="登记回款信息">
          <div className="w-full max-w-[680px] border border-[#ebeef5] bg-white shadow-xl">
            <div className="flex items-center border-b border-[#ebeef5] px-5 py-4">
              <div>
                <h2 className="font-medium text-[#303133]">登记回款信息</h2>
                <p className="mt-1 text-xs text-[#909399]">{repaymentDraft.snapshotNo}</p>
              </div>
              <button className="ml-auto text-[#909399] hover:text-[#303133]" type="button" title="关闭" onClick={() => setRepaymentDraft(null)}><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-4 p-5">
              <RepaymentField label="是否回款">
                <button
                  aria-checked={repaymentDraft.repaymentStatus === "已回款"}
                  aria-label={`是否回款：${repaymentDraft.repaymentStatus}`}
                  className="inline-flex h-9 items-center gap-2 text-sm text-[#606266]"
                  role="switch"
                  title="点击切换回款状态"
                  type="button"
                  onClick={() => setRepaymentDraft((current) => current ? {
                    ...current,
                    repaymentStatus: current.repaymentStatus === "已回款" ? "未回款" : "已回款",
                  } : current)}
                >
                  <span className={`relative inline-flex h-5 w-10 rounded-full transition-colors ${repaymentDraft.repaymentStatus === "已回款" ? "bg-[#13ce66]" : "bg-[#c0c4cc]"}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${repaymentDraft.repaymentStatus === "已回款" ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                  </span>
                  <span>{repaymentDraft.repaymentStatus}</span>
                </button>
              </RepaymentField>
              <div />
              <RepaymentField label="收款单位">
                <select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-3 text-sm" value={repaymentDraft.receivingUnitId} onChange={(event) => setRepaymentDraft((current) => current ? { ...current, receivingUnitId: event.target.value } : current)}>
                  <option value="">请选择承接单位</option>
                  {undertakingUnits.map((row) => <option key={String(row.undertakingUnitId)} value={String(row.undertakingUnitId)}>{partyOptionLabel(row, ["undertakingUnitCode", "entityCode"], ["shortName", "entityName", "name"])}</option>)}
                </select>
              </RepaymentField>
              <RepaymentField label="付款单位">
                <select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-3 text-sm" value={repaymentDraft.payerCustomerId} onChange={(event) => setRepaymentDraft((current) => current ? { ...current, payerCustomerId: event.target.value } : current)}>
                  <option value="">请选择客户</option>
                  {customers.map((row) => <option key={String(row.customerId)} value={String(row.customerId)}>{partyOptionLabel(row, ["customerCode"], ["shortName", "nameCn", "name"])}</option>)}
                </select>
              </RepaymentField>
              <RepaymentField label="回款币种">
                <select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-3 text-sm" value={repaymentDraft.repaymentCurrency} onChange={(event) => setRepaymentDraft((current) => current ? { ...current, repaymentCurrency: event.target.value } : current)}>
                  <option value="">请选择币种</option>{["CNY", "MXN", "CLP", "USD", "BRL"].map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                </select>
              </RepaymentField>
              <RepaymentField label="回款未税金额">
                <Input className="w-full min-w-0" type="number" step="0.01" value={repaymentDraft.repaymentAmountExcludingTax} onChange={(event) => updateRepaymentTaxField("excludingTax", event.target.value)} />
              </RepaymentField>
              <RepaymentField label="回款税率（%）">
                <Input className="w-full min-w-0" type="number" min="0" step="0.01" value={repaymentDraft.repaymentVatRate} onChange={(event) => updateRepaymentTaxField("vatRate", event.target.value)} />
              </RepaymentField>
              <RepaymentField label="回款含税金额">
                <Input className="w-full min-w-0" type="number" step="0.01" value={repaymentDraft.repaymentAmount} onChange={(event) => updateRepaymentTaxField("includingTax", event.target.value)} />
              </RepaymentField>
              <RepaymentField label="回款日期">
                <Input className="w-full min-w-0" type="date" value={repaymentDraft.repaymentDate} onChange={(event) => setRepaymentDraft((current) => current ? { ...current, repaymentDate: event.target.value } : current)} />
              </RepaymentField>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#ebeef5] px-5 py-4">
              <Button onClick={() => setRepaymentDraft(null)}>取消</Button>
              <Button tone="primary" disabled={busyNo === repaymentDraft.snapshotNo} onClick={() => void saveRepayment()}>保存回款信息</Button>
            </div>
          </div>
        </div>
      ) : null}
      {invoiceDraft ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-label="编辑发票信息">
          <div className="w-full max-w-[680px] border border-[#ebeef5] bg-white shadow-xl">
            <div className="flex items-center border-b border-[#ebeef5] px-5 py-4">
              <div>
                <h2 className="font-medium text-[#303133]">编辑发票信息</h2>
                <p className="mt-1 text-xs text-[#909399]">{invoiceDraft.snapshotNo}</p>
              </div>
              <button className="ml-auto text-[#909399] hover:text-[#303133]" type="button" title="关闭" onClick={() => setInvoiceDraft(null)}><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-4 p-5">
              <RepaymentField label="承接单位">
                <select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-3 text-sm" value={invoiceDraft.invoiceReceivingUnitId} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, invoiceReceivingUnitId: event.target.value } : current)}>
                  <option value="">请选择承接单位</option>
                  {undertakingUnits.map((row) => <option key={String(row.undertakingUnitId)} value={String(row.undertakingUnitId)}>{partyShortName(row, ["shortName", "entityName", "name"], ["undertakingUnitCode", "entityCode"])}</option>)}
                </select>
              </RepaymentField>
              <RepaymentField label="客户">
                <select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-3 text-sm" value={invoiceDraft.invoicePayerCustomerId} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, invoicePayerCustomerId: event.target.value } : current)}>
                  <option value="">请选择客户</option>
                  {customers.map((row) => <option key={String(row.customerId)} value={String(row.customerId)}>{partyShortName(row, ["shortName", "nameCn", "name"], ["customerCode"])}</option>)}
                </select>
              </RepaymentField>
              <RepaymentField label="发票号">
                <Input className="w-full min-w-0" value={invoiceDraft.invoiceNo} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, invoiceNo: event.target.value } : current)} />
              </RepaymentField>
              <RepaymentField label="发票币种">
                <Input className="w-full min-w-0" value={invoiceDraft.invoiceCurrency} placeholder="例如 USD、CNY" onChange={(event) => setInvoiceDraft((current) => current ? { ...current, invoiceCurrency: event.target.value.toUpperCase() } : current)} />
              </RepaymentField>
              <RepaymentField label="发票未税金额">
                <Input className="w-full min-w-0" type="number" step="0.01" value={invoiceDraft.invoiceAmountExcludingTax} onChange={(event) => updateInvoiceTaxField("excludingTax", event.target.value)} />
              </RepaymentField>
              <RepaymentField label="发票税率（%）">
                <Input className="w-full min-w-0" type="number" min="0" step="0.01" value={invoiceDraft.invoiceVatRate} onChange={(event) => updateInvoiceTaxField("vatRate", event.target.value)} />
              </RepaymentField>
              <RepaymentField label="发票含税金额">
                <Input className="w-full min-w-0" type="number" step="0.01" value={invoiceDraft.invoiceAmountIncludingTax} onChange={(event) => updateInvoiceTaxField("includingTax", event.target.value)} />
              </RepaymentField>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#ebeef5] px-5 py-4">
              <Button onClick={() => setInvoiceDraft(null)}>取消</Button>
              <Button tone="primary" disabled={busyNo === invoiceDraft.snapshotNo} onClick={() => void saveInvoiceInfo()}>保存发票信息</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RepaymentField({ children, label }: { children: React.ReactNode; label: string }) {
  return <label><span className="mb-1 block text-sm font-medium text-[#606266]">{label}</span>{children}</label>;
}

function formatValue(value: unknown, type?: string) {
  if (type === "month") return value ? String(value).slice(0, 7) : "";
  return formatDisplayValue(value as string | number | boolean | null | undefined, type);
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

function AmountSummary({
  currency,
  excludingTax,
  vatRate,
  includingTax,
  partyFlow,
  action,
}: {
  currency: unknown;
  excludingTax: unknown;
  vatRate: unknown;
  includingTax: unknown;
  partyFlow?: string;
  action?: ReactNode;
}) {
  const net = nullableNumber(excludingTax);
  const rate = nullableNumber(vatRate);
  const gross = nullableNumber(includingTax);
  const resolvedNet = net ?? (gross !== null && rate !== null ? gross / (1 + rate) : null);
  const resolvedGross = gross ?? (net !== null && rate !== null ? net * (1 + rate) : null);
  const tax = resolvedGross !== null && resolvedNet !== null ? resolvedGross - resolvedNet : null;
  return (
    <div className="min-w-[135px] space-y-0.5 text-xs leading-4 text-[#606266]">
      {partyFlow ? <div className="max-w-[190px] truncate text-[11px] text-[#909399]" title={partyFlow}>{partyFlow}</div> : null}
      <div className="font-semibold text-[#2f75b5]">{String(currency ?? "").trim() || "-"}</div>
      <div><span className="text-[#909399]">未税 </span>{formatCompactMoney(resolvedNet)}</div>
      <div><span className="text-[#909399]">税率 </span>{formatCompactRate(rate)}</div>
      <div><span className="text-[#909399]">税金 </span>{formatCompactMoney(tax)}</div>
      <div className="font-semibold text-[#303133]"><span className="font-normal text-[#909399]">含税 </span>{formatCompactMoney(resolvedGross)}</div>
      {action ? <div className="mt-1 flex items-center gap-1 border-t border-[#f0f2f5] pt-1">{action}</div> : null}
    </div>
  );
}

function RepaymentStatusAction({ row, busy, onToggle, onEdit }: { row: Row; busy: boolean; onToggle: () => void; onEdit: () => void }) {
  const paid = row.repaymentStatus === "已回款";
  return <>
    <button
      aria-checked={paid}
      aria-label={`回款状态：${paid ? "已回款" : "未回款"}`}
      className="inline-flex h-6 items-center gap-1 rounded-full text-xs text-[#606266] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={busy}
      role="switch"
      title={`点击切换为${paid ? "未回款" : "已回款"}`}
      type="button"
      onClick={onToggle}
    >
      <span className={`relative inline-flex h-4 w-7 rounded-full transition-colors ${paid ? "bg-[#13ce66]" : "bg-[#c0c4cc]"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${paid ? "translate-x-[15px]" : "translate-x-0.5"}`} />
      </span>
      <span>{paid ? "已回款" : "未回款"}</span>
    </button>
    <button aria-label="编辑回款信息" className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded text-[#909399] hover:bg-[#f5f7fa] hover:text-[#1890ff] disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} title="编辑回款信息" type="button" onClick={onEdit}>
      <Pencil size={13} />
    </button>
  </>;
}

function formatCompactMoney(value: number | null) {
  return value === null ? "-" : formatDisplayValue(value, "money");
}

function formatCompactRate(value: number | null) {
  return value === null ? "-" : `${(value * 100).toFixed(2)}%`;
}

function formatPartyFlow(payer: unknown, receiver: unknown) {
  const payerName = String(payer ?? "").trim();
  const receiverName = String(receiver ?? "").trim();
  return payerName && receiverName ? `${payerName} → ${receiverName}` : payerName || receiverName;
}
