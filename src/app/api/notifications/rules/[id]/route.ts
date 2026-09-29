import { NextRequest, NextResponse } from "next/server";
import { deleteNotificationRule } from "@/lib/notification-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const ruleId = decodeURIComponent(id);
    const actor = await getOperationActor(request);
    if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    await deleteNotificationRule(ruleId);
    await recordOperationLog({
      actor, domainKey: "common", moduleKey: "notification-rules", action: "delete",
      entityType: "notification-rules", entityId: ruleId, requestId: getOperationRequestId(request),
      detail: { result: "success" },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除通知规则失败" }, { status: 400 });
  }
}
