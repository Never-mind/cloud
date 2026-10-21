import { closeDb, executeRaw, queryRowsRaw } from "../src/lib/db";

/**
 * 飞书付款审批台账：记录“确认是否到账”节点通过时间（幂等）。
 *
 * 用法：npm run schema:feishu-payment-confirmed
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
  const table = "merge_common_feishu_approvals";
  const exists = await queryRowsRaw<{ count: number }>(
    `SELECT COUNT(*) AS count FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table`,
    { table },
  );
  if (!Number(exists[0]?.count ?? 0)) throw new Error(`${table} 不存在，先跑建表脚本`);

  const columns: Array<[string, string]> = [
    ["paymentConfirmedAt", "DATETIME NULL COMMENT '确认到账节点通过时间' AFTER `finishedAt`"],
    ["paymentConfirmedNode", "VARCHAR(100) NULL COMMENT '确认到账节点名称' AFTER `paymentConfirmedAt`"],
  ];
  for (const [column, ddl] of columns) {
    if (await columnExists(table, column)) {
      console.log(`${column} 已存在，跳过`);
      continue;
    }
    await executeRaw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
    console.log(`已添加 ${column}`);
  }
  console.log("飞书付款审批确认到账字段已就绪");
}

main()
  .catch((error) => {
    console.error("执行失败：", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
