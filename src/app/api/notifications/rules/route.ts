import { NextRequest, NextResponse } from "next/server";
import { listNotificationCandidates, listNotificationRules, saveNotificationRule, type NotificationRuleInput } from "@/lib/notification-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function GET() {
  try {
    const [rules, candidates] = await Promise.all([listNotificationRules(), listNotificationCandidates()]);
    return NextResponse.json({ rules, candidates });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "加载通知规则失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as NotificationRuleInput;
    const actor = await getOperationActor(request);
    if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const result = await saveNotificationRule(body, actor);
    await recordOperationLog({
      actor, domainKey: "common", moduleKey: "notification-rules", action: body.id ? "update" : "create",
      entityType: "notification-rules", entityId: result.id, requestId: getOperationRequestId(request),
      detail: { result: "success", name: body.name },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存通知规则失败" }, { status: 400 });
  }
}
