import mysql from "mysql2/promise";

const database = process.env.DB_NAME ?? "merge";
const connection = await mysql.createConnection({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "root",
  database,
});

try {
  const [tables] = await connection.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'power\\_%' ESCAPE '\\\\'",
  );
  const tableCounts = {};
  for (const tableName of ["power_requests", "power_purchaseorders", "power_shipments", "power_prepaymentcontracts"]) {
    const [[row]] = await connection.query(`SELECT COUNT(*) AS total FROM \`${tableName}\``);
    tableCounts[tableName] = Number(row.total ?? 0);
  }
  console.log(JSON.stringify({ database, powerTableCount: tables.length, tableCounts }, null, 2));
} finally {
  await connection.end();
}
