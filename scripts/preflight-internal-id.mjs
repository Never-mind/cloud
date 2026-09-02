import { buildConnectionConfig, closeConnection, countRows, getTableMetadata, listMergeTables, mysql, primaryColumns } from "./internal-id-common.mjs";

const MAX_UNSIGNED_INT_ROWS = 4_294_967_294;
const connection = await mysql.createConnection(buildConnectionConfig());
const report = [];

try {
  const tables = await listMergeTables(connection);
  for (const tableName of tables) {
    const metadata = await getTableMetadata(connection, tableName);
    const rows = await countRows(connection, tableName);
    const primary = primaryColumns(metadata);
    const internalState = metadata.internalId
      ? {
          type: metadata.internalId.columnType,
          nullable: metadata.internalId.isNullable,
          extra: metadata.internalId.extra,
          isPrimary: primary.length === 1 && primary[0] === "internalId",
        }
      : null;
    report.push({ tableName, rows, primaryKey: primary, internalId: internalState });
  }

  const failures = report.filter((item) => !item.primaryKey.length || item.rows > MAX_UNSIGNED_INT_ROWS);
  const partial = report.filter((item) => item.internalId && !item.internalId.isPrimary);
  const result = {
    database: buildConnectionConfig().database,
    tableCount: report.length,
    totalRows: report.reduce((sum, item) => sum + item.rows, 0),
    missingPrimaryKeyTables: failures.filter((item) => !item.primaryKey.length).map((item) => item.tableName),
    tooLargeTables: failures.filter((item) => item.rows > MAX_UNSIGNED_INT_ROWS).map((item) => item.tableName),
    partialInternalIdTables: partial.map((item) => item.tableName),
    tables: report,
  };
  console.log(JSON.stringify(result, null, 2));
  if (failures.length || partial.length) process.exitCode = 1;
} finally {
  await closeConnection(connection);
}
