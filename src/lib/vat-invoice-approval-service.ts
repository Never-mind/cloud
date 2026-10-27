import { queryRows, type Row } from "./db";
import { buildInvoicePrefill, type InvoiceSourceType } from "./invoice-service";
import { callFeishu, findActiveInvoiceApproval, submitInvoiceApproval, uploadApprovalAttachment } from "./feishu-approval-service";
import { listInvoiceApprovalAttachments, prepareInvoiceApprovalAttachments } from "./invoice-approval-attachment-service";
import { defaultInvoicePaymentTermDays } from "./invoice-payment-terms";
import { VAT_APPROVAL_CODE, buildVatApprovalForm, vatOptions, type VatDefinition, type VatDraft } from "./vat-invoice-approval";

export const getVatApprovalCode = () => process.env.FEISHU_VAT_INVOICE_APPROVAL_CODE?.trim() || VAT_APPROVAL_CODE;
export async function loadVatDefinition() {
  return callFeishu<VatDefinition>("/open-apis/approval/v4/approvals/" + encodeURIComponent(getVatApprovalCode()), {}, "读取增值税开票审批定义");
}
export function vatNodeApprovers(definition: VatDefinition, starterOpenId: string) {
  const handlerOpenId = starterOpenId.trim();
  if (!/^ou_[a-zA-Z0-9]+$/.test(handlerOpenId)) throw new Error("当前账号未绑定有效的飞书账号，请先绑定飞书后发起审批");
  const nodes = (definition.node_list ?? []).filter(node => node.need_approver);
  if (nodes.some(node => node.name !== "办理-票据发送")) throw new Error("增值税审批存在未配置的自选节点，请管理员检查飞书流程");
  return nodes.map(node => ({ key: node.node_id, value: [handlerOpenId] }));
}

export async function buildVatApprovalPrefill(params: { sourceType: InvoiceSourceType; sourceId?: string | null; sourceIds?: string[] | null; starterOpenId: string }) {
  const base = await buildInvoicePrefill(params);
  const definition = await loadVatDefinition();
  const options = vatOptions(definition);
  const [unit] = await queryRows<Row>("SELECT * FROM merge_common_undertaking_units WHERE undertakingUnitId = :id LIMIT 1", { id: base.undertakingUnitId });
  const [customer] = await queryRows<Row>("SELECT * FROM merge_common_customers WHERE customerId = :id LIMIT 1", { id: base.customerId });
  const banks = await queryRows<Row>("SELECT bankName, bankAccount, isDefault FROM merge_common_customer_bank_accounts WHERE customerId = :id ORDER BY isDefault DESC, accountId", { id: base.customerId });
  const contacts = await queryRows<Row>("SELECT phone, isPrimary FROM merge_common_customer_contacts WHERE customerId = :id ORDER BY isPrimary DESC, contactId", { id: base.customerId });
  const attachmentOptions = await listInvoiceApprovalAttachments({ ...params, customerId: String(base.customerId ?? "") });
  const attachments = attachmentOptions.filter(file => file.source === "customer");
  const normalize = (value: unknown) => String(value ?? "").normalize("NFKC").replace(/\s/g, "").toUpperCase();
  const names = [unit?.name, unit?.nameCn, unit?.entityName].map(normalize).filter(Boolean);
  const company = options.companies.find(option => names.includes(normalize(option.label)));
  const bank = banks.length === 1 ? banks[0] : banks.filter(item => Number(item.isDefault) === 1).length === 1 ? banks.find(item => Number(item.isDefault) === 1) : undefined;
  const contact = contacts.length === 1 ? contacts[0] : contacts.filter(item => Number(item.isPrimary) === 1).length === 1 ? contacts.find(item => Number(item.isPrimary) === 1) : undefined;
  const months = [...new Set((base.lines ?? []).map(line => String(line.date).match(/(?:\d{4})[-/]?(\d{2})/)?.[1]).filter(Boolean))];
  const periodMonth = String(base.period ?? "").replace(/\D/g, "").slice(4, 6);
  if (!months.length && periodMonth) months.push(periodMonth);
  const blockers: string[] = [];
  if (definition.status !== "ACTIVE") blockers.push("增值税审批流程已停用");
  if (!options.group) blockers.push("飞书增值税审批尚未配置 CLOUD 项目组");
  try { vatNodeApprovers(definition, params.starterOpenId); } catch (error) { blockers.push((error as Error).message); }
  const sourceCurrency = String(base.currency).trim().toUpperCase();
  const sameCurrency = sourceCurrency === "CNY";
  const draft: VatDraft = {
    companyKey: company?.value ?? "", invoiceType: "special",
    customerName: String(customer?.nameCn || customer?.name || ""), taxId: String(customer?.taxNumber ?? ""),
    address: String(customer?.address ?? ""), phone: String(customer?.contactPhone || contact?.phone || ""),
    bankName: String(bank?.bankName ?? ""), bankAccount: String(bank?.bankAccount ?? ""),
    months: options.months.filter(item => months.some(month => item.label === Number(month) + "月")).map(item => item.value),
    payments: options.payments.filter(item => item.label === "后付").map(item => item.value),
    paymentTermDays: String(defaultInvoicePaymentTermDays(unit?.paymentTermDays)),
    // Foreign-currency amounts are references, never implicit 1:1 CNY conversions.
    amountIncludingTax: sameCurrency ? String(base.amountIncludingTax ?? "") : "",
    amountExcludingTax: sameCurrency ? String(base.amountExcludingTax ?? "") : "",
    taxRate: String(base.taxRate ?? ""), taxAmount: sameCurrency ? String(base.taxAmount ?? "") : "", attachmentIds: [],
  };
  return { approvalCode: getVatApprovalCode(), sourceNo: base.sourceNo, period: base.period,
    sourceCurrency, sourceAmountIncludingTax: String(base.amountIncludingTax ?? ""), currency: "CNY" as const,
    draft, options, attachments, attachmentOptions, customerId: String(base.customerId ?? ""),
    existingApproval: await findActiveInvoiceApproval(params.sourceType, String(base.sourceId ?? params.sourceId ?? "")), blockers };
}

export async function submitVatInvoiceApproval(input: {
  sourceType: InvoiceSourceType; sourceId: string; sourceIds?: string[];
  starterOpenId: string; starterUserId?: string; starterName?: string; draft: VatDraft;
}) {
  const prefill = await buildVatApprovalPrefill(input);
  if (prefill.blockers.length) throw new Error(prefill.blockers.join("；"));
  if (prefill.existingApproval) throw new Error("该单据已有生效审批，请查看审批进度及回票，不要重复发起");
  const definition = await loadVatDefinition();
  // Validate before any attachment upload; all option keys are checked against the current definition.
  buildVatApprovalForm(input.draft, definition, input.starterOpenId);
  const nodeApprovers = vatNodeApprovers(definition, input.starterOpenId);
  if (input.draft.attachmentIds !== undefined && !Array.isArray(input.draft.attachmentIds)) throw new Error("附件材料格式不正确");
  const files = await prepareInvoiceApprovalAttachments({ ...input, customerId: prefill.customerId }, {
    attachmentRefs: [...(input.draft.attachmentRefs ?? []), ...(input.draft.attachmentIds ?? []).map(attachmentId => ({ source: "customer" as const, attachmentId }))],
    attachments: input.draft.attachments,
  });
  const tokens: string[] = [];
  for (const file of files) tokens.push(await uploadApprovalAttachment(file));
  return submitInvoiceApproval({
    ownerType: input.sourceType as "cloud_row" | "billing_statement" | "service_fee" | "settlement_invoice",
    ownerId: input.sourceId, allocationSourceIds: input.sourceIds, ownerNo: prefill.sourceNo,
    period: prefill.period, starterOpenId: input.starterOpenId, starterUserId: input.starterUserId, starterName: input.starterName,
    title: String(prefill.period ?? "") + " · " + input.draft.customerName + " · 增值税开票",
    approvalCode: getVatApprovalCode(), nodeApprovers,
    form: buildVatApprovalForm(input.draft, definition, input.starterOpenId, tokens),
  });
}
