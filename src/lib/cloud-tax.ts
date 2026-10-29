export const CLOUD_TAX_GROUPS = {
  supplierPayable: {
    netKey: "supplierPayableNetAmount",
    rateKey: "supplierTaxRate",
    taxKey: "supplierTaxAmount",
    totalKey: "supplierPayableTotalAmount",
  },
  customerReceivable: {
    netKey: "customerReceivableNetAmount",
    rateKey: "customerTaxRate",
    taxKey: "customerReceivableTaxAmount",
    totalKey: "customerReceivableTotalAmount",
  },
  collection: {
    netKey: "collectionNetAmount",
    rateKey: "collectionTaxRate",
    taxKey: "collectionTaxAmount",
    totalKey: "collectionTotalAmount",
  },
  invoice: {
    netKey: "invoiceNetAmount",
    rateKey: "invoiceTaxRate",
    taxKey: "invoiceTaxAmount",
    totalKey: "invoiceTotalAmount",
  },
  payment: {
    netKey: "paymentNetAmount",
    rateKey: "paymentTaxRate",
    taxKey: "paymentTaxAmount",
    totalKey: "paymentTotalAmount",
  },
} as const;

export type CloudTaxGroup = keyof typeof CLOUD_TAX_GROUPS;
export type CloudTaxField = "net" | "tax" | "total" | "rate";

type CloudTaxCalculation = {
  net: number | null;
  tax: number | null;
  total: number | null;
  source: "net-rate" | "tax" | "total" | null;
};

function cloudTaxNumber(value: unknown) {
  const raw = String(value ?? "").trim().replace(/,/g, "");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function cloudTaxRate(value: unknown) {
  const raw = String(value ?? "").trim().replace(/,/g, "");
  if (!raw) return null;
  const percent = raw.endsWith("%");
  const parsed = Number(percent ? raw.slice(0, -1) : raw);
  if (!Number.isFinite(parsed)) return null;
  return percent || parsed > 1 ? parsed / 100 : parsed;
}

export function calculateCloudTaxGroup(
  values: Record<string, unknown>,
  group: CloudTaxGroup,
  changedFields: readonly string[],
): CloudTaxCalculation {
  const { netKey, rateKey, taxKey, totalKey } = CLOUD_TAX_GROUPS[group];
  const net = cloudTaxNumber(values[netKey]);
  const taxRate = cloudTaxRate(values[rateKey]);
  const tax = cloudTaxNumber(values[taxKey]);
  const total = cloudTaxNumber(values[totalKey]);

  if ((changedFields.includes(netKey) || changedFields.includes(rateKey)) && net !== null && taxRate !== null) {
    const calculatedTax = net * taxRate;
    return { net, tax: calculatedTax, total: net + calculatedTax, source: "net-rate" };
  }
  if (changedFields.includes(totalKey) && total !== null && taxRate !== null) {
    const calculatedNet = total / (1 + taxRate);
    return { net: calculatedNet, tax: total - calculatedNet, total, source: "total" };
  }
  if (changedFields.includes(taxKey) && net !== null && tax !== null) {
    return { net, tax, total: net + tax, source: "tax" };
  }
  return { net, tax, total, source: null };
}

/** Full reviewed invoice amounts take precedence over tax-rate estimates. */
export function confirmedCloudInvoiceAmounts(values: Record<string, unknown>, fields: readonly string[]): CloudTaxCalculation | null {
  const keys = CLOUD_TAX_GROUPS.invoice;
  if (![keys.netKey, keys.taxKey, keys.totalKey].every(key => fields.includes(key) && String(values[key] ?? "").trim() !== "")) return null;
  const net = cloudTaxNumber(values[keys.netKey]);
  const tax = cloudTaxNumber(values[keys.taxKey]);
  const total = cloudTaxNumber(values[keys.totalKey]);
  const rate = cloudTaxRate(values[keys.rateKey]);
  if (net === null || tax === null || total === null || net < 0 || tax < 0 || total < 0 || (rate !== null && (rate < 0 || rate > 1))) throw new Error("发票金额或税率无效");
  if (Math.abs(net + tax - total) > 0.011) throw new Error("未税金额 + 税金与含税金额不一致");
  return { net, tax, total, source: null };
}

/** Preserve the amounts confirmed in the receipt editor, including invoice rounding. */
export function confirmedCloudCollectionAmounts(values: Record<string, unknown>, fields: readonly string[]): CloudTaxCalculation | null {
  const keys = CLOUD_TAX_GROUPS.collection;
  if (![keys.netKey, keys.taxKey, keys.totalKey].every(key => fields.includes(key) && String(values[key] ?? "").trim() !== "")) return null;
  const net = cloudTaxNumber(values[keys.netKey]);
  const tax = cloudTaxNumber(values[keys.taxKey]);
  const total = cloudTaxNumber(values[keys.totalKey]);
  if (net === null || tax === null || total === null) throw new Error("实收金额无效");
  if (Math.abs(net + tax - total) > 0.011) throw new Error("实收未税金额 + 税金与含税金额不一致，请核对后保存");
  return { net, tax, total, source: null };
}
