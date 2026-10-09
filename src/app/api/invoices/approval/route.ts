import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { submitInvoiceApprovalFromSource } from "@/lib/feishu-approval-service";
import type { InvoiceSourceType } from "@/lib/invoice-service";
import { queryRows } from "@/lib/db";
import { hasPermission } from "@/lib/permission-definitions";
import { getPermissionStateForEmail } from "@/lib/permission-service";

/**
 * 发起开票审批。
 *
 * 会用**当前登录人的飞书身份**发起（谁的飞书谁发起），所以要求该账号已绑定飞书。
 * 墨西哥主体必须带一个 CSF 附件（客户档案附件 ID 或已上传的 file_token）。
 */
export async function POST(request: NextRequest) {
  try {
    const email = getAuthenticatedUserEmail(request);
    if (!email) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const state = await getPermissionStateForEmail(email);
    if (!hasPermission(state, "invoices", "create")) {
      return NextResponse.json({ error: "当前账号没有开票权限" }, { status: 403 });
    }

    const users = await queryRows<{ userId: string; displayName: string; feishuOpenId: string; feishuName: string }>(
      "SELECT userId, displayName, feishuOpenId, feishuName FROM merge_common_users WHERE email = :email LIMIT 1",
      { email },
    );
    const user = users[0];
    const starterOpenId = String(user?.feishuOpenId ?? "").trim();
    if (!starterOpenId) {
      return NextResponse.json({ error: "当前账号还没有绑定飞书，无法以本人身份发起审批（请先用飞书登录一次）" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const text = (value: unknown) => String(value ?? "").trim();
    const sourceType = (text(body.sourceType) || "manual") as InvoiceSourceType;
    const sourceId = text(body.sourceId);
    if (!sourceId) return NextResponse.json({ error: "缺少来源单据（sourceId）" }, { status: 400 });

    const result = await submitInvoiceApprovalFromSource({
      sourceType,
      sourceId,
      sourceIds: Array.isArray(body.sourceIds) ? (body.sourceIds as unknown[]).map(text).filter(Boolean) : undefined,
      invoiceId: text(body.invoiceId) || null,
      starterOpenId,
      starterUserId: String(user?.userId ?? ""),
      starterName: String(user?.feishuName || user?.displayName || ""),
      purpose: text(body.purpose) || undefined,
      paymentReceivedTime: text(body.paymentReceivedTime),
      invoiceContent: text(body.invoiceContent) || undefined,
      paymentMethodKey: text(body.paymentMethodKey) || undefined,
      cfdiCodeKey: text(body.cfdiCodeKey) || undefined,
      customerOverride: body.customerOverride && typeof body.customerOverride === "object"
        ? {
          name: text((body.customerOverride as Record<string, unknown>).name) || undefined,
          taxId: text((body.customerOverride as Record<string, unknown>).taxId) || undefined,
          taxRegime: text((body.customerOverride as Record<string, unknown>).taxRegime) || undefined,
          address: text((body.customerOverride as Record<string, unknown>).address) || undefined,
          postCode: text((body.customerOverride as Record<string, unknown>).postCode) || undefined,
        }
        : undefined,
      cfsAttachmentId: text(body.cfsAttachmentId) || undefined,
      cfsFileToken: text(body.cfsFileToken) || undefined,
      amountIncludingTax: body.amountIncludingTax === undefined || body.amountIncludingTax === null || body.amountIncludingTax === ""
        ? undefined
        : Number(body.amountIncludingTax),
      amountCurrency: text(body.amountCurrency) || undefined,
      chile: body.chile && typeof body.chile === "object"
        ? {
          invoiceTypeKey: text((body.chile as Record<string, unknown>).invoiceTypeKey),
          amountIncludingTax: Number((body.chile as Record<string, unknown>).amountIncludingTax ?? 0),
          note1: text((body.chile as Record<string, unknown>).note1),
          note2Key: text((body.chile as Record<string, unknown>).note2Key),
          note3: Number((body.chile as Record<string, unknown>).note3 ?? 0),
          note4: Number((body.chile as Record<string, unknown>).note4 ?? 0),
          customerLabel: text((body.chile as Record<string, unknown>).customerLabel) || undefined,
        }
        : undefined,
    });

    return NextResponse.json({ ok: true, instanceCode: result.instanceCode, approvalId: result.id, approvalCode: result.approvalCode });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发起审批失败" }, { status: 400 });
  }
}
