"use client";
import { useEffect, useState } from "react";
import type { SearchSelectOption } from "./search-select";
import type { InvoicePartyMatch } from "@/lib/invoice-recognition-service";
import { fetchAllEntityRows } from "@/lib/client-entity-fetch";
import { notify } from "./app-dialog";
import { invoicePartnerOptions, type InvoicePartnerKind } from "@/lib/invoice-partner-options";

export function usePartnerOptions(entity: InvoicePartnerKind | "undertaking-units", match?: InvoicePartyMatch) {
  const [options, setOptions] = useState<SearchSelectOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchAllEntityRows<Record<string, unknown>>(entity);
        if (cancelled) return;
        setOptions(invoicePartnerOptions(rows, entity === "undertaking-units" ? "undertakingUnits" : entity));
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
