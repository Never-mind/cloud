import { createHash, createHmac } from "node:crypto";
import { resolveObsConfig, type ObsConfig } from "./obs-config";

/**
 * 极简 OBS 客户端（S3 兼容，AWS Signature V4）。
 *
 * 只用 PUT / GET / DELETE / HEAD / ListObjectsV2 这几个动作，
 * 所以不引第三方 SDK：少一个依赖、升级负担小，签名逻辑也可见可测。
 */

function sha256Hex(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

/** S3 的 URI 编码规则：保留 '/'，其它按 RFC3986 编码。 */
function encodeS3Path(path: string) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

function encodeQuery(params: Record<string, string>) {
  return Object.entries(params)
    .filter(([, value]) => value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

type SignedRequest = { url: string; headers: Record<string, string> };

function signRequest(config: ObsConfig, method: string, objectKey: string, query: Record<string, string>, payload: Buffer, contentType?: string) {
  // objectKey 为空 = 操作桶本身（列目录）
  const canonicalUri = `/${config.bucket}${objectKey ? `/${encodeS3Path(objectKey)}` : "/"}`;
  const queryString = encodeQuery(query);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(payload);
  const headerEntries: Array<[string, string]> = [
    ["host", config.endpoint],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", amzDate],
  ];
  if (contentType) headerEntries.push(["content-type", contentType]);
  headerEntries.sort(([left], [right]) => left.localeCompare(right));
  const canonicalHeaders = headerEntries.map(([key, value]) => `${key}:${value}\n`).join("");
  const signedHeaders = headerEntries.map(([key]) => key).join(";");
  const canonicalRequest = [method, canonicalUri, queryString, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), config.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const headers: Record<string, string> = {
    Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
  };
  if (contentType) headers["content-type"] = contentType;
  return { url: `https://${config.endpoint}${canonicalUri}${queryString ? `?${queryString}` : ""}`, headers } satisfies SignedRequest;
}

function requireConfig() {
  const config = resolveObsConfig();
  if (!config) throw new Error("OBS 未启用（缺少 OBS_ACCESS_KEY_ID / OBS_SECRET_ACCESS_KEY）");
  return config;
}

async function requestWithRetry(config: ObsConfig, build: () => SignedRequest, init: RequestInit = {}, attempts = 3) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { url, headers } = build();
    try {
      const response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(config.timeoutMs) });
      if (response.status >= 500 && attempt < attempts) {
        lastError = new Error(`OBS 返回 ${response.status}`);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OBS 请求失败");
}

/** 上传（<=200MB 用单次 PUT；更大走分片由调用方决定，这里不做静默降级）。 */
export async function obsPutObject(objectKey: string, body: Buffer, contentType: string, metadata: Record<string, string> = {}) {
  const config = requireConfig();
  const response = await requestWithRetry(
    config,
    () => signRequest(config, "PUT", objectKey, {}, body, contentType),
    { method: "PUT", body: new Uint8Array(body) },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OBS 上传失败（${response.status}）${detail.slice(0, 200)}`);
  }
  return { key: objectKey, size: body.length, contentType, metadata };
}

export async function obsGetObject(objectKey: string) {
  const config = requireConfig();
  const response = await requestWithRetry(config, () => signRequest(config, "GET", objectKey, {}, Buffer.alloc(0)));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`OBS 下载失败（${response.status}）`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, contentType: response.headers.get("content-type") ?? "application/octet-stream" };
}

export async function obsDeleteObject(objectKey: string) {
  const config = requireConfig();
  const response = await requestWithRetry(config, () => signRequest(config, "DELETE", objectKey, {}, Buffer.alloc(0)), { method: "DELETE" });
  // OBS 删除不存在的对象也返回 204，这里把 404 一并当成功
  if (!response.ok && response.status !== 404) throw new Error(`OBS 删除失败（${response.status}）`);
}

export type ObsObjectEntry = { key: string; size: number; lastModified: string };
export type ObsFolderEntry = { prefix: string };

/** 列目录：返回当前前缀下的子目录与文件（单页最多 1000 条）。 */
export async function obsListObjects(options: { prefix: string; delimiter?: string; continuationToken?: string; maxKeys?: number }) {
  const config = requireConfig();
  const query: Record<string, string> = { "list-type": "2", "max-keys": String(options.maxKeys ?? 200) };
  if (options.prefix) query.prefix = options.prefix;
  if (options.delimiter) query.delimiter = options.delimiter;
  if (options.continuationToken) query["continuation-token"] = options.continuationToken;
  const response = await requestWithRetry(config, () => signRequest(config, "GET", "", query, Buffer.alloc(0)));
  if (!response.ok) throw new Error(`OBS 列目录失败（${response.status}）`);
  const xml = await response.text();
  const readAll = (tag: string) => [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, "g"))].map((match) => match[1]);
  const keys = readAll("Key");
  const sizes = readAll("Size").map(Number);
  const dates = readAll("LastModified");
  const folders = [...xml.matchAll(/<CommonPrefixes>\s*<Prefix>([^<]*)<\/Prefix>/g)].map((match) => match[1]);
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const nextToken = xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/)?.[1];
  return {
    folders: folders.map<ObsFolderEntry>((prefix) => ({ prefix })),
    objects: keys.map<ObsObjectEntry>((key, index) => ({ key, size: sizes[index] ?? 0, lastModified: dates[index] ?? "" })),
    truncated,
    nextContinuationToken: truncated ? nextToken : undefined,
  };
}

export async function obsObjectExists(objectKey: string) {
  const config = requireConfig();
  const response = await requestWithRetry(config, () => signRequest(config, "HEAD", objectKey, {}, Buffer.alloc(0)), { method: "HEAD" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`OBS 检查对象失败（${response.status}）`);
  return { size: Number(response.headers.get("content-length") ?? 0), contentType: response.headers.get("content-type") ?? "" };
}
