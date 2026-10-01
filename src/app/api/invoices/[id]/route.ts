import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { deleteInvoice, getInvoice } from "@/lib/invoice-service";
import { hasPermission } from "@/lib/permission-definitions";
import { getPermissionStateForEmail } from "@/lib/permission-service";

async function requireAccess(request: NextRequest, action: "view" | "delete") {
  const email = getAuthenticatedUserEmail(request);
  if (!email) throw new Error("未登录");
  const state = await getPermissionStateForEmail(email);
  if (!hasPermission(state, "invoices", action)) throw new Error("当前账号没有该操作权限");
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAccess(request, "view");
    const { id } = await context.params;
    const invoice = await getInvoice(decodeURIComponent(id));
    if (!invoice) return NextResponse.json({ error: "开票记录不存在" }, { status: 404 });
    return NextResponse.json({ invoice });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票详情加载失败" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAccess(request, "delete");
    const { id } = await context.params;
    await deleteInvoice(decodeURIComponent(id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除失败" }, { status: 400 });
  }
}
