import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import type { RowDataPacket } from "mysql2";
import { closeDb, getDb } from "../src/lib/db";

loadEnvConfig(process.cwd());
const tables = ["merge_power_servicefeesnapshots", "merge_cloud_rows", "merge_po_settlement_sales", "merge_po_settlement_invoices"];

async function main() {
  const apply = process.argv.includes("--apply");
  const connection = await getDb().getConnection();
  try {
    const [identity] = await connection.query<RowDataPacket[]>("SELECT DATABASE() AS databaseName");
    console.log(JSON.stringify({ host: process.env.DB_HOST ?? "localhost", database: identity[0].databaseName, apply }));
    const pending: string[] = [];
    const schemas: string[] = [];
    for (const table of tables) {
      const [ddl] = await connection.query<RowDataPacket[]>(`SHOW CREATE TABLE \`${table}\``);
      schemas.push(`${ddl[0]["Create Table"]};`);
      const [columns] = await connection.query<RowDataPacket[]>("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table AND COLUMN_NAME='bankSerialNo'", { table });
      if (columns.length) { console.log(`${table}.bankSerialNo: already present`); continue; }
      pending.push(`ALTER TABLE \`${table}\` ADD COLUMN bankSerialNo VARCHAR(255) NULL COMMENT '银行流水号', ALGORITHM=INPLACE, LOCK=NONE`);
    }
    if (apply && pending.length) {
      await mkdir(resolve("backup"), { recursive: true });
      const file = resolve("backup", `receipt-bank-serial-${new Date().toISOString().replace(/[:.]/g, "-")}-schema.sql`);
      await writeFile(file, schemas.join("\n\n") + "\n", { flag: "wx" });
      console.log(`Schema backup: ${file}`);
      await connection.query("SET SESSION lock_wait_timeout=10");
    }
    for (const sql of pending) { console.log(`${apply ? "APPLY" : "PLAN"}: ${sql}`); if (apply) await connection.query(sql); }
  } finally { connection.release(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Migration failed"); process.exitCode = 1; }).finally(closeDb);
