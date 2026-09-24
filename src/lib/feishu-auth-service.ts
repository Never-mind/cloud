import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { AUTH_SESSION_VALUE } from "./auth-session";
import { executeRaw, queryRowsRaw } from "./db";
import { FEISHU_API_BASE, feishuAutoProvisionEnabled, feishuTenantKey, getFeishuCredentials } from "./feishu-auth-config";

/** 飞书授权回调带回的 state 有效期（毫秒）。 */
const STATE_TTL_MS = 10 * 60 * 1000;

export type FeishuProfile = {
  openId: string;
  unionId: string;
  name: string;
  email: string;
  tenantKey: string;
  avatarUrl: string;
  userId: string;
  employeeNo: string;
};

type UserRow = {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  loginType: string;
  feishuOpenId: string | null;
  feishuUnionId: string | null;
};

/** state = 随机串.时间戳.HMAC，防 CSRF；无状态，不落库。 */
export function createFeishuState() {
  const nonce = randomBytes(12).toString("hex");
  const issuedAt = Date.now().toString();
  return `${nonce}.${issuedAt}.${signState(`${nonce}.${issuedAt}`)}`;
}

export function verifyFeishuState(state: string) {
  const parts = String(state ?? "").split(".");
  // 第 4 段是可选的登录后跳转地址（base64url），校验只看前 3 段。
  if (parts.length !== 3 && parts.length !== 4) return false;
  const [nonce, issuedAt, signature] = parts;
  if (!nonce || !issuedAt || !/^\d+$/.test(issuedAt) || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = signState(`${nonce}.${issuedAt}`);
  const actual = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) return false;
  return Math.abs(Date.now() - Number(issuedAt)) <= STATE_TTL_MS;
}

/** 从 state 第 4 段取登录后的跳转地址；非法或缺失时回首页，避免开放重定向。 */
export function readNextFromState(state: string) {
  const parts = String(state ?? "").split(".");
  if (parts.length !== 4) return "/";
  try {
    const next = Buffer.from(parts[3], "base64url").toString("utf8");
    return next.startsWith("/") && !next.startsWith("//") ? next : "/";
  } catch {
    return "/";
  }
}

function signState(payload: string) {
  return createHmac("sha256", AUTH_SESSION_VALUE).update(payload).digest("hex");
}

/** 新版授权页地址（v1 authorize + v2 令牌接口的组合，飞书当前推荐用法）。 */
export function buildFeishuAuthorizeUrl({ redirectUri, state }: { redirectUri: string; state: string }) {
  const { appId } = getFeishuCredentials();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });
  return `${FEISHU_API_BASE}/open-apis/authen/v1/authorize?${params.toString()}`;
}

type FeishuTokenResponse = {
  code?: number;
  msg?: string;
  access_token?: string;
  data?: { access_token?: string; error?: string; error_description?: string };
  error?: string;
  error_description?: string;
};

/** code → user_access_token。 */
export async function exchangeFeishuCode({ code, redirectUri }: { code: string; redirectUri: string }) {
  const { appId, appSecret } = getFeishuCredentials();
  const response = await fetch(`${FEISHU_API_BASE}/open-apis/authen/v2/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: appId,
      client_secret: appSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as FeishuTokenResponse;
  const accessToken = payload.access_token ?? payload.data?.access_token ?? "";
  if (!response.ok || !accessToken) {
    const detail = payload.error_description ?? payload.data?.error_description ?? payload.error ?? payload.data?.error ?? payload.msg ?? `HTTP ${response.status}`;
    throw new Error(`飞书授权失败：${detail}`);
  }
  return accessToken;
}

/** user_access_token → 用户信息（open_id / union_id / 姓名 / 邮箱 / 租户）。 */
export async function fetchFeishuProfile(accessToken: string): Promise<FeishuProfile> {
  const response = await fetch(`${FEISHU_API_BASE}/open-apis/authen/v1/user_info`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    code?: number;
    msg?: string;
    data?: Record<string, unknown>;
  };
  const data = payload.data ?? {};
  const openId = String(data.open_id ?? "").trim();
  if (!response.ok || payload.code !== 0 || !openId) {
    throw new Error(`读取飞书用户信息失败：${payload.msg ?? `HTTP ${response.status}`}`);
  }
  return {
    openId,
    unionId: String(data.union_id ?? "").trim(),
    name: String(data.name ?? data.en_name ?? "").trim(),
    email: String(data.enterprise_email ?? data.email ?? "").trim().toLowerCase(),
    tenantKey: String(data.tenant_key ?? "").trim(),
    avatarUrl: String(data.avatar_url ?? data.avatar_middle ?? "").trim(),
    userId: String(data.user_id ?? "").trim(),
    employeeNo: String(data.employee_no ?? "").trim(),
  };
}

export type FeishuLoginResult =
  | { ok: true; userId: string; email: string; displayName: string; bound: boolean }
  | { ok: false; reason: string };

/**
 * 把飞书身份落到本地账号上：
 *   1. 先按 open_id / union_id 找已绑定的账号（绑过就只认绑定关系）
 *   2. 再按邮箱找账号：找到且允许飞书登录 → 自动绑定（首次登录）
 *   3. 都没有：按 FEISHU_AUTO_PROVISION 决定是否自动建号，否则提示联系管理员
 * 账号状态必须是 active，否则一律拒绝。
 */
export async function resolveFeishuLoginUser(profile: FeishuProfile): Promise<FeishuLoginResult> {
  const expectedTenant = feishuTenantKey();
  if (expectedTenant && profile.tenantKey && profile.tenantKey !== expectedTenant) {
    return { ok: false, reason: "该飞书账号不属于本公司，无法登录" };
  }

  const bound = await queryRowsRaw<UserRow>(
    `SELECT userId, email, displayName, role, status, loginType, feishuOpenId, feishuUnionId
       FROM merge_common_users
      WHERE feishuOpenId = :openId OR (:unionId <> '' AND feishuUnionId = :unionId)
      LIMIT 1`,
    { openId: profile.openId, unionId: profile.unionId },
  );
  if (bound[0]) return checkAndTouch(bound[0], false);

  if (profile.email) {
    const byEmail = await queryRowsRaw<UserRow>(
      `SELECT userId, email, displayName, role, status, loginType, feishuOpenId, feishuUnionId
         FROM merge_common_users WHERE email = :email LIMIT 1`,
      { email: profile.email },
    );
    const user = byEmail[0];
    if (user) {
      if (!allowsFeishuLogin(user.loginType)) {
        return { ok: false, reason: "该账号未开通飞书登录，请联系管理员" };
      }
      if (user.status !== "active") return { ok: false, reason: "账号已停用，请联系管理员" };
      await bindFeishuIdentity(user.userId, profile);
      return { ok: true, userId: user.userId, email: user.email, displayName: user.displayName || profile.name, bound: true };
    }
  }

  if (!feishuAutoProvisionEnabled()) {
    return {
      ok: false,
      reason: profile.email
        ? `该飞书账号（${profile.email}）尚未在系统里开通，请联系管理员添加账号`
        : `未获取到该飞书账号的企业邮箱（飞书返回为空，可能未设置企业邮箱或应用缺少 contact:user.email:readonly 权限）。请联系管理员在「用户管理 → 绑定飞书」里用 open_id 手工绑定：${profile.openId}`,
    };
  }
  if (!profile.email) {
    return {
      ok: false,
      reason: `飞书账号没有企业邮箱，无法自动建号。请联系管理员在「用户管理 → 绑定飞书」里用 open_id 手工绑定：${profile.openId}`,
    };
  }
  const userId = `feishu-${profile.openId}`.slice(0, 80);
  await executeRaw(
    `INSERT INTO merge_common_users
       (userId, displayName, email, passwordHash, passwordSalt, role, status, loginType, feishuOpenId, feishuUnionId, feishuName, feishuBoundAt)
     VALUES
       (:userId, :displayName, :email, '', '', 'user', 'active', 'feishu', :openId, :unionId, :feishuName, CURRENT_TIMESTAMP)`,
    {
      userId,
      displayName: profile.name || profile.email,
      email: profile.email,
      openId: profile.openId,
      unionId: profile.unionId || null,
      feishuName: profile.name || null,
    },
  );
  return { ok: true, userId, email: profile.email, displayName: profile.name || profile.email, bound: true };
}

export async function bindFeishuIdentity(userId: string, profile: FeishuProfile) {
  await executeRaw(
    `UPDATE merge_common_users
        SET feishuOpenId = :openId,
            feishuUnionId = :unionId,
            feishuName = :feishuName,
            feishuBoundAt = CURRENT_TIMESTAMP,
            loginType = CASE WHEN loginType = 'local' THEN 'both' ELSE loginType END
      WHERE userId = :userId`,
    {
      userId,
      openId: profile.openId,
      unionId: profile.unionId || null,
      feishuName: profile.name || null,
    },
  );
}

export async function unbindFeishuIdentity(userId: string) {
  await executeRaw(
    `UPDATE merge_common_users
        SET feishuOpenId = NULL, feishuUnionId = NULL, feishuName = NULL, feishuBoundAt = NULL
      WHERE userId = :userId`,
    { userId },
  );
}

/**
 * 管理员用 open_id 手工绑定（飞书账号没有企业邮箱时的兜底入口）。
 * open_id 是应用内唯一标识，绑上之后该成员就能用飞书登录，不再依赖邮箱匹配。
 */
export async function bindFeishuOpenId({
  userId,
  openId,
  unionId,
  feishuName,
}: {
  userId: string;
  openId: string;
  unionId?: string;
  feishuName?: string;
}) {
  const target = String(openId ?? "").trim();
  if (!target) throw new Error("请输入飞书 open_id");
  if (!/^ou_[0-9a-zA-Z]+$/.test(target)) throw new Error("飞书 open_id 格式不正确，应以 ou_ 开头");
  await executeRaw(
    `UPDATE merge_common_users
        SET feishuOpenId = :openId,
            feishuUnionId = :unionId,
            feishuName = :feishuName,
            feishuBoundAt = CURRENT_TIMESTAMP,
            loginType = CASE WHEN loginType = 'local' THEN 'both' ELSE loginType END
      WHERE userId = :userId`,
    {
      userId,
      openId: target,
      unionId: String(unionId ?? "").trim() || null,
      feishuName: String(feishuName ?? "").trim() || null,
    },
  );
}

function allowsFeishuLogin(loginType: string) {
  return loginType === "feishu" || loginType === "both";
}

async function checkAndTouch(user: UserRow, bound: boolean): Promise<FeishuLoginResult> {
  if (user.status !== "active") return { ok: false, reason: "账号已停用，请联系管理员" };
  return { ok: true, userId: user.userId, email: user.email, displayName: user.displayName, bound };
}
