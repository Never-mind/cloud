import { closeDb, executeRaw, queryRowsRaw } from "../src/lib/db";

/**
 * 集采项目结算发票补 `taxUuid` 列（幂等）。
 *
 * 背景：上传发票识别要读墨西哥 CFDI 的 UUID（Folio Fiscal），用来判断"这张票是不是已经录过"。
 * 列表和表单都不展示这一列，只做后台查重。
 *
 * 用法：npm run schema:settlement-invoice-uuid
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
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_po_settlement_invoices'`,
  );
  if (!Number(tableRows[0]?.count ?? 0)) throw new Error("merge_po_settlement_invoices 不存在，先跑建表脚本");

  if (await columnExists("merge_po_settlement_invoices", "taxUuid")) {
    console.log("taxUuid 列已存在，跳过加列");
  } else {
    await executeRaw(
      "ALTER TABLE `merge_po_settlement_invoices` ADD COLUMN `taxUuid` VARCHAR(64) NULL COMMENT '发票税务唯一标识（墨西哥 CFDI 的 UUID / Folio Fiscal，仅用于查重，不展示）' AFTER `invoiceNo`",
    );
    console.log("已为 merge_po_settlement_invoices 添加 taxUuid 列");
  }

  await executeRaw("ALTER TABLE `merge_po_settlement_invoices` ADD INDEX `idx_po_settlement_invoice_uuid` (`taxUuid`)").catch(() => undefined);

  const [stats] = await queryRowsRaw<{ total: number; filled: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN taxUuid IS NOT NULL AND taxUuid <> '' THEN 1 ELSE 0 END) AS filled
       FROM merge_po_settlement_invoices`,
  );
  console.log(`发票记录 ${stats?.total ?? 0} 条，其中带 UUID ${stats?.filled ?? 0} 条`);
  console.log("结算发票 UUID 列已就绪");
}

main().then(closeDb).catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await closeDb();
  process.exit(1);
});
