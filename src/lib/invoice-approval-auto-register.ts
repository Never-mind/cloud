import { queryRows, type Row } from "./db";
import { listReturnedInvoiceFiles, returnedInvoiceReview, returnedInvoiceContent } from "./invoice-approval-return-service";
import { groupReturnedInvoices } from "./invoice-approval-returns";
import { saveInvoice, type InvoiceDraftInput, type InvoiceSourceType } from "./invoice-service";
import { completeInvoiceReviewAmounts, validateInvoiceReview } from "./invoice-review";
import { defaultInvoicePaymentTermDays, invoiceDueDate } from "./invoice-payment-terms";
import { validateInvoiceAllocationPlan } from "./invoice-allocation";
import { recordOperationLog } from "./operation-log";

const text = (value: unknown) => String(value ?? "").trim();
export async function autoRegisterReturnedInvoice(instanceCode: string) {
  const [approval] = await queryRows<Row>("SELECT status, invoiceId FROM merge_common_feishu_approvals WHERE instanceCode = :instanceCode LIMIT 1", { instanceCode });
  if (!approval) throw new Error("审批台账不存在");
  if (approval.invoiceId) return { status: "registered", invoiceId: text(approval.invoiceId), note: "已登记，保留已有发票信息" };
  if (approval.status !== "approved") return { status: "waiting", note: "回票已取回，审批通过后自动登记" };
  const groups = groupReturnedInvoices(await listReturnedInvoiceFiles(instanceCode));
  if (!groups.length) return { status: "waiting", note: "尚未发现回传发票" };
  if (groups.length !== 1) throw new Error("回传附件包含多张发票或无法归组的文件，请在审批与回票中处理");
  const group = groups[0];
  if (group.registered) return { status: "registered", invoiceId: group.primary.invoiceId, note: "已登记" };
  if (group.conflicting) throw new Error("同一发票的不同格式信息不一致，请处理回票异常");
  const recognition = group.primary.recognition;
  if (!recognition?.facts) throw new Error(group.primary.recognitionError || "发票内容无法识别，请补充票面信息");
  const facts = recognition.facts;
  const amounts = completeInvoiceReviewAmounts({ amountExcludingTax: text(facts.amountExcludingTax), taxRate: text(facts.taxRate), taxAmount: text(facts.taxAmount), amountIncludingTax: text(facts.amountIncludingTax) });
  const details = { ...amounts, invoiceNo: text(facts.invoiceNo), invoiceDate: text(facts.invoiceDate), currency: text(facts.currency).toUpperCase() };
  const problem = validateInvoiceReview(details);
  if (problem) throw new Error(problem);
  const review = await returnedInvoiceReview(group.primary.id);
  const customerId = text(recognition.matches?.receiverCustomerId), undertakingUnitId = text(recognition.matches?.issuerUnitId);
  if (!customerId || !undertakingUnitId) throw new Error("票面客户或开票主体未唯一匹配业务伙伴，请在回票异常中补充");
  if (review.expectedInvoice?.currency && details.currency !== review.expectedInvoice.currency) throw new Error("回票币种与开票申请不同，请处理回票异常");
  if (review.allocationPlan) {
    const allocationError = validateInvoiceAllocationPlan(review.allocationPlan, amounts);
    if (allocationError || review.allocationPlan.currency !== details.currency) throw new Error(allocationError || "回票币种与各期分摊不同");
  } else if (review.approval.allocationSourceIds.length > 1) throw new Error("多账期发票缺少明确分摊，请补充各期金额");
  const paymentTermDays = defaultInvoicePaymentTermDays(review.base.paymentTermDays);
  const file = await returnedInvoiceContent(group.primary.id);
  const snapshot = review.partySnapshot;
  const input: InvoiceDraftInput = {
    source: "external", sourceType: review.approval.sourceType as InvoiceSourceType, sourceId: review.approval.sourceId,
    sourceNo: review.base.sourceNo, period: review.base.period, ...details, customerId, undertakingUnitId,
    paymentTermDays, dueDate: invoiceDueDate(details.invoiceDate, paymentTermDays),
    exchangeRate: text(facts.exchangeRate) || (details.currency === text(review.base.currency).toUpperCase() ? text(review.base.exchangeRate) : ""),
    customerName: text(facts.receiverName), customerTaxNumber: text(facts.receiverTaxNumber), sellerName: text(facts.issuerName),
    ...(snapshot?.customerId === customerId ? { customerAddress: text(snapshot.customer.address) } : {}),
    allocationPlan: review.allocationPlan, allocationSourceIds: review.approval.allocationSourceIds,
    file: { bytes: file.bytes, fileName: file.fileName, fileType: file.fileType },
    recognitionFacts: Object.fromEntries(Object.entries(facts).filter((entry): entry is [string, string] => typeof entry[1] === "string")), remark: "飞书审批回票自动登记",
  };
  let invoice;
  try {
    invoice = await saveInvoice(input, { name: "飞书回票自动登记" }, { instanceCode, fileId: group.primary.id, relatedFileIds: group.files.map(item => item.id), mode: "automatic" });
  } catch (error) {
    // Concurrent manual/automatic sync can finish first; never create or overwrite a second invoice.
    const [latest] = await queryRows<Row>("SELECT invoiceId FROM merge_common_feishu_approvals WHERE instanceCode = :instanceCode LIMIT 1", { instanceCode });
    if (latest?.invoiceId) return { status: "registered", invoiceId: text(latest.invoiceId), note: "已登记" };
    throw error;
  }
  await recordOperationLog({ moduleKey: "invoices", action: "auto_register_return", entityType: "invoice", entityId: text(invoice?.id),
    detail: { instanceCode, fileId: group.primary.id, recognized: facts, registrationMode: "automatic" } });
  return { status: "registered", invoiceId: text(invoice?.id), note: "发票已自动登记并回填对应账期" };
}
