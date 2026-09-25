/**
 * 飞书登录（自建应用 OAuth）配置。
 *
 * 只从环境变量读，不把 app_id / app_secret 写进代码仓库：
 *   FEISHU_APP_ID          自建应用 App ID
 *   FEISHU_APP_SECRET      自建应用 App Secret
 *   FEISHU_REDIRECT_URI    可选，回调地址覆盖；不配则按请求来源推导，方便本地调试
 *   FEISHU_AUTO_PROVISION  可选，=1 时首次飞书登录自动建号（默认关闭，走本地白名单）
 *   FEISHU_TENANT_KEY      可选，限定只允许本公司租户登录
 *   FEISHU_API_BASE        可选，默认 https://open.feishu.cn（Lark 国际版用 open.larksuite.com）
 */

export const FEISHU_API_BASE = (process.env.FEISHU_API_BASE ?? "https://open.feishu.cn").replace(/\/+$/, "");

const CALLBACK_PATH = "/api/auth/feishu/callback";

export function getFeishuCredentials() {
  const appId = (process.env.FEISHU_APP_ID ?? "").trim();
  const appSecret = (process.env.FEISHU_APP_SECRET ?? "").trim();
  if (!appId || !appSecret) {
    throw new Error("未配置飞书应用凭证（FEISHU_APP_ID / FEISHU_APP_SECRET），请联系管理员");
  }
  return { appId, appSecret };
}

export function isFeishuLoginEnabled() {
  return Boolean((process.env.FEISHU_APP_ID ?? "").trim() && (process.env.FEISHU_APP_SECRET ?? "").trim());
}

export function feishuAutoProvisionEnabled() {
  return process.env.FEISHU_AUTO_PROVISION === "1";
}

/**
 * 飞书首次登录自动建号时给新员工的默认权限：
 *   readonly（默认）：所有模块只读（可查看，不能改数据）
 *   none：不授任何权限，等管理员分配
 *   full：除管理员专属模块外，全部操作权限
 */
export function feishuDefaultPermissionMode(): "readonly" | "none" | "full" {
  const value = (process.env.FEISHU_AUTO_PROVISION_PERMISSIONS ?? "readonly").trim().toLowerCase();
  return value === "none" || value === "full" ? value : "readonly";
}

/** 没有企业邮箱的成员用这个后缀生成内部账号标识（仅用于会话与列表展示）。 */
export function feishuSyntheticEmail(openId: string) {
  return `${String(openId ?? "").trim()}@feishu.local`;
}

export function feishuTenantKey() {
  return (process.env.FEISHU_TENANT_KEY ?? "").trim();
}

/**
 * 回调地址：优先用环境变量覆盖；否则按请求来源推导（带反向代理头，
 * 这样生产走 https 域名、本地走 127.0.0.1 都不用改代码）。
 * 注意：飞书后台的「重定向 URL」必须与这里推导出的地址**完全一致**。
 */
export function resolveFeishuRedirectUri(request: { nextUrl: URL; headers: Headers }) {
  const override = (process.env.FEISHU_REDIRECT_URI ?? "").trim();
  if (override) return override;
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = (forwardedHost ?? request.headers.get("host") ?? request.nextUrl.host).split(",")[0].trim();
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = (forwardedProto ?? request.nextUrl.protocol.replace(":", "")).split(",")[0].trim();
  return `${proto}://${host}${CALLBACK_PATH}`;
}
