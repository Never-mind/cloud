import mysql from "mysql2/promise";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildDbConfig, LOGICAL_TABLE_NAMES, physicalTableName } from "../src/lib/db.ts";

const applyChanges = process.env.APPLY_SCHEMA_STRUCTURE === "1";
const remoteConfig = {
  host: process.env.TARGET_DB_HOST,
  port: Number(process.env.TARGET_DB_PORT ?? 3306),
  user: process.env.TARGET_DB_USER,
  password: process.env.TARGET_DB_PASSWORD,
  database: process.env.TARGET_DB_NAME,
};

for (const [key, value] of Object.entries(remoteConfig)) {
  if (!value && key !== "port") throw new Error(`Missing remote database setting: ${key}`);
}

const local = await mysql.createConnection(buildDbConfig(process.env));
const remote = await mysql.createConnection(remoteConfig);
const operations = [];
const warnings = [];

try {
  for (const logicalName of LOGICAL_TABLE_NAMES) {
    const tableName = physicalTableName(logicalName);
    const localCreate = await getCreateTable(local, tableName);
    const remoteCreate = await getCreateTable(remote, tableName, true);

    if (!remoteCreate) {
      operations.push({ tableName, kind: "create-table", sql: localCreate });
      continue;
    }

    const localDefinition = parseCreateTable(localCreate);
    const remoteDefinition = parseCreateTable(remoteCreate);
    const localColumns = await getColumns(local, tableName);
    const remoteColumns = await getColumns(remote, tableName);
    const remoteColumnByName = new Map(remoteColumns.map((column) => [column.Field, column]));

    for (const [index, localColumn] of localColumns.entries()) {
      const columnName = localColumn.Field;
      const columnDefinition = localDefinition.columns.get(columnName);
      if (!columnDefinition) throw new Error(`Unable to parse ${tableName}.${columnName}`);

      const remoteColumn = remoteColumnByName.get(columnName);
      if (!remoteColumn) {
        const position = index === 0 ? " FIRST" : ` AFTER ${quoteIdentifier(localColumns[index - 1].Field)}`;
        operations.push({
          tableName,
          kind: "add-column",
          sql: `ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${columnDefinition}${position}`,
        });
      } else if (normalizeColumn(localColumn) !== normalizeColumn(remoteColumn)) {
        operations.push({
          tableName,
          kind: "modify-column",
          sql: `ALTER TABLE ${quoteIdentifier(tableName)} MODIFY COLUMN ${columnDefinition}`,
        });
      }
    }

    collectDefinitionOperations({
      tableName,
      category: "index",
      localDefinitions: localDefinition.indexes,
      remoteDefinitions: remoteDefinition.indexes,
    });
    collectDefinitionOperations({
      tableName,
      category: "constraint",
      localDefinitions: localDefinition.constraints,
      remoteDefinitions: remoteDefinition.constraints,
    });
  }

  console.log(JSON.stringify({ applyChanges, operationCount: operations.length, operations, warnings }, null, 2));

  if (!applyChanges) {
    console.log("Dry run only. Set APPLY_SCHEMA_STRUCTURE=1 to apply these operations.");
  } else {
    const backupPath = await backupRemoteStructure();
    console.log(`Remote structure backup: ${backupPath}`);
    for (const [index, operation] of operations.entries()) {
      console.log(`[${index + 1}/${operations.length}] ${operation.kind} ${operation.tableName}`);
      try {
        await remote.query(operation.sql);
      } catch (error) {
        error.message = `${error.message}\nFailed SQL: ${operation.sql}`;
        throw error;
      }
    }
    console.log(`Applied ${operations.length} schema operations without copying application data.`);
  }
} finally {
  await Promise.all([local.end(), remote.end()]);
}

async function backupRemoteStructure() {
  const statements = [];
  for (const logicalName of LOGICAL_TABLE_NAMES) {
    const tableName = physicalTableName(logicalName);
    const createStatement = await getCreateTable(remote, tableName, true);
    if (createStatement) statements.push(`${createStatement};`);
  }
  const backupDirectory = resolve(process.cwd(), "outputs", "schema-backups");
  mkdirSync(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = resolve(backupDirectory, `${remoteConfig.database}-before-${timestamp}.sql`);
  writeFileSync(backupPath, `${statements.join("\n\n")}\n`, "utf8");
  return backupPath;
}

function collectDefinitionOperations({ tableName, category, localDefinitions, remoteDefinitions }) {
  for (const [name, localDefinition] of localDefinitions) {
    const remoteDefinition = remoteDefinitions.get(name);
    if (!remoteDefinition) {
      operations.push({
        tableName,
        kind: `add-${category}`,
        sql: `ALTER TABLE ${quoteIdentifier(tableName)} ADD ${localDefinition}`,
      });
      continue;
    }

    if (normalizeDefinition(localDefinition) !== normalizeDefinition(remoteDefinition)) {
      warnings.push({
        tableName,
        kind: `${category}-definition-differs`,
        name,
        local: localDefinition,
        remote: remoteDefinition,
        action: "kept remote definition to avoid a destructive drop/recreate",
      });
    }
  }
}

async function getCreateTable(connection, tableName, allowMissing = false) {
  try {
    const [rows] = await connection.query(`SHOW CREATE TABLE ${quoteIdentifier(tableName)}`);
    return String(rows[0]?.["Create Table"] ?? "");
  } catch (error) {
    if (allowMissing && error?.code === "ER_NO_SUCH_TABLE") return "";
    throw error;
  }
}

async function getColumns(connection, tableName) {
  const [rows] = await connection.query(`SHOW FULL COLUMNS FROM ${quoteIdentifier(tableName)}`);
  return rows;
}

function parseCreateTable(statement) {
  const openIndex = statement.indexOf("(\n");
  const closeIndex = statement.lastIndexOf("\n)");
  if (openIndex < 0 || closeIndex < 0) throw new Error("Unsupported SHOW CREATE TABLE format");

  const columns = new Map();
  const indexes = new Map();
  const constraints = new Map();
  const lines = statement
    .slice(openIndex + 2, closeIndex)
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/,$/, ""));

  for (const line of lines) {
    const columnMatch = line.match(/^`([^`]+)`\s+/);
    if (columnMatch) {
      columns.set(columnMatch[1], line);
      continue;
    }

    if (line.startsWith("PRIMARY KEY")) {
      indexes.set("PRIMARY", line);
      continue;
    }

    const indexMatch = line.match(/^(?:UNIQUE\s+)?KEY\s+`([^`]+)`/i);
    if (indexMatch) {
      indexes.set(indexMatch[1], line);
      continue;
    }

    const constraintMatch = line.match(/^CONSTRAINT\s+`([^`]+)`/i);
    if (constraintMatch) constraints.set(constraintMatch[1], line);
  }

  return { columns, indexes, constraints };
}

function normalizeColumn(column) {
  return [
    column.Type,
    column.Null,
    normalizeDefault(column.Default),
    String(column.Extra ?? "").replace(/DEFAULT_GENERATED/gi, "").trim(),
  ].join("|").toLowerCase();
}

function normalizeDefault(value) {
  return String(value ?? "").replace(/\(\)$/g, "").toLowerCase();
}

function normalizeDefinition(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function quoteIdentifier(value) {
  return `\`${String(value).replace(/`/g, "``")}\``;
}
