/**
 * 回填可行性分析（只读）：判断远程缺值的列应该“按业务主键从本地复制”还是“按规则重算”。
 */
import mysql from "mysql2/promise";
import { buildDbConfig } from "../src/lib/db.ts";

const local = await mysql.createConnection(buildDbConfig(process.env));
const remote = await mysql.createConnection({
  host: process.env.TARGET_DB_HOST,
  port: Number(process.env.TARGET_DB_PORT ?? 3306),
  user: process.env.TARGET_DB_USER,
  password: process.env.TARGET_DB_PASSWORD,
  database: process.env.TARGET_DB_NAME,
  charset: "utf8mb4",
});

const rows = async (conn, sql) => {
  const [result] = await conn.query(sql);
  return result;
};

async function overlap(label, table, key, valueColumns) {
  const localRows = await rows(local, `SELECT ${key} AS k, ${valueColumns.join(", ")} FROM \`${table}\``);
  const remoteRows = await rows(remote, `SELECT ${key} AS k FROM \`${table}\``);
  const remoteKeys = new Set(remoteRows.map((row) => String(row.k)));
  const matched = localRows.filter((row) => remoteKeys.has(String(row.k)));
  const localOnly = localRows.length - matched.length;
  const remoteOnly = remoteKeys.size - matched.length;
  console.log(`${label}：本地 ${localRows.length} 行 / 远程 ${remoteRows.length} 行，主键交集 ${matched.length}（仅本地 ${localOnly}，仅远程 ${remoteOnly}）`);
  const filledLocal = matched.filter((row) => String(row[valueColumns[0]] ?? "") !== "").length;
  console.log(`    交集行中本地已有值：${filledLocal}/${matched.length}`);
  return matched;
}

console.log("### purchaseorderitems");
const poItems = await overlap("  主键 id", "merge_power_purchaseorderitems", "id", ["currency", "powerFirst24VatIncluded"]);
const poColumns = (await rows(local, "SHOW FULL COLUMNS FROM `merge_power_purchaseorderitems`")).map((row) => row.Field);
console.log(`    本地列：${poColumns.join(", ")}`);
const remotePoItems = new Map(
  (await rows(remote, "SELECT id, poNo, requestNo, purchaseOrderId, unitPrice, taxExcludedUnitPrice FROM merge_power_purchaseorderitems"))
    .map((row) => [String(row.id), row]),
);
const localPoItems = new Map(
  (await rows(local, "SELECT id, poNo, requestNo, purchaseOrderId, unitPrice, taxExcludedUnitPrice FROM merge_power_purchaseorderitems"))
    .map((row) => [String(row.id), row]),
);
let priceMismatch = 0;
let keyMismatch = 0;
for (const row of poItems) {
  const remoteRow = remotePoItems.get(String(row.id));
  if (!remoteRow) continue;
  const localRow = localPoItems.get(String(row.id));
  if (Number(row.unitPrice ?? 0) !== Number(remoteRow.unitPrice ?? 0)) priceMismatch += 1;
  if (String(localRow?.poNo ?? "") !== String(remoteRow.poNo ?? "")) keyMismatch += 1;
}
console.log(`    单价不一致 ${priceMismatch} 行，poNo 不一致 ${keyMismatch} 行`);

console.log("\n### 业务编号是否有交集（判断两边是不是同一批业务数据）");
for (const [table, key] of [
  ["merge_power_purchaseorders", "poNo"],
  ["merge_power_requests", "requestNo"],
  ["merge_power_requestitems", "id"],
  ["merge_power_shipments", "shipmentId"],
  ["merge_po_settlement_projects", "projectNo"],
  ["merge_power_instancemodels", "deviceCode"],
]) {
  const localKeys = new Set((await rows(local, `SELECT ${key} AS k FROM \`${table}\``)).map((row) => String(row.k)));
  const remoteKeys = new Set((await rows(remote, `SELECT ${key} AS k FROM \`${table}\``)).map((row) => String(row.k)));
  const shared = [...localKeys].filter((value) => remoteKeys.has(value)).length;
  console.log(`  ${table.padEnd(38)} 本地 ${localKeys.size} / 远程 ${remoteKeys.size} / 交集 ${shared}`);
}

console.log("\n### billinginstanceledgers");
await overlap("  主键 ledgerId", "merge_power_billinginstanceledgers", "ledgerId", ["customerId"]);

console.log("\n### monthlybillingwriteoffs");
await overlap("  主键 id", "merge_power_monthlybillingwriteoffs", "id", ["customerId"]);

console.log("\n### servicefeesnapshotitems");
await overlap("  主键 id", "merge_power_servicefeesnapshotitems", "id", ["requestType"]);

console.log("\n### 测算依赖的主数据是否两边一致");
for (const table of ["merge_power_countries", "merge_power_b6typeconfigs", "merge_power_capexpricingitems", "merge_power_capexpricingversions"]) {
  const [l] = await local.query(`SELECT COUNT(*) AS c FROM \`${table}\``);
  const [r] = await remote.query(`SELECT COUNT(*) AS c FROM \`${table}\``);
  console.log(`  ${table.padEnd(38)} 本地 ${l[0].c} / 远程 ${r[0].c}`);
}

await local.end();
await remote.end();
