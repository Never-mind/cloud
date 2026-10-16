import { closeDb, executeRaw, queryRowsRaw } from "../src/lib/db";

/**
 * 月度汇率维护 + 服务费跨币种折算（幂等）。
 *
 * 背景：服务费核算原来是 `月账单核销金额 - 预付款核销金额` 直接相减，
 * 没判断币种。BR 存在「月账单是人民币、预付款是美金」的真实业务
 * （例如批次 BR-30 / 需求单 eSHWC250609y43a），直接相减会把美金当人民币减，
 * 服务费被虚增。
 *
 * 本脚本做两件事：
 *   1. 建 `merge_common_exchange_rates`（月度汇率维护表），供算力服务费折算
 *      和集采报价单默认汇率共用；
 *   2. 给 `merge_power_servicefeesnapshotitems` 补折算相关列，让服务费对账单
 *      能把确认当时的汇率冻结下来。
 *
 * 用法：npm run schema:exchange-rates
 */

async function tableExists(table: string) {
  const rows = await queryRowsRaw<{ count: number }>(
    `SELECT COUNT(*) AS count FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table`,
    { table },
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function columnExists(table: string, column: string) {
  const rows = await queryRowsRaw<{ count: number }>(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
    { table, column },
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function main() {
  if (await tableExists("merge_common_exchange_rates")) {
    console.log("merge_common_exchange_rates 已存在，跳过建表");
  } else {
    await executeRaw(`
      CREATE TABLE \`merge_common_exchange_rates\` (
        \`internalId\` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
        \`id\` VARCHAR(160) NOT NULL COMMENT '记录ID（FXR-账期-源币种-目标币种）',
        \`periodMonth\` VARCHAR(7) NOT NULL COMMENT '账期（YYYY-MM）',
        \`sourceCurrency\` VARCHAR(16) NOT NULL COMMENT '源币种',
        \`targetCurrency\` VARCHAR(16) NOT NULL COMMENT '目标币种',
        \`rate\` DECIMAL(18,8) NOT NULL COMMENT '汇率：1 源币种 = rate 目标币种',
        \`remark\` VARCHAR(255) NULL COMMENT '说明',
        \`createdByUserId\` VARCHAR(80) NULL COMMENT '创建人ID',
        \`createdByName\` VARCHAR(255) NULL COMMENT '创建人',
        \`updatedByUserId\` VARCHAR(80) NULL COMMENT '修改人ID',
        \`updatedByName\` VARCHAR(255) NULL COMMENT '修改人',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        PRIMARY KEY (\`internalId\`),
        UNIQUE KEY \`uk_internal_legacy_merge_common_exchange_rates\` (\`id\`),
        UNIQUE KEY \`uk_exchange_rate_period_pair\` (\`periodMonth\`, \`sourceCurrency\`, \`targetCurrency\`),
        KEY \`idx_exchange_rate_period\` (\`periodMonth\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='月度汇率维护'
    `);
    console.log("已创建 merge_common_exchange_rates");
  }

  if (!(await tableExists("merge_power_servicefeesnapshotitems"))) {
    throw new Error("merge_power_servicefeesnapshotitems 不存在，先跑服务费建表脚本");
  }

  const snapshotColumns: Array<[string, string]> = [
    ["exchangeRate", "ADD COLUMN `exchangeRate` DECIMAL(18,8) NULL COMMENT '跨币种折算汇率（快照）' AFTER `prepaymentCurrency`"],
    ["prepaymentAmountConverted", "ADD COLUMN `prepaymentAmountConverted` DECIMAL(18,4) NULL COMMENT '折算到月账单币种后的预付款核销金额' AFTER `prepaymentAmount`"],
    ["serviceFeeCurrency", "ADD COLUMN `serviceFeeCurrency` VARCHAR(16) NULL COMMENT '月度服务费币种' AFTER `serviceFeeAmountExcludingTax`"],
    ["fxStatus", "ADD COLUMN `fxStatus` VARCHAR(16) NULL COMMENT '折算状态：same/converted/missing' AFTER `serviceFeeCurrency`"],
  ];
  for (const [column, clause] of snapshotColumns) {
    if (await columnExists("merge_power_servicefeesnapshotitems", column)) {
      console.log(`快照明细 ${column} 已存在，跳过`);
      continue;
    }
    await executeRaw(`ALTER TABLE \`merge_power_servicefeesnapshotitems\` ${clause}`);
    console.log(`已为 merge_power_servicefeesnapshotitems 添加 ${column}`);
  }

  const [stats] = await queryRowsRaw<{ total: number }>("SELECT COUNT(*) AS total FROM merge_common_exchange_rates");
  console.log(`月度汇率维护表现有 ${stats?.total ?? 0} 条，请通过「财务管理 → 汇率维护」导入或维护汇率`);
  console.log("月度汇率维护已就绪");
}

main()
  .catch((error) => {
    console.error("执行失败：", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
