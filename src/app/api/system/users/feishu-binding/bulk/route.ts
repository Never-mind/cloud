import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserEmail } from "@/lib/auth";
import { queryRowsRaw } from "@/lib/db";
import { bindFeishuOpenId, unbindFeishuIdentity } from "@/lib/feishu-auth-service";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";
import { assertAdminActor } from "@/lib/user-service";

/**
 * 管理员批量绑定飞书身份。
 *
 * 每行一条，支持这几种写法（空格/逗号/等号都行）：
 *   zhangsan@luzcorp.com=ou_xxxxxxxx
 *   zhangsan@luzcorp.com, ou_xxxxxxxx
 *   zhangsan@luzcorp.com  ou_xxxxxxxx  张三
 *
 * 之所以要批量：成员没有企业邮箱时只能靠 open_id 绑定，一个一个贴在用户管理里太慢。
 *
 * `moveExisting=true`：如果这个 open_id 已经绑在别的账号上（例如首次飞书登录时自动建了一个
 * `ou_xxx@feishu.local` 账号），把它从旧账号摘下来绑到目标邮箱账号上 —— 用于清理重复账号。
 */
export async function POST(request: NextRequest) {
  try {
    const adminEmail = getAuthenticatedUserEmail(request);
    if (!adminEmail) return NextResponse.json({ error: "未登录" }, { status: 401 });
    await assertAdminActor(adminEmail);

    const body = (await request.json().catch(() => ({}))) as { text?: string; moveExisting?: boolean };
    const moveExisting = Boolean(body.moveExisting);
    const lines = String(body.text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return NextResponse.json({ error: "请粘贴要绑定的内容（每行：邮箱=open_id）" }, { status: 400 });

    const results: Array<{ line: string; email: string; openId: string; ok: boolean; message: string }> = [];
    for (const line of lines) {
      const parts = line.split(/[=,，\s]+/).filter(Boolean);
      const email = String(parts[0] ?? "").toLowerCase();
      const openId = String(parts[1] ?? "").trim();
      const feishuName = String(parts[2] ?? "").trim();
      if (!email || !openId) {
        results.push({ line, email, openId, ok: false, message: "格式不对，应为：邮箱=open_id（可选再跟一个姓名）" });
        continue;
      }
      const user = (await queryRowsRaw<{ userId: string }>(
        "SELECT userId FROM merge_common_users WHERE LOWER(email) = :email LIMIT 1",
        { email },
      ))[0];
      if (!user) {
        results.push({ line, email, openId, ok: false, message: "系统里没有这个邮箱对应的账号" });
        continue;
      }
      try {
        await bindFeishuOpenId({ userId: user.userId, openId, feishuName: feishuName || undefined });
        results.push({ line, email, openId, ok: true, message: "已绑定" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "绑定失败";
        if (moveExisting && /Duplicate entry/i.test(message)) {
          // 把同一个 open_id 从旧账号迁移到目标账号（旧账号本身的邮箱/权限保留）
          const previous = (await queryRowsRaw<{ userId: string; displayName: string | null }>(
            "SELECT userId, displayName FROM merge_common_users WHERE feishuOpenId = :openId LIMIT 1",
            { openId },
          ))[0];
          if (previous && previous.userId !== user.userId) {
            try {
              await unbindFeishuIdentity(previous.userId);
              await bindFeishuOpenId({ userId: user.userId, openId, feishuName: feishuName || undefined });
              results.push({ line, email, openId, ok: true, message: `已从「${previous.displayName ?? previous.userId}」迁移绑定` });
              continue;
            } catch (moveError) {
              results.push({ line, email, openId, ok: false, message: moveError instanceof Error ? moveError.message : "迁移绑定失败" });
              continue;
            }
          }
        }
        results.push({
          line, email, openId, ok: false,
          message: /Duplicate entry/i.test(message) ? "该飞书账号已绑到其它用户（可勾选「迁移绑定」接管）" : message,
        });
      }
    }

    const succeeded = results.filter((item) => item.ok).length;
    await recordOperationLog({
      domainKey: "common",
      moduleKey: "system-users",
      action: "update",
      entityType: "user",
      entityId: "feishu-bulk-bind",
      requestId: getOperationRequestId(request),
      detail: { change: moveExisting ? "feishu_bulk_move_bind" : "feishu_bulk_bind", total: results.length, succeeded, by: adminEmail },
    });
    return NextResponse.json({ total: results.length, succeeded, failed: results.length - succeeded, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "批量绑定失败" }, { status: 400 });
  }
}
