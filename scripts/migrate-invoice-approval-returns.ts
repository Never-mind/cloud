import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { buildDbConfig, closeDb, executeRaw, queryRowsRaw } from "../src/lib/db";

loadEnvConfig(process.cwd());
async function main() {
  const config = buildDbConfig(process.env);
  if (process.argv.includes("--local-only") && !["localhost", "127.0.0.1", "::1"].includes(config.host)) throw new Error("Local-only migration refused a remote database");
  console.log(JSON.stringify({ host: config.host, database: config.database, apply: process.argv.includes("--apply") }));
  const ddl = await readFile(new URL("./invoice-approval-returns.sql", import.meta.url), "utf8");
  if (!process.argv.includes("--apply")) { console.log(ddl); return; }
  await executeRaw(ddl);
  const rows = await queryRowsRaw("SELECT COUNT(*) AS columnsFound FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_common_invoice_approval_files'");
  console.log("Verified return-file table:", rows[0]);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(closeDb);
