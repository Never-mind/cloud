import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { executeRaw, getDb, queryRowsRaw, type Row } from "./db";

const SYNC_RUN_TABLE = "merge_power_material_sync_runs";
const SYNC_LOCK_NAME = "suanli-material-instance-model-sync";
const DEFAULT_MATERIAL_API_BASE_URL = "http://192.168.2.27:1337";
const DEFAULT_PAGE_SIZE = 100;
const MAX_ERROR_DETAILS = 100;
const MATERIAL_FIELDS = [
  "name",
  "material_type",
  "customer_part_no",
  "customer_item_code",
  "model",
  "material_code",
  "name_zh",
  "modified",
];

const INSTANCE_MODEL_TYPES = ["Equipment", "Component", "Material"] as const;
type InstanceModelType = (typeof INSTANCE_MODEL_TYPES)[number];
/** Equipment 的本地建档键必须是 06/99 开头的 Customer Part No. */
const EQUIPMENT_PART_NO_PREFIXES = ["06", "99"] as const;

export type RemoteMaterial = {
  name: string;
  materialType: string;
  customerPartNo: string;
  customerItemCode: string;
  model: string;
  materialCode: string;
  nameZh: string;
};

export type MaterialSyncBlockReason = "unsupported-type" | "missing-part-no" | "invalid-part-no" | "missing-item-code";

export type MaterialSyncTarget =
  | { ok: true; instanceType: InstanceModelType; deviceCode: string; alternateCode: string }
  | { ok: false; reason: MaterialSyncBlockReason; instanceType: InstanceModelType | null };

export type MaterialSyncTrigger = "manual" | "scheduled" | "script";

export type MaterialSyncSummary = {
  runId: string;
  triggerType: MaterialSyncTrigger;
  status: "success" | "failed";
  fetched: number;
  matchedByCustomerPartNo: number;
  skippedByCustomerItemCode: number;
  skippedInvalid: number;
  skippedDuplicateRemote: number;
  created: number;
  createdEquipment: number;
  createdComponent: number;
  createdMaterial: number;
  blockedByPartNo: number;
  skippedUnsupportedType: number;
  dryRun: boolean;
  missingNameZh: number;
  missingMaterialCode: number;
  errors: number;
  errorDetails: Array<{ sourceName: string; customerItemCode: string; error: string }>;
  startedAt: string;
  finishedAt: string | null;
};

type SyncRunRow = Row & {
  syncRunId: string;
  triggerType: MaterialSyncTrigger;
  status: string;
  fetchedCount: number;
  matchedCount: number;
  skippedExistingItemCount: number;
  skippedInvalidCount: number;
  skippedDuplicateCount: number;
  createdCount: number;
  createdEquipmentCount: number;
  createdComponentCount: number;
  createdMaterialCount: number;
  blockedByPartNoCount: number;
  skippedTypeCount: number;
  dryRun: number;
  missingNameZhCount: number;
  missingMaterialCodeCount: number;
  errorCount: number;
  errorJson: string | null;
  startedAt: string;
  finishedAt: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCode(value: unknown) {
  return clean(value).toLocaleLowerCase();
}

function normalizeInstanceModelType(value: unknown): InstanceModelType | null {
  const normalized = clean(value).toLocaleLowerCase();
  return INSTANCE_MODEL_TYPES.find((type) => type.toLocaleLowerCase() === normalized) ?? null;
}

/** Equipment 的 Customer Part No. 必须以 06 或 99 开头。 */
export function isEquipmentPartNo(value: unknown) {
  const partNo = clean(value);
  return EQUIPMENT_PART_NO_PREFIXES.some((prefix) => partNo.startsWith(prefix));
}

/**
 * 按远端 material_type 决定本地建档键：
 * - Equipment：deviceCode 取 Customer Part No.（06/99 开头，否则整条阻断）
 * - Component / Material：deviceCode 取 Customer Item Code（SL 编码）
 * alternateCode 是另一个编码，用于兼容老逻辑按另一个键建的存量档案，避免重复建档。
 */
export function resolveMaterialSyncTarget(
  material: Pick<RemoteMaterial, "materialType" | "customerPartNo" | "customerItemCode">,
): MaterialSyncTarget {
  const instanceType = normalizeInstanceModelType(material.materialType);
  if (!instanceType) return { ok: false, reason: "unsupported-type", instanceType: null };
  const partNo = clean(material.customerPartNo);
  const itemCode = clean(material.customerItemCode);
  if (instanceType === "Equipment") {
    if (!partNo) return { ok: false, reason: "missing-part-no", instanceType };
    if (!isEquipmentPartNo(partNo)) return { ok: false, reason: "invalid-part-no", instanceType };
    return { ok: true, instanceType, deviceCode: partNo, alternateCode: itemCode };
  }
  if (!itemCode) return { ok: false, reason: "missing-item-code", instanceType };
  return { ok: true, instanceType, deviceCode: itemCode, alternateCode: partNo };
}

/** 阻断原因对应的用户提示，需明确说明「远端维护后才能在本地建档」。 */
export function materialSyncBlockMessage(material: RemoteMaterial, reason: MaterialSyncBlockReason) {
  if (reason === "missing-part-no") {
    return "类型为 Equipment 但 Customer Part No. 为空，需在远端维护为 06 或 99 开头的编码后才能同步到本地";
  }
  if (reason === "invalid-part-no") {
    return `类型为 Equipment 但 Customer Part No.「${clean(material.customerPartNo)}」不是 06 或 99 开头，需在远端维护为该类型编码后才能同步到本地`;
  }
  if (reason === "missing-item-code") {
    return "Customer Item Code 为空，无法按 SL 编码建档，需在远端维护后才能同步到本地";
  }
  return `远端 material_type「${clean(material.materialType)}」不是 Equipment/Component/Material，无法确定本地建档编码`;
}

function createdCounterKey(instanceType: InstanceModelType) {
  return instanceType === "Equipment"
    ? ("createdEquipmentCount" as const)
    : instanceType === "Component"
      ? ("createdComponentCount" as const)
      : ("createdMaterialCount" as const);
}

function getConfig() {
  const token = clean(process.env.MATERIAL_API_TOKEN);
  if (!token) throw new Error("未配置 MATERIAL_API_TOKEN，无法读取远端 Material 数据");

  const configuredPageSize = Number(process.env.MATERIAL_SYNC_PAGE_SIZE ?? DEFAULT_PAGE_SIZE);
  const pageSize = Number.isFinite(configuredPageSize)
    ? Math.min(Math.max(Math.floor(configuredPageSize), 1), 1000)
    : DEFAULT_PAGE_SIZE;
  const baseUrl = clean(process.env.MATERIAL_API_BASE_URL || DEFAULT_MATERIAL_API_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = Number(process.env.MATERIAL_SYNC_TIMEOUT_MS ?? 30_000);

  return {
    baseUrl,
    token,
    pageSize,
    timeoutMs: Number.isFinite(timeoutMs) ? Math.min(Math.max(timeoutMs, 1_000), 120_000) : 30_000,
  };
}

async function fetchMaterials(): Promise<RemoteMaterial[]> {
  const config = getConfig();
  const rows: RemoteMaterial[] = [];
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      fields: JSON.stringify(MATERIAL_FIELDS),
      limit_start: String(offset),
      limit_page_length: String(config.pageSize),
      order_by: "modified asc,name asc",
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}/api/resource/Material?${params.toString()}`, {
        headers: { Authorization: `token ${config.token}`, Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      throw new Error(`读取远端 Material 失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timeout);
    }

    const payload = (await response.json().catch(() => ({}))) as { data?: unknown; exc_type?: string; exception?: string };
    if (!response.ok) {
      const detail = clean(payload.exception || payload.exc_type);
      throw new Error(`读取远端 Material 失败（HTTP ${response.status}${detail ? `：${detail}` : ""}）`);
    }
    if (!Array.isArray(payload.data)) throw new Error("远端 Material 返回格式无效：缺少 data 数组");

    const page = payload.data as Array<Record<string, unknown>>;
    rows.push(
      ...page.map((row) => ({
        name: clean(row.name),
        materialType: clean(row.material_type),
        customerPartNo: clean(row.customer_part_no),
        customerItemCode: clean(row.customer_item_code),
        model: clean(row.model),
        materialCode: clean(row.material_code),
        nameZh: clean(row.name_zh),
      })),
    );
    if (page.length < config.pageSize) break;
    offset += config.pageSize;
  }

  return rows;
}

function toSummary(row: SyncRunRow): MaterialSyncSummary {
  let errorDetails: MaterialSyncSummary["errorDetails"] = [];
  if (row.errorJson) {
    try {
      const parsed = JSON.parse(row.errorJson);
      if (Array.isArray(parsed)) errorDetails = parsed as MaterialSyncSummary["errorDetails"];
    } catch {
      errorDetails = [];
    }
  }
  return {
    runId: row.syncRunId,
    triggerType: row.triggerType,
    status: row.status === "success" ? "success" : "failed",
    fetched: Number(row.fetchedCount ?? 0),
    matchedByCustomerPartNo: Number(row.matchedCount ?? 0),
    skippedByCustomerItemCode: Number(row.skippedExistingItemCount ?? 0),
    skippedInvalid: Number(row.skippedInvalidCount ?? 0),
    skippedDuplicateRemote: Number(row.skippedDuplicateCount ?? 0),
    created: Number(row.createdCount ?? 0),
    createdEquipment: Number(row.createdEquipmentCount ?? 0),
    createdComponent: Number(row.createdComponentCount ?? 0),
    createdMaterial: Number(row.createdMaterialCount ?? 0),
    blockedByPartNo: Number(row.blockedByPartNoCount ?? 0),
    skippedUnsupportedType: Number(row.skippedTypeCount ?? 0),
    dryRun: Number(row.dryRun ?? 0) === 1,
    missingNameZh: Number(row.missingNameZhCount ?? 0),
    missingMaterialCode: Number(row.missingMaterialCodeCount ?? 0),
    errors: Number(row.errorCount ?? 0),
    errorDetails,
    startedAt: String(row.startedAt ?? ""),
    finishedAt: row.finishedAt ? String(row.finishedAt) : null,
  };
}

async function updateRun(runId: string, values: Record<string, unknown>) {
  const assignments = Object.keys(values).map((key) => `\`${key}\` = :${key}`).join(", ");
  await executeRaw(
    `UPDATE ${SYNC_RUN_TABLE} SET ${assignments}, updatedAt = CURRENT_TIMESTAMP WHERE syncRunId = :runId`,
    { ...values, runId },
  );
}

export async function getLatestMaterialSyncRun() {
  const rows = await queryRowsRaw<SyncRunRow>(
    `SELECT * FROM ${SYNC_RUN_TABLE} ORDER BY startedAt DESC, syncRunId DESC LIMIT 1`,
  );
  return rows[0] ? toSummary(rows[0]) : null;
}

export async function runMaterialSync({ triggerType = "manual", dryRun = false }: { triggerType?: MaterialSyncTrigger; dryRun?: boolean } = {}) {
  const runId = `MATERIAL-SYNC-${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${randomUUID().slice(0, 8)}`;
  const startedAt = new Date().toISOString();
  const connection = await getDb().getConnection();
  let lockAcquired = false;
  const errors: MaterialSyncSummary["errorDetails"] = [];
  const counts = {
    fetchedCount: 0,
    matchedCount: 0,
    skippedExistingItemCount: 0,
    skippedInvalidCount: 0,
    skippedDuplicateCount: 0,
    createdCount: 0,
    createdEquipmentCount: 0,
    createdComponentCount: 0,
    createdMaterialCount: 0,
    blockedByPartNoCount: 0,
    skippedTypeCount: 0,
    dryRun: dryRun ? 1 : 0,
    missingNameZhCount: 0,
    missingMaterialCodeCount: 0,
    errorCount: 0,
  };

  try {
    const [lockRows] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK(?, 0) AS acquired", [SYNC_LOCK_NAME]);
    lockAcquired = Number(lockRows[0]?.acquired ?? 0) === 1;
    if (!lockAcquired) throw new Error("已有 Material 同步任务正在执行，请稍后再试");

    await connection.execute(
      `INSERT INTO ${SYNC_RUN_TABLE} (syncRunId, triggerType, status, dryRun, startedAt) VALUES (?, ?, 'running', ?, CURRENT_TIMESTAMP)`,
      [runId, triggerType, dryRun ? 1 : 0],
    );

    const materials = await fetchMaterials();
    counts.fetchedCount = materials.length;
    const [localRows] = await connection.query<RowDataPacket[]>("SELECT deviceCode FROM merge_power_instancemodels");
    const localCodes = new Set(localRows.map((row) => normalizeCode(row.deviceCode)).filter(Boolean));
    const remoteCandidateCodes = new Set<string>();

    for (const material of materials) {
      const partCode = normalizeCode(material.customerPartNo);
      const itemCode = normalizeCode(material.customerItemCode);
      // 双键匹配：存量档案可能是老逻辑按 customer_item_code 建的，新规则 Equipment 按
      // customer_part_no 建档，任一命中都视为已存在，避免同一物料重复建档。
      if (partCode && localCodes.has(partCode)) {
        counts.matchedCount += 1;
        continue;
      }
      if (itemCode && localCodes.has(itemCode)) {
        counts.skippedExistingItemCount += 1;
        continue;
      }

      const target = resolveMaterialSyncTarget(material);
      if (!target.ok) {
        if (target.reason === "unsupported-type") counts.skippedTypeCount += 1;
        else if (target.instanceType === "Equipment") counts.blockedByPartNoCount += 1;
        else counts.skippedInvalidCount += 1;
        counts.errorCount += 1;
        if (errors.length < MAX_ERROR_DETAILS) {
          errors.push({
            sourceName: material.name,
            customerItemCode: material.customerItemCode,
            error: materialSyncBlockMessage(material, target.reason),
          });
        }
        continue;
      }
      if (!material.model) {
        counts.skippedInvalidCount += 1;
        counts.errorCount += 1;
        if (errors.length < MAX_ERROR_DETAILS) {
          errors.push({ sourceName: material.name, customerItemCode: material.customerItemCode, error: "model 为空" });
        }
        continue;
      }
      const candidateCode = normalizeCode(target.deviceCode);
      if (remoteCandidateCodes.has(candidateCode)) {
        counts.skippedDuplicateCount += 1;
        continue;
      }
      remoteCandidateCodes.add(candidateCode);
      if (!material.nameZh) counts.missingNameZhCount += 1;
      if (!material.materialCode) counts.missingMaterialCodeCount += 1;

      try {
        if (!dryRun) {
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT IGNORE INTO merge_power_instancemodels
              (deviceCode, modelCode, instanceType, xxllCode, nameZh, nameEn)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [target.deviceCode, material.model, target.instanceType, material.materialCode || null, material.nameZh || null, material.model],
          );
          if (result.affectedRows === 0) {
            counts.skippedExistingItemCount += 1;
            continue;
          }
        }
        counts.createdCount += 1;
        counts[createdCounterKey(target.instanceType)] += 1;
        localCodes.add(candidateCode);
      } catch (error) {
        counts.errorCount += 1;
        if (errors.length < MAX_ERROR_DETAILS) {
          errors.push({
            sourceName: material.name,
            customerItemCode: material.customerItemCode,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    await updateRun(runId, { ...counts, errorJson: JSON.stringify(errors), status: "success", finishedAt: new Date() });
    return {
      runId,
      triggerType,
      status: "success" as const,
      fetched: counts.fetchedCount,
      matchedByCustomerPartNo: counts.matchedCount,
      skippedByCustomerItemCode: counts.skippedExistingItemCount,
      skippedInvalid: counts.skippedInvalidCount,
      skippedDuplicateRemote: counts.skippedDuplicateCount,
      created: counts.createdCount,
      createdEquipment: counts.createdEquipmentCount,
      createdComponent: counts.createdComponentCount,
      createdMaterial: counts.createdMaterialCount,
      blockedByPartNo: counts.blockedByPartNoCount,
      skippedUnsupportedType: counts.skippedTypeCount,
      dryRun,
      missingNameZh: counts.missingNameZhCount,
      missingMaterialCode: counts.missingMaterialCodeCount,
      errors: counts.errorCount,
      errorDetails: errors,
      startedAt,
      finishedAt: new Date().toISOString(),
    } satisfies MaterialSyncSummary;
  } catch (error) {
    if (lockAcquired) {
      try {
        await updateRun(runId, { ...counts, errorJson: JSON.stringify([{ sourceName: "", customerItemCode: "", error: error instanceof Error ? error.message : String(error) }]), status: "failed", errorCount: counts.errorCount + 1, finishedAt: new Date() });
      } catch {
        // Preserve the original sync error if the run record cannot be updated.
      }
    }
    throw error;
  } finally {
    if (lockAcquired) await connection.query("SELECT RELEASE_LOCK(?)", [SYNC_LOCK_NAME]);
    connection.release();
  }
}
