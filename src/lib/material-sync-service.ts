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
  "customer_part_no",
  "customer_item_code",
  "model",
  "material_code",
  "name_zh",
  "modified",
];

type RemoteMaterial = {
  name: string;
  customerPartNo: string;
  customerItemCode: string;
  model: string;
  materialCode: string;
  nameZh: string;
};

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

export async function runMaterialSync({ triggerType = "manual" }: { triggerType?: MaterialSyncTrigger } = {}) {
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
    missingNameZhCount: 0,
    missingMaterialCodeCount: 0,
    errorCount: 0,
  };

  try {
    const [lockRows] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK(?, 0) AS acquired", [SYNC_LOCK_NAME]);
    lockAcquired = Number(lockRows[0]?.acquired ?? 0) === 1;
    if (!lockAcquired) throw new Error("已有 Material 同步任务正在执行，请稍后再试");

    await connection.execute(
      `INSERT INTO ${SYNC_RUN_TABLE} (syncRunId, triggerType, status, startedAt) VALUES (?, ?, 'running', CURRENT_TIMESTAMP)`,
      [runId, triggerType],
    );

    const materials = await fetchMaterials();
    counts.fetchedCount = materials.length;
    const [localRows] = await connection.query<RowDataPacket[]>("SELECT deviceCode FROM merge_power_instancemodels");
    const localCodes = new Set(localRows.map((row) => normalizeCode(row.deviceCode)).filter(Boolean));
    const remoteCandidateCodes = new Set<string>();

    for (const material of materials) {
      const partCode = normalizeCode(material.customerPartNo);
      const itemCode = normalizeCode(material.customerItemCode);
      if (partCode && localCodes.has(partCode)) {
        counts.matchedCount += 1;
        continue;
      }
      if (itemCode && localCodes.has(itemCode)) {
        counts.skippedExistingItemCount += 1;
        continue;
      }
      if (!itemCode || !material.model) {
        counts.skippedInvalidCount += 1;
        counts.errorCount += 1;
        if (errors.length < MAX_ERROR_DETAILS) {
          errors.push({
            sourceName: material.name,
            customerItemCode: material.customerItemCode,
            error: !itemCode ? "customer_item_code 为空" : "model 为空",
          });
        }
        continue;
      }
      if (remoteCandidateCodes.has(itemCode)) {
        counts.skippedDuplicateCount += 1;
        continue;
      }
      remoteCandidateCodes.add(itemCode);
      if (!material.nameZh) counts.missingNameZhCount += 1;
      if (!material.materialCode) counts.missingMaterialCodeCount += 1;

      try {
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT IGNORE INTO merge_power_instancemodels
            (deviceCode, modelCode, instanceType, xxllCode, nameZh, nameEn)
           VALUES (?, ?, 'Material', ?, ?, ?)`,
          [material.customerItemCode, material.model, material.materialCode || null, material.nameZh || null, material.model],
        );
        if (result.affectedRows > 0) {
          counts.createdCount += 1;
          localCodes.add(itemCode);
        } else {
          counts.skippedExistingItemCount += 1;
        }
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
