import mysql from "mysql2/promise";
import { applyChineseComments } from "./database-comments.mjs";

const database = process.env.DB_NAME ?? "merge";
const connection = await mysql.createConnection({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "root",
  database,
});

try {
  const result = await applyChineseComments(connection, database);
  const mode = result.dryRun ? "（预览）" : "";
  console.log(
    `数据库中文备注更新完成${mode}：检查 ${result.tableCount} 张表，更新 ${result.updatedTables} 张表备注、${result.updatedColumns} 个字段备注。`,
  );
} finally {
  await connection.end();
}

