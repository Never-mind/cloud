/**
 * 远程库基线数据补全（幂等，默认 dry-run）。
 *
 * 处理两类“新增字段/新增功能”留下的数据缺口：
 *   1. merge_power_countries.defaultUndertakingUnitId / defaultCustomerId
 *      本地与远程的承接单位、客户是同一批，但 UUID 不同，必须按编码/名称映射后写入远程 UUID，
 *      不能直接复制本地值。否则需求单同步会写入不存在的承接单位/客户并直接阻断。
 *   2. merge_power_b6typeconfigs 的 4 条 B6 规则（远程表为空，算力价测算依赖它）。
 *
 * 用法：
 *   tsx scripts/backfill-remote-baseline.mjs            # 只打印计划
 *   tsx scripts/backfill-remote-baseline.mjs --apply    # 执行
 */
import mysql from "mysql2/promise";
import { buildDbConfig } from "../src/lib/db.ts";

const apply = process.argv.includes("--apply");
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

// ---------------------------------------------------------------- 国家默认值
const localUnits = await rows(local, "SELECT undertakingUnitId, undertakingUnitCode, name FROM merge_common_undertaking_units");
const remoteUnits = await rows(remote, "SELECT undertakingUnitId, undertakingUnitCode, name FROM merge_common_undertaking_units");
const localCustomers = await rows(local, "SELECT customerId, customerCode, name FROM merge_common_customers");
const remoteCustomers = await rows(remote, "SELECT customerId, customerCode, name FROM merge_common_customers");
const localCountries = await rows(local, "SELECT code, defaultUndertakingUnitId, defaultCustomerId FROM merge_power_countries ORDER BY code");
const remoteCountries = new Map(
  (await rows(remote, "SELECT code, defaultUndertakingUnitId, defaultCustomerId FROM merge_power_countries")).map((row) => [String(row.code), row]),
);

const localUnitById = new Map(localUnits.map((row) => [String(row.undertakingUnitId), row]));
const remoteUnitByCode = new Map(remoteUnits.map((row) => [String(row.undertakingUnitCode), row]));
const remoteUnitByName = new Map(remoteUnits.map((row) => [String(row.name).trim().toLowerCase(), row]));
const localCustomerById = new Map(localCustomers.map((row) => [String(row.customerId), row]));
const remoteCustomerByCode = new Map(remoteCustomers.map((row) => [String(row.customerCode), row]));
const remoteCustomerByName = new Map(remoteCustomers.map((row) => [String(row.name).trim().toLowerCase(), row]));

const countryStatements = [];
const unresolved = [];
console.log("国家默认承接单位 / 默认客户映射：");
for (const row of localCountries) {
  const code = String(row.code);
  const current = remoteCountries.get(code);
  const localUnitId = String(row.defaultUndertakingUnitId ?? "");
  const localCustomerId = String(row.defaultCustomerId ?? "");
  if (!localUnitId && !localCustomerId) continue;

  const localUnit = localUnitById.get(localUnitId);
  const remoteUnit = localUnit
    ? remoteUnitByCode.get(String(localUnit.undertakingUnitCode)) ?? remoteUnitByName.get(String(localUnit.name).trim().toLowerCase())
    : undefined;
  const localCustomer = localCustomerById.get(localCustomerId);
  const remoteCustomer = localCustomer
    ? remoteCustomerByCode.get(String(localCustomer.customerCode)) ?? remoteCustomerByName.get(String(localCustomer.name).trim().toLowerCase())
    : undefined;

  if ((localUnit && !remoteUnit) || (localCustomer && !remoteCustomer)) {
    unresolved.push(`${code}（本地 ${localUnit?.name ?? "-"} / ${localCustomer?.name ?? "-"} 在远程找不到对应记录）`);
    continue;
  }

  const nextUnitId = remoteUnit ? String(remoteUnit.undertakingUnitId) : null;
  const nextCustomerId = remoteCustomer ? String(remoteCustomer.customerId) : null;
  if (String(current?.defaultUndertakingUnitId ?? "") === String(nextUnitId ?? "") &&
      String(current?.defaultCustomerId ?? "") === String(nextCustomerId ?? "")) {
    console.log(`  ${code.padEnd(4)} 远程已是目标值，跳过`);
    continue;
  }
  console.log(`  ${code.padEnd(4)} ${localUnit?.name ?? "-"} -> ${nextUnitId} / ${localCustomer?.name ?? "-"} -> ${nextCustomerId}`);
  countryStatements.push(
    `UPDATE \`merge_power_countries\` SET defaultUndertakingUnitId = ${nextUnitId ? `'${nextUnitId}'` : "NULL"}, defaultCustomerId = ${nextCustomerId ? `'${nextCustomerId}'` : "NULL"} WHERE code = '${code}'`,
  );
}
if (unresolved.length) {
  console.log("  ★ 无法自动映射，需要人工维护：");
  for (const item of unresolved) console.log(`    ${item}`);
}

// ---------------------------------------------------------------- B6 类型规则
const b6Seed = [
  ["B61", "B61", "整机服务场景", 0, 0, null, null, null, null, "按SL模板费率", "SL模板已含对应费率，避免重复计算", "资金占用月数与备件占用月数待确认。", "启用", 10],
  ["B62-A7", "B62-A7", "整机已含备件费用", 1, 1, 0, 0, 0, 0, "备件单独结差", "整机价已含备件费用。", "不提供海外备件服务。", "启用", 20],
  ["B62-A8 (HT)", "B62-A8", "HT整机不含资金占用费", 0, 0, 2, null, 0, 0, "备件单独结差", "整机价不含资金占用费。", "备件占用月数待确认；不提供海外备件服务。", "启用", 30],
  ["B63 (HT)", "B63", "HT整机服务场景", 0, 0, 0, null, 0, 0, "备件单独结差", "整机价不含资金占用费。", "资金占用月数暂按0，需复核；备件占用月数待确认。", "启用", 40],
];
const remoteB6 = await rows(remote, "SELECT b6Type FROM merge_power_b6typeconfigs");
const remoteB6Set = new Set(remoteB6.map((row) => String(row.b6Type)));
const b6Statements = [];
console.log("\nB6 类型规则：");
for (const item of b6Seed) {
  if (remoteB6Set.has(String(item[0]))) {
    console.log(`  ${String(item[0]).padEnd(14)} 远程已存在，跳过`);
    continue;
  }
  console.log(`  ${String(item[0]).padEnd(14)} 待插入`);
  const values = item
    .map((value) => (value === null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`))
    .join(", ");
  b6Statements.push(
    `INSERT IGNORE INTO \`merge_power_b6typeconfigs\` (b6Type, alias, scope, fundingCostIncluded, spareCostIncluded, defaultFundingMonths, defaultSpareOccupancyMonths, overseasSpareServiceAvailable, defaultSpareRate, spareSettlementMethod, slPricingInstruction, notes, status, sortOrder) VALUES (${values})`,
  );
}

const statements = [...countryStatements, ...b6Statements];
console.log(`\n合计待执行 ${statements.length} 条语句。`);
for (const statement of statements) console.log(`  ${statement}`);

if (!apply) {
  console.log("\n当前为 dry-run，未执行任何语句。追加 --apply 才会生效。");
} else {
  let ok = 0;
  const failed = [];
  for (const statement of statements) {
    try {
      await remote.query(statement);
      ok += 1;
    } catch (error) {
      failed.push(`${statement} -> ${error.code ?? ""} ${error.message}`);
    }
  }
  console.log(`\n执行完成：成功 ${ok} 条，失败 ${failed.length} 条`);
  for (const item of failed) console.log(`  失败：${item}`);
}

await local.end();
await remote.end();
