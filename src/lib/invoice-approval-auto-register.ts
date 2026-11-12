import { queryRows, type Row } from "./db";
import { listReturnedInvoiceFiles, returnedInvoiceReview, returnedInvoiceContent } from "./invoice-approval-return-service";
import { groupReturnedInvoices } from "./invoice-approval-returns";
import { saveInvoice, type InvoiceDraftInput, type InvoiceSourceType } from "./invoice-service";
import { completeInvoiceReviewAmounts, validateInvoiceReview } from "./invoice-review";
import { defaultInvoicePaymentTermDays, invoiceDueDate } from "./invoice-payment-terms";
import { validateInvoiceAllocationPlan } from "./invoice-allocation";
import { matchReturnedInvoiceAllocations } from "./invoice-approval-return-allocation";
import { recordOperationLog } from "./operation-log";

const text = (value: unknown) => String(value ?? "").trim();
export async function autoRegisterReturnedInvoice(instanceCode: string) {
  const [approval] = await queryRows<Row>("SELECT status, invoiceId FROM merge_common_feishu_approvals WHERE instanceCode = :instanceCode LIMIT 1", { instanceCode });
  if (!approval) throw new Error("审批台账不存在");
  if (approval.status !== "approved") return { status: "waiting", note: "回票已取回，审批通过后自动登记" };
  const groups = groupReturnedInvoices(await listReturnedInvoiceFiles(instanceCode));
  const pending = groups.filter(group => !group.registered);
  if (!pending.length && (groups.length || approval.invoiceId)) return { status: "registered", invoiceId: text(approval.invoiceId || groups[0]?.files.find(file => file.invoiceId)?.invoiceId), note: "已登记，保留已有发票信息" };
  if (!groups.length) return { status: "waiting", note: "尚未发现回传发票" };
  const multiple = groups.length > 1;
  if (approval.invoiceId && !multiple) throw new Error("该审批已有正式发票，新增回票请在回票异常中核对");
  const firstReview = await returnedInvoiceReview(pending[0].primary.id);
  const matchedPlans = multiple ? matchReturnedInvoiceAllocations(groups, firstReview.allocationPlan) : null;
  const prepared: Array<{ group: typeof groups[number]; input: InvoiceDraftInput }> = [];
  // Validate every pending invoice and read its original before the first financial write.
  for (const group of pending) {
    if (group.conflicting) throw new Error("同一发票的不同格式信息不一致，请处理回票异常");
    const recognition = group.primary.recognition;
    if (!recognition?.facts) throw new Error(group.primary.recognitionError || "发票内容无法识别，请补充票面信息");
    const facts = recognition.facts;
    const amounts = completeInvoiceReviewAmounts({ amountExcludingTax: text(facts.amountExcludingTax), taxRate: text(facts.taxRate), taxAmount: text(facts.taxAmount), amountIncludingTax: text(facts.amountIncludingTax) });
    const details = { ...amounts, invoiceNo: text(facts.invoiceNo), invoiceDate: text(facts.invoiceDate), currency: text(facts.currency).toUpperCase() };
    const problem = validateInvoiceReview(details);
    if (problem) throw new Error(problem);
    const review = group === pending[0] ? firstReview : await returnedInvoiceReview(group.primary.id);
    const customerId = text(recognition.matches?.receiverCustomerId), undertakingUnitId = text(recognition.matches?.issuerUnitId);
    if (!customerId || !undertakingUnitId) throw new Error("票面客户或开票主体未唯一匹配业务伙伴，请在回票异常中补充");
    if (review.expectedInvoice?.currency && details.currency !== review.expectedInvoice.currency) throw new Error("回票币种与开票申请不同，请处理回票异常");
    const allocationPlan = matchedPlans ? matchedPlans.get(group.key)! : review.allocationPlan;
    if (allocationPlan) {
      const allocationError = validateInvoiceAllocationPlan(allocationPlan, amounts);
      if (allocationError || allocationPlan.currency !== details.currency) throw new Error(allocationError || "回票币种与各期分摊不同");
    } else if (review.approval.allocationSourceIds.length > 1) throw new Error("多账期发票缺少明确分摊，请补充各期金额");
    const paymentTermDays = defaultInvoicePaymentTermDays(review.base.paymentTermDays);
    const file = await returnedInvoiceContent(group.primary.id);
    const snapshot = review.partySnapshot;
    const assigned = multiple ? allocationPlan!.allocations[0] : null;
    // CFDI MXN TipoCambio=1 is relative to MXN, not the application's USD accounting rate.
    const approvedUsdRates = allocationPlan?.allocations.map(row => text(row.sourceCurrency === "USD" ? row.exchangeRate : row.invoiceUsdRate));
    const usdRate = approvedUsdRates?.length && approvedUsdRates.every(rate => rate && rate === approvedUsdRates[0]) ? approvedUsdRates[0] : "";
    const input: InvoiceDraftInput = {
      businessExchangeRate: review.businessRequest?.businessExchangeRate,
      source: "external", sourceType: review.approval.sourceType as InvoiceSourceType, sourceId: assigned?.sourceId || review.approval.sourceId,
      sourceNo: assigned?.sourceNo || review.base.sourceNo, period: assigned?.period || review.base.period, ...details, customerId, undertakingUnitId,
      paymentTermDays, dueDate: invoiceDueDate(details.invoiceDate, paymentTermDays),
      exchangeRate: usdRate || text(facts.exchangeRate) || (details.currency === text(review.base.currency).toUpperCase() ? text(review.base.exchangeRate) : ""),
      customerName: text(facts.receiverName), customerTaxNumber: text(facts.receiverTaxNumber), sellerName: text(facts.issuerName),
      ...(snapshot?.customerId === customerId ? { customerAddress: text(snapshot.customer.address) } : {}),
      allocationPlan, allocationSourceIds: assigned ? [assigned.sourceId] : review.approval.allocationSourceIds,
      file: { bytes: file.bytes, fileName: file.fileName, fileType: file.fileType },
      recognitionFacts: Object.fromEntries(Object.entries(facts).filter((entry): entry is [string, string] => typeof entry[1] === "string")), remark: "飞书审批回票自动登记",
    };
    prepared.push({ group, input });
  }
  let invoiceId = text(approval.invoiceId);
  for (const { group, input } of prepared) {
    try {
      const invoice = await saveInvoice(input, { name: "飞书回票自动登记" }, { instanceCode, fileId: group.primary.id, relatedFileIds: group.files.map(item => item.id), mode: "automatic", ...(multiple ? { allocationMode: "matched_return" as const } : {}) });
      invoiceId = text(invoice?.id);
    } catch (error) {
      // Another invoice on this approval does not prove this file group was registered.
      const [latest] = await queryRows<Row>("SELECT invoiceId FROM merge_common_invoice_approval_files WHERE id = :id AND instanceCode = :instanceCode LIMIT 1", { id: group.primary.id, instanceCode });
      if (!latest?.invoiceId) throw error;
      invoiceId = text(latest.invoiceId);
      continue;
    }
    await recordOperationLog({ moduleKey: "invoices", action: "auto_register_return", entityType: "invoice", entityId: invoiceId,
      detail: { instanceCode, fileId: group.primary.id, recognized: input.recognitionFacts, registrationMode: "automatic", sourceId: input.sourceId } });
  }
  return { status: "registered", invoiceId, note: multiple ? `${groups.length} 张发票已自动登记并回填对应账期` : "发票已自动登记并回填对应账期" };
}
