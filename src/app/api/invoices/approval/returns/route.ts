import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { hasPermission } from "@/lib/permission-definitions";
import { getPermissionStateForEmail } from "@/lib/permission-service";
import { getOperationActor } from "@/lib/operation-actor";
import { recordOperationLog } from "@/lib/operation-log";
import { listInvoiceApprovalProgress, returnedInvoiceContent, returnedInvoiceReview } from "@/lib/invoice-approval-return-service";
import { saveInvoice, type InvoiceDraftInput, type InvoiceSourceType } from "@/lib/invoice-service";
import { syncInvoiceApproval } from "@/lib/feishu-approval-service";

class AccessError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function access(request: NextRequest, action: "view" | "create") {
  const email = getAuthenticatedUserEmail(request);
  if (!email) throw new AccessError("未登录", 401);
  if (!hasPermission(await getPermissionStateForEmail(email), "invoices", action)) throw new AccessError("没有发票管理的操作权限", 403);
}
export async function GET(request: NextRequest) {
  try {
    await access(request, "view");
    const params = request.nextUrl.searchParams, id = params.get("fileId");
    if (id && params.get("download") === "1") {
      const file = await returnedInvoiceContent(id);
      return new NextResponse(new Uint8Array(file.bytes), { headers: {
        "Content-Type": file.fileType, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
        "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(file.fileName),
      } });
    }
    if (id) return NextResponse.json(await returnedInvoiceReview(id));
    return NextResponse.json(await listInvoiceApprovalProgress(params.get("sourceType") ?? undefined, params.get("sourceId") ?? undefined, Number(params.get("offset") || 0)));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "回票读取失败" }, { status: error instanceof AccessError ? error.status : 400 }); }
}
export async function POST(request: NextRequest) {
  try {
    await access(request, "create");
    const body = await request.json() as { fileId?: string; draft?: InvoiceDraftInput };
    if (!body.fileId || !body.draft) throw new Error("缺少待确认发票");
    let review = await returnedInvoiceReview(body.fileId);
    // An exception correction must preserve the user's edits while refreshing remote status.
    await syncInvoiceApproval(review.approval.instanceCode, { autoRegister: false });
    review = await returnedInvoiceReview(body.fileId);
    if (review.approval.status !== "approved") throw new Error("审批尚未通过，识别结果已保留，审批通过后再确认登记");
    if (!review.group) throw new Error("待确认回票不存在");
    if (review.group.registered) throw new Error("该张发票已登记，请刷新");
    if (review.approval.invoiceId) throw new Error("该审批已登记发票；补传或换票请先核对原记录，不能覆盖");
    const file = await returnedInvoiceContent(body.fileId);
    const actor = await getOperationActor(request), raw = body.draft;
    const snapshot = review.partySnapshot;
    const facts = review.group.primary.recognition?.facts;
    const matches = review.group.primary.recognition?.matches;
    if (review.expectedInvoice?.currency && String(raw.currency ?? "").trim().toUpperCase() !== review.expectedInvoice.currency) throw new Error("国内增值税发票的开票币种应为人民币（CNY），来源对账单可使用其他币种");
    const input: InvoiceDraftInput = {
      source: "external", sourceType: review.approval.sourceType as InvoiceSourceType, sourceId: review.approval.sourceId,
      sourceNo: review.base.sourceNo, period: review.base.period,
      invoiceNo: raw.invoiceNo, invoiceDate: raw.invoiceDate, dueDate: raw.dueDate, paymentTermDays: raw.paymentTermDays,
      customerId: raw.customerId, undertakingUnitId: raw.undertakingUnitId, currency: raw.currency, exchangeRate: raw.exchangeRate,
      ...(snapshot && raw.customerId === snapshot.customerId ? {
        customerName: String(snapshot.customer.name ?? ""), customerTaxNumber: String(snapshot.customer.taxId ?? ""),
        customerAddress: String(snapshot.customer.address ?? ""),
      } : {}),
      ...(snapshot && raw.undertakingUnitId === snapshot.undertakingUnitId ? { sellerName: snapshot.sellerName } : {}),
      ...(raw.customerId && raw.customerId === matches?.receiverCustomerId ? {
        ...(facts?.receiverName ? { customerName: facts.receiverName } : {}),
        ...(facts?.receiverTaxNumber ? { customerTaxNumber: facts.receiverTaxNumber } : {}),
      } : {}),
      ...(raw.undertakingUnitId && raw.undertakingUnitId === matches?.issuerUnitId && facts?.issuerName ? { sellerName: facts.issuerName } : {}),
      amountExcludingTax: raw.amountExcludingTax, taxRate: raw.taxRate, taxAmount: raw.taxAmount, amountIncludingTax: raw.amountIncludingTax,
      comment: raw.comment, allocationSourceIds: review.approval.allocationSourceIds.length > 1 ? review.approval.allocationSourceIds : [],
      allocationPlan:raw.allocationPlan??review.allocationPlan,
      file: { fileName: file.fileName, fileType: file.fileType, bytes: file.bytes },
    };
    const invoice = await saveInvoice(input, { userId: actor?.userId, name: actor?.displayName }, {
      instanceCode: review.approval.instanceCode, fileId: body.fileId, relatedFileIds: review.group.files.map(item => item.id),
    });
    let warning = "";
    try {
      await recordOperationLog({ actor, moduleKey: "invoices", action: "confirm_recognition", entityType: "invoice", entityId: String(invoice?.id ?? ""),
        detail: { instanceCode: review.approval.instanceCode, fileId: body.fileId, recognized: review.group.primary.recognition?.facts, confirmed: { ...input, file: undefined } } });
    } catch {
      // The invoice and confirmation snapshot have already committed atomically.
      warning = "发票已登记，操作日志写入失败，请联系管理员；不要重复提交";
      console.error("Invoice return audit log failed", invoice?.id);
    }
    return NextResponse.json({ invoice, warning });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "回票确认失败" }, { status: error instanceof AccessError ? error.status : 400 }); }
}
