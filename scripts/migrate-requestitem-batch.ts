import { closeDb, executeRaw, queryRowsRaw } from "../src/lib/db";

/**
 * 内部批次号下沉到需求明细（幂等）。
 *
 * 背景：批次号原来只存在需求单主单（`merge_power_requests.batchName`），
 * 但一个需求单的多条明细可能分属不同批次，主单只装得下一个，其余就丢了。
 * 现在把批次落到明细 `merge_power_requestitems.batchName`，主单字段退化为「默认批次」。
 *
 * 本脚本做两件事：
 *   1. 给明细表加 `batchName` 列；
 *   2. 把存量主单批次回填到它自己的明细（只填空值，不会覆盖手工改过的）。
 *
 * 用法：npm run schema:requestitem-batch
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
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_requestitems'`,
  );
  if (!Number(tableRows[0]?.count ?? 0)) throw new Error("merge_power_requestitems 不存在，先跑建表脚本");

  if (await columnExists("merge_power_requestitems", "batchName")) {
    console.log("明细批次列已存在，跳过加列");
  } else {
    await executeRaw(
      "ALTER TABLE `merge_power_requestitems` ADD COLUMN `batchName` VARCHAR(255) NULL COMMENT '内部批次号（明细级；主单的 batchName 是默认批次）' AFTER `requestType`",
    );
    console.log("已为 merge_power_requestitems 添加 batchName 列");
  }

  const result = await executeRaw(
    `UPDATE merge_power_requestitems AS ri
       INNER JOIN merge_power_requests AS r ON r.requestNo = ri.requestNo
        SET ri.batchName = r.batchName
      WHERE (ri.batchName IS NULL OR ri.batchName = '')
        AND r.batchName IS NOT NULL AND r.batchName <> ''`,
  );
  const affected = Number((result as { affectedRows?: number }).affectedRows ?? 0);
  console.log(`存量回填：${affected} 条明细从主单带入了批次`);

  const [stats] = await queryRowsRaw<{ total: number; filled: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN batchName IS NOT NULL AND batchName <> '' THEN 1 ELSE 0 END) AS filled
       FROM merge_power_requestitems`,
  );
  console.log(`明细总数 ${stats?.total ?? 0}，其中有批次 ${stats?.filled ?? 0}`);
  console.log("明细批次号已就绪");
}

main()
  .catch((error) => {
    console.error("执行失败：", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
