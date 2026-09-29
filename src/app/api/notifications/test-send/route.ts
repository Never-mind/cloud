import { NextRequest, NextResponse } from "next/server";
import { sendTestNotification, type NotificationRuleInput } from "@/lib/notification-service";
import { getOperationActor } from "@/lib/operation-actor";

/** 试发：只能发给自己，用于验证飞书权限与模板效果。 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getOperationActor(request);
    if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as NotificationRuleInput;
    const result = await sendTestNotification(body, actor);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "试发失败" }, { status: 400 });
  }
}
