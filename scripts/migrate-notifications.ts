import { closeDb, executeRaw, queryRowsRaw } from "../src/lib/db";

/**
 * 消息通知模块建表（幂等，可重复执行）。
 *
 * 表放在 merge_common_ 前缀下，因为通知是跨域能力（集采/算力/华为云都要用）。
 * 用法：npm run schema:notifications
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
await createTableIfMissing(
  "merge_common_notification_rules",
  `
    CREATE TABLE \`merge_common_notification_rules\` (
      \`id\` CHAR(36) NOT NULL COMMENT '规则ID',
      \`name\` VARCHAR(128) NOT NULL COMMENT '规则名称',
      \`domainKey\` VARCHAR(32) NOT NULL DEFAULT 'po' COMMENT '业务域 power/po/cloud',
      \`moduleKey\` VARCHAR(64) NOT NULL DEFAULT 'settlement-projects' COMMENT '业务模块',
      \`triggerStatus\` VARCHAR(64) NOT NULL COMMENT '触发状态（模块内状态码）',
      \`delayDays\` INT NOT NULL DEFAULT 0 COMMENT '进入该状态后多少天触发，0=当天',
      \`repeatEveryDays\` INT NOT NULL DEFAULT 0 COMMENT '逾期后每隔多少天再提醒，0=只提醒一次',
      \`channels\` VARCHAR(64) NOT NULL DEFAULT 'feishu,inapp' COMMENT '通知渠道，逗号分隔',
      \`titleTemplate\` VARCHAR(255) NOT NULL COMMENT '标题模板',
      \`bodyTemplate\` TEXT NOT NULL COMMENT '正文模板，支持变量占位',
      \`enabled\` TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',
      \`createdByUserId\` VARCHAR(64) NULL,
      \`createdByName\` VARCHAR(128) NULL,
      \`updatedByUserId\` VARCHAR(64) NULL,
      \`updatedByName\` VARCHAR(128) NULL,
      \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_notification_rule_module\` (\`moduleKey\`, \`enabled\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息通知规则'
  `,
);

await createTableIfMissing(
  "merge_common_notification_rule_recipients",
  `
    CREATE TABLE \`merge_common_notification_rule_recipients\` (
      \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`ruleId\` CHAR(36) NOT NULL COMMENT '规则ID',
      \`userId\` VARCHAR(64) NOT NULL COMMENT '收件人用户ID',
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uk_notification_rule_recipient\` (\`ruleId\`, \`userId\`),
      KEY \`idx_notification_recipient_user\` (\`userId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息通知规则收件人'
  `,
);

await createTableIfMissing(
  "merge_common_notifications",
  `
    CREATE TABLE \`merge_common_notifications\` (
      \`id\` CHAR(36) NOT NULL COMMENT '通知ID',
      \`ruleId\` CHAR(36) NOT NULL COMMENT '规则ID',
      \`businessType\` VARCHAR(64) NOT NULL COMMENT '业务类型，如 settlement-projects',
      \`businessId\` VARCHAR(128) NOT NULL COMMENT '业务单据ID',
      \`businessNo\` VARCHAR(128) NULL COMMENT '业务单号，便于展示',
      \`recipientUserId\` VARCHAR(64) NOT NULL COMMENT '收件人用户ID',
      \`title\` VARCHAR(255) NOT NULL COMMENT '标题',
      \`content\` TEXT NOT NULL COMMENT '正文',
      \`feishuStatus\` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/sent/failed/skipped',
      \`feishuError\` VARCHAR(500) NULL COMMENT '飞书发送失败原因',
      \`sentAt\` DATETIME NULL COMMENT '发送时间',
      \`readAt\` DATETIME NULL COMMENT '已读时间',
      \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uk_notification_dedupe\` (\`ruleId\`, \`businessId\`, \`recipientUserId\`),
      KEY \`idx_notification_inbox\` (\`recipientUserId\`, \`readAt\`, \`createdAt\`),
      KEY \`idx_notification_rule\` (\`ruleId\`, \`createdAt\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息通知记录（同时作为站内消息）'
  `,
);

  console.log("消息通知表结构已就绪");

  // 已有账号补齐「消息通知」的查看权限：通知默认对所有人开放，配置权留给管理员。
  // 用 INSERT IGNORE，不会覆盖管理员已经做过的授权/收回决定。
  const users = await queryRowsRaw<{ userId: string }>(
    "SELECT userId FROM merge_common_users WHERE status = 'active'",
  );
  for (const user of users) {
    await executeRaw(
      `INSERT IGNORE INTO merge_common_user_permissions
        (userId, moduleKey, canView, canCreate, canUpdate, canDelete, canExport, canImport, canConfirm, updatedByUserId)
       VALUES (:userId, 'notification-rules', 1, 0, 0, 0, 0, 0, 0, NULL)`,
      { userId: user.userId },
    );
  }
  console.log(`已为 ${users.length} 个启用中的账号补齐「消息通知」查看权限（不覆盖已有授权）`);
}

main()
  .catch((error) => {
    console.error("建表失败", error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
