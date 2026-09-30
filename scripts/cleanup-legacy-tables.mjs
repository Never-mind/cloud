import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

/**
 * 清理历史遗留的"无前缀"旧表（power_*）。
 *
 * 应用所有查询都会被 db.ts 的 physicalTableName() 改写到 merge_* 前缀，
 * 这些 power_* 表已经不会再被读写（实测 46 张、约 107MB）。
 * 脚本会先把每张表的数据导出到 backup/，确认导出成功后再 DROP。
 *
 * 用法：
 *   node scripts/cleanup-legacy-tables.mjs              只列出将删除的表与体量
 *   node scripts/cleanup-legacy-tables.mjs --apply      备份后删除
 *   node scripts/cleanup-legacy-tables.mjs --apply --keep=power_importjobs,power_monthlybillingwriteoffs   跳过指定表
 */
const apply = process.argv.includes("--apply");
const keepArg = process.argv.find((value) => value.startsWith("--keep="))?.split("=")[1] ?? "";
const keep = new Set(keepArg.split(",").map((value) => value.trim()).filter(Boolean));

const conn = await mysql.createConnection({ host: process.env.DB_HOST ?? "127.0.0.1", user: process.env.DB_USER ?? "root", password: process.env.DB_PASSWORD ?? "root", database: process.env.DB_NAME ?? "merge", charset: "utf8mb4" });

const [tables] = await conn.query(
  `SELECT TABLE_NAME AS tableName, TABLE_ROWS AS rowEstimate, ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 1) AS mb
     FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'power\\_%'
    ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC`,
);
const targets = tables.filter((row) => !keep.has(row.tableName));
console.table(targets.map((row) => ({ 表: row.tableName, 行数估计: row.rowEstimate, 大小MB: row.mb })));
console.log(`\n共 ${targets.length} 张（合计 ${targets.reduce((sum, row) => sum + Number(row.mb ?? 0), 0).toFixed(1)} MB）${keep.size ? `，已排除 ${[...keep].join("、")}` : ""}`);

if (!apply) {
  console.log("未执行删除。备份+删除请加 --apply。");
  await conn.end();
  process.exit(0);
}

const backupDir = path.resolve("backup", `legacy-tables-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}`);
fs.mkdirSync(backupDir, { recursive: true });
console.log(`\n备份目录：${backupDir}`);

let dropped = 0;
for (const { tableName } of targets) {
  const [rows] = await conn.query(`SELECT * FROM \`${tableName}\``);
  fs.writeFileSync(path.join(backupDir, `${tableName}.json`), JSON.stringify(rows));
  await conn.query(`DROP TABLE \`${tableName}\``);
  dropped += 1;
  console.log(`  ✔ 已备份并删除 ${tableName}（${rows.length} 行）`);
}
console.log(`\n完成：删除 ${dropped} 张遗留表，数据已备份到 ${backupDir}`);
await conn.end();
