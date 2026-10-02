import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { listMergeCandidates } from "@/lib/invoice-service";
import { hasPermission } from "@/lib/permission-definitions";
import { getPermissionStateForEmail } from "@/lib/permission-service";

/** 合并开票的候选账单行：只列未开票、同客户、同币种、有应收金额的对账行。 */
export async function GET(request: NextRequest) {
  try {
    const email = getAuthenticatedUserEmail(request);
    if (!email) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const state = await getPermissionStateForEmail(email);
    if (!hasPermission(state, "invoices", "create")) {
      return NextResponse.json({ error: "当前账号没有开票权限" }, { status: 403 });
    }
    const params = request.nextUrl.searchParams;
    const data = await listMergeCandidates({
      customerId: params.get("customerId") ?? "",
      currency: params.get("currency") ?? "",
      from: params.get("from") ?? "",
      to: params.get("to") ?? "",
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "候选账单行加载失败" }, { status: 400 });
  }
}
