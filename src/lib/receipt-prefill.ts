type ReceiptAmounts = {
  currency?: unknown;
  net?: unknown;
  rate?: unknown;
  total?: unknown;
  tax?: unknown;
};

function input(value: unknown) {
  return String(value ?? "").trim();
}

export function receiptInvoiceCurrencyMismatch(receiptCurrency: unknown, invoiceCurrency: unknown) {
  const receipt = input(receiptCurrency).toUpperCase();
  const invoice = input(invoiceCurrency).toUpperCase();
  return Boolean(receipt && invoice && receipt !== invoice);
}

/**
 * Only used when opening the editor: never overwrite an existing receipt,
 * including zero.  The source is either an issued invoice or the confirmed
 * customer receivable when no invoice exists yet.
 */
export function prefillReceiptFromSource(receipt: ReceiptAmounts, source: ReceiptAmounts) {
  const mismatch = receiptInvoiceCurrencyMismatch(receipt.currency, source.currency);
  const fill = (key: keyof ReceiptAmounts) => input(receipt[key]) || (mismatch ? "" : input(source[key]));
  const result = {
    currency: input(receipt.currency) || input(source.currency),
    net: fill("net"), rate: fill("rate"), total: fill("total"), tax: fill("tax"),
  };
  // 来源没有税金时，按本次确认的含税、未税差额带出，保留来源票面舍入后的金额。
  if (!result.tax && result.net && result.total && Number.isFinite(Number(result.net)) && Number.isFinite(Number(result.total))) {
    result.tax = String(Number((Number(result.total) - Number(result.net)).toFixed(4)));
  }
  return result;
}

/** Backward-compatible helper for callers that already have invoice data. */
export function prefillReceiptFromInvoice(receipt: ReceiptAmounts, invoice: ReceiptAmounts) {
  return prefillReceiptFromSource(receipt, invoice);
}
