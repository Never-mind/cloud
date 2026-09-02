import { buildConnectionConfig, closeConnection, findUniqueIndex, getTableMetadata, INTERNAL_ID_COLUMN, listMergeTables, mysql, primaryColumns, quoteIdentifier, legacyIndexName } from "./internal-id-common.mjs";

const applyChanges = process.env.APPLY_INTERNAL_ID_ROLLBACK === "1";
const connection = await mysql.createConnection({ ...buildConnectionConfig(), multipleStatements: true });

try {
  const operations = [];
  for (const tableName of await listMergeTables(connection)) {
    const metadata = await getTableMetadata(connection, tableName);
    const currentPrimary = primaryColumns(metadata);
    if (currentPrimary.join(",") !== INTERNAL_ID_COLUMN) continue;
    const legacyIndex = metadata.indexes.find((index) => index.indexName === legacyIndexName(tableName))
      ?? metadata.indexes.find((index) => index.indexName !== "PRIMARY" && Number(index.nonUnique) === 0 && String(index.indexColumns ?? "") !== INTERNAL_ID_COLUMN);
    if (!legacyIndex) throw new Error(`${tableName} 缺少旧主键唯一索引，拒绝自动回滚`);
    const oldColumns = String(legacyIndex.indexColumns).split(",").map((value) => value.trim()).filter(Boolean);
    operations.push({
      tableName,
      sql: `ALTER TABLE ${quoteIdentifier(tableName)} MODIFY COLUMN ${quoteIdentifier(INTERNAL_ID_COLUMN)} INT UNSIGNED NULL; ALTER TABLE ${quoteIdentifier(tableName)} DROP PRIMARY KEY, DROP INDEX ${quoteIdentifier(legacyIndex.indexName)}, ADD PRIMARY KEY (${oldColumns.map(quoteIdentifier).join(", ")}), DROP COLUMN ${quoteIdentifier(INTERNAL_ID_COLUMN)}`,
    });
  }
  console.log(JSON.stringify({ database: buildConnectionConfig().database, applyChanges, operationCount: operations.length, operations }, null, 2));
  if (!applyChanges) {
    console.log("只读回滚预览完成。只有确认新代码未写入 internalId 且具备完整备份时，才设置 APPLY_INTERNAL_ID_ROLLBACK=1。");
  } else {
    for (const operation of operations) await connection.query(operation.sql);
    console.log(`internalId 回滚完成：处理 ${operations.length} 张表。`);
  }
} finally {
  await closeConnection(connection);
}
