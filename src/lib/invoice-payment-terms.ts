const DAY_MS = 86400000;

function dateTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

function termDays(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const days = Number(value);
  return Number.isSafeInteger(days) && days >= 0 ? days : null;
}

export function defaultInvoicePaymentTermDays(value: unknown) {
  return termDays(value) ?? 30;
}

export function invoiceDueDate(invoiceDate: string, paymentTermDays: unknown) {
  const timestamp = dateTimestamp(invoiceDate);
  const days = termDays(paymentTermDays);
  if (timestamp === null || days === null) return "";
  const due = new Date(timestamp + days * DAY_MS);
  if (!Number.isFinite(due.getTime()) || due.getUTCFullYear() > 9999) return "";
  return due.toISOString().slice(0, 10);
}

function daysBetween(invoiceDate: string, dueDate: string) {
  const start = dateTimestamp(invoiceDate);
  const end = dateTimestamp(dueDate);
  return start === null || end === null ? null : (end - start) / DAY_MS;
}

export type InvoicePaymentDates = { invoiceDate: string; paymentTermDays: string; dueDate: string };

export function updateInvoicePaymentDates<T extends InvoicePaymentDates>(input: T, field: keyof InvoicePaymentDates, value: string): T {
  const next = { ...input, [field]: value };
  if (field === "dueDate") {
    const days = daysBetween(next.invoiceDate, value);
    next.paymentTermDays = days !== null && days >= 0 ? String(days) : "";
  } else {
    next.dueDate = invoiceDueDate(next.invoiceDate, next.paymentTermDays);
  }
  return next;
}

export function validateInvoicePaymentDates(input: InvoicePaymentDates) {
  if (dateTimestamp(input.invoiceDate) === null) return "请填写有效开票日期";
  if (termDays(input.paymentTermDays) === null) return "账期天数必须是大于或等于 0 的整数";
  if (dateTimestamp(input.dueDate) === null) return "请填写有效到期日";
  if (input.dueDate < input.invoiceDate) return "到期日不能早于开票日期";
  if (invoiceDueDate(input.invoiceDate, input.paymentTermDays) !== input.dueDate) return "到期日与账期天数不一致，请核对开票日期、账期天数和到期日";
  return "";
}

/** Older callers may provide an explicit due date without a term; keep the date and derive its days. */
export function resolveInvoicePaymentDates(input: { invoiceDate: string; dueDate?: string | null; paymentTermDays?: string | number | null }, defaultDays: unknown) {
  const days = String(input.paymentTermDays ?? "").trim();
  const dueDate = String(input.dueDate ?? "").trim();
  const paymentTermDays = days || (dueDate ? String(daysBetween(input.invoiceDate, dueDate) ?? "") : String(defaultInvoicePaymentTermDays(defaultDays)));
  const result = { invoiceDate: input.invoiceDate, paymentTermDays, dueDate: dueDate || invoiceDueDate(input.invoiceDate, paymentTermDays) };
  const error = validateInvoicePaymentDates(result);
  if (error) throw new Error(error);
  return { paymentTermDays: Number(paymentTermDays), dueDate: result.dueDate };
}
