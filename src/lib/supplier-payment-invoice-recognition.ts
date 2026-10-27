import { addDaysToDateOnly } from "./date-only";
import { completeInvoiceReviewAmounts } from "./invoice-review";

/**
 * 发票识别结果 → 华为云供应商付款「供应商开票」字段。
 *
 * 识别服务返回的是项目结算发票口径（currency / amountExcludingTax / invoiceTotal），
 * 这里只做字段名映射；空字段不覆盖用户已经手工填写的内容。
 */
export type SupplierPaymentInvoiceRecognitionForm = {
  invoiceNo?: unknown;
  invoiceDate?: unknown;
  currency?: unknown;
  exchangeRate?: unknown;
  amountExcludingTax?: unknown;
  taxRate?: unknown;
  taxAmount?: unknown;
  invoiceTotal?: unknown;
  invoiceEntityId?: unknown;
};

export function buildSupplierPaymentInvoicePatch(
  form: SupplierPaymentInvoiceRecognitionForm,
  current: { supplierId?: unknown; receivableDate?: unknown } = {},
) {
  const patch: Record<string, unknown> = {};
  const assign = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") patch[key] = value;
  };
  assign("invoiceNo", form.invoiceNo);
  assign("invoiceDate", form.invoiceDate);
  assign("invoiceCurrency", form.currency);
  assign("invoiceExchangeRate", form.exchangeRate);
  const amounts = completeInvoiceReviewAmounts({ amountExcludingTax: String(form.amountExcludingTax ?? ""), taxRate: String(form.taxRate ?? ""), taxAmount: String(form.taxAmount ?? ""), amountIncludingTax: String(form.invoiceTotal ?? "") });
  assign("invoiceNetAmount", amounts.amountExcludingTax);
  if (amounts.taxRate !== "") assign("invoiceTaxRate", String(Number(amounts.taxRate) / 100));
  assign("invoiceTaxAmount", amounts.taxAmount);
  assign("invoiceTotalAmount", amounts.amountIncludingTax);
  if (patch.invoiceDate && !current.receivableDate) patch.receivableDate = addDaysToDateOnly(patch.invoiceDate, 30);
  if (Object.keys(patch).length) patch.invoiceStatus = "issued";

  const warnings: string[] = [];
  if (!patch.invoiceNo) warnings.push("未识别到发票号，请手工填写");
  if (!patch.invoiceTotalAmount) warnings.push("未识别到发票含税金额，请手工填写");
  if (current.supplierId && form.invoiceEntityId && String(current.supplierId) !== String(form.invoiceEntityId)) {
    warnings.push("识别的供应商与当前付款供应商不一致，请核对");
  }
  return { patch, warnings };
}

