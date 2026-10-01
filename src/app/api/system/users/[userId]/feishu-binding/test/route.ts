import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserEmail } from "@/lib/auth";
import { queryRowsRaw } from "@/lib/db";
import { sendFeishuTextToUser } from "@/lib/feishu-message-service";
import { assertAdminActor } from "@/lib/user-service";

/**
 * 给指定账号发一条飞书测试消息，用来验证「绑定 + 机器人权限」是否真的通了
 * （消息通知上线前，管理员可以逐个确认谁能收到）。
 */
export async function POST(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    const adminEmail = getAuthenticatedUserEmail(request);
    if (!adminEmail) return NextResponse.json({ error: "未登录" }, { status: 401 });
    await assertAdminActor(adminEmail);
    const { userId } = await context.params;
    const user = (await queryRowsRaw<{ displayName: string; feishuOpenId: string | null }>(
      "SELECT displayName, feishuOpenId FROM merge_common_users WHERE userId = :userId LIMIT 1",
      { userId: decodeURIComponent(userId) },
    ))[0];
    if (!user) return NextResponse.json({ error: "账号不存在" }, { status: 404 });
    if (!String(user.feishuOpenId ?? "").trim()) return NextResponse.json({ error: "该账号还没绑定飞书，先绑定再试" }, { status: 400 });

    const result = await sendFeishuTextToUser(
      String(user.feishuOpenId),
      `【Cloud业务系统】飞书通知测试\n收件人：${user.displayName}\n发送时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}\n收到这条消息说明该账号能正常接收系统通知。`,
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发送失败" }, { status: 400 });
  }
}
