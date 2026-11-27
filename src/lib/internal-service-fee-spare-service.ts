import { createHash, randomUUID } from "node:crypto";
import type { Row } from "./db";
import { DEFAULT_PAGE_SIZE, normalizePageSize } from "./pagination";
import { feeExecute as execute, feeQuery as query, withInternalFeeTransaction } from "./internal-service-fee-db";
import {
  buildInternalServiceSpareSchedule,
  normalizeInternalServiceSpare,
  type InternalServiceSpareInput,
  type InternalServiceSpareNormalized,
} from "./internal-service-fee-spare";

const AUDIT_TABLE = "internalservicespareaudits";
const SPARE_STATUS_ACTIVE = "启用";
const SPARE_STATUS_VOID = "已停用";

type SpareRow = Row & {
  ledgerId: string;
  countryCode: string;
  batchName: string;
  spareName: string;
  spareCode: string;
  quantity: number;
  startMonth: string;
  procurementCostUsd: number;
  contractExcludingTaxUsd: number | null;
  managementFeeTotalUsd: number;
  first24MonthlyUsd: number;
  next36MonthlyUsd: number;
  archivedAmount: number;
  remainingAmount: number;
  status: string;
  notes: string;
  voidedAt: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  totalMonths: number;
  archivedMonths: number;
  openMonths: number;
};

export async function internalServiceFeeSpareSchemaAvailable() {
  const [row] = await query<Row>(`
    SELECT
      SUM(COLUMN_NAME='ledgerType') AS ledgerType,
      SUM(COLUMN_NAME='spareProcurementCost') AS spareProcurementCost,
      SUM(COLUMN_NAME='spareFirst24MonthlyAmount') AS spareFirst24MonthlyAmount,
      SUM(COLUMN_NAME='spareNext36MonthlyAmount') AS spareNext36MonthlyAmount,
      SUM(COLUMN_NAME='spareBusinessKey') AS spareBusinessKey,
      SUM(COLUMN_NAME='notes') AS notes,
      SUM(COLUMN_NAME='voidedAt') AS voidedAt
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_internalserviceledgers'
  `);
  const [audit] = await query<Row>(`
    SELECT COUNT(*) AS count
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_internalservicespareaudits'
  `);
  return Number(row?.ledgerType ?? 0) > 0
    && Number(row?.spareProcurementCost ?? 0) > 0
    && Number(row?.spareFirst24MonthlyAmount ?? 0) > 0
    && Number(row?.spareNext36MonthlyAmount ?? 0) > 0
    && Number(row?.spareBusinessKey ?? 0) > 0
    && Number(row?.notes ?? 0) > 0
    && Number(row?.voidedAt ?? 0) > 0
    && Number(audit?.count ?? 0) > 0;
}

async function requireSpareSchema() {
  if (!await internalServiceFeeSpareSchemaAvailable()) {
    throw new Error("请先执行备件管理费增量迁移：npm run schema:internal-fee-spares -- --apply");
  }
}

export async function listInternalServiceSpares(searchParams: URLSearchParams) {
  await requireSpareSchema();
  const keyword = searchParams.get("keyword")?.trim() ?? "";
  const countryCode = searchParams.get("countryCode")?.trim().toUpperCase() ?? "";
  const status = searchParams.get("status")?.trim() ?? "";
  const requestedPage = Math.max(1, Math.floor(Number(searchParams.get("page") ?? 1) || 1));
  const pageSize = normalizePageSize(Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE));
  const conditions = ["ledger.ledgerType = 'spare'"];
  const params: Row = {};
  if (keyword) {
    conditions.push("(ledger.ledgerId LIKE :keyword OR ledger.batchName LIKE :keyword OR ledger.nameEn LIKE :keyword OR ledger.deviceCode LIKE :keyword OR ledger.notes LIKE :keyword)");
    params.keyword = `%${keyword}%`;
  }
  if (countryCode) {
    conditions.push("ledger.countryCode = :countryCode");
    params.countryCode = countryCode;
  }
  if (status) {
    conditions.push("ledger.status = :status");
    params.status = status;
  }
  const where = `WHERE ${conditions.join(" AND ")}`;
  const [{ total: totalValue }] = await query<Row>(
    `SELECT COUNT(*) AS total FROM internalserviceledgers ledger ${where}`,
    params,
  );
  const total = Number(totalValue ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  params.limit = pageSize;
  params.offset = (page - 1) * pageSize;
  const rows = await query<SpareRow>(`
    SELECT
      ledger.ledgerId,
      ledger.countryCode,
      ledger.batchName,
      ledger.nameEn AS spareName,
      ledger.deviceCode AS spareCode,
      ledger.quantity,
      DATE_FORMAT(ledger.startMonth, '%Y-%m-%d') AS startMonth,
      COALESCE(ledger.spareProcurementCost, ledger.procurementCost, 0) AS procurementCostUsd,
      ledger.spareContractExcludingTax AS contractExcludingTaxUsd,
      COALESCE(ledger.internalServiceFeeTotal, 0) AS managementFeeTotalUsd,
      COALESCE(ledger.spareFirst24MonthlyAmount, 0) AS first24MonthlyUsd,
      COALESCE(ledger.spareNext36MonthlyAmount, 0) AS next36MonthlyUsd,
      COALESCE(ledger.archivedAmount, 0) AS archivedAmount,
      COALESCE(ledger.remainingAmount, 0) AS remainingAmount,
      ledger.status,
      COALESCE(ledger.notes, '') AS notes,
      DATE_FORMAT(ledger.voidedAt, '%Y-%m-%d %H:%i:%s') AS voidedAt,
      COALESCE(ledger.createdBy, '') AS createdBy,
      COALESCE(ledger.updatedBy, '') AS updatedBy,
      DATE_FORMAT(ledger.createdAt, '%Y-%m-%d %H:%i:%s') AS createdAt,
      DATE_FORMAT(ledger.updatedAt, '%Y-%m-%d %H:%i:%s') AS updatedAt,
      COALESCE(monthStats.totalMonths, 0) AS totalMonths,
      COALESCE(monthStats.archivedMonths, 0) AS archivedMonths,
      COALESCE(monthStats.openMonths, 0) AS openMonths
    FROM internalserviceledgers ledger
    LEFT JOIN (
      SELECT ledgerId,
        COUNT(*) AS totalMonths,
        COALESCE(SUM(archived = 1), 0) AS archivedMonths,
        COALESCE(SUM(archived = 0), 0) AS openMonths
      FROM monthlyinternalservicefees
      WHERE sourceType = 'spare'
      GROUP BY ledgerId
    ) monthStats ON monthStats.ledgerId = ledger.ledgerId
    ${where}
    ORDER BY
      CASE WHEN ledger.status = :activeStatus THEN 0 ELSE 1 END,
      ledger.startMonth DESC,
      ledger.batchName,
      ledger.nameEn
    LIMIT :limit OFFSET :offset
  `, { ...params, activeStatus: SPARE_STATUS_ACTIVE });
  return { rows: rows.map(normalizeSpareRow), total, page, pageSize, totalPages };
}

export async function getInternalServiceSpare(ledgerId: string) {
  await requireSpareSchema();
  const [row] = await query<SpareRow>(`
    SELECT
      ledger.ledgerId,
      ledger.countryCode,
      ledger.batchName,
      ledger.nameEn AS spareName,
      ledger.deviceCode AS spareCode,
      ledger.quantity,
      DATE_FORMAT(ledger.startMonth, '%Y-%m-%d') AS startMonth,
      COALESCE(ledger.spareProcurementCost, ledger.procurementCost, 0) AS procurementCostUsd,
      ledger.spareContractExcludingTax AS contractExcludingTaxUsd,
      COALESCE(ledger.internalServiceFeeTotal, 0) AS managementFeeTotalUsd,
      COALESCE(ledger.spareFirst24MonthlyAmount, 0) AS first24MonthlyUsd,
      COALESCE(ledger.spareNext36MonthlyAmount, 0) AS next36MonthlyUsd,
      COALESCE(ledger.archivedAmount, 0) AS archivedAmount,
      COALESCE(ledger.remainingAmount, 0) AS remainingAmount,
      ledger.status,
      COALESCE(ledger.notes, '') AS notes,
      DATE_FORMAT(ledger.voidedAt, '%Y-%m-%d %H:%i:%s') AS voidedAt,
      COALESCE(ledger.createdBy, '') AS createdBy,
      COALESCE(ledger.updatedBy, '') AS updatedBy,
      DATE_FORMAT(ledger.createdAt, '%Y-%m-%d %H:%i:%s') AS createdAt,
      DATE_FORMAT(ledger.updatedAt, '%Y-%m-%d %H:%i:%s') AS updatedAt,
      (SELECT COUNT(*) FROM monthlyinternalservicefees fee WHERE fee.ledgerId=ledger.ledgerId AND fee.sourceType='spare') AS totalMonths,
      (SELECT COUNT(*) FROM monthlyinternalservicefees fee WHERE fee.ledgerId=ledger.ledgerId AND fee.sourceType='spare' AND fee.archived=1) AS archivedMonths,
      (SELECT COUNT(*) FROM monthlyinternalservicefees fee WHERE fee.ledgerId=ledger.ledgerId AND fee.sourceType='spare' AND fee.archived=0) AS openMonths
    FROM internalserviceledgers ledger
    WHERE ledger.ledgerType='spare' AND ledger.ledgerId=:ledgerId
    LIMIT 1
  `, { ledgerId });
  if (!row) throw new Error("备件管理费台账不存在");
  const [months, audits] = await Promise.all([
    query<Row>(`
      SELECT id, monthIndex, DATE_FORMAT(writeOffMonth, '%Y-%m-%d') AS writeOffMonth,
        internalServiceFeeAmount, internalServiceFeeReportingAmount, archived,
        DATE_FORMAT(archivedAt, '%Y-%m-%d %H:%i:%s') AS archivedAt, archiveSnapshotNo
      FROM monthlyinternalservicefees
      WHERE ledgerId=:ledgerId AND sourceType='spare'
      ORDER BY monthIndex
    `, { ledgerId }),
    query<Row>(`
      SELECT id, action, actor, reason, beforeJson, afterJson, metadataJson,
        DATE_FORMAT(createdAt, '%Y-%m-%d %H:%i:%s') AS createdAt
      FROM ${AUDIT_TABLE}
      WHERE ledgerId=:ledgerId
      ORDER BY createdAt DESC, id DESC
    `, { ledgerId }),
  ]);
  return { ...normalizeSpareRow(row), months, audits };
}

export async function createInternalServiceSpare(input: InternalServiceSpareInput, actor: string) {
  return withInternalFeeTransaction(async () => {
    await requireSpareSchema();
    const created = await saveSpareLocked(input, actor, null, "create", "");
    return { ledgerId: String(created.ledgerId) };
  });
}

export async function importInternalServiceSpares(
  inputs: InternalServiceSpareInput[],
  actor: string,
  sourceFileName: string,
) {
  if (!inputs.length) throw new Error("没有可导入的备件");
  return withInternalFeeTransaction(async () => {
    await requireSpareSchema();
    const normalized: InternalServiceSpareNormalized[] = [];
    const errors: string[] = [];
    for (const [index, input] of inputs.entries()) {
      const result = normalizeInternalServiceSpare(input);
      if (!result.value) errors.push(`第 ${index + 1} 行：${result.errors[0]}`);
      else normalized.push(result.value);
    }
    const duplicateKeys = duplicateBusinessKeys(normalized.map((item) => item.businessKey));
    if (duplicateKeys.length) errors.push(`导入文件存在重复备件：${duplicateKeys.slice(0, 10).join("、")}`);
    if (errors.length) throw new Error(errors.slice(0, 20).join("\n"));

    const ledgerIds: string[] = [];
    for (const item of normalized) {
      const created = await saveSpareLocked(item, actor, null, "import", sourceFileName);
      ledgerIds.push(String(created.ledgerId));
    }
    return { count: ledgerIds.length, ledgerIds };
  });
}

export async function updateInternalServiceSpare(ledgerId: string, input: InternalServiceSpareInput, actor: string) {
  return withInternalFeeTransaction(async () => {
    await requireSpareSchema();
    return saveSpareLocked(input, actor, ledgerId, "update", "");
  });
}

export async function voidInternalServiceSpare(ledgerId: string, actor: string, reason: string) {
  return withInternalFeeTransaction(async () => {
    await requireSpareSchema();
    if (!reason.trim()) throw new Error("请填写作废原因");
    const current = await spareForUpdate(ledgerId);
    if (current.status === SPARE_STATUS_VOID) throw new Error("该备件管理费已经停用");
    const openRows = await query<Row>(
      "SELECT id FROM monthlyinternalservicefees WHERE ledgerId=:ledgerId AND sourceType='spare' AND archived=0",
      { ledgerId },
    );
    const [archivedCount] = await query<Row>(
      "SELECT COUNT(*) AS count FROM monthlyinternalservicefees WHERE ledgerId=:ledgerId AND sourceType='spare' AND archived=1",
      { ledgerId },
    );
    await execute("DELETE FROM monthlyinternalservicefees WHERE ledgerId=:ledgerId AND sourceType='spare' AND archived=0", { ledgerId });
    await execute(`
      UPDATE internalserviceledgers
      SET status=:status, voidedAt=CURRENT_TIMESTAMP, updatedBy=:actor,
        remainingAmount=0, unallocatedAmount=0
      WHERE ledgerId=:ledgerId
    `, { ledgerId, status: SPARE_STATUS_VOID, actor });
    const after = await spareForUpdate(ledgerId);
    await writeAudit({
      ledgerId,
      action: "void",
      actor,
      reason: reason.trim(),
      beforeJson: JSON.stringify(current),
      afterJson: JSON.stringify({ ...after, deletedOpenMonths: openRows.length }),
      metadataJson: JSON.stringify({ deletedOpenMonths: openRows.length }),
    });
    return {
      ledgerId,
      status: SPARE_STATUS_VOID,
      deletedOpenMonths: openRows.length,
      archivedMonths: Number(archivedCount?.count ?? 0),
    };
  });
}

async function saveSpareLocked(
  input: InternalServiceSpareInput,
  actor: string,
  existingLedgerId: string | null,
  action: "create" | "update" | "import",
  sourceFileName: string,
) {
  const normalizedResult = normalizeInternalServiceSpare(input);
  if (!normalizedResult.value) throw new Error(normalizedResult.errors.join("；"));
  const normalized = normalizedResult.value;
  const existing = existingLedgerId ? await spareForUpdate(existingLedgerId) : null;
  if (existing?.status === SPARE_STATUS_VOID) throw new Error("已停用的备件不能修改，请新增备件记录");
  await ensureBusinessKeyAvailable(normalized.businessKey, existingLedgerId);

  const ledgerId = existingLedgerId ?? `ISF-SPARE-${normalized.countryCode}-${randomUUID()}`;
  const spareCode = normalized.spareCode || `SPARE-${normalized.countryCode}-${createHash("sha1").update(normalized.businessKey).digest("hex").slice(0, 8).toUpperCase()}`;
  const archived = existingLedgerId
    ? await query<Row>(`
      SELECT monthIndex, DATE_FORMAT(writeOffMonth, '%Y-%m-%d') AS writeOffMonth, internalServiceFeeAmount AS amount
      FROM monthlyinternalservicefees
      WHERE ledgerId=:ledgerId AND sourceType='spare' AND archived=1
      ORDER BY monthIndex
    `, { ledgerId })
    : [];
  if (existing && normalizeMonth(existing.startMonth) !== normalized.startMonth && archived.length) {
    throw new Error("已有对账月份，不能修改备件开始月份");
  }
  const schedule = buildInternalServiceSpareSchedule(normalized, archived.map((row) => ({
    monthIndex: Number(row.monthIndex),
    writeOffMonth: String(row.writeOffMonth),
    amount: Number(row.amount),
  })));
  const archivedAmount = roundMoney(archived.reduce((total, row) => total + Number(row.amount ?? 0), 0));
  const remainingAmount = roundMoney(normalized.managementFeeTotalUsd - archivedAmount);

  const values = {
    ledgerId,
    countryCode: normalized.countryCode,
    batchName: normalized.batchName,
    spareName: normalized.spareName,
    spareCode,
    quantity: normalized.quantity,
    startMonth: normalized.startMonth,
    procurementCostUsd: normalized.procurementCostUsd,
    procurementTaxExcludedUnitPrice: roundMoney(normalized.procurementCostUsd / normalized.quantity),
    contractExcludingTaxUsd: normalized.contractExcludingTaxUsd,
    managementFeeTotalUsd: normalized.managementFeeTotalUsd,
    first24MonthlyUsd: normalized.first24MonthlyUsd,
    next36MonthlyUsd: normalized.next36MonthlyUsd,
    archivedAmount,
    remainingAmount,
    notes: normalized.notes,
    businessKey: normalized.businessKey,
    createdBy: existing?.createdBy || actor,
    updatedBy: actor,
  };
  await execute(`
    INSERT INTO internalserviceledgers
      (ledgerId,countryCode,batchName,requestNo,poNo,deviceCode,modelCode,nameEn,supplierId,undertakingUnitId,customerId,
       quantity,currency,reportingCurrency,exchangeRate,procurementCurrency,procurementToContractRate,vatRate,
       procurementTaxExcludedUnitPrice,procurementTaxSurcharge,contractRevenueIncludingTax,contractRevenueExcludingTax,
       procurementCost,internalServiceFeeTotal,internalServiceFeeReportingTotal,archivedAmount,manualAmount,remainingAmount,
       unallocatedAmount,startMonth,status,ledgerType,spareProcurementCost,spareContractExcludingTax,
       spareFirst24MonthlyAmount,spareNext36MonthlyAmount,spareBusinessKey,notes,voidedAt,createdBy,updatedBy)
    VALUES
      (:ledgerId,:countryCode,:batchName,'','',:spareCode,'',:spareName,'','','',
       :quantity,'USD','USD',1,'USD',1,0,
       :procurementTaxExcludedUnitPrice,0,:contractExcludingTaxUsd,:contractExcludingTaxUsd,
       :procurementCostUsd,:managementFeeTotalUsd,:managementFeeTotalUsd,:archivedAmount,0,:remainingAmount,
       0,:startMonth,:status,'spare',:procurementCostUsd,:contractExcludingTaxUsd,
       :first24MonthlyUsd,:next36MonthlyUsd,:businessKey,:notes,NULL,:createdBy,:updatedBy)
    ON DUPLICATE KEY UPDATE
      countryCode=VALUES(countryCode),batchName=VALUES(batchName),deviceCode=VALUES(deviceCode),nameEn=VALUES(nameEn),
      quantity=VALUES(quantity),currency='USD',reportingCurrency='USD',exchangeRate=1,
      procurementCurrency='USD',procurementToContractRate=1,vatRate=0,
      procurementTaxExcludedUnitPrice=VALUES(procurementTaxExcludedUnitPrice),procurementTaxSurcharge=0,
      contractRevenueIncludingTax=VALUES(contractRevenueIncludingTax),contractRevenueExcludingTax=VALUES(contractRevenueExcludingTax),
      procurementCost=VALUES(procurementCost),internalServiceFeeTotal=VALUES(internalServiceFeeTotal),
      internalServiceFeeReportingTotal=VALUES(internalServiceFeeReportingTotal),
      archivedAmount=VALUES(archivedAmount),manualAmount=0,remainingAmount=VALUES(remainingAmount),unallocatedAmount=0,
      startMonth=VALUES(startMonth),status=VALUES(status),ledgerType='spare',
      spareProcurementCost=VALUES(spareProcurementCost),spareContractExcludingTax=VALUES(spareContractExcludingTax),
      spareFirst24MonthlyAmount=VALUES(spareFirst24MonthlyAmount),spareNext36MonthlyAmount=VALUES(spareNext36MonthlyAmount),
      spareBusinessKey=VALUES(spareBusinessKey),notes=VALUES(notes),voidedAt=NULL,updatedBy=VALUES(updatedBy)
  `, { ...values, status: SPARE_STATUS_ACTIVE });

  await execute(
    "DELETE FROM monthlyinternalservicefees WHERE ledgerId=:ledgerId AND sourceType='spare' AND archived=0",
    { ledgerId },
  );
  for (const row of schedule) {
    if (row.archived) continue;
    await execute(`
      INSERT INTO monthlyinternalservicefees
        (id,ledgerId,writeOffMonth,monthIndex,countryCode,batchName,requestNo,poNo,deviceCode,modelCode,nameEn,
         supplierId,undertakingUnitId,customerId,quantity,currency,internalServiceFeeAmount,
         reportingCurrency,exchangeRate,internalServiceFeeReportingAmount,sourceType,adjustmentNo,archived)
      VALUES
        (:id,:ledgerId,:writeOffMonth,:monthIndex,:countryCode,:batchName,'','',:spareCode,'',:spareName,
         '','','',:quantity,'USD',:amount,'USD',1,:amount,'spare','',0)
    `, {
      id: `ISF-${ledgerId}-${String(row.monthIndex).padStart(3, "0")}`,
      ledgerId,
      writeOffMonth: row.writeOffMonth,
      monthIndex: row.monthIndex,
      countryCode: normalized.countryCode,
      batchName: normalized.batchName,
      spareCode,
      spareName: normalized.spareName,
      quantity: normalized.quantity,
      amount: row.amount,
    });
  }

  const after = await spareForUpdate(ledgerId);
  await writeAudit({
    ledgerId,
    action,
    actor,
    reason: action === "import" ? `Excel 导入：${sourceFileName}` : normalized.notes,
    beforeJson: existing ? JSON.stringify(existing) : "",
    afterJson: JSON.stringify(after),
    metadataJson: JSON.stringify({ sourceFileName, scheduleRows: 60, archivedRows: archived.length }),
  });
  return after;
}

async function ensureBusinessKeyAvailable(businessKey: string, currentLedgerId: string | null) {
  const [duplicate] = await query<Row>(`
    SELECT ledgerId
    FROM internalserviceledgers
    WHERE ledgerType='spare' AND spareBusinessKey=:businessKey AND status<>:voidStatus
      ${currentLedgerId ? "AND ledgerId<>:currentLedgerId" : ""}
    LIMIT 1
  `, { businessKey, voidStatus: SPARE_STATUS_VOID, ...(currentLedgerId ? { currentLedgerId } : {}) });
  if (duplicate) throw new Error("相同国家、批次、备件编码/名称和开始月份已存在，请勿重复录入");
}

async function spareForUpdate(ledgerId: string) {
  const [row] = await query<Row>(`
    SELECT ledgerId,countryCode,batchName,nameEn AS spareName,deviceCode AS spareCode,quantity,
      DATE_FORMAT(startMonth,'%Y-%m-%d') AS startMonth,status,COALESCE(notes,'') AS notes,
      DATE_FORMAT(voidedAt,'%Y-%m-%d %H:%i:%s') AS voidedAt,COALESCE(createdBy,'') AS createdBy,
      COALESCE(updatedBy,'') AS updatedBy
    FROM internalserviceledgers
    WHERE ledgerId=:ledgerId AND ledgerType='spare'
    LIMIT 1
  `, { ledgerId });
  if (!row) throw new Error("备件管理费台账不存在");
  return row;
}

async function writeAudit(input: {
  ledgerId: string;
  action: string;
  actor: string;
  reason: string;
  beforeJson: string;
  afterJson: string;
  metadataJson: string;
}) {
  await execute(`
    INSERT INTO ${AUDIT_TABLE}
      (id,ledgerId,action,actor,reason,beforeJson,afterJson,metadataJson)
    VALUES
      (:id,:ledgerId,:action,:actor,:reason,:beforeJson,:afterJson,:metadataJson)
  `, { id: randomUUID(), ...input });
}

function normalizeSpareRow(row: SpareRow): SpareRow {
  return {
    ...row,
    quantity: Number(row.quantity ?? 0),
    procurementCostUsd: Number(row.procurementCostUsd ?? 0),
    contractExcludingTaxUsd: row.contractExcludingTaxUsd == null ? null : Number(row.contractExcludingTaxUsd),
    managementFeeTotalUsd: Number(row.managementFeeTotalUsd ?? 0),
    first24MonthlyUsd: Number(row.first24MonthlyUsd ?? 0),
    next36MonthlyUsd: Number(row.next36MonthlyUsd ?? 0),
    archivedAmount: Number(row.archivedAmount ?? 0),
    remainingAmount: Number(row.remainingAmount ?? 0),
    totalMonths: Number(row.totalMonths ?? 0),
    archivedMonths: Number(row.archivedMonths ?? 0),
    openMonths: Number(row.openMonths ?? 0),
  };
}

function normalizeMonth(value: unknown) {
  return String(value ?? "").slice(0, 7) + "-01";
}

function duplicateBusinessKeys(keys: string[]) {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([key]) => key);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
