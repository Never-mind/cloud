/**
 * 远端 CRM（发票 / 回款 / 汇率 OpenAPI）的连接配置。
 *
 * 与 Frappe 的 frappe-config 同一思路：地址、密钥、业务线只在这里解析一次，
 * 换域名或换 token 时只改一个环境变量，避免"一半请求走新地址"的静默故障。
 */

/** 代码内兜底地址：CRM_API_BASE_URL 没配时使用。 */
const DEFAULT_CRM_API_BASE_URL = "http://crm-api.wanzhongtech.com";
/** 业务线 2 = Cloud（华为云），发票/回款同步默认只看这一条。 */
export const DEFAULT_CRM_BUSINESS_LINE_ID = 2;
const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_SYNC_MONTHS = 3;
const MAX_SYNC_MONTHS = 24;

function configuredNumber(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export type CrmEndpoint = {
  baseUrl: string;
  token: string;
};

/**
 * 远端地址与 OpenAPI 密钥的唯一解析入口。
 *
 * @param serviceLabel 仅用于报错文案，例如「发票」「回款」。
 */
export function resolveCrmEndpoint(serviceLabel = "CRM 数据"): CrmEndpoint {
  const token = (process.env.CRM_API_TOKEN ?? "").trim();
  if (!token) {
    throw new Error(`未配置 CRM OpenAPI 密钥（CRM_API_TOKEN），无法读取远端${serviceLabel}`);
  }
  const baseUrl = ((process.env.CRM_API_BASE_URL ?? "").trim() || DEFAULT_CRM_API_BASE_URL).replace(/\/+$/, "");
  return { baseUrl, token };
}

/** 业务线 ID：非法值回退默认（2 = Cloud）。 */
export function resolveCrmBusinessLineId() {
  const configured = configuredNumber(process.env.CRM_BUSINESS_LINE_ID);
  if (configured === null || configured <= 0) return DEFAULT_CRM_BUSINESS_LINE_ID;
  return Math.floor(configured);
}

/** 请求超时：非法或空白回退默认值，并夹在 [1000, 120000] 之间。 */
export function resolveCrmTimeoutMs() {
  const configured = configuredNumber(process.env.CRM_TIMEOUT_MS);
  if (configured === null) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(configured, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}

/** 默认同步最近多少个月（含当月）：非法或空白回退 3，最大 24。 */
export function resolveCrmSyncMonths() {
  const configured = configuredNumber(process.env.CRM_SYNC_MONTHS);
  if (configured === null) return DEFAULT_SYNC_MONTHS;
  return Math.min(Math.max(Math.floor(configured), 1), MAX_SYNC_MONTHS);
}
