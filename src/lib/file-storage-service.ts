import { obsDeleteObject, obsGetObject, obsPutObject } from "./obs-client";
import { isObsEnabled, resolveObsConfig } from "./obs-config";
import { queryRowsRaw, type Row } from "./db";

/**
 * 文件存储的统一入口：数据库只留索引，文件内容放 OBS。
 *
 * 目录规范（对象键前缀固定为配置的 OBS_PREFIX，默认 Cloud）：
 *   Cloud/算力/<国家码>/<需求单号>/
 *   Cloud/集采/<项目名-编号>/
 *   Cloud/华为云/<客户简称>/<YYYYMM>/
 *   Cloud/公共/<档案类型>/<档案简称>/
 *   Cloud/文档库/<文件夹路径>/
 *   Cloud/发票/<YYYYMM>/
 * 发票类文件统一加 `Inv_` 前缀；同名文件末尾追附件 ID 避免互相覆盖。
 */

export type StorageSystem = "power" | "po" | "cloud" | "common" | "docs" | "invoice";

export type StorageContext = {
  system: StorageSystem;
  /** 算力：国家码（BR/MX/CL…） */
  country?: string;
  /** 算力：需求单号 */
  requestNo?: string;
  /** 集采：项目名-编号 */
  project?: string;
  /** 华为云：客户简称 */
  customer?: string;
  /** 华为云：账期 YYYYMM */
  period?: string;
  /** 公共：档案类型/名称（如 客户/Hengshan） */
  partyLabel?: string;
  /** 文档库：文件夹路径 */
  folderPath?: string;
  /** 发票：票号（单号只用于命名，目录按年月归档） */
  invoiceNo?: string;
};

const SYSTEM_FOLDERS: Record<StorageSystem, string> = {
  power: "算力",
  po: "集采",
  cloud: "华为云",
  common: "公共",
  docs: "文档库",
  invoice: "发票",
};

const UNSORTED = "未分类";

/** 路径片段清洗：去掉分隔符与控制字符，压缩空白，保留中文。 */
export function sanitizeStorageSegment(value: unknown, fallback = UNSORTED) {
  const cleaned = String(value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+$/, "_");
  return (cleaned || fallback).slice(0, 80);
}

/** 文件名清洗 + 发票 Inv 前缀 + 唯一后缀。 */
export function buildStorageFileName(fileName: unknown, attachmentId: string, isInvoice = false) {
  const raw = String(fileName ?? "").trim() || "file";
  const dotIndex = raw.lastIndexOf(".");
  const base = sanitizeStorageSegment(dotIndex > 0 ? raw.slice(0, dotIndex) : raw, "file");
  const extension = dotIndex > 0 ? sanitizeStorageSegment(raw.slice(dotIndex + 1), "").replace(/\./g, "") : "";
  const withPrefix = isInvoice && !/^inv[_\-\s]/i.test(base) ? `Inv_${base}` : base;
  const suffix = attachmentId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) || "0";
  return `${withPrefix}__${suffix}${extension ? `.${extension}` : ""}`;
}

/** 目录前缀（以 / 结尾）。 */
export function buildStoragePrefix(context: StorageContext, prefix = resolveObsConfig()?.prefix ?? "Cloud") {
  const segments: string[] = [prefix.replace(/^\/+|\/+$/g, "") || "Cloud", SYSTEM_FOLDERS[context.system]];
  switch (context.system) {
    case "power":
      segments.push(sanitizeStorageSegment(context.country), sanitizeStorageSegment(context.requestNo));
      break;
    case "po":
      segments.push(sanitizeStorageSegment(context.project));
      break;
    case "cloud":
      segments.push(sanitizeStorageSegment(context.customer), sanitizeStorageSegment(context.period));
      break;
    case "common":
      segments.push(sanitizeStorageSegment(context.partyLabel));
      break;
    case "docs":
      if (context.folderPath) segments.push(...context.folderPath.split("/").filter(Boolean).map((part) => sanitizeStorageSegment(part)));
      break;
    case "invoice":
      segments.push(sanitizeStorageSegment(context.period, "未分账期"));
      break;
  }
  return `${segments.join("/")}/`;
}

export function buildStorageKey(context: StorageContext, fileName: unknown, attachmentId: string, isInvoice = false) {
  return `${buildStoragePrefix(context)}${buildStorageFileName(fileName, attachmentId, isInvoice)}`;
}

export type StoredFileInput = {
  context: StorageContext;
  attachmentId: string;
  fileName: string;
  fileType: string;
  bytes: Buffer;
  isInvoice?: boolean;
};

export type StoredFileResult = {
  provider: "db" | "obs";
  storageKey: string | null;
  /** 展示用的文件名（发票会带 Inv_ 前缀）。 */
  fileName: string;
};

/**
 * 保存文件：OBS 启用就上传对象，返回对象键；否则返回 provider='db'，
 * 由调用方继续按老办法把 base64 存进数据库（双轨兼容，便于灰度与回滚）。
 */
export async function storeFile(input: StoredFileInput): Promise<StoredFileResult> {
  const displayName = buildStorageFileName(input.fileName, input.attachmentId, input.isInvoice);
  if (!isObsEnabled()) return { provider: "db", storageKey: null, fileName: input.fileName };
  const key = `${buildStoragePrefix(input.context)}${displayName}`;
  await obsPutObject(key, input.bytes, input.fileType || "application/octet-stream");
  return { provider: "obs", storageKey: key, fileName: displayName };
}

export type StoredFileRecord = {
  dataUrl?: unknown;
  storageProvider?: unknown;
  storageKey?: unknown;
  fileType?: unknown;
  fileName?: unknown;
};

/** 读文件：优先按索引里的 provider 取，老的（db）走 base64 解出来。 */
export async function readFile(record: StoredFileRecord) {
  const provider = String(record.storageProvider ?? "db");
  const storageKey = String(record.storageKey ?? "").trim();
  if (provider === "obs" && storageKey) {
    const object = await obsGetObject(storageKey);
    if (!object) return null;
    return { bytes: object.bytes, contentType: object.contentType || String(record.fileType ?? "application/octet-stream") };
  }
  const dataUrl = String(record.dataUrl ?? "");
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:([^;,]+)?;base64,([\s\S]*)$/);
  return {
    bytes: match ? Buffer.from(match[2], "base64") : Buffer.from(dataUrl, "utf8"),
    contentType: String(record.fileType ?? match?.[1] ?? "application/octet-stream"),
  };
}

const ATTACHMENT_TABLES = ["merge_cloud_attachments", "merge_common_attachments", "merge_po_settlement_attachments", "merge_common_document_files"];

/**
 * 删文件：OBS 对象删失败只记日志（避免因为远端问题删不掉索引）。
 *
 * 同一份对象可能被多条索引引用（例如发票 PDF 同时挂在对账行的开票附件下），
 * 所以删之前先看还有没有别的索引在用这个对象键，有就只删索引、不删对象。
 */
export async function deleteFileObject(record: StoredFileRecord) {
  if (String(record.storageProvider ?? "db") !== "obs") return;
  const storageKey = String(record.storageKey ?? "").trim();
  if (!storageKey) return;
  try {
    for (const table of ATTACHMENT_TABLES) {
      const rows = await queryRowsRaw<{ count: number }>(
        `SELECT COUNT(*) AS count FROM \`${table}\` WHERE storageKey = :storageKey`,
        { storageKey },
      );
      if (Number(rows[0]?.count ?? 0) > 1) return;
    }
  } catch {
    // 引用检查失败时按"可能还有引用"处理，宁可不删对象也不误删
    return;
  }
  try {
    await obsDeleteObject(storageKey);
  } catch (error) {
    console.error(`[file-storage] 删除 OBS 对象失败 ${storageKey}:`, error instanceof Error ? error.message : error);
  }
}

/* --------------------------------------------------------------------------
 * 目录归属解析：按业务单据算出"这个附件应该放到哪个文件夹"。
 * 解析不到就回落到「未分类」，不影响上传。
 * ------------------------------------------------------------------------ */

const CLOUD_ROW_OWNER_TYPES = new Set(["reconciliation", "collection", "invoice", "supplier_payment"]);
const PARTY_OWNER_LABELS: Record<string, { table: string; idColumn: string; label: string; nameColumns: string[] }> = {
  customers: { table: "merge_common_customers", idColumn: "customerId", label: "客户", nameColumns: ["shortName", "nameCn", "name", "customerCode"] },
  suppliers: { table: "merge_common_suppliers", idColumn: "supplierId", label: "供应商", nameColumns: ["shortName", "nameCn", "nameEn", "supplierCode"] },
  "undertaking-units": { table: "merge_common_undertaking_units", idColumn: "undertakingUnitId", label: "承接单位", nameColumns: ["shortName", "entityName", "name", "undertakingUnitCode"] },
};

async function resolveCustomerName(reference: string) {
  if (!reference) return "";
  const rows = await queryRowsRaw<Row>(
    `SELECT COALESCE(NULLIF(shortName, ''), NULLIF(nameCn, ''), NULLIF(name, ''), customerCode) AS name
       FROM merge_common_customers WHERE customerId = :reference OR customerCode = :reference LIMIT 1`,
    { reference },
  );
  return String(rows[0]?.name ?? "").trim();
}

/** 华为云附件：按「客户 / 账期」归档（对账单、实收、开票、供应商付款、CRM 发票通用）。 */
export async function resolveCloudAttachmentContext(ownerType: string, ownerId: string): Promise<StorageContext> {
  if (ownerType === "crm_invoice") {
    const rows = await queryRowsRaw<Row>(
      "SELECT customerName, customerId, belongMonth FROM merge_cloud_crm_invoices WHERE id = :ownerId LIMIT 1",
      { ownerId },
    );
    const row = rows[0];
    return {
      system: "cloud",
      customer: String(row?.customerName ?? "").trim() || (await resolveCustomerName(String(row?.customerId ?? ""))) || "未匹配客户",
      period: String(row?.belongMonth ?? "").replace(/[^0-9]/g, ""),
    };
  }
  if (CLOUD_ROW_OWNER_TYPES.has(ownerType)) {
    const rows = await queryRowsRaw<Row>(
      "SELECT period, customer, customerId FROM merge_cloud_rows WHERE id = :ownerId LIMIT 1",
      { ownerId },
    );
    const row = rows[0];
    const customer = (await resolveCustomerName(String(row?.customerId ?? ""))) || String(row?.customer ?? "").trim();
    return { system: "cloud", customer: customer || "未匹配客户", period: String(row?.period ?? "").trim() };
  }
  return { system: "cloud" };
}

/** 公共档案附件（客户/供应商/承接单位）。 */
export async function resolveCommonAttachmentContext(ownerType: string, ownerId: string): Promise<StorageContext> {
  const config = PARTY_OWNER_LABELS[ownerType];
  if (!config) return { system: "common", partyLabel: ownerType };
  const nameExpression = `COALESCE(${config.nameColumns.map((column) => `NULLIF(${column}, '')`).join(", ")})`;
  const rows = await queryRowsRaw<Row>(
    `SELECT ${nameExpression} AS name FROM ${config.table} WHERE ${config.idColumn} = :ownerId LIMIT 1`,
    { ownerId },
  );
  const name = String(rows[0]?.name ?? "").trim() || ownerId;
  return { system: "common", partyLabel: `${config.label}/${name}` };
}

/** 集采附件：按项目归档。 */
export async function resolveSettlementContext(projectId: string): Promise<StorageContext> {
  const rows = await queryRowsRaw<Row>(
    "SELECT projectName, projectNo FROM merge_po_settlement_projects WHERE id = :projectId LIMIT 1",
    { projectId },
  );
  const name = String(rows[0]?.projectName ?? "").trim();
  const no = String(rows[0]?.projectNo ?? "").trim();
  return { system: "po", project: name && no ? `${name}-${no}` : name || no || "未分类项目" };
}

/** 文档库附件：按文件夹路径归档。 */
export async function resolveDocumentContext(folderId: string): Promise<StorageContext> {
  const names: string[] = [];
  let current = folderId;
  for (let depth = 0; depth < 10 && current; depth += 1) {
    const rows = await queryRowsRaw<Row>(
      "SELECT name, parentId FROM merge_common_document_folders WHERE folderId = :folderId LIMIT 1",
      { folderId: current },
    );
    const row = rows[0];
    if (!row) break;
    names.unshift(String(row.name ?? "").trim() || current);
    current = String(row.parentId ?? "");
  }
  return { system: "docs", folderPath: names.slice(1).join("/") || "根目录" };
}
