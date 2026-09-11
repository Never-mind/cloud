/**
 * 远程库数据缺口巡检（只读）。
 *
 * 结构同步只能保证“列存在”，无法保证“列里有值”。历史上不少新增列是靠
 * scripts/migrate.ts 里的回填语句补的数据（币种、算力价快照、customerId、
 * requestType 等），这些回填没有在远程执行过，于是远程列全空。
 *
 * 本脚本逐表比对本地与远程的非空行数，输出：
 *   - 本地有值 / 远程全空：需要回填
 *   - 远程有值但少于本地：部分缺失，需人工确认
 *
 * 用法：tsx scripts/check-remote-data-gaps.mjs
 */
import mysql from "mysql2/promise";
import { buildDbConfig, LOGICAL_TABLE_NAMES, physicalTableName } from "../src/lib/db.ts";

const remoteConfig = {
  host: process.env.TARGET_DB_HOST,
  port: Number(process.env.TARGET_DB_PORT ?? 3306),
  user: process.env.TARGET_DB_USER,
  password: process.env.TARGET_DB_PASSWORD,
  database: process.env.TARGET_DB_NAME,
  charset: "utf8mb4",
};
for (const [key, value] of Object.entries(remoteConfig)) {
  if (key === "port" || key === "charset") continue;
  if (!value) throw new Error(`缺少远程库参数：${key}`);
}

const local = await mysql.createConnection(buildDbConfig(process.env));
const remote = await mysql.createConnection(remoteConfig);

const fetchColumns = async (conn, table) => {
  try {
    const [rows] = await conn.query(`SHOW FULL COLUMNS FROM \`${table}\``);
    return rows;
  } catch {
    return null;
  }
};

const filledExpr = (column) =>
  `SUM(CASE WHEN \`${column}\` IS NOT NULL AND CAST(\`${column}\` AS CHAR) <> '' THEN 1 ELSE 0 END)`;

const aggregate = async (conn, table, columns) => {
  const projection = columns.map((column, index) => `${filledExpr(column)} AS \`c${index}\``).join(", ");
  const [rows] = await conn.query(`SELECT COUNT(*) AS \`__total\`, ${projection} FROM \`${table}\``);
  return rows[0];
};

const single = async (conn, table, column) => {
  try {
    const [rows] = await conn.query(`SELECT COUNT(*) AS t, ${filledExpr(column)} AS f FROM \`${table}\``);
    return { total: Number(rows[0].t ?? 0), filled: Number(rows[0].f ?? 0) };
  } catch (error) {
    return { error: error.message };
  }
};

const listTables = async (conn) => {
  const [rows] = await conn.query("SHOW TABLES");
  const key = Object.keys(rows[0] ?? {})[0];
  return rows.map((row) => String(row[key])).filter((name) => /^merge_/.test(name));
};

const targets = new Set([
  ...LOGICAL_TABLE_NAMES.map((name) => physicalTableName(name)),
  ...(await listTables(local)),
]);

const needBackfill = [];
const partial = [];
const skipped = [];

for (const table of [...targets].sort()) {
  const [localColumns, remoteColumns] = await Promise.all([
    fetchColumns(local, table),
    fetchColumns(remote, table),
  ]);
  if (!localColumns || !remoteColumns) {
    skipped.push(`${table}（本地${localColumns ? "有" : "无"}，远程${remoteColumns ? "有" : "无"}）`);
    continue;
  }
  const remoteSet = new Set(remoteColumns.map((row) => row.Field));
  const columns = localColumns.map((row) => row.Field).filter((field) => remoteSet.has(field));

  let localStats;
  let remoteStats;
  try {
    localStats = await aggregate(local, table, columns);
    remoteStats = await aggregate(remote, table, columns);
  } catch {
    localStats = null;
    remoteStats = null;
  }

  for (const [index, column] of columns.entries()) {
    let l;
    let r;
    if (localStats && remoteStats) {
      l = { total: Number(localStats.__total ?? 0), filled: Number(localStats[`c${index}`] ?? 0) };
      r = { total: Number(remoteStats.__total ?? 0), filled: Number(remoteStats[`c${index}`] ?? 0) };
    } else {
      l = await single(local, table, column);
      r = await single(remote, table, column);
    }
    if (l.error || r.error) {
      skipped.push(`${table}.${column}（读取失败：${l.error ?? r.error}）`);
      continue;
    }
    if (l.filled > 0 && r.filled === 0) {
      needBackfill.push({ table, column, l, r });
    } else if (l.filled > 0 && r.filled > 0 && r.filled < l.filled) {
      partial.push({ table, column, l, r });
    }
  }
}

const fmt = ({ total, filled }) => `${total}/${filled}`;
// 两边行数本身就不同时，缺值往往只是“本地多了几条本地数据”，不是漏回填，单独标注以便判断。
const rowNote = (item) => (item.l.total === item.r.total ? "" : `  ⚠行数不同（本地 ${item.l.total} / 远程 ${item.r.total}）`);

console.log("=".repeat(100));
console.log(`本地有值、远程全空（需要回填）的列：${needBackfill.length} 个`);
console.log("=".repeat(100));
for (const item of needBackfill) {
  console.log(`${`${item.table}.${item.column}`.padEnd(58)} 本地 ${fmt(item.l).padEnd(12)} 远程 ${fmt(item.r)}${rowNote(item)}`);
}

console.log("");
console.log("=".repeat(100));
console.log(`远程有值但少于本地（部分缺失，需人工确认）的列：${partial.length} 个`);
console.log("=".repeat(100));
for (const item of partial) {
  console.log(`${`${item.table}.${item.column}`.padEnd(58)} 本地 ${fmt(item.l).padEnd(12)} 远程 ${fmt(item.r)}${rowNote(item)}`);
}

if (skipped.length) {
  console.log("");
  console.log("=".repeat(100));
  console.log(`跳过的对象：${skipped.length} 个`);
  console.log("=".repeat(100));
  for (const item of skipped) console.log(item);
}

await local.end();
await remote.end();
