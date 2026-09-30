"use client";

import { useEffect, useRef, useState } from "react";
import { SearchSelect, type SearchSelectOption } from "./search-select";
import { formatMoneyValue } from "@/lib/display-format";

export type CrmInvoiceCandidate = {
  crmInvoiceId: number | string;
  invoiceNo?: string | null;
  customerShortName?: string | null;
  customerSubjectName?: string | null;
  customerName?: string | null;
  mappedCustomerId?: string | null;
  belongMonth?: string | null;
  currency?: string | null;
  amountTaxExcluded?: unknown;
  taxAmount?: unknown;
  amountTaxIncluded?: unknown;
  invoiceDate?: string | null;
  invoiceStatus?: number | string | null;
  invoiceStatusLabel?: string | null;
  targetRowId?: string | null;
};

function hintOf(invoice: CrmInvoiceCandidate, rowId: string) {
  const parts = [
    invoice.customerName || invoice.customerShortName || invoice.customerSubjectName || "-",
    invoice.belongMonth ?? "",
    `${invoice.currency ?? ""} ${formatMoneyValue(invoice.amountTaxIncluded)}`.trim(),
    String(invoice.invoiceStatus) === "2" ? "已作废" : invoice.invoiceStatusLabel ?? "",
  ].filter(Boolean);
  if (invoice.targetRowId && invoice.targetRowId !== rowId) parts.push("已匹配其它对账明细");
  return parts.join(" · ");
}

/**
 * 「编辑客户开票」里的 CRM 发票搜索。
 *
 * 远端只读，这里只是把已同步到本地的 CRM 发票按发票号 / 客户 / 主体搜出来，
 * 选中后由调用方把开票信息填进表单；保存时再回写匹配关系并挂载 PDF。
 */
export function CrmInvoicePicker({
  rowId,
  customerId,
  value,
  onPick,
}: {
  rowId: string;
  customerId: string;
  value: string;
  onPick: (invoice: CrmInvoiceCandidate) => void;
}) {
  const [options, setOptions] = useState<SearchSelectOption[]>([]);
  const [candidates, setCandidates] = useState<CrmInvoiceCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const searchTimer = useRef<number | null>(null);

  useEffect(() => () => { if (searchTimer.current) window.clearTimeout(searchTimer.current); }, []);

  function handleSearch(keyword: string) {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    const trimmed = keyword.trim();
    searchTimer.current = window.setTimeout(() => {
      const params = new URLSearchParams({ view: "search", limit: "20" });
      if (trimmed) params.set("keyword", trimmed);
      if (customerId) params.set("customerId", customerId);
      setLoading(true);
      void fetch(`/api/cloud/crm-invoices?${params.toString()}`)
        .then((response) => response.json())
        .then((data: { items?: CrmInvoiceCandidate[] }) => {
          const items = Array.isArray(data.items) ? data.items : [];
          setCandidates(items);
          setOptions(items.map((item) => ({
            value: String(item.crmInvoiceId),
            label: String(item.invoiceNo ?? item.crmInvoiceId),
            code: item.customerName ?? item.customerShortName ?? undefined,
            hint: hintOf(item, rowId),
          })));
        })
        .catch(() => { setCandidates([]); setOptions([]); })
        .finally(() => setLoading(false));
    }, trimmed ? 220 : 0);
  }

  return (
    <SearchSelect
      className="w-full"
      emptyText="没有匹配的 CRM 发票（可先到「账期发票（CRM）」同步一次）"
      loading={loading}
      onChange={(next) => {
        const picked = candidates.find((item) => String(item.crmInvoiceId) === next);
        if (picked) onPick(picked);
      }}
      onSearch={handleSearch}
      options={options}
      placeholder="输入发票号 / 客户 / 主体搜索 CRM 发票"
      value={value}
    />
  );
}
