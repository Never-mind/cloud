import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { buildInvoiceApprovalPrefill } from "@/lib/feishu-approval-service";
import type { InvoiceSourceType } from "@/lib/invoice-service";
import { hasPermission } from "@/lib/permission-definitions";
import { getPermissionStateForEmail } from "@/lib/permission-service";
import { buildVatApprovalPrefill } from "@/lib/vat-invoice-approval-service";
import { queryRows } from "@/lib/db";

/** 开票审批预填：主体分支、约定收款日、客户开票信息、客户档案附件候选、阻断项。 */
export async function GET(request: NextRequest) {
  try {
    const email = getAuthenticatedUserEmail(request);
    if (!email) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const state = await getPermissionStateForEmail(email);
    if (!hasPermission(state, "invoices", "create")) {
      return NextResponse.json({ error: "当前账号没有开票权限" }, { status: 403 });
    }
    const params = request.nextUrl.searchParams;
    const sourceType = (params.get("sourceType") ?? "manual") as InvoiceSourceType;
    const sourceIds = (params.get("sourceIds") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    if (!["cloud_row", "billing_statement", "service_fee", "settlement_invoice"].includes(sourceType)) throw new Error("不支持的审批来源");
    const flow = params.get("flow") ?? "cloud";
    if (!["cloud", "vat"].includes(flow)) throw new Error("不支持的开票审批流程");
    const source = { sourceType, sourceId: params.get("sourceId"), sourceIds };
    if (flow === "vat") {
      const [user] = await queryRows<{ feishuOpenId: string }>("SELECT feishuOpenId FROM merge_common_users WHERE email = :email LIMIT 1", { email });
      return NextResponse.json(await buildVatApprovalPrefill({ ...source, starterOpenId: String(user?.feishuOpenId ?? "").trim() }));
    }
    const prefill = await buildInvoiceApprovalPrefill(source);
    return NextResponse.json(prefill);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "审批预填失败" }, { status: 400 });
  }
}
