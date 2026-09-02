import { buildConnectionConfig, closeConnection, countRows, findUniqueIndex, getTableMetadata, INTERNAL_ID_COLUMN, INTERNAL_ID_TEMP_INDEX, legacyIndexName, listMergeTables, mysql, primaryColumns, quoteIdentifier } from "./internal-id-common.mjs";

const applyChanges = process.env.APPLY_INTERNAL_ID_MIGRATION === "1";
const connection = await mysql.createConnection({ ...buildConnectionConfig(), multipleStatements: true });
const operations = [];
const warnings = [];
const MAX_UNSIGNED_INT_ROWS = 4_294_967_294;

try {
  const tables = await listMergeTables(connection);
  for (const tableName of tables) {
    const metadata = await getTableMetadata(connection, tableName);
    const oldPrimaryColumns = primaryColumns(metadata);
    if (!oldPrimaryColumns.length) throw new Error(`${tableName} 没有现有主键，已停止`);

    const rowCount = await countRows(connection, tableName);
    if (rowCount > MAX_UNSIGNED_INT_ROWS) throw new Error(`${tableName} 有 ${rowCount} 行，超过 INT UNSIGNED 可用范围`);

    if (metadata.internalId && (
      String(metadata.internalId.columnType).toLowerCase() !== "int unsigned" ||
      String(metadata.internalId.isNullable).toUpperCase() === "NO" && !String(metadata.internalId.extra ?? "").toLowerCase().includes("auto_increment")
    )) {
      throw new Error(`${tableName}.internalId 已存在但类型或自增属性不符合预期，已停止以避免改写现有结构`);
    }

    if (!metadata.internalId) {
      operations.push({
        tableName,
        kind: "add-column",
        sql: `ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(INTERNAL_ID_COLUMN)} INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST`,
      });
    }

    const oldPrimaryIsInternal = oldPrimaryColumns.length === 1 && oldPrimaryColumns[0] === INTERNAL_ID_COLUMN;
    if (!oldPrimaryIsInternal) {
      const legacyIndex = findUniqueIndex(metadata, oldPrimaryColumns, { excludePrimary: true })?.indexName ?? legacyIndexName(tableName);
      const hasLegacyIndex = Boolean(findUniqueIndex(metadata, oldPrimaryColumns, { excludePrimary: true }));
      const hasInternalIndex = metadata.indexes.some((index) => index.indexName === INTERNAL_ID_TEMP_INDEX);
      operations.push({
        tableName,
        kind: "backfill-column",
        sql: `SET @merge_internal_id := 0; SELECT @merge_internal_id := COALESCE(MAX(${quoteIdentifier(INTERNAL_ID_COLUMN)}), 0) FROM ${quoteIdentifier(tableName)}; UPDATE ${quoteIdentifier(tableName)} SET ${quoteIdentifier(INTERNAL_ID_COLUMN)} = (@merge_internal_id := @merge_internal_id + 1) WHERE ${quoteIdentifier(INTERNAL_ID_COLUMN)} IS NULL ORDER BY ${oldPrimaryColumns.map(quoteIdentifier).join(", ")}`,
      });
      if (!hasInternalIndex) {
        operations.push({
          tableName,
          kind: "add-internal-unique-key",
          sql: `ALTER TABLE ${quoteIdentifier(tableName)} ADD UNIQUE KEY ${quoteIdentifier(INTERNAL_ID_TEMP_INDEX)} (${quoteIdentifier(INTERNAL_ID_COLUMN)})`,
        });
      }
      operations.push({
        tableName,
        kind: "make-internal-auto-increment",
        sql: `ALTER TABLE ${quoteIdentifier(tableName)} MODIFY COLUMN ${quoteIdentifier(INTERNAL_ID_COLUMN)} INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键'`,
      });
      if (!hasLegacyIndex) {
        operations.push({
          tableName,
          kind: "add-legacy-unique-key",
          sql: `ALTER TABLE ${quoteIdentifier(tableName)} ADD UNIQUE KEY ${quoteIdentifier(legacyIndex)} (${oldPrimaryColumns.map(quoteIdentifier).join(", ")})`,
        });
      }
      operations.push({
        tableName,
        kind: "switch-primary-key",
        sql: `ALTER TABLE ${quoteIdentifier(tableName)} DROP PRIMARY KEY, DROP INDEX ${quoteIdentifier(INTERNAL_ID_TEMP_INDEX)}, ADD PRIMARY KEY (${quoteIdentifier(INTERNAL_ID_COLUMN)})`,
      });
    }
  }

  console.log(JSON.stringify({
    database: buildConnectionConfig().database,
    applyChanges,
    tableCount: tables.length,
    operationCount: operations.length,
    operations,
    warnings,
  }, null, 2));

  if (!applyChanges) {
    console.log("只读预览完成。确认备份并在维护窗口执行时，设置 APPLY_INTERNAL_ID_MIGRATION=1。该脚本不会清空数据或重生成 UUID。");
  } else {
    for (const [index, operation] of operations.entries()) {
      console.log(`[${index + 1}/${operations.length}] ${operation.kind} ${operation.tableName}`);
      try {
        await connection.query(operation.sql);
      } catch (error) {
        error.message = `${error.message}\nFailed SQL: ${operation.sql}`;
        throw error;
      }
    }
    console.log(`internalId 迁移完成：处理 ${tables.length} 张表，执行 ${operations.length} 个结构操作。`);
  }
} finally {
  await closeConnection(connection);
}
