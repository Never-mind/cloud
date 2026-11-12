import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { prospectSchema } from "../src/lib/prospect-schema";
loadEnvConfig(process.cwd());
async function main() {
  const { queryRowsRaw, executeRaw, closeDb } = await import("../src/lib/db");
  try {
    const statements = [...prospectSchema];
    const columns = await queryRowsRaw("SHOW COLUMNS FROM merge_common_customers LIKE 'paymentTermDays'");
    if (!columns.length) statements.push("ALTER TABLE merge_common_customers ADD COLUMN paymentTermDays INT NULL COMMENT '默认开票账期天数，空值按30天'");
    const [db] = await queryRowsRaw("SELECT DATABASE() AS databaseName");
    if (!process.argv.includes("--apply")) { console.log(JSON.stringify({ host: process.env.DB_HOST, ...db, statements }, null, 2)); return; }
    const before: Record<string, unknown> = {};
    for (const table of ["merge_common_customers", "merge_common_prospects", "merge_common_prospect_followups", "merge_common_prospect_conversion_lock"]) {
      const exists = await queryRowsRaw("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table", { table });
      before[table] = exists.length ? await queryRowsRaw(`SHOW CREATE TABLE ${table}`) : null;
    }
    await mkdir("backup/prospects", { recursive: true });
    const backup = `backup/prospects/schema-before-${Date.now()}.json`;
    await writeFile(backup, JSON.stringify(before, null, 2), { flag: "wx" });
    for (const sql of statements) await executeRaw(sql);
    console.log(JSON.stringify({ ...db, applied: statements.length, backup }));
  } finally { await closeDb(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
