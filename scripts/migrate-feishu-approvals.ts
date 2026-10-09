import { closeDb, executeRaw, queryRowsRaw } from "../src/lib/db";

/**
 * 飞书审批开票的关联表（幂等，可重复执行）。
 *
 * 一张台账记录一次「飞书审批 → 本地开票」的申请：
 *   单据归属（ownerType/ownerId）+ 审批实例（approvalCode/instanceCode/审批单号）
 *   + 状态（pending/approved/rejected/canceled）+ 发起人 + 表单快照。
 *
 * 开票记录 merge_common_invoices 上加两列，用来反查这张票是哪一单审批开出来的。
 *
 * 用法：npm run schema:feishu-approvals
 */
async function createTableIfMissing(tableName: string, ddl: string) {
  const rows = await queryRowsRaw<{ count: number }>(
    "SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName",
    { tableName },
  );
  if (Number(rows[0]?.count ?? 0) > 0) {
    console.log(`已存在：${tableName}`);
    return false;
  }
  await executeRaw(ddl);
  console.log(`已创建：${tableName}`);
  return true;
}

async function addColumnIfMissing(tableName: string, columnName: string, ddl: string) {
  const rows = await queryRowsRaw<{ count: number }>(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName AND COLUMN_NAME = :columnName`,
    { tableName, columnName },
  );
  if (Number(rows[0]?.count ?? 0) > 0) return false;
  await executeRaw(`ALTER TABLE \`${tableName}\` ADD COLUMN ${ddl}`);
  console.log(`已补字段：${tableName}.${columnName}`);
  return true;
}

async function tableExists(tableName: string) {
  const rows = await queryRowsRaw<{ count: number }>(
    "SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName",
    { tableName },
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function main() {
  await createTableIfMissing(
    "merge_common_feishu_approvals",
    `
      CREATE TABLE \`merge_common_feishu_approvals\` (
        \`id\` CHAR(36) NOT NULL COMMENT '台账ID',
        \`ownerType\` VARCHAR(32) NOT NULL COMMENT '来源单据类型：cloud_row/billing_statement/service_fee/settlement_invoice',
        \`ownerId\` VARCHAR(64) NOT NULL COMMENT '来源单据ID（对账行ID / 对账单号 / 项目发票ID）',
        \`ownerNo\` VARCHAR(128) NULL COMMENT '来源单号，展示用',
        \`period\` VARCHAR(16) NULL COMMENT '账期 YYYYMM',
        \`approvalCode\` VARCHAR(64) NOT NULL COMMENT '飞书审批定义 code',
        \`instanceCode\` VARCHAR(64) NOT NULL COMMENT '飞书审批实例 code',
        \`serialNumber\` VARCHAR(64) NULL COMMENT '飞书审批单号',
        \`title\` VARCHAR(255) NULL COMMENT '审批标题（一般取 Purpose）',
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending 审批中 / approved 已通过 / rejected 已驳回 / canceled 已撤回',
        \`remoteStatus\` VARCHAR(32) NULL COMMENT '飞书原始状态',
        \`starterOpenId\` VARCHAR(64) NULL COMMENT '发起人飞书 open_id',
        \`starterUserId\` VARCHAR(64) NULL COMMENT '发起人系统用户ID',
        \`starterName\` VARCHAR(128) NULL COMMENT '发起人姓名',
        \`invoiceId\` CHAR(36) NULL COMMENT '通过后生成的开票记录ID',
        \`allocationSourceIds\` VARCHAR(500) NULL COMMENT '合并多账期时勾选的账单行ID（逗号分隔），通过后按这批行出票',
        \`formJson\` LONGTEXT NULL COMMENT '提交给飞书的表单快照',
        \`rejectReason\` VARCHAR(500) NULL COMMENT '驳回/撤回原因',
        \`submittedAt\` DATETIME NULL COMMENT '提交时间',
        \`finishedAt\` DATETIME NULL COMMENT '审批结束时间',
        \`lastSyncedAt\` DATETIME NULL COMMENT '最后一次同步状态时间',
        \`syncError\` VARCHAR(500) NULL COMMENT '最后一次同步失败原因',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_feishu_approval_instance\` (\`instanceCode\`),
        KEY \`idx_feishu_approval_owner\` (\`ownerType\`, \`ownerId\`),
        KEY \`idx_feishu_approval_status\` (\`status\`),
        KEY \`idx_feishu_approval_invoice\` (\`invoiceId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='飞书审批开票台账'
    `,
  );

  if (await tableExists("merge_common_invoices")) {
    await addColumnIfMissing("merge_common_invoices", "approvalInstanceCode", "`approvalInstanceCode` VARCHAR(64) NULL COMMENT '对应的飞书审批实例 code'");
    await addColumnIfMissing("merge_common_invoices", "approvalStatus", "`approvalStatus` VARCHAR(16) NULL COMMENT '审批状态快照：pending/approved/rejected/canceled'");
    // 审批人回传的 CFDI 发票解析结果（真实票号/UUID/开票时间/金额/双方税号）
    await addColumnIfMissing("merge_common_invoices", "cfdiUuid", "`cfdiUuid` VARCHAR(64) NULL COMMENT 'CFDI 税务唯一标识（SAT UUID）'");
    await addColumnIfMissing("merge_common_invoices", "cfdiFolio", "`cfdiFolio` VARCHAR(64) NULL COMMENT 'CFDI 真实票号（Serie-Folio）'");
    await addColumnIfMissing("merge_common_invoices", "cfdiTotalAmount", "`cfdiTotalAmount` DECIMAL(18,4) NULL COMMENT 'CFDI 含税金额'");
    await addColumnIfMissing("merge_common_invoices", "cfdiIssuedAt", "`cfdiIssuedAt` DATE NULL COMMENT 'CFDI 开票日期'");
    await addColumnIfMissing("merge_common_invoices", "cfdiCurrency", "`cfdiCurrency` VARCHAR(16) NULL COMMENT 'CFDI 币种'");
    await addColumnIfMissing("merge_common_invoices", "cfdiIssuerRfc", "`cfdiIssuerRfc` VARCHAR(32) NULL COMMENT 'CFDI 开票方税号'");
    await addColumnIfMissing("merge_common_invoices", "cfdiReceiverRfc", "`cfdiReceiverRfc` VARCHAR(32) NULL COMMENT 'CFDI 客户税号'");
  } else {
    console.log("提示：merge_common_invoices 不存在，先跑 npm run schema:invoices");
  }

  await addColumnIfMissing("merge_common_feishu_approvals", "allocationSourceIds", "`allocationSourceIds` VARCHAR(500) NULL COMMENT '合并多账期时勾选的账单行ID（逗号分隔）'");
  await addColumnIfMissing("merge_common_feishu_approvals", "invoiceParseJson", "`invoiceParseJson` LONGTEXT NULL COMMENT '审批回传发票的解析结果与核验差异'");

  // 客户档案补两个开票审批要用的字段：墨西哥的税制（Régimen Fiscal）和发票地址邮编
  await addColumnIfMissing("merge_common_customers", "taxRegime", "`taxRegime` VARCHAR(255) NULL COMMENT '税制（墨西哥 Régimen Fiscal）'");
  await addColumnIfMissing("merge_common_customers", "postCode", "`postCode` VARCHAR(32) NULL COMMENT '发票地址邮编'");

  console.log("飞书审批台账结构已就绪");
}

main()
  .catch((error) => {
    console.error("建表失败", error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
