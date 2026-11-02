import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { getOperationActor } from "@/lib/operation-actor";
import { hasPermission } from "@/lib/permission-definitions";
import { getPermissionStateForEmail } from "@/lib/permission-service";
import { previewStatementInvoiceRemoval, removeStatementInvoiceRegistration } from "@/lib/statement-invoice-removal";

async function access(request: NextRequest) {
  const email = getAuthenticatedUserEmail(request);
  if (!email) throw new Error("未登录");
  const state = await getPermissionStateForEmail(email);
  return (mode: "delete" | "void") => {
    if (!hasPermission(state, "invoices", mode === "delete" ? "delete" : "update")) throw new Error("当前账号没有删除或作废发票登记的权限");
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const authorize = await access(request);
    const { id } = await context.params;
    const preview = await previewStatementInvoiceRemoval(id, { sourceType: request.nextUrl.searchParams.get("sourceType") || "", sourceId: request.nextUrl.searchParams.get("sourceId") || "" });
    authorize(preview.mode);
    return NextResponse.json({ preview });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "删除预览加载失败" }, { status: 400 }); }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const authorize = await access(request);
    const { id } = await context.params;
    const body = await request.json();
    const actor = await getOperationActor(request);
    const result = await removeStatementInvoiceRegistration(id, { sourceType: String(body.sourceType || ""), sourceId: String(body.sourceId || ""), revision: String(body.revision || "") },
      { userId: actor?.userId, name: actor?.displayName }, authorize);
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "移除登记失败" }, { status: 400 }); }
}
