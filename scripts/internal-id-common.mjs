import mysql from "mysql2/promise";

export const INTERNAL_ID_COLUMN = "internalId";
export const INTERNAL_ID_TEMP_INDEX = "uk_internal_id";
export const LEGACY_INDEX_PREFIX = "uk_internal_legacy_";

export function buildConnectionConfig(env = process.env) {
  return {
    host: env.DB_HOST ?? "localhost",
    port: Number(env.DB_PORT ?? 3306),
    user: env.DB_USER ?? "root",
    password: env.DB_PASSWORD ?? "root",
    database: env.DB_NAME ?? "merge",
  };
}

export function quoteIdentifier(value) {
  return `\`${String(value).replaceAll("`", "``")}\``;
}

export function legacyIndexName(tableName) {
  const normalized = String(tableName).replace(/[^A-Za-z0-9_]/g, "_");
  return `${LEGACY_INDEX_PREFIX}${normalized}`.slice(0, 64);
}

export function findUniqueIndex(metadata, columns, { excludePrimary = false } = {}) {
  const expected = columns.join(",");
  return metadata.indexes.find((index) =>
    (!excludePrimary || index.indexName !== "PRIMARY") &&
    Number(index.nonUnique) === 0 &&
    String(index.indexColumns ?? "") === expected,
  ) ?? null;
}

export async function listMergeTables(connection) {
  const [rows] = await connection.query(
    "SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE ? ORDER BY TABLE_NAME",
    ["merge\\_%"],
  );
  return rows.map((row) => String(row.tableName));
}

export async function getTableMetadata(connection, tableName) {
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME AS columnName, COLUMN_TYPE AS columnType, IS_NULLABLE AS isNullable,
            COLUMN_KEY AS columnKey, EXTRA AS extra, COLUMN_COMMENT AS columnComment,
            ORDINAL_POSITION AS ordinalPosition
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [tableName],
  );
  const [indexes] = await connection.query(
    `SELECT INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS indexColumns
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      GROUP BY INDEX_NAME, NON_UNIQUE
      ORDER BY INDEX_NAME`,
    [tableName],
  );
  return {
    tableName,
    columns,
    indexes,
    internalId: columns.find((column) => column.columnName === INTERNAL_ID_COLUMN) ?? null,
    primaryKey: indexes.find((index) => index.indexName === "PRIMARY") ?? null,
  };
}

export function primaryColumns(metadata) {
  return String(metadata.primaryKey?.indexColumns ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function indexHasColumns(metadata, columns, { uniqueOnly = false } = {}) {
  const expected = columns.join(",");
  return metadata.indexes.some((index) =>
    (!uniqueOnly || Number(index.nonUnique) === 0) && String(index.indexColumns ?? "") === expected,
  );
}

export function buildForwardSql(metadata) {
  const oldColumns = primaryColumns(metadata);
  if (!oldColumns.length) throw new Error(`${metadata.tableName} 没有现有主键`);
  if (metadata.internalId) {
    if (oldColumns.length === 1 && oldColumns[0] === INTERNAL_ID_COLUMN) return [`-- ${metadata.tableName} 已完成 internalId 迁移`];
    throw new Error(`${metadata.tableName}.internalId 已存在但尚未切换为主键，不能生成无上下文的迁移 SQL`);
  }

  const oldUniqueIndex = findUniqueIndex(metadata, oldColumns, { excludePrimary: true });
  const legacyName = oldUniqueIndex?.indexName ?? legacyIndexName(metadata.tableName);
  const legacyIndexSql = oldUniqueIndex
    ? `-- 已存在等价唯一索引 ${quoteIdentifier(legacyName)}，迁移后继续保留`
    : `ALTER TABLE ${quoteIdentifier(metadata.tableName)} ADD UNIQUE KEY ${quoteIdentifier(legacyName)} (${oldColumns.map(quoteIdentifier).join(", ")});`;
  return [
    `-- ${metadata.tableName}: ${oldColumns.join(", ")} 保留为公开业务键，internalId 改为 InnoDB 主键`,
    `ALTER TABLE ${quoteIdentifier(metadata.tableName)} ADD COLUMN ${quoteIdentifier(INTERNAL_ID_COLUMN)} INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;`,
    `SET @merge_internal_id := 0;`,
    `SELECT @merge_internal_id := COALESCE(MAX(${quoteIdentifier(INTERNAL_ID_COLUMN)}), 0) FROM ${quoteIdentifier(metadata.tableName)};`,
    `UPDATE ${quoteIdentifier(metadata.tableName)} SET ${quoteIdentifier(INTERNAL_ID_COLUMN)} = (@merge_internal_id := @merge_internal_id + 1) WHERE ${quoteIdentifier(INTERNAL_ID_COLUMN)} IS NULL ORDER BY ${oldColumns.map(quoteIdentifier).join(", ")};`,
    `ALTER TABLE ${quoteIdentifier(metadata.tableName)} ADD UNIQUE KEY ${quoteIdentifier(INTERNAL_ID_TEMP_INDEX)} (${quoteIdentifier(INTERNAL_ID_COLUMN)});`,
    `ALTER TABLE ${quoteIdentifier(metadata.tableName)} MODIFY COLUMN ${quoteIdentifier(INTERNAL_ID_COLUMN)} INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';`,
    legacyIndexSql,
    `ALTER TABLE ${quoteIdentifier(metadata.tableName)} DROP PRIMARY KEY, DROP INDEX ${quoteIdentifier(INTERNAL_ID_TEMP_INDEX)}, ADD PRIMARY KEY (${quoteIdentifier(INTERNAL_ID_COLUMN)});`,
    "",
  ];
}

export function buildRollbackSql(tableName, oldColumns, legacyIndex = legacyIndexName(tableName), dropLegacyIndex = true) {
  return [
    `-- ${tableName}: 恢复原主键 ${oldColumns.join(", ")}，不恢复或重生成任何业务数据`,
    `ALTER TABLE ${quoteIdentifier(tableName)} MODIFY COLUMN ${quoteIdentifier(INTERNAL_ID_COLUMN)} INT UNSIGNED NULL;`,
    `ALTER TABLE ${quoteIdentifier(tableName)} DROP PRIMARY KEY${dropLegacyIndex ? `, DROP INDEX ${quoteIdentifier(legacyIndex)}` : ""}, ADD PRIMARY KEY (${oldColumns.map(quoteIdentifier).join(", ")}), DROP COLUMN ${quoteIdentifier(INTERNAL_ID_COLUMN)};`,
    "",
  ];
}

export async function countRows(connection, tableName) {
  const [[row]] = await connection.query(`SELECT COUNT(*) AS total FROM ${quoteIdentifier(tableName)}`);
  return Number(row?.total ?? 0);
}

export async function closeConnection(connection) {
  if (connection) await connection.end();
}

export { mysql };
