import type { InvoiceAttachmentSelection } from "./invoice-approval-attachments";
export const VAT_APPROVAL_CODE = "9BF45F81-882F-4C8C-9E7B-E19CC959F294";
export const VAT_FIELDS = {
  liaison: "widget16510690411150001", group: "widget17899624236400001",
  company: "widget16608896634540001", details: "widget17899621348720001",
  customer: "widget16929605880150001", type: "widget17524796304450001",
  taxId: "widget17028916748680001", address: "widget16929605819700001",
  phone: "widget17007203547350001", bank: "widget17007203787970001",
  account: "widget17095450380230001", months: "widget17007201933420001",
  amount: "widget16608918984450001", payment: "widget17007201313460001",
  days: "widget16934539110050001", attachments: "widget16611355279960001",
} as const;

export type VatOption = { value: string; label: string };
export type VatDefinition = {
  status?: string; form: string;
  node_list?: Array<{ node_id: string; name: string; need_approver: boolean }>;
};
export type VatDraft = InvoiceAttachmentSelection & {
  companyKey: string; invoiceType: "special" | "ordinary"; customerName: string;
  taxId: string; address: string; phone: string; bankName: string; bankAccount: string;
  months: string[]; payments: string[]; paymentTermDays: string; amountIncludingTax: string;
  amountExcludingTax: string; taxRate: string; taxAmount: string; attachmentIds: string[];
};
export function vatOptions(definition: VatDefinition) {
  const flat: Array<Record<string, unknown>> = [];
  const visit = (items: Array<Record<string, unknown>>) => {
    for (const item of items) { flat.push(item); if (Array.isArray(item.children)) visit(item.children); }
  };
  visit(JSON.parse(definition.form));
  const options = (id: string): VatOption[] => {
    const option = flat.find(item => item.id === id)?.option;
    return Array.isArray(option) ? option.map(item => ({ value: String(item.value), label: String(item.text) })) : [];
  };
  return {
    group: options(VAT_FIELDS.group).find(item => item.label.trim().toUpperCase() === "CLOUD"),
    companies: options(VAT_FIELDS.company).filter(item => item.label !== "Techno Breakthrough Co., Ltd"),
    types: options(VAT_FIELDS.type), months: options(VAT_FIELDS.months), payments: options(VAT_FIELDS.payment),
  };
}

export function buildVatApprovalForm(draft: VatDraft, definition: VatDefinition, liaisonOpenId: string, fileTokens: string[] = []) {
  const options = vatOptions(definition);
  if (definition.status !== "ACTIVE") throw new Error("增值税开票审批已停用");
  if (!options.group) throw new Error("飞书增值税审批尚未配置 CLOUD 项目组");
  if (!options.companies.some(item => item.value === draft.companyKey)) throw new Error("请选择有效的国内开票主体");
  if (!["special", "ordinary"].includes(draft.invoiceType)) throw new Error("当前仅支持专票和普票");
  const type = options.types.find(item => item.label === (draft.invoiceType === "special" ? "专票" : "普票"));
  if (!type) throw new Error("飞书票据类型配置不完整");
  if (!/^ou_[a-zA-Z0-9]+$/.test(liaisonOpenId)) throw new Error("发起账号未绑定飞书");
  const required = (value: string, label: string) => { if (!String(value ?? "").trim()) throw new Error("请填写" + label); return value.trim(); };
  const selected = (values: string[], list: VatOption[], label: string) => {
    if (!Array.isArray(values) || !values.length || values.some(value => !list.some(item => item.value === value))) throw new Error("请选择有效的" + label);
    return [...new Set(values)];
  };
  const amount = Number(draft.amountIncludingTax), days = Number(draft.paymentTermDays);
  if (!draft.amountIncludingTax || !Number.isFinite(amount) || amount <= 0) throw new Error("开票含税金额必须大于 0");
  if (draft.paymentTermDays === "" || !Number.isInteger(days) || days < 0 || days > 3650) throw new Error("账期天数应为 0 到 3650 的整数");
  const detail: Array<{ id: string; type: string; value: unknown }> = [
    { id: VAT_FIELDS.customer, type: "input", value: required(draft.customerName, "客户公司名称") },
    { id: VAT_FIELDS.type, type: "radioV2", value: type.value },
    { id: VAT_FIELDS.taxId, type: "input", value: required(draft.taxId, "税号") },
    { id: VAT_FIELDS.months, type: "checkboxV2", value: selected(draft.months, options.months, "所属月份") },
  ];
  if (draft.invoiceType === "special") {
    for (const [id, value, label] of [
      [VAT_FIELDS.address, draft.address, "开票地址"], [VAT_FIELDS.phone, draft.phone, "电话"],
      [VAT_FIELDS.bank, draft.bankName, "开户行"], [VAT_FIELDS.account, draft.bankAccount, "银行账号"],
    ]) detail.push({ id, type: "input", value: required(value, label) });
  }
  return [
    // Contact value contains user_id; app-scoped open_id must use open_ids.
    { id: VAT_FIELDS.liaison, type: "contact", value: [], open_ids: [liaisonOpenId] },
    { id: VAT_FIELDS.group, type: "radioV2", value: options.group.value },
    { id: VAT_FIELDS.company, type: "radioV2", value: draft.companyKey },
    { id: VAT_FIELDS.details, type: "fieldList", value: [detail] },
    { id: VAT_FIELDS.amount, type: "number", value: amount },
    { id: VAT_FIELDS.payment, type: "checkboxV2", value: selected(draft.payments, options.payments, "付款类型") },
    { id: VAT_FIELDS.days, type: "number", value: days },
    ...(fileTokens.length ? [{ id: VAT_FIELDS.attachments, type: "attachmentV2", value: fileTokens }] : []),
  ];
}
