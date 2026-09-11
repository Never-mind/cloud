/**
 * 远程库结构对齐脚本（覆盖全部 merge_* 表）。
 *
 * 背景：早期的 compare/sync 只遍历 src/lib/db.ts 里的 50 张纳管表，
 * merge_po_* / merge_common_* / merge_cloud_* 等表被整体跳过，
 * 导致新增列（例如项目结算的 acceptanceCompletedAt）没有同步到远程。
 *
 * 用法：
 *   tsx scripts/sync-merge-schema.mjs            # 只打印计划（默认 dry-run）
 *   tsx scripts/sync-merge-schema.mjs --apply    # 执行
 *
 * 行为保证：只做 ADD COLUMN / MODIFY COLUMN / CREATE TABLE，绝不 DROP、不改数据。
 */
import mysql from "mysql2/promise";
import { buildDbConfig, LOGICAL_TABLE_NAMES, physicalTableName } from "../src/lib/db.ts";

const apply = process.argv.includes("--apply");
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

const numericTypes = /^(tinyint|smallint|mediumint|int|bigint|decimal|float|double|bit|year)/i;

function quoteDefault(value, type) {
  if (value === null || value === undefined) return null;
  const raw = String(value);
  if (/^current_timestamp(\(\d+\))?$/i.test(raw)) return raw.toUpperCase();
  if (numericTypes.test(type) || /^b'|^0x/i.test(raw)) return raw;
  return `'${raw.replace(/'/g, "''")}'`;
}

function columnDefinition(row) {
  const parts = [`\`${row.Field}\``, row.Type];
  if (row.Collation) parts.push(`CHARACTER SET ${String(row.Collation).split("_")[0]} COLLATE ${row.Collation}`);
  parts.push(String(row.Null).toUpperCase() === "NO" ? "NOT NULL" : "NULL");
  const defaultValue = quoteDefault(row.Default, row.Type);
  if (defaultValue !== null) parts.push(`DEFAULT ${defaultValue}`);
  else if (String(row.Null).toUpperCase() === "YES") parts.push("DEFAULT NULL");
  if (/on update current_timestamp/i.test(String(row.Extra ?? ""))) parts.push("ON UPDATE CURRENT_TIMESTAMP");
  if (String(row.Extra ?? "").includes("auto_increment")) parts.push("AUTO_INCREMENT");
  if (row.Comment) parts.push(`COMMENT '${String(row.Comment).replace(/'/g, "''")}'`);
  return parts.join(" ");
}

const listTables = async (conn, pattern) => {
  const [rows] = await conn.query("SHOW TABLES");
  const key = Object.keys(rows[0] ?? {})[0];
  return rows.map((row) => String(row[key])).filter((name) => pattern.test(name));
};

const fetchColumns = async (conn, table) => {
  try {
    const [rows] = await conn.query(`SHOW FULL COLUMNS FROM \`${table}\``);
    return rows;
  } catch {
    return null;
  }
};

const targets = new Set(await listTables(local, /^merge_/));
for (const logicalName of LOGICAL_TABLE_NAMES) targets.add(physicalTableName(logicalName));

const createStatements = [];
const alterStatements = [];

for (const table of [...targets].sort()) {
  const localRows = await fetchColumns(local, table);
  if (!localRows) continue;
  const remoteRows = await fetchColumns(remote, table);

  if (!remoteRows) {
    const [ddlRows] = await local.query(`SHOW CREATE TABLE \`${table}\``);
    const ddl = String(ddlRows[0]?.["Create Table"] ?? "");
    if (ddl) createStatements.push({ table, sql: ddl });
    continue;
  }

  const remoteByField = new Map(remoteRows.map((row) => [row.Field, row]));
  for (const row of localRows) {
    const remoteRow = remoteByField.get(row.Field);
    if (!remoteRow) {
      // 自增主键不能重复添加，远程缺失时说明整张表需要重建，这里只提示。
      if (String(row.Extra ?? "").includes("auto_increment")) {
        alterStatements.push({ table, kind: "skip", sql: `${row.Field}（自增主键远程缺失，需人工处理）` });
        continue;
      }
      alterStatements.push({ table, kind: "add", sql: `ALTER TABLE \`${table}\` ADD COLUMN ${columnDefinition(row)}` });
      continue;
    }
    if (String(row.Type).toLowerCase() !== String(remoteRow.Type).toLowerCase()) {
      alterStatements.push({ table, kind: "modify", sql: `ALTER TABLE \`${table}\` MODIFY COLUMN ${columnDefinition(row)}` });
    }
  }
}

const applicable = alterStatements.filter((item) => item.kind !== "skip");
const skipped = alterStatements.filter((item) => item.kind === "skip");

console.log(`扫描本地 merge_* 表 ${targets.size} 张`);
console.log(`计划：新建表 ${createStatements.length} 张，新增列 ${applicable.filter((i) => i.kind === "add").length} 个，类型调整 ${applicable.filter((i) => i.kind === "modify").length} 个，需人工 ${skipped.length} 个\n`);
for (const item of createStatements) console.log(`[CREATE] ${item.table}`);
for (const item of applicable) console.log(`[${item.kind === "add" ? "ADD   " : "MODIFY"}] ${item.sql}`);
for (const item of skipped) console.log(`[SKIP  ] ${item.table}.${item.sql}`);

if (!apply) {
  console.log("\n当前为 dry-run，未执行任何语句。追加 --apply 才会生效。");
} else {
  let ok = 0;
  const failed = [];
  for (const item of createStatements) {
    try {
      await remote.query(item.sql);
      ok += 1;
      console.log(`已建表 ${item.table}`);
    } catch (error) {
      failed.push(`${item.table} -> ${error.code ?? ""} ${error.message}`);
    }
  }
  for (const item of applicable) {
    try {
      await remote.query(item.sql);
      ok += 1;
    } catch (error) {
      failed.push(`${item.sql} -> ${error.code ?? ""} ${error.message}`);
    }
  }
  console.log(`\n执行完成：成功 ${ok} 条，失败 ${failed.length} 条`);
  for (const item of failed) console.log(`  失败：${item}`);
}

await local.end();
await remote.end();
