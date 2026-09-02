import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildConnectionConfig, buildForwardSql, buildRollbackSql, closeConnection, findUniqueIndex, getTableMetadata, legacyIndexName, listMergeTables, mysql, primaryColumns } from "./internal-id-common.mjs";

const forwardPath = resolve(process.cwd(), process.env.INTERNAL_ID_SQL_OUTPUT ?? "merge-internal-id-migration.sql");
const rollbackPath = resolve(process.cwd(), process.env.INTERNAL_ID_ROLLBACK_OUTPUT ?? "merge-internal-id-rollback.sql");
const connection = await mysql.createConnection(buildConnectionConfig());

try {
  const forward = [
    "-- MySQL 8 migration for merge_* tables",
    "-- Generated from the connected database metadata.",
    "-- Review the table list, take a full data backup, and execute during a maintenance window.",
    "-- This script preserves UUIDs/business numbers and does not delete or rewrite business data.",
    "",
  ];
  const rollback = [
    "-- Rollback for merge_* internalId migration",
    "-- Only execute after stopping the application and confirming a backup.",
    "-- This removes internalId but preserves the original UUID/business-number values.",
    "",
  ];

  for (const tableName of await listMergeTables(connection)) {
    const metadata = await getTableMetadata(connection, tableName);
    const oldColumns = primaryColumns(metadata);
    if (!oldColumns.length) throw new Error(`${tableName} 没有主键，无法生成迁移 SQL`);
    forward.push(...buildForwardSql(metadata));
    if (!metadata.internalId) {
      const legacyIndex = findUniqueIndex(metadata, oldColumns, { excludePrimary: true });
      rollback.push(...buildRollbackSql(tableName, oldColumns, legacyIndex?.indexName ?? legacyIndexName(tableName), true));
    }
    else rollback.push(`-- ${tableName}: 当前已存在 internalId，请根据实际迁移状态人工审核回滚`, "");
  }

  mkdirSync(resolve(forwardPath, ".."), { recursive: true });
  mkdirSync(resolve(rollbackPath, ".."), { recursive: true });
  writeFileSync(forwardPath, `${forward.join("\n")}\n`, "utf8");
  writeFileSync(rollbackPath, `${rollback.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ database: buildConnectionConfig().database, forwardPath, rollbackPath }, null, 2));
} finally {
  await closeConnection(connection);
}
