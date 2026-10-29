/** 对账确认锁定业务金额；开票、实收拥有独立的维护字段。客户端和接口共用。 */
export const CLOUD_COLLECTION_EDIT_FIELDS = [
  "collected", "collectionPayer", "collectionPayee", "collectionPayerCustomerId", "collectionPayeeUndertakingUnitId",
  "collectionCurrency", "collectionExchangeRate", "collectionNetAmount", "collectionTaxRate",
  "collectionTaxAmount", "collectionTotalAmount", "collectionDate",
] as const;

export const CLOUD_INVOICE_EDIT_FIELDS = [
  "collectionInvoice", "invoiceNo", "invoiceCurrency", "invoicePayer", "invoicePayee",
  "invoicePayerCustomerId", "invoicePayeeUndertakingUnitId", "invoiceNetAmount", "invoiceTaxRate",
  "invoiceTaxAmount", "invoiceTotalAmount", "invoiceExchangeRate", "invoiceDate", "receivableDate",
] as const;

const financialFields = new Set<string>([...CLOUD_COLLECTION_EDIT_FIELDS, ...CLOUD_INVOICE_EDIT_FIELDS]);

export function isCloudFinancialField(field: string) {
  return financialFields.has(field);
}

export function isCloudRowConfirmed(value: unknown) {
  return Number(value) === 1;
}

export function assertCloudRowEditable(confirmed: unknown, patch: Record<string, unknown>) {
  if (isCloudRowConfirmed(confirmed) && Object.keys(patch).some((field) => !isCloudFinancialField(field))) {
    throw new Error("对账单已确认，账单金额及明细已锁定；仍可编辑开票、实收及相关状态");
  }
}

export function pickCloudFinancialFields(input: Record<string, unknown>, group: "collection" | "invoice") {
  const fields = group === "collection" ? CLOUD_COLLECTION_EDIT_FIELDS : CLOUD_INVOICE_EDIT_FIELDS;
  return Object.fromEntries(fields.filter((key) => Object.prototype.hasOwnProperty.call(input, key)).map((key) => [key, input[key]]));
}
