import { NextRequest, NextResponse } from "next/server";
import { listNotificationCandidates, listNotificationRules, saveNotificationRule, type NotificationRuleInput } from "@/lib/notification-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";
import { hasPermission } from "@/lib/permission-definitions";
import { getPermissionStateForEmail } from "@/lib/permission-service";

export async function GET(request: NextRequest) {
  try {
    const [rules, candidates] = await Promise.all([listNotificationRules(), listNotificationCandidates()]);
    // 告诉前端"当前账号能不能配规则"：普通账号默认只有查看权，前端据此隐藏新建/编辑/删除按钮，
    // 避免出现点了才报"没有权限"的按钮。
    const actor = await getOperationActor(request);
    const permissionState = actor ? await getPermissionStateForEmail(actor.email) : null;
    const canConfigure = hasPermission(permissionState, "notification-rules", "create")
      || hasPermission(permissionState, "notification-rules", "update")
      || hasPermission(permissionState, "notification-rules", "delete");
    return NextResponse.json({ rules, candidates, canConfigure });
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
