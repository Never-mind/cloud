import { loadEnvConfig } from "@next/env";
import { closeDb, execute, queryRowsRaw } from "../src/lib/db";

loadEnvConfig(process.cwd());

const columns = [
  ["ledgerType", "`ledgerType` VARCHAR(16) NOT NULL DEFAULT 'instance' COMMENT 'instance/spare'"],
  ["spareProcurementCost", "`spareProcurementCost` DECIMAL(18,2) NULL COMMENT 'spare procurement cost USD'"],
  ["spareContractExcludingTax", "`spareContractExcludingTax` DECIMAL(18,2) NULL COMMENT 'spare contract amount excluding tax USD'"],
  ["spareFirst24MonthlyAmount", "`spareFirst24MonthlyAmount` DECIMAL(18,2) NULL COMMENT 'spare monthly management fee for first 24 months USD'"],
  ["spareNext36MonthlyAmount", "`spareNext36MonthlyAmount` DECIMAL(18,2) NULL COMMENT 'spare monthly management fee for next 36 months USD'"],
  ["spareBusinessKey", "`spareBusinessKey` VARCHAR(255) NULL COMMENT 'spare deduplication key'"],
  ["notes", "`notes` TEXT NULL COMMENT 'notes'"],
  ["voidedAt", "`voidedAt` DATETIME NULL COMMENT 'void timestamp'"],
  ["createdBy", "`createdBy` VARCHAR(255) NULL COMMENT 'created by user email'"],
  ["updatedBy", "`updatedBy` VARCHAR(255) NULL COMMENT 'updated by user email'"],
] as const;

async function columnExists(columnName: string) {
  const [row] = await queryRowsRaw<{ count: number }>(
    "SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='merge_power_internalserviceledgers' AND COLUMN_NAME=:columnName",
    { columnName },
  );
  return Number(row?.count ?? 0) > 0;
}

async function indexExists(indexName: string) {
  const [row] = await queryRowsRaw<{ count: number }>(
    "SELECT COUNT(*) AS count FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='merge_power_internalserviceledgers' AND INDEX_NAME=:indexName",
    { indexName },
  );
  return Number(row?.count ?? 0) > 0;
}

async function tableExists(tableName: string) {
  const [row] = await queryRowsRaw<{ count: number }>(
    "SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:tableName",
    { tableName },
  );
  return Number(row?.count ?? 0) > 0;
}

async function main() {
  const apply = process.argv.includes("--apply");
  let pending = 0;
  for (const [column, ddl] of columns) {
    if (await columnExists(column)) {
      console.log(`OK   internalserviceledgers.${column}`);
      continue;
    }
    pending += 1;
    console.log(`${apply ? "APPLY" : "PLAN "} internalserviceledgers.${column}: ${ddl}`);
    if (apply) await execute(`ALTER TABLE internalserviceledgers ADD COLUMN ${ddl}`);
  }
  for (const [index, ddl] of [
    ["idx_InternalServiceLedgers_type", "KEY `idx_InternalServiceLedgers_type` (`ledgerType`)"],
    ["idx_InternalServiceLedgers_spare_key", "KEY `idx_InternalServiceLedgers_spare_key` (`spareBusinessKey`)"],
  ] as const) {
    if (await indexExists(index)) {
      console.log(`OK   index ${index}`);
      continue;
    }
    pending += 1;
    console.log(`${apply ? "APPLY" : "PLAN "} index ${index}`);
    if (apply) await execute(`ALTER TABLE internalserviceledgers ADD ${ddl}`);
  }
  if (!(await tableExists("merge_power_internalservicespareaudits"))) {
    pending += 1;
    console.log(`${apply ? "APPLY" : "PLAN "} internalservicespareaudits`);
    if (apply) await execute(`
      CREATE TABLE internalservicespareaudits (
        id CHAR(36) NOT NULL, ledgerId VARCHAR(96) NOT NULL COMMENT 'spare management fee ledger id',
        action VARCHAR(32) NOT NULL COMMENT 'create/import/update/void', actor VARCHAR(255) NOT NULL COMMENT 'operator',
        reason TEXT NULL COMMENT 'change reason', beforeJson LONGTEXT NULL COMMENT 'state before change',
        afterJson LONGTEXT NULL COMMENT 'state after change', metadataJson LONGTEXT NULL COMMENT 'supplementary metadata',
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id), KEY idx_InternalServiceSpareAudits_ledger (ledgerId, createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='InternalServiceSpareAudits'
    `);
  } else {
    console.log("OK   internalservicespareaudits");
  }
  if (apply) {
    await execute(`
      UPDATE internalserviceledgers ledger
      LEFT JOIN monthlyinternalservicefees firstMonth
        ON firstMonth.ledgerId=ledger.ledgerId AND firstMonth.sourceType='spare' AND firstMonth.monthIndex=1
      LEFT JOIN monthlyinternalservicefees nextMonth
        ON nextMonth.ledgerId=ledger.ledgerId AND nextMonth.sourceType='spare' AND nextMonth.monthIndex=25
      SET ledger.ledgerType='spare',
          ledger.status=CASE WHEN ledger.status='附件导入' THEN '启用' ELSE ledger.status END,
          ledger.spareProcurementCost=COALESCE(ledger.spareProcurementCost, ledger.procurementCost),
          ledger.spareContractExcludingTax=COALESCE(ledger.spareContractExcludingTax, ledger.contractRevenueExcludingTax),
          ledger.spareFirst24MonthlyAmount=COALESCE(ledger.spareFirst24MonthlyAmount, firstMonth.internalServiceFeeAmount),
          ledger.spareNext36MonthlyAmount=COALESCE(ledger.spareNext36MonthlyAmount, nextMonth.internalServiceFeeAmount),
          ledger.spareBusinessKey=COALESCE(
            ledger.spareBusinessKey,
            CONCAT(
              'spare|', UPPER(COALESCE(ledger.countryCode,'')), '|',
              UPPER(COALESCE(ledger.batchName,'')), '|',
              UPPER(COALESCE(NULLIF(ledger.deviceCode,''), NULLIF(ledger.nameEn,''), ledger.ledgerId)), '|',
              DATE_FORMAT(ledger.startMonth,'%Y-%m')
            )
          )
      WHERE ledger.ledgerId LIKE 'ISF-SPARE-%'
         OR ledger.status='附件导入'
         OR EXISTS (
           SELECT 1 FROM monthlyinternalservicefees spareFee
           WHERE spareFee.ledgerId=ledger.ledgerId AND spareFee.sourceType='spare'
         )
    `);
  }
  console.log(`${apply ? "APPLIED" : "PENDING"} ${pending} change(s)`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "备件管理费迁移失败");
    process.exitCode = 1;
  })
  .finally(closeDb);
