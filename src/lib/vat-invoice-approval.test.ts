import { describe, expect, it } from "vitest";
import { buildVatApprovalForm, vatOptions, VAT_FIELDS as F, type VatDefinition, type VatDraft } from "./vat-invoice-approval";
const option = (id: string, labels: string[]) => ({ id, option: labels.map((text, index) => ({ text, value: id + "-" + index })) });
const definition: VatDefinition = { status: "ACTIVE", form: JSON.stringify([
  option(F.group, ["VIBE", "CLOUD"]), option(F.company, ["Domestic", "Techno Breakthrough Co., Ltd"]),
  { id: F.details, children: [option(F.type, ["专票", "普票", "红票"]), option(F.months, ["1月", "10月"])] },
  option(F.payment, ["后付", "预付"]),
]) };
const draft: VatDraft = { companyKey: F.company + "-0", invoiceType: "special", customerName: "Customer", taxId: "TAX",
  address: "Address", phone: "123", bankName: "Bank", bankAccount: "Account", months: [F.months + "-1"],
  payments: [F.payment + "-0"], paymentTermDays: "30", amountIncludingTax: "106", amountExcludingTax: "100",
  taxRate: "6", taxAmount: "6", attachmentIds: [] };
describe("VAT approval", () => {
  it("uses dynamic CLOUD keys and gross amounts with a hidden current-user contact", () => {
    const form = buildVatApprovalForm(draft, definition, "ou_test");
    expect(form.find(item => item.id === F.amount)?.value).toBe(106);
    expect(form.find(item => item.id === F.group)?.value).toBe(F.group + "-1");
    expect(form.find(item => item.id === F.liaison)).toEqual({ id: F.liaison, type: "contact", value: [], open_ids: ["ou_test"] });
    expect(vatOptions(definition).companies).toHaveLength(1);
  });
  it("requires bank details only for special invoices and never sends them for ordinary invoices", () => {
    expect(() => buildVatApprovalForm({ ...draft, bankAccount: "" }, definition, "ou_test")).toThrow("银行账号");
    const form = buildVatApprovalForm({ ...draft, invoiceType: "ordinary", bankAccount: "" }, definition, "ou_test");
    expect(JSON.stringify(form)).not.toContain(F.account);
  });
  it("fails closed for missing Cloud, unsupported choices, red invoices and invalid amounts", () => {
    expect(() => buildVatApprovalForm(draft, { ...definition, form: definition.form.replace("CLOUD", "other") }, "ou_test")).toThrow("CLOUD");
    expect(() => buildVatApprovalForm({ ...draft, months: ["bogus"] }, definition, "ou_test")).toThrow("所属月份");
    expect(() => buildVatApprovalForm({ ...draft, invoiceType: "red" as never }, definition, "ou_test")).toThrow("专票和普票");
    expect(() => buildVatApprovalForm({ ...draft, amountIncludingTax: "Infinity" }, definition, "ou_test")).toThrow("含税金额");
    expect(() => buildVatApprovalForm({ ...draft, paymentTermDays: "" }, definition, "ou_test")).toThrow("账期");
  });
});
