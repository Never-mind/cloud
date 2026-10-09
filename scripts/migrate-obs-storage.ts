import { closeDb, executeRaw, queryRowsRaw } from "../src/lib/db";

/**
 * 文件外置到 OBS 的索引字段（幂等）。
 *
 * 只给 4 张附件表加 3 列：storageProvider（db/obs）、storageKey（对象键）、storageUrl（可选直链）。
 * 原有 dataUrl 不动，历史文件仍能下载。
 * 用法：npm run schema:obs-storage
 */
const TABLES = ["merge_common_attachments", "merge_cloud_attachments", "merge_po_settlement_attachments", "merge_common_document_files"];

async function addColumnIfMissing(tableName: string, columnName: string, ddl: string) {
  const rows = await queryRowsRaw<{ count: number }>(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName AND COLUMN_NAME = :columnName`,
    { tableName, columnName },
  );
  if (Number(rows[0]?.count ?? 0) > 0) return false;
  await executeRaw(`ALTER TABLE \`${tableName}\` ADD COLUMN ${ddl}`);
  return true;
}

async function main() {
  for (const table of TABLES) {
    const exists = await queryRowsRaw<{ count: number }>(
      `SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table`,
      { table },
    );
    if (!Number(exists[0]?.count ?? 0)) {
      console.log(`表不存在，跳过：${table}`);
      continue;
    }
    const added: string[] = [];
    if (await addColumnIfMissing(table, "storageProvider", "`storageProvider` VARCHAR(16) NOT NULL DEFAULT 'db' COMMENT '文件存放位置：db=数据库内 dataUrl，obs=对象存储'")) added.push("storageProvider");
    if (await addColumnIfMissing(table, "storageKey", "`storageKey` VARCHAR(500) NULL COMMENT 'OBS 对象键（含目录与文件名）'")) added.push("storageKey");
    if (await addColumnIfMissing(table, "storageUrl", "`storageUrl` VARCHAR(1000) NULL COMMENT '可选的对象直链（一般留空，下载走服务端代理）'")) added.push("storageUrl");
    /**
     * 文件外置到 OBS 后 dataUrl 就是空的，但这 4 张表历史上是 NOT NULL，
     * 不给成可空的话，只要是走 OBS 的附件上传都会报 "Column 'dataUrl' cannot be null"。
     * 新表 merge_power_billingstatement_attachments 建表时就是可空的，这里对齐。
     */
    if (await ensureNullableDataUrl(table)) added.push("dataUrl→NULL");
    console.log(added.length ? `已补字段：${table} → ${added.join(", ")}` : `字段已存在，跳过：${table}`);
  }
  console.log("OBS 文件索引字段已就绪");
}

async function ensureNullableDataUrl(table: string) {
  const rows = await queryRowsRaw<{ IS_NULLABLE: string }>(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = 'dataUrl' LIMIT 1`,
    { table },
  );
  if (!rows.length) return false;
  if (String(rows[0].IS_NULLABLE).toUpperCase() === "YES") return false;
  await executeRaw(`ALTER TABLE \`${table}\` MODIFY COLUMN \`dataUrl\` LONGTEXT NULL COMMENT '文件内容（base64 data URL；已外置到 OBS 时为空）'`);
  return true;
}

main()
  .catch((error) => {
    console.error("补字段失败", error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
