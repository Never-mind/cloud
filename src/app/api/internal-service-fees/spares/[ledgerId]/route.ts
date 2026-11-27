import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { updateInternalServiceSpare, voidInternalServiceSpare } from "@/lib/internal-service-fee-spare-service";
import type { InternalServiceSpareInput } from "@/lib/internal-service-fee-spare";

export async function PUT(request: NextRequest, context: { params: Promise<{ ledgerId: string }> }) {
  try {
    const actor = getAuthenticatedUserEmail(request);
    if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const { ledgerId } = await context.params;
    return NextResponse.json(await updateInternalServiceSpare(decodeURIComponent(ledgerId), await request.json() as InternalServiceSpareInput, actor));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "备件管理费修改失败" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ ledgerId: string }> }) {
  try {
    const actor = getAuthenticatedUserEmail(request);
    if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const { ledgerId } = await context.params;
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await voidInternalServiceSpare(decodeURIComponent(ledgerId), actor, String(body.reason ?? "")));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "备件管理费停用失败" }, { status: 400 });
  }
}
