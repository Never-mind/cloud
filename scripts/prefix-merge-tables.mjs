import mysql from "mysql2/promise";

const database = process.env.DB_NAME ?? "merge";
const applyChanges = process.env.APPLY_MERGE_TABLE_PREFIX === "1";
const legacyPrefixes = ["power_", "po_", "cloud_", "common_"];

const connection = await mysql.createConnection({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "root",
  database,
  multipleStatements: false,
});

function quoteIdentifier(value) {
  return `\`${String(value).replaceAll("`", "``")}\``;
}

try {
  const [rows] = await connection.query(
    `SELECT TABLE_NAME AS tableName
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME`,
  );
  const sourceTables = rows
    .map((row) => String(row.tableName))
    .filter((tableName) => legacyPrefixes.some((prefix) => tableName.startsWith(prefix)));
  const operations = sourceTables.map((source) => ({ source, target: `merge_${source}` }));

  const conflicts = operations.filter(({ target }) => rows.some((row) => String(row.tableName) === target));
  if (conflicts.length) {
    throw new Error(`目标表已存在，未执行任何改名：${conflicts.map(({ source, target }) => `${source} -> ${target}`).join(", ")}`);
  }

  console.log(JSON.stringify({ database, applyChanges, tableCount: operations.length, operations }, null, 2));
  if (!applyChanges) {
    console.log("Dry run only. Set APPLY_MERGE_TABLE_PREFIX=1 to rename the tables.");
  } else if (operations.length) {
    await connection.query(`RENAME TABLE ${operations.map(({ source, target }) => `${quoteIdentifier(source)} TO ${quoteIdentifier(target)}`).join(", ")}`);
    console.log(`Renamed ${operations.length} tables in database '${database}'.`);
  } else {
    console.log(`No legacy-prefixed tables found in database '${database}'.`);
  }
} finally {
  await connection.end();
}
