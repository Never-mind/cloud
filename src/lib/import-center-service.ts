import { randomUUID } from "crypto";
import { execute, queryRows, type Row } from "./db";
import {
  buildImportPreview,
  getImportTarget,
  type ImportPreview,
  type ImportStrategy,
  type ImportTargetKey,
} from "./import-center";
import { DEFAULT_PAGE_SIZE, normalizePageSize } from "./pagination";
import { assertPrepaymentInstanceOwnership } from "./prepayment-service";
import { synchronizeConfirmedPurchaseOrderShipments } from "./procurement-service";
import type { PartyReferenceRow } from "./party-reference";

type ImportJobRow = Row & {
  jobId: string;
  targetKey: ImportTargetKey;
  targetTitle: string;
  fileName: string | null;
  status: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  masterCount: number;
  detailCount: number;
  previewJson: string;
  reportJson: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
};

const EXECUTION_PLAN: Array<{
  key: keyof ImportPreview["operations"];
  table: string;
  primaryKey: string;
  fields: string[];
}> = [
  {
    key: "requests",
    table: "requests",
    primaryKey: "requestNo",
    fields: ["requestNo", "countryCode", "contractNo", "batchName", "requestType", "status", "plannedDeliveryDate"],
  },
  {
    key: "requestItems",
    table: "requestitems",
    primaryKey: "id",
    fields: ["id", "requestNo", "requestType", "deviceCode", "supplierId", "undertakingUnitId", "customerId", "requestedAt", "quantity"],
  },
  {
    key: "purchaseOrders",
    table: "purchaseorders",
    primaryKey: "purchaseOrderId",
    fields: ["purchaseOrderId", "poNo", "requestNo", "sourceRequestNos", "status", "currency", "usdRate", "paymentDate", "releasedAt"],
  },
  {
    key: "purchaseOrderItems",
    table: "purchaseorderitems",
    primaryKey: "id",
    fields: ["id", "purchaseOrderId", "poNo", "requestNo", "requestItemId", "requestType", "taxExcludedUnitPrice", "taxSurcharge", "unitPrice", "hardwareCoefficient", "softwareCoefficient", "totalCoefficient"],
  },
  {
    key: "instanceContracts",
    table: "instancecontracts",
    primaryKey: "id",
    fields: ["id", "contractNo", "countryCode", "deviceCode", "modelCode", "instanceModelEn", "currency", "first24MonthPriceUSD", "next36MonthPriceUSD"],
  },
  {
    key: "billingLedgers",
    table: "billinginstanceledgers",
    primaryKey: "ledgerId",
    fields: [
      "ledgerId",
      "purchaseOrderItemId",
      "countryCode",
      "batchName",
      "requestNo",
      "poNo",
      "deviceCode",
      "requestType",
      "modelCode",
      "nameEn",
      "supplierId",
      "undertakingUnitId",
      "quantity",
      "actualCurrency",
      "actualUnitPrice",
      "instanceContractNo",
      "contractCurrency",
      "first24MonthPrice",
      "next36MonthPrice",
      "startMonth",
      "status",
      "confirmedAt",
    ],
  },
  {
    key: "monthlyBillingWriteOffs",
    table: "monthlybillingwriteoffs",
    primaryKey: "id",
    fields: [
      "id",
      "ledgerId",
      "writeOffMonth",
      "monthIndex",
      "stage",
      "countryCode",
      "batchName",
      "requestNo",
      "poNo",
      "deviceCode",
      "requestType",
      "modelCode",
      "nameEn",
      "supplierId",
      "undertakingUnitId",
      "quantity",
      "instanceContractNo",
      "currency",
      "monthlyAmount",
      "monthlyTotalAmount",
      "sourceType",
      "adjustmentNo",
    ],
  },
  {
    key: "prepaymentContracts",
    table: "prepaymentcontracts",
    primaryKey: "contractNo",
    fields: ["contractNo", "status", "currency", "effectiveDate", "totalAmount", "confirmedAt"],
  },
  {
    key: "prepaymentContractItems",
    table: "prepaymentcontractitems",
    primaryKey: "id",
    fields: [
      "id",
      "contractNo",
      "lineType",
      "purchaseOrderItemId",
      "requestItemId",
      "countryCode",
      "batchName",
      "requestNo",
      "poNo",
      "deviceCode",
      "requestType",
      "modelCode",
      "nameEn",
      "supplierId",
      "undertakingUnitId",
      "quantity",
      "actualCurrency",
      "actualUnitPrice",
      "actualTotalAmount",
      "contractCurrency",
      "contractUnitPrice",
      "contractTotalAmount",
      "writeOffStartMonth",
      "feeName",
      "feeDescription",
      "prepaymentAmount",
      "currency",
      "usdRate",
      "paymentDate",
    ],
  },
  {
    key: "monthlyPrepaymentWriteOffs",
    table: "monthlyprepaymentwriteoffs",
    primaryKey: "id",
    fields: [
      "id",
      "contractNo",
      "contractLineId",
      "writeOffMonth",
      "monthIndex",
      "totalMonths",
      "currency",
      "originalAmount",
      "monthlyAmount",
      "lineType",
      "requestType",
      "countryCode",
      "batchName",
      "requestNo",
      "poNo",
      "deviceCode",
      "modelCode",
      "nameEn",
      "quantity",
      "sourceType",
      "adjustmentNo",
    ],
  },
];

export async function createImportPreviewJob({
  targetKey,
  strategy = "overwrite-drafts",
  rows,
  fileName = "",
}: {
  targetKey: ImportTargetKey;
  strategy?: ImportStrategy;
  rows: Row[];
  fileName?: string;
}) {
  const target = getImportTarget(targetKey);
  if (!target) throw new Error("未知导入类型");
  const requestItems =
    targetKey === "purchase-orders"
      ? await queryRows("SELECT id, requestNo, deviceCode, requestType FROM requestitems")
      : [];
  const purchaseOrders =
    targetKey === "purchase-orders"
      ? await queryRows("SELECT purchaseOrderId, poNo FROM purchaseorders")
      : [];
  const instanceModels =
    targetKey === "instance-contracts"
      ? await queryRows("SELECT deviceCode, modelCode, nameEn FROM instancemodels")
      : [];
  const [suppliers, undertakingUnits, customers] = await Promise.all([
    queryRows<PartyReferenceRow>("SELECT supplierId, supplierCode, shortName, nameCn FROM common_suppliers"),
    queryRows<PartyReferenceRow>("SELECT undertakingUnitId, undertakingUnitCode, entityCode, shortName, entityName, name FROM common_undertaking_units"),
    queryRows<PartyReferenceRow>("SELECT customerId, customerCode, shortName, nameCn, name FROM common_customers"),
  ]);
  const billingPurchaseLines =
    targetKey === "billing-ledgers"
      ? await queryRows(`
          SELECT
            poi.id AS purchaseOrderItemId,
            COALESCE(poi.requestNo, ri.requestNo) AS requestNo,
            poi.poNo,
            req.countryCode,
            req.batchName,
            ri.deviceCode,
            COALESCE(NULLIF(poi.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(req.requestType, ''), '整机') AS requestType,
            im.modelCode,
            im.nameEn,
            ri.supplierId,
            ri.undertakingUnitId,
            ri.quantity,
            po.currency AS actualCurrency,
            poi.unitPrice AS actualUnitPrice
          FROM purchaseorderitems poi
          LEFT JOIN purchaseorders po ON po.purchaseOrderId = poi.purchaseOrderId OR (poi.purchaseOrderId IS NULL AND po.poNo = poi.poNo)
          LEFT JOIN requestitems ri ON ri.id = poi.requestItemId
          LEFT JOIN requests req ON req.requestNo = ri.requestNo
          LEFT JOIN instancemodels im ON im.deviceCode = ri.deviceCode
        `)
      : [];
  const billingInstanceContracts =
    targetKey === "billing-ledgers"
      ? await queryRows(
          "SELECT contractNo, countryCode, deviceCode, currency, first24MonthPriceUSD, next36MonthPriceUSD FROM instancecontracts",
        )
      : [];
  const prepaymentPurchaseLines =
    targetKey === "prepayment-contracts"
      ? await queryRows(`
          SELECT
            poi.id AS purchaseOrderItemId,
            poi.requestItemId,
            COALESCE(poi.requestNo, po.requestNo, ri.requestNo) AS requestNo,
            poi.poNo,
            req.countryCode,
            req.batchName,
            ri.deviceCode,
            COALESCE(NULLIF(poi.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(req.requestType, ''), '整机') AS requestType,
            im.modelCode,
            im.nameEn,
            ri.supplierId,
            ri.undertakingUnitId,
            ri.quantity,
            po.currency AS actualCurrency,
            poi.unitPrice AS actualUnitPrice,
            ROUND(COALESCE(poi.unitPrice, 0) * COALESCE(ri.quantity, 0), 2) AS actualTotalAmount
          FROM purchaseorderitems poi
          LEFT JOIN purchaseorders po ON po.purchaseOrderId = poi.purchaseOrderId OR (poi.purchaseOrderId IS NULL AND po.poNo = poi.poNo)
          LEFT JOIN requestitems ri ON ri.id = poi.requestItemId
          LEFT JOIN requests req ON req.requestNo = COALESCE(poi.requestNo, po.requestNo, ri.requestNo)
          LEFT JOIN instancemodels im ON im.deviceCode = ri.deviceCode
        `)
      : [];
  const preview = buildImportPreview(targetKey, rows, {
    requestItems,
    purchaseOrders,
    instanceModels,
    instanceContracts: billingInstanceContracts,
    billingPurchaseLines,
    prepaymentPurchaseLines,
    partyReferences: { suppliers, undertakingUnits, customers },
  });
  preview.strategy = normalizeImportStrategy(strategy);
  preview.execution = await summarizeExecution(preview, preview.strategy);
  const jobId = `IMP-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8)}`;
  const status = preview.report.failed.length ? "预览有错误" : "待确认";

  await execute(
    `
      INSERT INTO importjobs
        (jobId, targetKey, targetTitle, fileName, status, totalRows, successRows, failedRows,
         masterCount, detailCount, previewJson, reportJson)
      VALUES
        (:jobId, :targetKey, :targetTitle, :fileName, :status, :totalRows, :successRows, :failedRows,
         :masterCount, :detailCount, :previewJson, :reportJson)
    `,
    {
      jobId,
      targetKey,
      targetTitle: target.title,
      fileName,
      status,
      totalRows: preview.report.total,
      successRows: preview.report.success,
      failedRows: preview.report.failed.length,
      masterCount: preview.summary.masterCount,
      detailCount: preview.summary.detailCount,
      previewJson: JSON.stringify(preview),
      reportJson: JSON.stringify(preview.report),
    },
  );

  return { jobId, status, ...preview };
}

export async function confirmImportJob(jobId: string, options: { allowConfirmed?: boolean } = {}) {
  const job = await getImportJob(jobId);
  if (!job) throw new Error("导入任务不存在");
  if (job.status === "已导入") return job;

  const preview = JSON.parse(String(job.previewJson)) as ImportPreview;
  if (preview.report.failed.length) {
    await updateImportJobStatus(jobId, "预览有错误");
    throw new Error("当前导入预览仍有错误，请先修正后重新上传");
  }

  const failed: Array<{ rowNumber: number; primaryKey: string; error: string }> = [];
  let success = 0;
  let skipped = 0;
  const synchronizedPurchaseOrderIds = new Set<string>();
  const strategy = normalizeImportStrategy(preview.strategy);
  if (strategy === "overwrite-all" && !options.allowConfirmed) {
    throw new Error("覆盖已确认数据需要再次确认");
  }
  if (preview.targetKey === "prepayment-contracts") {
    await assertPrepaymentInstanceOwnership(preview.operations.prepaymentContractItems as any);
  }

  for (const plan of EXECUTION_PLAN) {
    for (const row of preview.operations[plan.key]) {
      try {
        const existing = await findExistingRow(plan, row);
        const action = resolveExecutionAction(existing, strategy);
        if (action === "skip") {
          skipped += 1;
          continue;
        }
        if (existing) await updateRow(plan, existing, row);
        else await insertRow(plan, row);
        if (plan.key === "purchaseOrders" && row.purchaseOrderId) {
          synchronizedPurchaseOrderIds.add(String(row.purchaseOrderId));
        }
        if (plan.key === "purchaseOrderItems" && row.purchaseOrderId) {
          synchronizedPurchaseOrderIds.add(String(row.purchaseOrderId));
        }
        success += 1;
      } catch (error) {
        failed.push({
          rowNumber: 0,
          primaryKey: String(row[plan.primaryKey] ?? ""),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const status = failed.length ? "导入部分失败" : skipped ? "已导入（部分跳过）" : "已导入";
  const report = {
    total: preview.report.total,
    success: failed.length ? 0 : success,
    failed,
  };

  const shipmentSync = preview.targetKey === "purchase-orders" && synchronizedPurchaseOrderIds.size
    ? await synchronizeConfirmedPurchaseOrderShipments([...synchronizedPurchaseOrderIds])
    : { orderCount: 0, created: 0, updated: 0 };

  await execute(
    `
      UPDATE importjobs
      SET status = :status,
          successRows = :successRows,
          failedRows = :failedRows,
          reportJson = :reportJson,
          confirmedAt = CURRENT_TIMESTAMP
      WHERE jobId = :jobId
    `,
    {
      jobId,
      status,
      successRows: report.success,
      failedRows: failed.length,
      reportJson: JSON.stringify(report),
    },
  );

  const savedJob = await getImportJob(jobId);
  return savedJob ? { ...savedJob, shipmentSync } : savedJob;
}

export type ImportJobListResult = {
  jobs: ImportJobRow[];
  total: number;
  page: number;
  pageSize: number;
};

export function normalizeImportJobPagination(searchParams: URLSearchParams) {
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSize = normalizePageSize(Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE));
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

export async function listImportJobs(searchParams = new URLSearchParams()): Promise<ImportJobListResult> {
  const pagination = normalizeImportJobPagination(searchParams);
  const [{ total }] = await queryRows<{ total: number }>("SELECT COUNT(*) AS total FROM importjobs");
  const jobs = await queryRows<ImportJobRow>(
    `
      SELECT
        jobId, targetKey, targetTitle, fileName, status, totalRows, successRows, failedRows,
        masterCount, detailCount, createdAt, updatedAt, confirmedAt
      FROM importjobs
      ORDER BY createdAt DESC
      LIMIT :limit OFFSET :offset
    `,
    {
      limit: pagination.pageSize,
      offset: pagination.offset,
    },
  );
  return {
    jobs,
    total: Number(total ?? 0),
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}

export async function getImportJob(jobId: string) {
  const rows = await queryRows<ImportJobRow>("SELECT * FROM importjobs WHERE jobId = :jobId LIMIT 1", { jobId });
  return rows[0] ?? null;
}

function updateImportJobStatus(jobId: string, status: string) {
  return execute("UPDATE importjobs SET status = :status WHERE jobId = :jobId", { jobId, status });
}

type ExecutionPlan = (typeof EXECUTION_PLAN)[number];
type ExistingImportRow = { primaryKey: string; status: string | null };

function normalizeImportStrategy(strategy: ImportStrategy | undefined): ImportStrategy {
  return strategy === "create-only" || strategy === "overwrite-all" ? strategy : "overwrite-drafts";
}

async function summarizeExecution(preview: ImportPreview, strategy: ImportStrategy) {
  const summary = { create: 0, updateDraft: 0, updateConfirmed: 0, skip: 0 };
  for (const plan of EXECUTION_PLAN) {
    for (const row of preview.operations[plan.key]) {
      const existing = await findExistingRow(plan, row);
      if (!existing) {
        summary.create += 1;
        continue;
      }
      if (isDraftStatus(existing.status)) {
        if (strategy === "create-only") summary.skip += 1;
        else summary.updateDraft += 1;
      } else if (strategy === "overwrite-all") {
        summary.updateConfirmed += 1;
      } else {
        summary.skip += 1;
      }
    }
  }
  return summary;
}

function resolveExecutionAction(existing: ExistingImportRow | null, strategy: ImportStrategy) {
  if (!existing) return "create";
  if (strategy === "create-only") return "skip";
  if (strategy === "overwrite-all" || isDraftStatus(existing.status)) return "update";
  return "skip";
}

function isDraftStatus(status: string | null) {
  return !status || status === "草稿";
}

async function findExistingRow(plan: ExecutionPlan, row: Row): Promise<ExistingImportRow | null> {
  if (plan.key === "instanceContracts") {
    const rows = await queryRows<Row>(
      `SELECT id, NULL AS status FROM instancecontracts WHERE contractNo = :contractNo AND countryCode = :countryCode AND deviceCode = :deviceCode LIMIT 1`,
      { contractNo: row.contractNo, countryCode: row.countryCode, deviceCode: row.deviceCode },
    );
    if (rows[0]) return { primaryKey: String(rows[0].id), status: null };
    return null;
  }

  const statusLookup = getStatusLookup(plan, row);
  const rows = await queryRows<Row>(
    `SELECT ${quoteIdentifier(plan.primaryKey)} AS primaryKey FROM ${quoteIdentifier(plan.table)} WHERE ${quoteIdentifier(plan.primaryKey)} = :id LIMIT 1`,
    { id: row[plan.primaryKey] },
  );
  if (!rows[0]) return null;
  if (!statusLookup) return { primaryKey: String(rows[0].primaryKey), status: null };
  const statusRows = await queryRows<Row>(statusLookup.sql, statusLookup.params);
  return { primaryKey: String(rows[0].primaryKey), status: statusRows[0] ? String(statusRows[0].status ?? "") : null };
}

function getStatusLookup(plan: ExecutionPlan, row: Row): { sql: string; params: Row } | null {
  if (["requests", "purchaseOrders", "billingLedgers", "prepaymentContracts"].includes(String(plan.key))) {
    return {
      sql: `SELECT status FROM ${quoteIdentifier(plan.table)} WHERE ${quoteIdentifier(plan.primaryKey)} = :id LIMIT 1`,
      params: { id: row[plan.primaryKey] },
    };
  }
  if (plan.key === "requestItems") return { sql: "SELECT status FROM requests WHERE requestNo = :requestNo LIMIT 1", params: { requestNo: row.requestNo } };
  if (plan.key === "purchaseOrderItems") return { sql: "SELECT status FROM purchaseorders WHERE purchaseOrderId = :purchaseOrderId LIMIT 1", params: { purchaseOrderId: row.purchaseOrderId } };
  if (plan.key === "prepaymentContractItems" || plan.key === "monthlyPrepaymentWriteOffs") return { sql: "SELECT status FROM prepaymentcontracts WHERE contractNo = :contractNo LIMIT 1", params: { contractNo: row.contractNo } };
  if (plan.key === "monthlyBillingWriteOffs") return { sql: "SELECT status FROM billinginstanceledgers WHERE ledgerId = :ledgerId LIMIT 1", params: { ledgerId: row.ledgerId } };
  return null;
}

async function insertRow(plan: ExecutionPlan, row: Row) {
  const { table, fields } = plan;
  const columns = fields.map(quoteIdentifier).join(", ");
  const values = fields.map((field) => `:${field}`).join(", ");
  const params = Object.fromEntries(fields.map((field) => [field, normalizeDbValue(row[field])]));

  await execute(
    `
      INSERT INTO ${quoteIdentifier(table)} (${columns})
      VALUES (${values})
    `,
    params,
  );
}

async function updateRow(plan: ExecutionPlan, existing: ExistingImportRow, row: Row) {
  const fields = plan.fields.filter((field) => field !== plan.primaryKey && row[field] !== undefined && row[field] !== "");
  if (!fields.length) return;
  const assignments = fields.map((field) => `${quoteIdentifier(field)} = :${field}`).join(", ");
  const params = Object.fromEntries(fields.map((field) => [field, normalizeDbValue(row[field])]));
  await execute(
    `UPDATE ${quoteIdentifier(plan.table)} SET ${assignments} WHERE ${quoteIdentifier(plan.primaryKey)} = :id`,
    { ...params, id: existing.primaryKey },
  );
}

function normalizeDbValue(value: unknown) {
  return value === undefined || value === "" ? null : value;
}

function quoteIdentifier(identifier: string) {
  return `\`${identifier.replace(/`/g, "``")}\``;
}
