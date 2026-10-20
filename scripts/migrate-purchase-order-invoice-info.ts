import { closeDb, executeRaw, queryRowsRaw } from "../src/lib/db";

/**
 * 算力采购订单发票登记字段（幂等）：
 *   发票号 / 开票日期 / 发票金额 / 发票币种 / 发票备注。
 * 预计付款日期复用已有的 paymentDate，不重复加列。
 *
 * 用法：npm run schema:purchase-invoice-info
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
    ["invoiceNo", "VARCHAR(100) NULL COMMENT '供应商发票号' AFTER `paymentDate`"],
    ["invoiceDate", "DATE NULL COMMENT '开票日期' AFTER `invoiceNo`"],
    ["invoiceAmount", "DECIMAL(18,4) NULL COMMENT '发票金额' AFTER `invoiceDate`"],
    ["invoiceCurrency", "VARCHAR(16) NULL COMMENT '发票币种' AFTER `invoiceAmount`"],
    ["invoiceStatus", "VARCHAR(16) NULL COMMENT '开票状态：issued / not_issued' AFTER `invoiceCurrency`"],
    ["invoiceRemark", "VARCHAR(500) NULL COMMENT '发票备注' AFTER `invoiceStatus`"],
  ];
  for (const [column, ddl] of columns) {
    if (await columnExists(table, column)) {
      console.log(`${column} 已存在，跳过`);
      continue;
    }
    await executeRaw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
    console.log(`已添加 ${column}`);
  }
  console.log("采购订单发票登记字段已就绪");
}

main()
  .catch((error) => {
    console.error("执行失败：", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
