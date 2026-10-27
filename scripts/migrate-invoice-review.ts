import { closeDb, executeRaw, queryRowsRaw } from "../src/lib/db";

async function main() {
  const rows = await queryRowsRaw<{ count: number }>(
    "SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_servicefeesnapshots' AND COLUMN_NAME = 'invoiceDate'",
  );
  if (!Number(rows[0]?.count)) {
    await executeRaw("ALTER TABLE merge_power_servicefeesnapshots ADD COLUMN invoiceDate DATE NULL COMMENT 'Invoice issue date, separate from receivable date'");
    console.log("Added service fee invoiceDate. Historical dates were not inferred.");
  } else console.log("invoiceDate already exists.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(closeDb);
