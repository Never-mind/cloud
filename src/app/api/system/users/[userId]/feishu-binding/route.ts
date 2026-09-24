import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserEmail } from "@/lib/auth";
import { bindFeishuOpenId, unbindFeishuIdentity } from "@/lib/feishu-auth-service";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";
import { assertAdminActor } from "@/lib/user-service";

/**
 * 管理员手工绑定飞书身份（用 open_id）。
 * 场景：飞书成员没有企业邮箱，没法按邮箱自动匹配，管理员从登录报错里拿到 open_id 贴进来即可。
 */
export async function POST(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    const adminEmail = getAuthenticatedUserEmail(request);
    if (!adminEmail) return NextResponse.json({ error: "未登录" }, { status: 401 });
    await assertAdminActor(adminEmail);
    const { userId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { openId?: string; unionId?: string; feishuName?: string };
    await bindFeishuOpenId({
      userId,
      openId: String(body.openId ?? ""),
      unionId: body.unionId,
      feishuName: body.feishuName,
    });
    await recordOperationLog({
      domainKey: "common",
      moduleKey: "system-users",
      action: "update",
      entityType: "user",
      entityId: userId,
      requestId: getOperationRequestId(request),
      detail: { change: "feishu_bind_by_open_id", openId: String(body.openId ?? "").trim(), by: adminEmail },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "绑定失败";
    // 唯一索引冲突：该飞书账号已经绑到别的本地账号上。
    if (/Duplicate entry/i.test(message)) {
      return NextResponse.json({ error: "该飞书账号已经绑定到其它用户，请先在那条账号上解绑" }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** 管理员解绑某账号的飞书身份：解绑后该账号只能用密码登录（若 loginType 允许）。 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    const adminEmail = getAuthenticatedUserEmail(request);
    if (!adminEmail) return NextResponse.json({ error: "未登录" }, { status: 401 });
    await assertAdminActor(adminEmail);
    const { userId } = await context.params;
    await unbindFeishuIdentity(userId);
    await recordOperationLog({
      domainKey: "common",
      moduleKey: "system-users",
      action: "update",
      entityType: "user",
      entityId: userId,
      requestId: getOperationRequestId(request),
      detail: { change: "feishu_unbind", by: adminEmail },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "解绑失败" }, { status: 400 });
  }
}
