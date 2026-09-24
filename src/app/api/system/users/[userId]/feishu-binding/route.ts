import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserEmail } from "@/lib/auth";
import { unbindFeishuIdentity } from "@/lib/feishu-auth-service";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";
import { assertAdminActor } from "@/lib/user-service";

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
