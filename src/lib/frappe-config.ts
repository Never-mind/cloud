/**
 * 远端 Frappe（物流 / 需求单系统）的连接配置。
 *
 * 需求单同步、物料同步、物流快照取数读的都是同一台 Frappe，所以地址与密钥
 * 只在这里解析一次。换 IP 或换密钥时改 `.env.local` 一个变量即可，不必到多个
 * service 里同步修改 —— 改漏一个会出现"一半同步走了新地址"这类不报错的静默故障。
 */

/** 代码内兜底地址：所有相关环境变量都没配时使用。 */
const DEFAULT_FRAPPE_BASE_URL = "http://192.168.3.153:1337";

/**
 * 推荐变量名在前，历史变量名在后继续兼容，避免已上线服务器必须一次性改名。
 * 新增服务请只用 `FRAPPE_API_BASE_URL` / `FRAPPE_API_TOKEN`。
 */
const BASE_URL_ENV_KEYS = ["FRAPPE_API_BASE_URL", "MATERIAL_API_BASE_URL", "FRAPPE_DEMAND_API_BASE_URL"] as const;
const TOKEN_ENV_KEYS = ["FRAPPE_API_TOKEN", "MATERIAL_API_TOKEN", "FRAPPE_DEMAND_API_TOKEN"] as const;

const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 120_000;

/** 取第一个非空环境变量；空白值按未配置处理。 */
function firstConfigured(keys: readonly string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** 取环境变量的数值配置；空白或非数字按未配置处理。 */
function configuredNumber(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export type FrappeEndpoint = {
  baseUrl: string;
  token: string;
};

/**
 * 远端地址与 API 密钥的唯一解析入口。
 *
 * @param serviceLabel 仅用于报错文案，例如「需求数据」「Material 数据」。
 */
export function resolveFrappeEndpoint(serviceLabel: string): FrappeEndpoint {
  const token = firstConfigured(TOKEN_ENV_KEYS);
  if (!token) {
    throw new Error(
      `未配置 Frappe API 密钥（${TOKEN_ENV_KEYS[0]}，兼容旧名 ${TOKEN_ENV_KEYS[1]}），无法读取远端${serviceLabel}`,
    );
  }
  const baseUrl = (firstConfigured(BASE_URL_ENV_KEYS) || DEFAULT_FRAPPE_BASE_URL).replace(/\/+$/, "");
  return { baseUrl, token };
}

/** 分页大小：非法或空白回退默认值，并夹在 [1, max] 之间。 */
export function resolvePageSize(value: string | undefined, fallback: number, max: number) {
  const configured = configuredNumber(value);
  return configured === null ? fallback : Math.min(Math.max(Math.floor(configured), 1), max);
}

/** 请求超时：非法或空白回退默认值，并夹在 [1000, 120000] 之间。 */
export function resolveTimeoutMs(value: string | undefined) {
  const configured = configuredNumber(value);
  return configured === null ? DEFAULT_TIMEOUT_MS : Math.min(Math.max(configured, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}
