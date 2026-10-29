import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { hasPermission } from "@/lib/permission-definitions";
import { getPermissionStateForEmail } from "@/lib/permission-service";
import { loadInvoicePartner } from "@/lib/invoice-partner-service";

export async function GET(request: NextRequest) {
  try {
    const email = getAuthenticatedUserEmail(request);
    if (!email) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const state = await getPermissionStateForEmail(email);
    if (!hasPermission(state, "invoices", "create")) return NextResponse.json({ error: "当前账号没有开票权限" }, { status: 403 });
    return NextResponse.json(await loadInvoicePartner(request.nextUrl.searchParams.get("kind") || "", request.nextUrl.searchParams.get("id") || ""));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "伙伴资料读取失败" }, { status: 400 });
  }
}
