import mysql from "mysql2/promise";
import { buildDbConfig, physicalTableName } from "../src/lib/db";

const remoteConfig = {
  host: process.env.TARGET_DB_HOST,
  port: Number(process.env.TARGET_DB_PORT ?? 3306),
  user: process.env.TARGET_DB_USER,
  password: process.env.TARGET_DB_PASSWORD,
  database: process.env.TARGET_DB_NAME,
};

if (process.env.APPLY_REMOTE_SCHEMA !== "1") {
  throw new Error("Set APPLY_REMOTE_SCHEMA=1 to apply the remote schema correction.");
}
for (const [key, value] of Object.entries(remoteConfig)) {
  if (!value && key !== "port") throw new Error(`Missing ${key}`);
}

let local: mysql.Connection;
let remote: mysql.Connection;

async function main() {
  local = await mysql.createConnection(buildDbConfig(process.env));
  remote = await mysql.createConnection(remoteConfig);
  try {
    await rebuildCountries();
    await createMissingTables([
      "internalserviceledgers",
      "monthlyinternalservicefees",
      "internalservicefeeadjustments",
      "internalservicefeesnapshots",
      "internalservicefeesnapshotitems",
    ]);
    await remote.execute("ALTER TABLE `merge_power_purchaseorders` MODIFY COLUMN `purchaseOrderId` VARCHAR(128) NULL");
    for (const field of [
      "childSparePartCode", "childTopSn", "customerChildComponentOriginalSn", "childComponentDescription",
      "rowId", "tenantId", "template", "version",
    ]) {
      await remote.execute(`ALTER TABLE \`merge_power_purchaseordersnitems\` MODIFY COLUMN \`${field}\` VARCHAR(1024) NULL`);
    }
    console.log("Remote schema correction completed.");
  } finally {
    await Promise.all([local?.end(), remote?.end()]);
  }
}

async function rebuildCountries() {
  const target = physicalTableName("countries");
  const backup = `${target}_legacy_20260720`;
  const [existing] = await remote.query<any[]>(`SHOW TABLES LIKE '${target}'`);
  if (existing.length) {
    const [backupExists] = await remote.query<any[]>(`SHOW TABLES LIKE '${backup}'`);
    if (!backupExists.length) await remote.execute(`RENAME TABLE \`${target}\` TO \`${backup}\``);
  }
  await createFromLocal("countries");
  const [legacyRows] = await remote.query<any[]>(`SELECT abbr, name_cn, name_en FROM \`${backup}\``).catch(() => [[]]);
  const [localRates] = await local.query<any[]>(`SELECT code, vatRate, nameLocal FROM \`${target}\``);
  const rateByCode = new Map(localRates.map((row) => [String(row.code), row]));
  for (const row of legacyRows) {
    const code = String(row.abbr ?? "").trim();
    if (!code) continue;
    const localCountry = rateByCode.get(code);
    await remote.execute(
      `INSERT INTO \`${target}\` (code, nameZh, nameEn, nameLocal, vatRate)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE nameZh = VALUES(nameZh), nameEn = VALUES(nameEn), nameLocal = VALUES(nameLocal), vatRate = VALUES(vatRate)`,
      [code, row.name_cn ?? "", row.name_en ?? "", localCountry?.nameLocal ?? row.name_en ?? "", localCountry?.vatRate ?? null],
    );
  }
}

async function createMissingTables(tableNames: string[]) {
  for (const tableName of tableNames) {
    const physicalName = physicalTableName(tableName);
    const [existing] = await remote.query<any[]>(`SHOW TABLES LIKE '${physicalName}'`);
    if (!existing.length) await createFromLocal(tableName);
  }
}

async function createFromLocal(logicalName: string) {
  const physicalName = physicalTableName(logicalName);
  const [result] = await local.query<any[]>(`SHOW CREATE TABLE \`${physicalName}\``);
  const statement = String(result[0]?.["Create Table"] ?? "");
  if (!statement) throw new Error(`Unable to read local definition for ${physicalName}`);
  await remote.query(statement);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
