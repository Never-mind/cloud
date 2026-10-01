import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { voidInvoice } from "@/lib/invoice-service";
import { getOperationActor } from "@/lib/operation-actor";
import { hasPermission } from "@/lib/permission-definitions";
import { getPermissionStateForEmail } from "@/lib/permission-service";

/** 作废发票：票面数据保留供审计，来源账单回到"未开票"。 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const email = getAuthenticatedUserEmail(request);
    if (!email) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const state = await getPermissionStateForEmail(email);
    if (!hasPermission(state, "invoices", "update")) {
      return NextResponse.json({ error: "当前账号没有作废权限" }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const actor = await getOperationActor(request);
    const { id } = await context.params;
    const invoice = await voidInvoice(decodeURIComponent(id), String(body.reason ?? ""), {
      userId: actor?.userId ?? null,
      name: actor?.displayName ?? null,
    });
    return NextResponse.json({ invoice });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "作废失败" }, { status: 400 });
  }
}
