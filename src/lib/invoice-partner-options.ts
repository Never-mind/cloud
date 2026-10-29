export type InvoicePartnerKind = "customers" | "undertakingUnits" | "suppliers";

const text = (...values: unknown[]) => values.map(value => String(value ?? "").trim()).find(Boolean) || "";

/** Keep display names separate from identity; search all maintained names and tax IDs. */
export function invoicePartnerOptions(rows: Record<string, unknown>[], kind: InvoicePartnerKind) {
  const idKey = { customers: "customerId", undertakingUnits: "undertakingUnitId", suppliers: "supplierId" }[kind];
  return rows.map(row => ({
    value: text(row[idKey], row.id),
    label: text(row.shortName, row.entityName, row.nameCn, row.name, row.nameEn),
    code: text(row.customerCode, row.undertakingUnitCode, row.entityCode, row.supplierCode),
    hint: text(row.entityName, row.nameCn, row.name, row.nameEn),
    keywords: [row.shortName, row.name, row.nameCn, row.nameEn, row.entityName, row.taxNumber, row.customerCode, row.undertakingUnitCode, row.entityCode, row.supplierCode].map(value => String(value ?? "")).join(" "),
  })).filter(option => option.value);
}
