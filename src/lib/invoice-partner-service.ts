import { queryRows, type Row } from "./db";
import { defaultInvoicePaymentTermDays } from "./invoice-payment-terms";

const config = {
  customers: { table: "merge_common_customers", id: "customerId", accounts: "merge_common_customer_bank_accounts", contacts: "merge_common_customer_contacts" },
  undertakingUnits: { table: "merge_common_undertaking_units", id: "undertakingUnitId", accounts: "merge_common_undertaking_unit_bank_accounts", contacts: "merge_common_undertaking_unit_contacts" },
  suppliers: { table: "merge_common_suppliers", id: "supplierId", accounts: "merge_common_supplier_bank_accounts", contacts: "merge_common_supplier_contacts" },
} as const;
const text = (...values: unknown[]) => values.map(value => String(value ?? "").trim()).find(Boolean) || "";
export async function loadInvoicePartner(kind: string, id: string) {
  if (!Object.prototype.hasOwnProperty.call(config, kind) || !id.trim()) throw new Error("请选择有效的业务伙伴类型和档案");
  const target = config[kind as keyof typeof config];
  const [rows, banks, contacts] = await Promise.all([
    queryRows<Row>(`SELECT * FROM ${target.table} WHERE ${target.id} = :id LIMIT 1`, { id }),
    queryRows<Row>(`SELECT * FROM ${target.accounts} WHERE ${target.id} = :id ORDER BY isDefault DESC, accountId`, { id }),
    queryRows<Row>(`SELECT * FROM ${target.contacts} WHERE ${target.id} = :id ORDER BY isPrimary DESC, contactId`, { id }),
  ]);
  const row = rows[0];
  if (!row) throw new Error("所选业务伙伴不存在或类型不匹配，请重新选择");
  const choose = (items: Row[], flag: string) => items.length === 1 ? items[0] : items.filter(item => Number(item[flag]) === 1).length === 1 ? items.find(item => Number(item[flag]) === 1) : undefined;
  const bank = choose(banks, "isDefault"), contact = choose(contacts, "isPrimary");
  return {
    id, kind, name: text(row.nameCn, row.entityName, row.name, row.shortName),
    internationalName: text(row.nameEn, row.entityName, row.name, row.nameCn, row.shortName),
    shortName: text(row.shortName, row.entityName, row.nameCn, row.name),
    taxNumber: text(row.taxNumber), taxRegime: text(row.taxRegime), postCode: text(row.postCode),
    address: text(row.registeredAddress, row.address), country: text(row.country),
    phone: text(contact?.phone, row.contactPhone), contactName: text(contact?.name, row.contactName),
    email: text(row.financeEmail, contact?.email, row.contactEmail),
    paymentTermDays: defaultInvoicePaymentTermDays(row.paymentTermDays),
    bankAccountId: text(bank?.accountId), bankName: text(bank?.bankName), bankAccount: text(bank?.bankAccount),
    bankAccountName: text(bank?.accountName), bankSwiftCode: text(bank?.swiftCode), bankCode: text(bank?.bankRoutingNumber), bankAddress: text(bank?.bankAddress),
    warnings: banks.length > 1 && !bank ? ["该伙伴有多个银行账户且未设置唯一默认账户，请核对并填写本次开票账户"] : [],
  };
}
