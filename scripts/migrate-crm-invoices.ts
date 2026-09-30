import { closeDb, executeRaw, queryRowsRaw } from "../src/lib/db";

/**
 * CRM 发票 / 回款同步模块建表（幂等，可重复执行）。
 *
 * 表放在 merge_cloud_ 前缀下，因为这批数据是"华为云业务 → 账期发票（CRM）"页签的本地副本。
 * 用法：npm run schema:crm-invoices
 */
async function createTableIfMissing(tableName: string, ddl: string) {
  const rows = await queryRowsRaw<{ count: number }>(
    `SELECT COUNT(*) AS count FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName`,
    { tableName },
  );
  if (Number(rows[0]?.count ?? 0) > 0) {
    console.log(`已存在，跳过：${tableName}`);
    return;
  }
  await executeRaw(ddl);
  console.log(`已创建：${tableName}`);
}

async function main() {
  // CRM 发票本地副本：CRM 是唯一数据源，本地只做只读副本 + 回填状态记录。
  await createTableIfMissing(
    "merge_cloud_crm_invoices",
    `
      CREATE TABLE \`merge_cloud_crm_invoices\` (
        \`id\` CHAR(36) NOT NULL COMMENT '本地记录ID',
        \`crmInvoiceId\` BIGINT NOT NULL COMMENT 'CRM 发票ID（唯一键，幂等同步用）',
        \`businessLineId\` INT NOT NULL DEFAULT 2 COMMENT '业务线ID：1云图 2Cloud 3vibe',
        \`invoiceNo\` VARCHAR(128) NOT NULL COMMENT '发票编号',
        \`customerShortName\` VARCHAR(255) NULL COMMENT 'CRM 客户简称',
        \`customerSubjectName\` VARCHAR(255) NULL COMMENT 'CRM 客户主体名称',
        \`belongMonth\` VARCHAR(7) NOT NULL COMMENT '归属月份 YYYY-MM',
        \`period\` VARCHAR(7) NULL COMMENT '本地账期 YYYYMM',
        \`currency\` VARCHAR(16) NULL COMMENT '币种',
        \`amountTaxExcluded\` DECIMAL(18,4) NULL COMMENT '开票金额不含税',
        \`taxAmount\` DECIMAL(18,4) NULL COMMENT '税额',
        \`amountTaxIncluded\` DECIMAL(18,4) NULL COMMENT '开票金额含税',
        \`invoiceDate\` DATE NULL COMMENT '开票日期',
        \`paymentTermDays\` INT NULL COMMENT '账期天数',
        \`dueDate\` DATE NULL COMMENT '到期日',
        \`invoiceType\` TINYINT NULL COMMENT '开票类型：1预付 2后付',
        \`invoiceStatus\` TINYINT NULL COMMENT '发票状态：1审核通过 2已作废',
        \`productServiceName\` VARCHAR(128) NULL COMMENT '产品服务名称',
        \`attachmentUrl\` VARCHAR(1000) NULL COMMENT 'CRM 附件地址（OBS 直链）',
        \`attachmentId\` CHAR(36) NULL COMMENT '已下载到本地附件表的附件ID',
        \`customerId\` VARCHAR(64) NULL COMMENT '映射到的本地客户ID',
        \`customerName\` VARCHAR(255) NULL COMMENT '映射到的本地客户简称',
        \`targetRowId\` VARCHAR(64) NULL COMMENT '回填到的华为云对账行ID',
        \`backfillStatus\` VARCHAR(24) NOT NULL DEFAULT 'pending' COMMENT 'pending/backfilled/mismatch/unmatched/void/skipped',
        \`backfillNote\` VARCHAR(500) NULL COMMENT '回填说明（差异、未匹配原因等）',
        \`syncedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最近一次同步时间',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_crm_invoice_remote\` (\`crmInvoiceId\`),
        KEY \`idx_crm_invoice_month\` (\`businessLineId\`, \`belongMonth\`, \`invoiceStatus\`),
        KEY \`idx_crm_invoice_customer\` (\`customerId\`),
        KEY \`idx_crm_invoice_row\` (\`targetRowId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='CRM 发票本地副本'
    `,
  );

  // CRM 回款本地副本：用于回填本地「客户实收」。
  await createTableIfMissing(
    "merge_cloud_crm_receipts",
    `
      CREATE TABLE \`merge_cloud_crm_receipts\` (
        \`id\` CHAR(36) NOT NULL COMMENT '本地记录ID',
        \`crmReceiptId\` BIGINT NOT NULL COMMENT 'CRM 回款ID（唯一键）',
        \`businessLineId\` INT NOT NULL DEFAULT 2 COMMENT '业务线ID',
        \`arrivalMonth\` VARCHAR(7) NOT NULL COMMENT '到账月份 YYYY-MM',
        \`period\` VARCHAR(7) NULL COMMENT '本地账期 YYYYMM',
        \`customerShortName\` VARCHAR(255) NULL COMMENT 'CRM 客户简称',
        \`currency\` VARCHAR(16) NULL COMMENT '原币币种',
        \`receiptStatus\` TINYINT NULL COMMENT '回款匹配状态：1未匹配 2部分匹配 3已匹配 4无需处理',
        \`receiptAmount\` DECIMAL(18,4) NULL COMMENT '回款金额',
        \`receivingBank\` VARCHAR(128) NULL COMMENT '收款银行',
        \`receivingAccountName\` VARCHAR(255) NULL COMMENT '收款账户名',
        \`receivingAccountNo\` VARCHAR(64) NULL COMMENT '收款账号',
        \`bankSerialNo\` VARCHAR(128) NULL COMMENT '银行流水号',
        \`bankSerialSummary\` VARCHAR(500) NULL COMMENT '银行流水摘要',
        \`payerName\` VARCHAR(255) NULL COMMENT '付款方名称',
        \`ourSubjectName\` VARCHAR(255) NULL COMMENT '我方主体名称',
        \`currencyConvertedFlag\` TINYINT NULL COMMENT '是否折算币种：1是 2否',
        \`convertedCurrency\` VARCHAR(16) NULL COMMENT '折算币种',
        \`convertedExchangeRate\` DECIMAL(18,8) NULL COMMENT '折算汇率',
        \`convertedAmount\` DECIMAL(18,4) NULL COMMENT '折算金额',
        \`invoiceNos\` VARCHAR(500) NULL COMMENT '关联发票编号，逗号分隔',
        \`customerId\` VARCHAR(64) NULL COMMENT '映射到的本地客户ID',
        \`customerName\` VARCHAR(255) NULL COMMENT '映射到的本地客户简称',
        \`targetRowId\` VARCHAR(64) NULL COMMENT '回填到的华为云对账行ID',
        \`backfillStatus\` VARCHAR(24) NOT NULL DEFAULT 'pending' COMMENT 'pending/backfilled/mismatch/unmatched/skipped',
        \`backfillNote\` VARCHAR(500) NULL COMMENT '回填说明',
        \`syncedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最近一次同步时间',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_crm_receipt_remote\` (\`crmReceiptId\`),
        KEY \`idx_crm_receipt_month\` (\`businessLineId\`, \`arrivalMonth\`),
        KEY \`idx_crm_receipt_customer\` (\`customerId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='CRM 回款本地副本'
    `,
  );

  // CRM 客户 → 本地对账客户映射：运维在「账期发票（CRM）」页签里维护一次即可。
  await createTableIfMissing(
    "merge_cloud_crm_customer_mappings",
    `
      CREATE TABLE \`merge_cloud_crm_customer_mappings\` (
        \`id\` CHAR(36) NOT NULL COMMENT '映射ID',
        \`crmValue\` VARCHAR(255) NOT NULL COMMENT 'CRM 侧原始值（主体名称或客户简称）',
        \`crmValueNormalized\` VARCHAR(255) NOT NULL COMMENT '归一化后的匹配键',
        \`matchField\` VARCHAR(32) NOT NULL DEFAULT 'customerSubjectName' COMMENT '匹配字段：customerSubjectName / customerShortName',
        \`customerId\` VARCHAR(64) NOT NULL COMMENT '本地客户ID',
        \`customerName\` VARCHAR(255) NULL COMMENT '本地客户简称（冗余展示）',
        \`source\` VARCHAR(16) NOT NULL DEFAULT 'manual' COMMENT '来源：auto 自动匹配 / manual 人工维护',
        \`remark\` VARCHAR(255) NULL,
        \`createdByUserId\` VARCHAR(64) NULL,
        \`createdByName\` VARCHAR(128) NULL,
        \`updatedByUserId\` VARCHAR(64) NULL,
        \`updatedByName\` VARCHAR(128) NULL,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_crm_mapping_value\` (\`crmValueNormalized\`),
        KEY \`idx_crm_mapping_customer\` (\`customerId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='CRM 客户与本地对账客户映射'
    `,
  );

  // 同步运行台账：与物料同步的 sync_runs 一个思路，便于回溯"哪次同步做了什么"。
  await createTableIfMissing(
    "merge_cloud_crm_sync_runs",
    `
      CREATE TABLE \`merge_cloud_crm_sync_runs\` (
        \`syncRunId\` CHAR(36) NOT NULL,
        \`triggerType\` VARCHAR(16) NOT NULL DEFAULT 'manual' COMMENT 'manual/scheduled/script',
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'running' COMMENT 'running/success/failed',
        \`businessLineId\` INT NOT NULL DEFAULT 2,
        \`months\` VARCHAR(255) NULL COMMENT '本次同步的账期，逗号分隔',
        \`dryRun\` TINYINT NOT NULL DEFAULT 0,
        \`invoiceFetched\` INT NOT NULL DEFAULT 0,
        \`invoiceChanged\` INT NOT NULL DEFAULT 0,
        \`invoiceVoided\` INT NOT NULL DEFAULT 0,
        \`receiptFetched\` INT NOT NULL DEFAULT 0,
        \`receiptChanged\` INT NOT NULL DEFAULT 0,
        \`backfilledCount\` INT NOT NULL DEFAULT 0,
        \`mismatchCount\` INT NOT NULL DEFAULT 0,
        \`unmatchedCount\` INT NOT NULL DEFAULT 0,
        \`attachmentDownloaded\` INT NOT NULL DEFAULT 0,
        \`attachmentFailed\` INT NOT NULL DEFAULT 0,
        \`errorCount\` INT NOT NULL DEFAULT 0,
        \`errorJson\` TEXT NULL,
        \`message\` VARCHAR(500) NULL,
        \`startedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`finishedAt\` DATETIME NULL,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`syncRunId\`),
        KEY \`idx_crm_sync_run_started\` (\`startedAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='CRM 发票回款同步运行台账'
    `,
  );

  console.log("CRM 发票 / 回款同步表结构已就绪");
}

main()
  .catch((error) => {
    console.error("建表失败", error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
