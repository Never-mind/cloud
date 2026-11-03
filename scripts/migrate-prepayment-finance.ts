import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
loadEnvConfig(process.cwd());

export const financeTables = [
`CREATE TABLE IF NOT EXISTS merge_common_invoice_business_links (
  id VARCHAR(64) NOT NULL PRIMARY KEY, invoiceId VARCHAR(64) NOT NULL,
  sourceType VARCHAR(40) NOT NULL, sourceId VARCHAR(64) NOT NULL, sourceNo VARCHAR(255) NULL,
  sourceCurrency VARCHAR(16) NOT NULL, businessExchangeRate DECIMAL(24,10) NOT NULL,
  sourceAmountIncludingTax DECIMAL(20,2) NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_business_invoice (invoiceId,sourceType,sourceId), KEY idx_business_source (sourceType,sourceId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE IF NOT EXISTS merge_common_receipts (
  id VARCHAR(64) NOT NULL PRIMARY KEY, sourceType VARCHAR(40) NOT NULL, sourceId VARCHAR(64) NOT NULL,
  requestKey VARCHAR(64) NOT NULL, version INT NOT NULL DEFAULT 1,
  customerId VARCHAR(64) NOT NULL, undertakingUnitId VARCHAR(64) NOT NULL,
  currency VARCHAR(16) NOT NULL, exchangeRate DECIMAL(24,10) NULL, businessExchangeRate DECIMAL(24,10) NOT NULL,
  sourceCurrency VARCHAR(16) NOT NULL, sourceAmountIncludingTax DECIMAL(20,2) NOT NULL,
  amountExcludingTax DECIMAL(20,2) NOT NULL, taxRate DECIMAL(10,4) NOT NULL,
  taxAmount DECIMAL(20,2) NOT NULL, amountIncludingTax DECIMAL(20,2) NOT NULL,
  receivedDate DATE NULL, isReceived TINYINT NOT NULL DEFAULT 0, bankSerialNo VARCHAR(255) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active', remark TEXT NULL, voidReason TEXT NULL,
  createdBy VARCHAR(255) NULL, updatedBy VARCHAR(255) NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_receipt_request (sourceType,sourceId,requestKey), KEY idx_receipt_source (sourceType,sourceId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE IF NOT EXISTS merge_common_receipt_allocations (
  id VARCHAR(64) NOT NULL PRIMARY KEY, receiptId VARCHAR(64) NOT NULL, invoiceId VARCHAR(64) NOT NULL,
  amount DECIMAL(20,2) NOT NULL, invoiceExchangeRate DECIMAL(24,10) NOT NULL,
  invoiceAmount DECIMAL(20,2) NOT NULL,
  UNIQUE KEY uk_receipt_invoice (receiptId,invoiceId), KEY idx_receipt_invoice (invoiceId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

async function main() {
  const { queryRowsRaw, executeRaw, closeDb } = await import("../src/lib/db");
  try {
    const columns: Record<string, Record<string,string>> = {
      merge_power_prepaymentcontracts: { financeId: "VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL", financeAmountBasis: "VARCHAR(16) NULL", financeTaxRate: "DECIMAL(10,4) NULL", financeCustomerId: "VARCHAR(64) NULL", financeUnitId: "VARCHAR(64) NULL", financeVersion: "INT NOT NULL DEFAULT 0" },
      merge_common_feishu_approvals: { businessRequestJson: "LONGTEXT NULL" },
      merge_common_invoices: { importBatchId: "VARCHAR(64) NULL", importRowKey: "VARCHAR(128) NULL" },
    };
    const before: Record<string, unknown> = {};
    const statements: string[] = [];
    for (const [table, fields] of Object.entries(columns)) {
      before[table] = await queryRowsRaw(`SHOW CREATE TABLE ${table}`);
      const existing = await queryRowsRaw("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table", { table });
      for (const [field, definition] of Object.entries(fields)) if (!existing.some(row => row.COLUMN_NAME === field)) statements.push(`ALTER TABLE ${table} ADD COLUMN ${field} ${definition}`);
    }
    for (const [table, name, columns] of [
      ["merge_power_prepaymentcontracts", "uk_prepayment_finance", "financeId"],
      ["merge_common_invoices", "uk_invoice_import_row", "importBatchId,importRowKey"],
    ]) if (!(await queryRowsRaw(`SHOW INDEX FROM ${table}`)).some(row => row.Key_name === name)) statements.push(`ALTER TABLE ${table} ADD UNIQUE KEY ${name} (${columns})`);
    statements.push(...financeTables);
    for (const table of ["merge_common_invoice_business_links","merge_common_receipts","merge_common_receipt_allocations"]) {
      const [current] = await queryRowsRaw("SELECT TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table",{table});
      if (current) before[table] = await queryRowsRaw(`SHOW CREATE TABLE ${table}`);
      if (current && current.TABLE_COLLATION !== "utf8mb4_unicode_ci") statements.push(`ALTER TABLE ${table} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    }
    const [idColumn] = await queryRowsRaw("SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='merge_power_prepaymentcontracts' AND COLUMN_NAME='financeId'");
    if (idColumn && idColumn.COLLATION_NAME !== "utf8mb4_unicode_ci") statements.push("ALTER TABLE merge_power_prepaymentcontracts MODIFY financeId VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL");
    // Only stable technical IDs are backfilled; no tax, invoice, or receipt facts are inferred.
    statements.push("UPDATE merge_power_prepaymentcontracts SET financeId=UUID(),updatedAt=updatedAt WHERE financeId IS NULL OR financeId=''");
    const [database] = await queryRowsRaw("SELECT DATABASE() AS db");
    if (!process.argv.includes("--apply")) { console.log(JSON.stringify({ mode: "plan", database: database.db, statements }, null, 2)); return; }
    const stamp = `tmp/prepayment-finance/schema-before-${Date.now()}.json`;
    await mkdir("tmp/prepayment-finance", { recursive: true });
    before.contractKeys = await queryRowsRaw(`SELECT contractNo,updatedAt${idColumn ? ",financeId" : ""} FROM merge_power_prepaymentcontracts`);
    await writeFile(stamp, JSON.stringify(before, null, 2), { flag: "wx" });
    for (const sql of statements) await executeRaw(sql);
    console.log(JSON.stringify({ mode: "applied", database: database.db, statements: statements.length, backup: stamp }));
  } finally { await closeDb(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
