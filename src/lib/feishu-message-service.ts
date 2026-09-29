/**
 * 飞书消息发送（应用身份 / 机器人）。
 *
 * 与登录共用同一个自建应用（FEISHU_APP_ID / FEISHU_APP_SECRET），但发消息走的是
 * tenant_access_token，不是用户 token。飞书后台需要：
 *   1) 权限管理里勾选「以应用的身份发消息」（im:message:send_as_bot）；
 *   2) 应用功能里启用机器人；
 *   3) 可用范围包含收件人，并且发布新版本，否则权限不生效。
 */
import { FEISHU_API_BASE, getFeishuCredentials } from "./feishu-auth-config";

type TenantTokenCache = { token: string; expiresAt: number };

// tenant_access_token 有效期 2 小时，进程内缓存，提前 5 分钟过期。
const cacheGlobal = globalThis as typeof globalThis & { __feishuTenantToken?: TenantTokenCache };
const TOKEN_SAFETY_WINDOW_MS = 5 * 60 * 1000;

export async function getFeishuTenantAccessToken() {
  const cached = cacheGlobal.__feishuTenantToken;
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const { appId, appSecret } = getFeishuCredentials();
  const response = await fetch(`${FEISHU_API_BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    code?: number;
    msg?: string;
    tenant_access_token?: string;
    expire?: number;
  };
  if (!response.ok || data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`获取飞书 tenant_access_token 失败：${data.msg ?? response.status}`);
  }
  const expiresIn = Number(data.expire ?? 7200) * 1000;
  cacheGlobal.__feishuTenantToken = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + Math.max(expiresIn - TOKEN_SAFETY_WINDOW_MS, 60_000),
  };
  return data.tenant_access_token;
}

export type FeishuSendResult = { ok: true; messageId: string } | { ok: false; error: string };

/**
 * 给单个用户发私聊文本消息。
 * 返回结构化结果而不是抛错：批量发送时要记录"谁失败了、为什么"，不能因为一个人没绑飞书就中断整批。
 */
export async function sendFeishuTextToUser(openId: string, text: string): Promise<FeishuSendResult> {
  const receiver = String(openId ?? "").trim();
  if (!receiver) return { ok: false, error: "该用户未绑定飞书（缺少 open_id）" };
  if (!/^ou_[0-9a-zA-Z]+$/.test(receiver)) return { ok: false, error: `飞书 open_id 格式不正确：${receiver}` };

  try {
    const token = await getFeishuTenantAccessToken();
    const response = await fetch(`${FEISHU_API_BASE}/open-apis/im/v1/messages?receive_id_type=open_id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: receiver,
        msg_type: "text",
        content: JSON.stringify({ text }),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      code?: number;
      msg?: string;
      data?: { message_id?: string };
    };
    if (!response.ok || data.code !== 0) {
      const hint = Number(data.code) === 99991672 || Number(data.code) === 99991663
        ? "（应用缺少发消息权限或机器人未启用，请在飞书后台开启后发布新版本）"
        : "";
      return { ok: false, error: `${data.msg ?? `HTTP ${response.status}`}${hint}` };
    }
    return { ok: true, messageId: String(data.data?.message_id ?? "") };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "飞书发送失败" };
  }
}
