import { closeDb, executeRaw, queryRowsRaw } from "../src/lib/db";

/**
 * 项目结算明细支持「客户变更」（幂等）。
 *
 * 背景：报价单确认后是锁定的，客户之后加减设备没法回写报价单，也没地方录进项目。
 * 现在把变更落在项目结算明细上：
 *   - `source`：区分「报价带来的行」和「客户变更追加的行」；
 *   - `cancelledAt` / `cancelReason`：客户取消某一行时标记（取消行不计结算收入/成本，
 *     但已经花出去的采购成本仍留在实际成本里，避免"取消就当作没花过钱"）；
 *   - `changeNote`：新增变更行时的依据（比如"客户 10-08 邮件增加 2 台服务器"）。
 *
 * 客户变更行没有对应的报价明细，所以 `quotationItemId` 要放开为可空。
 *
 * 用法：npm run schema:settlement-item-change
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
  const tableRows = await queryRowsRaw<{ count: number }>(
    `SELECT COUNT(*) AS count FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_po_settlement_items'`,
  );
  if (!Number(tableRows[0]?.count ?? 0)) throw new Error("merge_po_settlement_items 不存在，先跑建表脚本");

  const [column] = await queryRowsRaw<{ IS_NULLABLE: string }>(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_po_settlement_items' AND COLUMN_NAME = 'quotationItemId'`,
  );
  if (column && String(column.IS_NULLABLE).toUpperCase() === "NO") {
    await executeRaw("ALTER TABLE `merge_po_settlement_items` MODIFY COLUMN `quotationItemId` CHAR(36) NULL COMMENT '报价明细ID（客户变更追加的行为空）'");
    console.log("已放开 merge_po_settlement_items.quotationItemId（允许为空）");
  } else {
    console.log("quotationItemId 已可空，跳过");
  }

  const columns: Array<[string, string]> = [
    ["source", "`source` VARCHAR(16) NOT NULL DEFAULT 'quotation' COMMENT '来源：quotation 报价单 / customer_change 客户变更' AFTER `quotationItemId`"],
    ["cancelledAt", "`cancelledAt` DATETIME NULL COMMENT '客户取消时间（取消行不计结算，但保留已发生成本）' AFTER `orderedAt`"],
    ["cancelReason", "`cancelReason` VARCHAR(500) NULL COMMENT '客户取消依据/原因' AFTER `cancelledAt`"],
    ["changeNote", "`changeNote` VARCHAR(500) NULL COMMENT '客户变更依据（追加行时填写）' AFTER `cancelReason`"],
  ];
  for (const [name, ddl] of columns) {
    if (await columnExists("merge_po_settlement_items", name)) {
      console.log(`字段已存在，跳过：merge_po_settlement_items.${name}`);
      continue;
    }
    await executeRaw(`ALTER TABLE \`merge_po_settlement_items\` ADD COLUMN ${ddl}`);
    console.log(`已补字段：merge_po_settlement_items.${name}`);
  }

  // 存量行都是报价带来的
  const result = await executeRaw(
    "UPDATE merge_po_settlement_items SET source = 'quotation' WHERE source IS NULL OR source = ''",
  );
  console.log(`存量明细来源回填：${Number((result as { affectedRows?: number }).affectedRows ?? 0)} 行`);
  console.log("项目结算明细的客户变更列已就绪");
}

main().then(closeDb).catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await closeDb();
  process.exit(1);
});
