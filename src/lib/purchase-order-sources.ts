import { normalizeRequestNos } from "./procurement-workflow";

/** Actual line sources take precedence over legacy headers (which can be incomplete or free text). */
export function getPurchaseSourceRequestNos(
  order: { requestNo?: unknown; sourceRequestNos?: unknown },
  itemRequestNos: unknown[] = [],
) {
  const itemSources = normalizeRequestNos(itemRequestNos.map((value) => String(value ?? "")));
  const savedSources = normalizeRequestNos([String(order.sourceRequestNos ?? "")]);
  const sources = itemSources || savedSources || normalizeRequestNos([String(order.requestNo ?? "")]);
  return sources.split(",").filter(Boolean).sort().join(",");
}

/** Match the whole order so filtering by one source never removes its other lines/totals. */
export function buildPurchaseSourceRequestFilter(values: string[], params: Record<string, unknown>, name: string) {
  const matches = values.map((value, index) => {
    const key = `${name}_${index}`;
    params[key] = value;
    return `(FIND_IN_SET(:${key}, purchase.sourceRequestNos) > 0
      OR FIND_IN_SET(:${key}, purchase.requestNo) > 0
      OR EXISTS (
        SELECT 1 FROM purchaseorderitems sourceItem
        LEFT JOIN requestitems sourceRequestItem ON sourceRequestItem.id = sourceItem.requestItemId
        WHERE sourceItem.poNo = purchase.poNo
          AND COALESCE(NULLIF(sourceItem.requestNo, ''), sourceRequestItem.requestNo) = :${key}
      ))`;
  });
  return matches.length ? `(${matches.join(" OR ")})` : "";
}
