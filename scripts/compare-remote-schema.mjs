import mysql from "mysql2/promise";
import { buildDbConfig, LOGICAL_TABLE_NAMES, physicalTableName } from "../src/lib/db.ts";

const remoteConfig = {
  host: process.env.TARGET_DB_HOST,
  port: Number(process.env.TARGET_DB_PORT ?? 3306),
  user: process.env.TARGET_DB_USER,
  password: process.env.TARGET_DB_PASSWORD,
  database: process.env.TARGET_DB_NAME,
};

for (const [key, value] of Object.entries(remoteConfig)) {
  if (!value && key !== "port") throw new Error(`Missing ${key}`);
}

const local = await mysql.createConnection(buildDbConfig(process.env));
const remote = await mysql.createConnection(remoteConfig);
const differences = [];

// 只遍历纳管表会漏掉 merge_po_* / merge_common_* 等表（历史上就是这样漏掉了
// 项目结算的 acceptanceCompletedAt），因此这里以本地库实际存在的 merge_* 表为准。
const [tableRows] = await local.query("SHOW TABLES");
const tableKey = Object.keys(tableRows[0] ?? {})[0];
const targetTables = new Set(tableRows.map((row) => String(row[tableKey])).filter((name) => /^merge_/.test(name)));
for (const logicalName of LOGICAL_TABLE_NAMES) targetTables.add(physicalTableName(logicalName));

for (const tableName of [...targetTables].sort()) {
  const [localRows] = await local.query(`SHOW FULL COLUMNS FROM \`${tableName}\``).catch(() => [[]]);
  const [remoteRows] = await remote.query(`SHOW FULL COLUMNS FROM \`${tableName}\``).catch(() => [[]]);
  // 逻辑表清单里存在、但本地库并未建表的条目直接跳过，避免整脚本中断。
  if (!localRows.length && !remoteRows.length) continue;
  if (!localRows.length) {
    differences.push({ tableName, missing: [], extra: remoteRows.map((row) => row.Field), changed: [], remoteExists: true, localExists: false });
    continue;
  }
  const localByField = new Map(localRows.map((row) => [row.Field, normalize(row)]));
  const remoteByField = new Map(remoteRows.map((row) => [row.Field, normalize(row)]));
  const missing = [...localByField.keys()].filter((field) => !remoteByField.has(field));
  const extra = [...remoteByField.keys()].filter((field) => !localByField.has(field));
  const changed = [...localByField.keys()].flatMap((field) => {
    const localColumn = localByField.get(field);
    const remoteColumn = remoteByField.get(field);
    return remoteColumn && localColumn !== remoteColumn ? [{ field, local: localColumn, remote: remoteColumn }] : [];
  });
  if (missing.length || extra.length || changed.length || !remoteRows.length) {
    differences.push({ tableName, missing, extra, changed, remoteExists: Boolean(remoteRows.length) });
  }
}

console.log(JSON.stringify(differences, null, 2));
await Promise.all([local.end(), remote.end()]);

function normalize(column) {
  return `${column.Type}|${column.Null}|${column.Default ?? ""}|${column.Extra ?? ""}`.toLowerCase();
}
