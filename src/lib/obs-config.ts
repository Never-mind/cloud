/**
 * 华为 OBS（对象存储）连接配置。
 *
 * 与 Frappe / CRM 一样集中解析环境变量：换桶、换密钥只改一处，
 * 代码里不写死 AK/SK，也不把密钥下发到浏览器。
 */

const DEFAULT_ENDPOINT = "obs.cn-east-2.myhuaweicloud.com";
const DEFAULT_REGION = "cn-east-2";
// OBS 上的目录前缀。桶 ad-data-platform 里实际用的是小写 cloud，
// 大小写敏感，写成 Cloud 会被桶策略拒掉（403 AccessDenied）。
const DEFAULT_PREFIX = "cloud";
const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 300_000;

export type ObsConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  /** 对象键统一前缀，默认 Cloud（这段以外的桶内容不属于本系统）。 */
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  timeoutMs: number;
};

function configuredNumber(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 是否启用了 OBS：配了密钥且没有显式 OBS_ENABLED=0 就算启用。 */
export function isObsEnabled() {
  const flag = (process.env.OBS_ENABLED ?? "").trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return Boolean((process.env.OBS_ACCESS_KEY_ID ?? "").trim() && (process.env.OBS_SECRET_ACCESS_KEY ?? "").trim());
}

/**
 * 解析 OBS 配置。未启用时返回 null（调用方回落到"文件存数据库"的老路）。
 * 启用但缺字段时抛错，避免静默把文件写丢。
 */
export function resolveObsConfig(): ObsConfig | null {
  if (!isObsEnabled()) return null;
  const accessKeyId = (process.env.OBS_ACCESS_KEY_ID ?? "").trim();
  const secretAccessKey = (process.env.OBS_SECRET_ACCESS_KEY ?? "").trim();
  const bucket = (process.env.OBS_BUCKET ?? "").trim();
  if (!accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("OBS 配置不完整：需要 OBS_BUCKET、OBS_ACCESS_KEY_ID、OBS_SECRET_ACCESS_KEY");
  }
  const timeout = configuredNumber(process.env.OBS_TIMEOUT_MS);
  return {
    endpoint: ((process.env.OBS_ENDPOINT ?? "").trim() || DEFAULT_ENDPOINT).replace(/^https?:\/\//, "").replace(/\/+$/, ""),
    region: (process.env.OBS_REGION ?? "").trim() || DEFAULT_REGION,
    bucket,
    prefix: ((process.env.OBS_PREFIX ?? "").trim() || DEFAULT_PREFIX).replace(/^\/+|\/+$/g, ""),
    accessKeyId,
    secretAccessKey,
    timeoutMs: timeout === null ? DEFAULT_TIMEOUT_MS : Math.min(Math.max(timeout, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS),
  };
}
