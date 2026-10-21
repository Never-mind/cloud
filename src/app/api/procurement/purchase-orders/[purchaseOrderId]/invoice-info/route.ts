import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { execute, queryRows, type Row } from "@/lib/db";
import { normalizeDateOnlyValue } from "@/lib/date-only";
import { getOperationActor } from "@/lib/operation-actor";
import { deriveInvoiceTaxAmounts, validateInvoiceTaxAmounts } from "@/lib/invoice-tax";

type RouteContext = { params: Promise<{ purchaseOrderId: string }> };

async function loadInvoiceInfo(purchaseOrderId: string) {
  const rows = await queryRows<Row>(
    `SELECT po.purchaseOrderId, po.poNo, po.currency AS orderCurrency,
            po.invoiceNo, po.invoiceDate, po.invoiceAmount, po.invoiceNetAmount, po.invoiceTaxRate, po.invoiceTaxAmount,
            po.invoiceCurrency, po.invoiceStatus,
            po.paymentDate AS expectedPaymentDate, po.invoiceRemark,
            po.paymentStatus, po.paidAt AS actualPaymentDate,
            po.paymentApprovalId,
            approval.status AS paymentApprovalStatus,
            approval.serialNumber AS paymentApprovalNo,
            approval.paymentConfirmedAt
       FROM merge_power_purchaseorders po
       LEFT JOIN merge_common_feishu_approvals approval ON approval.id = po.paymentApprovalId
      WHERE po.purchaseOrderId = :purchaseOrderId
      LIMIT 1`,
    { purchaseOrderId },
  );
  return rows[0] ?? null;
}

/** 算力采购订单的发票登记信息（附件区使用，不改变采购明细）。 */
export async function GET(request: NextRequest, context: RouteContext) {
  if (!getAuthenticatedUserEmail(request)) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const purchaseOrderId = decodeURIComponent((await context.params).purchaseOrderId);
  const invoiceInfo = await loadInvoiceInfo(purchaseOrderId);
  if (!invoiceInfo) return NextResponse.json({ error: "采购订单不存在" }, { status: 404 });
  return NextResponse.json({ invoiceInfo });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!getAuthenticatedUserEmail(request)) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try {
    const purchaseOrderId = decodeURIComponent((await context.params).purchaseOrderId);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const text = (value: unknown) => String(value ?? "").trim();
    const current = await loadInvoiceInfo(purchaseOrderId);
    if (!current) return NextResponse.json({ error: "采购订单不存在" }, { status: 404 });
    const hasField = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
    const amountOrNull = (value: unknown, label: string) => {
      const amountText = text(value).replace(/,/g, "");
      if (!amountText) return null;
      const amount = Number(amountText);
      if (!Number.isFinite(amount)) throw new Error(`${label}格式不正确`);
      return amount;
    };
    const invoiceAmount = hasField("invoiceAmount")
      ? amountOrNull(body.invoiceAmount, "含税金额")
      : amountOrNull(current.invoiceAmount, "含税金额");
    const invoiceNetAmount = hasField("invoiceNetAmount")
      ? amountOrNull(body.invoiceNetAmount, "未税金额")
      : amountOrNull(current.invoiceNetAmount, "未税金额");
    const invoiceTaxRate = hasField("invoiceTaxRate")
      ? amountOrNull(body.invoiceTaxRate, "税率")
      : amountOrNull(current.invoiceTaxRate, "税率");
    const invoiceTaxAmount = hasField("invoiceTaxAmount")
      ? amountOrNull(body.invoiceTaxAmount, "税金")
      : amountOrNull(current.invoiceTaxAmount, "税金");
    const invoiceTax = deriveInvoiceTaxAmounts({
      netAmount: invoiceNetAmount,
      taxRate: invoiceTaxRate,
      taxAmount: invoiceTaxAmount,
      grossAmount: invoiceAmount,
    });
    const invoiceTaxError = validateInvoiceTaxAmounts(invoiceTax);
    if (invoiceTaxError) throw new Error(invoiceTaxError);
    const currentPaymentStatus = String(current.paymentStatus ?? "").trim();
    const paid = body.paid === true;
    const unpaid = body.paid === false;
    const nextPaymentStatus = paid
      ? "已付款"
      : unpaid && currentPaymentStatus !== "审批中"
        ? "未付款"
        : currentPaymentStatus || null;
    const actualPaymentDate = normalizeDateOnlyValue(body.actualPaymentDate);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
    const nextPaidAt = paid
      ? actualPaymentDate ?? normalizeDateOnlyValue(current.actualPaymentDate) ?? today
      : unpaid && currentPaymentStatus !== "审批中"
        ? null
        : current.actualPaymentDate ?? null;
    const invoiceStatus = body.invoiced === true
      ? "已开票"
      : body.invoiced === false
        ? "未开票"
        : current.invoiceStatus ?? null;

    const actor = await getOperationActor(request);
    await execute(
      `UPDATE merge_power_purchaseorders
          SET invoiceNo = :invoiceNo,
              invoiceDate = :invoiceDate,
              invoiceAmount = :invoiceAmount,
              invoiceNetAmount = :invoiceNetAmount,
              invoiceTaxRate = :invoiceTaxRate,
              invoiceTaxAmount = :invoiceTaxAmount,
              invoiceCurrency = :invoiceCurrency,
              invoiceStatus = :invoiceStatus,
              paymentDate = :expectedPaymentDate,
              paymentStatus = :paymentStatus,
              paidAt = :paidAt,
              invoiceRemark = :invoiceRemark,
              updatedAt = CURRENT_TIMESTAMP,
              updatedByUserId = :updatedByUserId,
              updatedByName = :updatedByName
        WHERE purchaseOrderId = :purchaseOrderId`,
      {
        purchaseOrderId,
        invoiceNo: text(body.invoiceNo).slice(0, 100) || null,
        invoiceDate: normalizeDateOnlyValue(body.invoiceDate),
        invoiceAmount: invoiceTax.grossAmount,
        invoiceNetAmount: invoiceTax.netAmount,
        invoiceTaxRate: invoiceTax.taxRate,
        invoiceTaxAmount: invoiceTax.taxAmount,
        invoiceCurrency: text(body.invoiceCurrency).toUpperCase().slice(0, 16) || null,
        invoiceStatus,
        expectedPaymentDate: normalizeDateOnlyValue(body.expectedPaymentDate),
        paymentStatus: nextPaymentStatus,
        paidAt: nextPaidAt,
        invoiceRemark: text(body.invoiceRemark).slice(0, 500) || null,
        updatedByUserId: actor?.userId ?? null,
        updatedByName: actor?.displayName ?? null,
      },
    );
    const invoiceInfo = await loadInvoiceInfo(purchaseOrderId);
    if (!invoiceInfo) return NextResponse.json({ error: "采购订单不存在" }, { status: 404 });
    return NextResponse.json({ invoiceInfo });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票信息保存失败" }, { status: 400 });
  }
}
