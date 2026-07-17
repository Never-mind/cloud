import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import mysql from "mysql2/promise";

const database = process.env.DEPLOY_DB_NAME ?? process.env.DB_NAME ?? "cloud_power";
const schemaPath = resolve(process.cwd(), `${database}_schema.sql`);
const sql = readFileSync(schemaPath, "utf8").replace(/^\uFEFF/, "");

const connection = await mysql.createConnection({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "root",
  multipleStatements: true,
});

try {
  await connection.query(sql);
  console.log(`Applied ${schemaPath}`);
} finally {
  await connection.end();
}
