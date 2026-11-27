import { loadEnvConfig } from "@next/env";
import { closeDb, execute, physicalTableName, queryRowsRaw } from "../src/lib/db";

loadEnvConfig(process.cwd());

const columns = [
  ["internalserviceledgers", "reportingCurrency", "`reportingCurrency` VARCHAR(16) NULL COMMENT 'reporting currency'"],
  ["internalserviceledgers", "exchangeRate", "`exchangeRate` DECIMAL(18,10) NULL COMMENT 'source currency units per reporting currency'"],
  ["internalserviceledgers", "procurementCurrency", "`procurementCurrency` VARCHAR(16) NULL COMMENT 'procurement item currency'"],
  ["internalserviceledgers", "procurementToContractRate", "`procurementToContractRate` DECIMAL(18,10) NULL COMMENT 'procurement currency units per contract currency'"],
  ["internalserviceledgers", "internalServiceFeeReportingTotal", "`internalServiceFeeReportingTotal` DECIMAL(18,2) NULL COMMENT 'management fee total in reporting currency'"],
  ["monthlyinternalservicefees", "reportingCurrency", "`reportingCurrency` VARCHAR(16) NULL COMMENT 'reporting currency'"],
  ["monthlyinternalservicefees", "exchangeRate", "`exchangeRate` DECIMAL(18,10) NULL COMMENT 'source currency units per reporting currency'"],
  ["monthlyinternalservicefees", "internalServiceFeeReportingAmount", "`internalServiceFeeReportingAmount` DECIMAL(18,2) NULL COMMENT 'management fee in reporting currency'"],
  ["internalservicefeesnapshots", "reportingCurrency", "`reportingCurrency` VARCHAR(16) NULL COMMENT 'reporting currency summary'"],
  ["internalservicefeesnapshots", "totalReportingAmount", "`totalReportingAmount` DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT 'management fee total in reporting currency'"],
  ["internalservicefeesnapshotitems", "reportingCurrency", "`reportingCurrency` VARCHAR(16) NULL COMMENT 'reporting currency'"],
  ["internalservicefeesnapshotitems", "exchangeRate", "`exchangeRate` DECIMAL(18,10) NULL COMMENT 'source currency units per reporting currency'"],
  ["internalservicefeesnapshotitems", "internalServiceFeeReportingAmount", "`internalServiceFeeReportingAmount` DECIMAL(18,2) NULL COMMENT 'management fee in reporting currency'"],
  ["merge_power_internalservicejccomponents", "reportingCurrency", "`reportingCurrency` VARCHAR(16) NULL COMMENT 'reporting currency'"],
  ["merge_power_internalservicejccomponents", "exchangeRate", "`exchangeRate` DECIMAL(18,10) NULL COMMENT 'source currency units per reporting currency'"],
  ["merge_power_internalservicejccomponents", "ruleTotalReporting", "`ruleTotalReporting` DECIMAL(18,2) NULL COMMENT 'rule total in reporting currency'"],
  ["merge_power_internalservicejccomponents", "approvedTotalReporting", "`approvedTotalReporting` DECIMAL(18,2) NULL COMMENT 'approved total in reporting currency'"],
  ["merge_power_internalservicejccomponents", "fixedAdjustmentReporting", "`fixedAdjustmentReporting` DECIMAL(18,2) NULL COMMENT 'fixed adjustment in reporting currency'"],
  ["merge_power_internalservicejcmonths", "reportingAmount", "`reportingAmount` DECIMAL(18,2) NULL COMMENT 'JC amount in reporting currency'"],
] as const;

async function tableExists(tableName: string) {
  const [row] = await queryRowsRaw<{ count: number }>(
    "SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:tableName",
    { tableName: physicalTableName(tableName) },
  );
  return Number(row?.count ?? 0) > 0;
}

async function columnExists(tableName: string, columnName: string) {
  const [row] = await queryRowsRaw<{ count: number }>(
    "SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:tableName AND COLUMN_NAME=:columnName",
    { tableName: physicalTableName(tableName), columnName },
  );
  return Number(row?.count ?? 0) > 0;
}

async function main() {
  const apply = process.argv.includes("--apply");
  let pending = 0;
  for (const [table, column, ddl] of columns) {
    if (!(await tableExists(table))) {
      console.log(`SKIP table=${table} (not found)`);
      continue;
    }
    if (await columnExists(table, column)) {
      console.log(`OK   ${table}.${column}`);
      continue;
    }
    pending += 1;
    console.log(`${apply ? "APPLY" : "PLAN "} ${table}.${column}: ${ddl}`);
    if (apply) await execute(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  }
  console.log(`${apply ? "APPLIED" : "PENDING"} ${pending} column(s)`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "管理费报告币种迁移失败");
    process.exitCode = 1;
  })
  .finally(closeDb);
