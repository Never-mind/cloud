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

for (const logicalName of LOGICAL_TABLE_NAMES) {
  const tableName = physicalTableName(logicalName);
  const [localRows] = await local.query(`SHOW FULL COLUMNS FROM \`${tableName}\``);
  const [remoteRows] = await remote.query(`SHOW FULL COLUMNS FROM \`${tableName}\``).catch(() => [[]]);
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
