import type { InvoiceRecognition } from "./invoice-recognition-service";
import { invoicePartyFields } from "./invoice-party-fields";
import { completeInvoiceReviewAmounts } from "./invoice-review";
import { defaultInvoicePaymentTermDays, invoiceDueDate, resolveInvoicePaymentDates } from "./invoice-payment-terms";

/** 两个账单模块使用同一套识别回填；票面日期优先于档案默认账期。 */
export function recognizedInvoiceFields(result: InvoiceRecognition, current: { currency: string; exchangeRate: string }) {
  const facts = result.facts, form = result.form;
  const invoiceDate = facts?.invoiceDate ?? form.invoiceDate;
  const defaultDays = defaultInvoicePaymentTermDays(result.partyMatches?.issuerUnit.paymentTermDays);
  const dates = facts?.dueDate || facts?.paymentTermDays
    ? resolveInvoicePaymentDates({ invoiceDate, dueDate: facts.dueDate, paymentTermDays: facts.paymentTermDays }, defaultDays)
    : { paymentTermDays: defaultDays, dueDate: invoiceDueDate(invoiceDate, defaultDays) };
  const amounts = completeInvoiceReviewAmounts({
    amountExcludingTax: facts?.amountExcludingTax ?? form.amountExcludingTax,
    taxRate: facts?.taxRate ?? form.taxRate, taxAmount: facts?.taxAmount ?? form.taxAmount,
    amountIncludingTax: facts?.amountIncludingTax ?? form.invoiceTotal,
  });
  return {
    ...invoicePartyFields({}), ...amounts,
    customerName: facts?.receiverName || undefined, customerTaxNumber: facts?.receiverTaxNumber || undefined,
    sellerName: facts?.issuerName || undefined, ...result.partyFields,
    invoiceNo: facts?.invoiceNo ?? form.invoiceNo, invoiceDate,
    paymentTermDays: String(dates.paymentTermDays), dueDate: dates.dueDate,
    currency: facts?.currency || form.currency || current.currency,
    exchangeRate: form.exchangeRate || ((facts?.currency || form.currency) === current.currency ? current.exchangeRate : ""),
    customerId: result.matches?.receiverCustomerId || "", undertakingUnitId: result.matches?.issuerUnitId || "",
    ...(facts?.comment !== undefined ? { comment: facts.comment } : {}),
    ...(result.lines ? { lines: result.lines.map(line => ({ periodLabel: line.periodLabel, description: line.description, amount: line.amount })) } : {}),
  };
}
