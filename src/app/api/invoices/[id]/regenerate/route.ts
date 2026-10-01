import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { regenerateInvoiceFile } from "@/lib/invoice-service";
import { getOperationActor } from "@/lib/operation-actor";
import { hasPermission } from "@/lib/permission-definitions";
import { getPermissionStateForEmail } from "@/lib/permission-service";

/** 重新生成票面：票号与快照不变，用于补签章或改数据后重出。 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const email = getAuthenticatedUserEmail(request);
    if (!email) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const state = await getPermissionStateForEmail(email);
    if (!hasPermission(state, "invoices", "update")) {
      return NextResponse.json({ error: "当前账号没有重新生成权限" }, { status: 403 });
    }
    const actor = await getOperationActor(request);
    const { id } = await context.params;
    const invoice = await regenerateInvoiceFile(decodeURIComponent(id), {
      userId: actor?.userId ?? null,
      name: actor?.displayName ?? null,
    });
    return NextResponse.json({ invoice });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "重新生成失败" }, { status: 400 });
  }
}
