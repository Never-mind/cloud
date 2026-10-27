import { deriveInvoiceTaxAmounts, roundInvoiceAmount, validateInvoiceTaxAmounts } from "./invoice-tax";

export type InvoiceReviewAmounts = {
  amountExcludingTax: string;
  taxRate: string;
  taxAmount: string;
  amountIncludingTax: string;
};

export function invoiceReviewNumber(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function completeInvoiceReviewAmounts(input: InvoiceReviewAmounts): InvoiceReviewAmounts {
  const values = deriveInvoiceTaxAmounts({
    netAmount: invoiceReviewNumber(input.amountExcludingTax), taxRate: invoiceReviewNumber(input.taxRate),
    taxAmount: invoiceReviewNumber(input.taxAmount), grossAmount: invoiceReviewNumber(input.amountIncludingTax),
  });
  const value = (number: number | null) => number === null ? "" : String(number);
  return { amountExcludingTax: value(values.netAmount), taxRate: value(values.taxRate), taxAmount: value(values.taxAmount), amountIncludingTax: value(values.grossAmount) };
}

export function updateInvoiceReviewAmounts<T extends InvoiceReviewAmounts>(input: T, field: keyof InvoiceReviewAmounts, value: string): T {
  const next = { ...input, [field]: value };
  const net = invoiceReviewNumber(next.amountExcludingTax);
  const rate = invoiceReviewNumber(next.taxRate);
  const tax = invoiceReviewNumber(next.taxAmount);
  const gross = invoiceReviewNumber(next.amountIncludingTax);
  if ((field === "amountExcludingTax" || field === "taxRate") && net !== null && rate !== null) {
    next.taxAmount = String(roundInvoiceAmount(net * rate / 100));
    next.amountIncludingTax = String(roundInvoiceAmount(net + Number(next.taxAmount)));
  } else if (field === "amountIncludingTax" && gross !== null && rate !== null && rate >= 0) {
    next.amountExcludingTax = String(roundInvoiceAmount(gross / (1 + rate / 100)));
    next.taxAmount = String(roundInvoiceAmount(gross - Number(next.amountExcludingTax)));
  } else if (field === "taxAmount" && net !== null && tax !== null) {
    next.amountIncludingTax = String(roundInvoiceAmount(net + tax));
  }
  return next;
}

export function validateInvoiceReview(input: InvoiceReviewAmounts & { invoiceNo?: unknown; invoiceDate?: unknown; currency?: unknown }, requireDetails = true) {
  if (requireDetails && !String(input.invoiceNo ?? "").trim()) return "请填写真实发票号码";
  const date = String(input.invoiceDate ?? "");
  if (requireDetails && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) return "请填写有效开票日期";
  if (requireDetails && !String(input.currency ?? "").trim()) return "请填写发票币种";
  for (const key of ["amountExcludingTax", "taxRate", "taxAmount", "amountIncludingTax"] as const) {
    if (input[key].trim() && invoiceReviewNumber(input[key]) === null) return "金额和税率必须是有效数字";
  }
  const values = completeInvoiceReviewAmounts(input);
  if (requireDetails && (!values.amountExcludingTax || !values.taxAmount || !values.amountIncludingTax)) return "请补齐未税金额、税金和含税金额";
  return validateInvoiceTaxAmounts({ netAmount: invoiceReviewNumber(values.amountExcludingTax), taxRate: invoiceReviewNumber(values.taxRate), taxAmount: invoiceReviewNumber(values.taxAmount), grossAmount: invoiceReviewNumber(values.amountIncludingTax) });
}
