import { closeDb, executeRaw, queryRowsRaw } from "../src/lib/db";

/**
 * 算力采购订单发票金额拆分（幂等）：
 *   invoiceNetAmount  未税金额
 *   invoiceTaxRate    税率（百分数，13 表示 13%）
 *   invoiceTaxAmount  税金
 *   invoiceAmount     原字段保留，作为含税金额
 *
 * 用法：npm run schema:purchase-invoice-tax
 */

async function columnExists(table: string, column: string) {
  const rows = await queryRowsRaw<{ count: number }>(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
    { table, column },
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function main() {
  const table = "merge_power_purchaseorders";
  const exists = await queryRowsRaw<{ count: number }>(
    `SELECT COUNT(*) AS count FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table`,
    { table },
  );
  if (!Number(exists[0]?.count ?? 0)) throw new Error(`${table} 不存在，先跑建表脚本`);

  const columns: Array<[string, string]> = [
    ["invoiceNetAmount", "DECIMAL(18,4) NULL COMMENT '发票未税金额' AFTER `invoiceAmount`"],
    ["invoiceTaxRate", "DECIMAL(9,4) NULL COMMENT '发票税率（百分数，13=13%）' AFTER `invoiceNetAmount`"],
    ["invoiceTaxAmount", "DECIMAL(18,4) NULL COMMENT '发票税金' AFTER `invoiceTaxRate`"],
  ];
  for (const [column, ddl] of columns) {
    if (await columnExists(table, column)) {
      console.log(`${column} 已存在，跳过`);
      continue;
    }
    await executeRaw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
    console.log(`已添加 ${column}`);
  }
  console.log("采购订单发票金额拆分字段已就绪");
}

main()
  .catch((error) => {
    console.error("执行失败：", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
