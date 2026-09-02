import { buildConnectionConfig, closeConnection, countRows, getTableMetadata, listMergeTables, mysql, primaryColumns } from "./internal-id-common.mjs";

const connection = await mysql.createConnection(buildConnectionConfig());
const report = [];

try {
  for (const tableName of await listMergeTables(connection)) {
    const metadata = await getTableMetadata(connection, tableName);
    const total = await countRows(connection, tableName);
    const [[nullCount]] = metadata.internalId
      ? await connection.query(`SELECT COUNT(*) AS total FROM \`${tableName.replaceAll("`", "``")}\` WHERE \`internalId\` IS NULL`)
      : [[{ total: total }]];
    const [[duplicateCount]] = metadata.internalId
      ? await connection.query(`SELECT COUNT(*) - COUNT(DISTINCT \`internalId\`) AS total FROM \`${tableName.replaceAll("`", "``")}\``)
      : [[{ total: 0 }]];
    report.push({
      tableName,
      rows: total,
      primaryKey: primaryColumns(metadata),
      internalIdType: metadata.internalId?.columnType ?? null,
      internalIdExtra: metadata.internalId?.extra ?? null,
      internalIdNulls: Number(nullCount?.total ?? 0),
      duplicateInternalIds: Number(duplicateCount?.total ?? 0),
    });
  }
  const failures = report.filter((item) =>
    item.primaryKey.join(",") !== "internalId" ||
    String(item.internalIdType).toLowerCase() !== "int unsigned" ||
    !String(item.internalIdExtra).toLowerCase().includes("auto_increment") ||
    item.internalIdNulls !== 0 ||
    item.duplicateInternalIds !== 0,
  );
  console.log(JSON.stringify({ database: buildConnectionConfig().database, tableCount: report.length, failureCount: failures.length, failures, tables: report }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await closeConnection(connection);
}
