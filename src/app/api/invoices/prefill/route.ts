import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { buildInvoicePrefill, type InvoiceSourceType } from "@/lib/invoice-service";
import { hasPermission } from "@/lib/permission-definitions";
import { getPermissionStateForEmail } from "@/lib/permission-service";

/** 开票弹层预填：按来源单据把客户/承接单位/银行/金额/明细都取好，并返回缺哪些档案资料。 */
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
    // 合并多账期时前端传 sourceIds=a,b,c（逗号分隔）
    const sourceIds = (params.get("sourceIds") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    const prefill = await buildInvoicePrefill({ sourceType, sourceId: params.get("sourceId"), sourceIds });
    return NextResponse.json(prefill);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "预填失败" }, { status: 400 });
  }
}
