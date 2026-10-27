"use client";
import { useEffect, useState } from "react";
import type { SearchSelectOption } from "./search-select";
import type { InvoicePartyMatch } from "@/lib/invoice-recognition-service";
import { fetchAllEntityRows } from "@/lib/client-entity-fetch";
import { notify } from "./app-dialog";

export function usePartnerOptions(entity: string, match?: InvoicePartyMatch) {
  const [options, setOptions] = useState<SearchSelectOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchAllEntityRows<Record<string, unknown>>(entity);
        if (cancelled) return;
        const firstText = (...values: unknown[]) => values.map(value => String(value ?? "").trim()).find(Boolean) || "";
        setOptions(rows.map(row => ({
          value: firstText(row.customerId, row.undertakingUnitId, row.supplierId, row.id),
          label: firstText(row.shortName, row.entityName, row.nameCn, row.name, row.nameEn),
          code: firstText(row.customerCode, row.entityCode, row.undertakingUnitCode, row.supplierCode),
          hint: firstText(row.entityName, row.nameCn, row.name, row.nameEn),
          keywords: [row.name, row.nameCn, row.nameEn, row.entityName, row.taxNumber].map(value => String(value ?? "")).join(" "),
        })));
      } catch (error) {
        if (!cancelled) { setOptions([]); notify(error instanceof Error ? error.message : "业务伙伴档案加载失败", "error"); }
      }
    })();
    return () => { cancelled = true; };
  }, [entity]);
  return [...options, ...(match?.candidates ?? [])
    .filter(candidate => !options.some(option => option.value === candidate.id))
    .map(candidate => ({ value: candidate.id, label: candidate.name }))];
}
