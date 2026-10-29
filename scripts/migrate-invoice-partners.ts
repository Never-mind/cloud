import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RowDataPacket } from "mysql2";
import { closeDb, getDb } from "../src/lib/db";

// Additive only. Defaults to a read-only plan; --apply is explicit.
const additions = [
  ["merge_common_feishu_approvals", "partySnapshotJson", "LONGTEXT NULL COMMENT '本次开票双方资料快照'"],
  ["merge_cloud_supplier_payments", "invoiceSupplierId", "VARCHAR(64) NULL COMMENT '实际开票供应商ID'"],
  ["merge_cloud_supplier_payments", "invoiceSupplierName", "VARCHAR(255) NULL COMMENT '实际开票供应商名称快照'"],
] as const;
async function main() {
  const apply = process.argv.includes("--apply");
  const connection = await getDb().getConnection();
  try {
    const pending: string[] = [];
    for (const [table, column, definition] of additions) {
      const [rows] = await connection.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column", { table, column });
      if (Number(rows[0]?.count)) { console.log(`${table}.${column}: already present`); continue; }
      pending.push(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}, ALGORITHM=INPLACE, LOCK=NONE`);
    }
    if (apply && pending.length) {
      // Keep the pre-change DDL only; never export business rows or credentials.
      const schemas: string[] = [];
      for (const table of new Set(additions.map(([table]) => table))) {
        const [rows] = await connection.query<RowDataPacket[]>(`SHOW CREATE TABLE ${table}`);
        schemas.push(`${rows[0]["Create Table"]};`);
      }
      const directory = resolve("backup");
      await mkdir(directory, { recursive: true });
      const path = resolve(directory, `invoice-partners-${new Date().toISOString().replace(/[:.]/g, "-")}-schema.sql`);
      await writeFile(path, schemas.join("\n\n") + "\n", { flag: "wx" });
      console.log(`Schema backup: ${path}`);
      // Fail promptly on metadata locks; do not fall back to a blocking table copy.
      await connection.query("SET SESSION lock_wait_timeout = 10");
    }
    for (const sql of pending) {
      console.log(`${apply ? "APPLY" : "PLAN"}: ${sql}`);
      if (apply) await connection.query(sql);
    }
  } finally {
    connection.release();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Migration failed"); process.exitCode = 1; }).finally(closeDb);
