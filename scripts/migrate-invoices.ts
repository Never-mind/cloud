import { closeDb, executeRaw, queryRowsRaw } from "../src/lib/db";

/**
 * 开票功能建表（幂等，可重复执行）。
 *
 * 发票主表放公共域 `merge_common_`：开票主体是我们自己的承接单位，
 * 但同一张票可能来自华为云对账、月账单对账单、服务费对账单或项目结算，
 * 放公共域才不会被某个业务域的前缀绑死。
 *
 * 用法：npm run schema:invoices
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

/** 老库补字段用（已建过表的库升级时不会重复加）。 */
async function addColumnIfMissing(tableName: string, columnName: string, ddl: string) {
  const rows = await queryRowsRaw<{ count: number }>(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName AND COLUMN_NAME = :columnName`,
    { tableName, columnName },
  );
  if (Number(rows[0]?.count ?? 0) > 0) {
    console.log(`字段已存在，跳过：${tableName}.${columnName}`);
    return;
  }
  await executeRaw(`ALTER TABLE \`${tableName}\` ADD COLUMN ${ddl}`);
  console.log(`已补字段：${tableName}.${columnName}`);
}

async function main() {
  /**
   * 开票记录主表。
   *
   * 两条来源共用一张表：
   *   - source=generated：系统生成票面文件，票号由我们分配（INV-<账期>-<流水>）；
   *   - source=external ：外部已经开好票，只上传文件 + 登记票号金额。
   * 开票主体与客户信息都存**快照**：客户以后改名字改地址，已开出的票面不能跟着变。
   */
  await createTableIfMissing(
    "merge_common_invoices",
    `
      CREATE TABLE \`merge_common_invoices\` (
        \`id\` CHAR(36) NOT NULL COMMENT '开票记录ID',
        \`invoiceNo\` VARCHAR(64) NOT NULL COMMENT '发票号（系统生成按 INV-账期-流水；外部上传用外部票号）',
        \`source\` VARCHAR(16) NOT NULL DEFAULT 'generated' COMMENT 'generated 系统生成 / external 外部上传',
        \`template\` VARCHAR(16) NULL COMMENT '票面模板：normal 普通 / sgd 双币',
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT 'draft 草稿 / issued 已开票 / void 已作废',
        \`sourceType\` VARCHAR(32) NULL COMMENT '来源单据类型：cloud_row / billing_statement / service_fee / settlement_invoice / manual',
        \`sourceId\` VARCHAR(64) NULL COMMENT '来源单据ID',
        \`sourceNo\` VARCHAR(128) NULL COMMENT '来源单据编号（对账单号、项目号等，展示用）',
        \`period\` VARCHAR(16) NULL COMMENT '账期 YYYYMM',
        \`customerId\` VARCHAR(64) NULL COMMENT '客户ID（快照来源，展示按档案当前值走 customerId）',
        \`customerName\` VARCHAR(255) NULL COMMENT '客户抬头（快照）',
        \`customerAddress\` TEXT NULL COMMENT '客户发票地址（快照）',
        \`customerTaxNumber\` VARCHAR(100) NULL,
        \`customerContact\` VARCHAR(255) NULL COMMENT '客户联系人（快照）',
        \`customerContactEmail\` VARCHAR(255) NULL,
        \`undertakingUnitId\` VARCHAR(64) NULL COMMENT '开票主体（承接单位）ID',
        \`sellerName\` VARCHAR(255) NULL COMMENT '开票主体名称（快照）',
        \`sellerCountry\` VARCHAR(100) NULL,
        \`sellerAddress\` VARCHAR(500) NULL,
        \`sellerTelephone\` VARCHAR(100) NULL,
        \`sellerFinanceEmail\` VARCHAR(255) NULL,
        \`bankAccountId\` VARCHAR(64) NULL COMMENT '承接单位银行账户ID',
        \`bankAccountName\` VARCHAR(255) NULL COMMENT '收款人名称',
        \`bankName\` VARCHAR(255) NULL,
        \`bankAccount\` VARCHAR(255) NULL COMMENT '收款账号',
        \`bankSwiftCode\` VARCHAR(100) NULL,
        \`bankCode\` VARCHAR(100) NULL,
        \`bankAddress\` VARCHAR(500) NULL,
        \`currency\` VARCHAR(16) NULL,
        \`exchangeRate\` DECIMAL(18,8) NULL COMMENT '开票汇率（报表折算用，票面不体现）',
        \`amountExcludingTax\` DECIMAL(18,4) NULL COMMENT '未税金额',
        \`taxRate\` DECIMAL(9,4) NULL COMMENT '税率（百分数，如 6 表示 6%）',
        \`taxAmount\` DECIMAL(18,4) NULL COMMENT '税金',
        \`amountIncludingTax\` DECIMAL(18,4) NULL COMMENT '含税金额（票面 Total）',
        \`sgdRate\` DECIMAL(18,8) NULL COMMENT '双币模板行汇率',
        \`sgdTotal\` DECIMAL(18,4) NULL COMMENT '双币模板 SGD 合计',
        \`gstRegNo\` VARCHAR(255) NULL COMMENT '双币模板 GST 税号展示文字',
        \`invoiceDate\` DATE NULL,
        \`dueDate\` DATE NULL,
        \`paymentTermDays\` INT NULL COMMENT '账期天数',
        \`comment\` TEXT NULL COMMENT '票面备注（自动折行）',
        \`authImg\` LONGTEXT NULL COMMENT '签章图（data URI 或可访问地址）',
        \`fileName\` VARCHAR(255) NULL COMMENT '票面/发票文件名',
        \`fileType\` VARCHAR(128) NULL,
        \`fileSize\` INT NULL,
        \`fileProvider\` VARCHAR(16) NULL COMMENT 'obs 已在云盘 / db 数据库回落',
        \`storageKey\` VARCHAR(500) NULL COMMENT 'OBS 对象键',
        \`fileContent\` LONGTEXT NULL COMMENT '数据库回落时存 base64 内容',
        \`issuedAt\` DATETIME NULL,
        \`issuedByUserId\` VARCHAR(64) NULL,
        \`issuedByName\` VARCHAR(128) NULL,
        \`voidedAt\` DATETIME NULL,
        \`voidReason\` VARCHAR(255) NULL,
        \`remark\` VARCHAR(500) NULL,
        \`createdByUserId\` VARCHAR(64) NULL,
        \`createdByName\` VARCHAR(128) NULL,
        \`updatedByUserId\` VARCHAR(64) NULL,
        \`updatedByName\` VARCHAR(128) NULL,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_invoice_no\` (\`invoiceNo\`),
        KEY \`idx_invoice_source\` (\`sourceType\`, \`sourceId\`),
        KEY \`idx_invoice_period\` (\`period\`),
        KEY \`idx_invoice_customer\` (\`customerId\`),
        KEY \`idx_invoice_status\` (\`status\`, \`invoiceDate\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='开票记录（系统生成 + 外部上传）'
    `,
  );

  /** 票面明细行：一张票可以拆多行（多账期、多账号），行金额合计应等于含税总额。 */
  await createTableIfMissing(
    "merge_common_invoice_items",
    `
      CREATE TABLE \`merge_common_invoice_items\` (
        \`id\` CHAR(36) NOT NULL COMMENT '明细行ID',
        \`invoiceId\` CHAR(36) NOT NULL COMMENT '所属开票记录ID',
        \`lineNo\` INT NOT NULL DEFAULT 1 COMMENT '行号（从 1 开始，决定票面顺序）',
        \`periodLabel\` VARCHAR(32) NULL COMMENT '票面 TIME 列（账期或期间）',
        \`description\` VARCHAR(500) NULL COMMENT '票面 Description',
        \`amount\` DECIMAL(18,4) NULL COMMENT '行金额（单价=小计，数量恒为 1）',
        \`sgdRate\` DECIMAL(18,8) NULL COMMENT '双币模板该行 SGD 汇率',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_invoice_item_invoice\` (\`invoiceId\`, \`lineNo\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='开票明细行'
    `,
  );

  // 承接单位开票资料：票面左侧 CONTACT 与银行栏都取自这里。
  await addColumnIfMissing("merge_common_undertaking_units", "financeEmail", "`financeEmail` VARCHAR(255) NULL COMMENT '票面财务联系邮箱'");
  await addColumnIfMissing("merge_common_undertaking_units", "paymentTermDays", "`paymentTermDays` INT NULL COMMENT '默认账期天数（票面 Payment Terms）'");
  await addColumnIfMissing("merge_common_undertaking_units", "signatureImage", "`signatureImage` LONGTEXT NULL COMMENT '票面签章图（data URI）'");

  // 月账单对账单：原本一点开票信息都没有，补上与华为云对账一致的开票字段。
  await addColumnIfMissing("merge_power_billingstatementsnapshots", "invoiceId", "`invoiceId` CHAR(36) NULL COMMENT '关联开票记录ID'");
  await addColumnIfMissing("merge_power_billingstatementsnapshots", "invoiceNo", "`invoiceNo` VARCHAR(64) NULL COMMENT '发票号'");
  await addColumnIfMissing("merge_power_billingstatementsnapshots", "invoiceCurrency", "`invoiceCurrency` VARCHAR(16) NULL COMMENT '开票币种'");
  await addColumnIfMissing("merge_power_billingstatementsnapshots", "invoiceNetAmount", "`invoiceNetAmount` DECIMAL(18,4) NULL COMMENT '开票未税金额'");
  await addColumnIfMissing("merge_power_billingstatementsnapshots", "invoiceTaxRate", "`invoiceTaxRate` DECIMAL(9,4) NULL COMMENT '开票税率'");
  await addColumnIfMissing("merge_power_billingstatementsnapshots", "invoiceTaxAmount", "`invoiceTaxAmount` DECIMAL(18,4) NULL COMMENT '开票税金'");
  await addColumnIfMissing("merge_power_billingstatementsnapshots", "invoiceTotalAmount", "`invoiceTotalAmount` DECIMAL(18,4) NULL COMMENT '开票含税金额'");
  await addColumnIfMissing("merge_power_billingstatementsnapshots", "invoiceDate", "`invoiceDate` DATE NULL COMMENT '开票日期'");
  await addColumnIfMissing("merge_power_billingstatementsnapshots", "invoiceStatus", "`invoiceStatus` VARCHAR(16) NULL COMMENT '开票状态：issued / not_issued'");

  // 开票时会把票面同时挂到来源单据的开票附件位（华为云对账行的「客户开票附件」），
  // 这里记录挂上去的那条附件 ID，作废时据此摘掉，避免残留一张作废票的附件。
  await addColumnIfMissing("merge_common_invoices", "sourceAttachmentId", "`sourceAttachmentId` VARCHAR(64) NULL COMMENT '挂到来源单据开票附件位上的附件ID'");

  await grantInvoicePermissionToExistingUsers();

  console.log("开票表结构已就绪");
}

/**
 * 开票默认对所有账号开放。
 *
 * 与自动建号的默认口径保持一致（除「账户管理」「功能启用」两个管理员模块外，其余模块默认全开），
 * 新账号在建号时按同一份权限定义自动带上；这里只给**已有账号**补一行，
 * 用 INSERT IGNORE 保证管理员手工收回过的权限不会被脚本重新打开。
 */
async function grantInvoicePermissionToExistingUsers() {
  const users = await queryRowsRaw<{ userId: string }>(
    "SELECT userId FROM merge_common_users WHERE role <> 'admin' AND status = 'active'",
  );
  for (const user of users) {
    await executeRaw(
      `INSERT IGNORE INTO merge_common_user_permissions
         (userId, moduleKey, canView, canCreate, canUpdate, canDelete, canExport, canImport, canConfirm, updatedByUserId)
       VALUES (:userId, 'invoices', 1, 1, 1, 1, 1, 1, 1, NULL)`,
      { userId: user.userId },
    );
  }
  console.log(`发票管理已对 ${users.length} 个普通账号开放（已有手工设置的不覆盖）`);
}

main()
  .catch((error) => {
    console.error("建表失败", error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
