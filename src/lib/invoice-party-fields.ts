export const INVOICE_CUSTOMER_FIELDS = [["customerName", "客户开票名称"], ["customerTaxNumber", "客户税号"], ["customerAddress", "客户开票地址"], ["customerContact", "客户联系人"], ["customerContactPhone", "客户电话"], ["customerContactEmail", "客户邮箱"]] as const;
export const INVOICE_SELLER_FIELDS = [["sellerName", "开票单位名称"], ["sellerCountry", "开票单位国家"], ["sellerAddress", "开票单位地址"], ["sellerTelephone", "开票单位电话"], ["sellerContactName", "开票单位联系人"], ["sellerFinanceEmail", "财务邮箱"], ["bankAccountName", "银行账户名称"], ["bankName", "开户银行"], ["bankAccount", "银行账号"], ["bankSwiftCode", "SWIFT"], ["bankCode", "银行代码"], ["bankAddress", "银行地址"]] as const;
export type InvoicePartyFields = Partial<Record<(typeof INVOICE_CUSTOMER_FIELDS | typeof INVOICE_SELLER_FIELDS)[number][0], string>>;
export function invoicePartyFields(row: Record<string, unknown>): InvoicePartyFields {
  return Object.fromEntries([...INVOICE_CUSTOMER_FIELDS, ...INVOICE_SELLER_FIELDS].map(([key]) => [key, row[key] === undefined || row[key] === null ? undefined : String(row[key])]));
}
export function partnerToInvoiceFields(kind: "customers" | "undertakingUnits", row: Record<string, unknown>): InvoicePartyFields {
  const text = (key: string) => String(row[key] ?? "");
  return kind === "customers" ? { customerName: text("internationalName"), customerTaxNumber: text("taxNumber"), customerAddress: text("address"), customerContact: text("contactName"), customerContactPhone: text("phone"), customerContactEmail: text("email") } : { sellerName: text("internationalName"), sellerCountry: text("country"), sellerAddress: text("address"), sellerTelephone: text("phone"), sellerContactName: text("contactName"), sellerFinanceEmail: text("email"), bankAccountName: text("bankAccountName"), bankName: text("bankName"), bankAccount: text("bankAccount"), bankSwiftCode: text("bankSwiftCode"), bankCode: text("bankCode"), bankAddress: text("bankAddress") };
}
