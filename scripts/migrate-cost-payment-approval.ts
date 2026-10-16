import { closeDb, executeRaw, queryRowsRaw } from "../src/lib/db";

/**
 * 成本款付款申请（飞书审批 A5075F7F-2EC5-4594-875B-14BEAEFD45E3）幂等迁移。
 *
 * 三个发起入口都要能把「审批状态 / 已付款」带进列表：
 *   ① 华为云业务 → 供应商付款（`merge_cloud_supplier_payments`）
 *   ② 集采系统 → 发票汇总 / 项目结算发票（`merge_po_settlement_invoices`）
 *   ③ 算力系统 → 采购订单（`merge_power_purchaseorders`，支持多单合并成一张审批）
 *
 * 审批实例本身复用 `merge_common_feishu_approvals` 台账（开票审批在用），不新建表；
 * 这里只给三张来源表补「关联的审批台账 ID」，采购订单再补付款状态。
 * 采购订单附件复用 `merge_common_attachments`（ownerType = purchase-orders）。
 *
 * 用法：npm run schema:cost-payment-approval
 */

async function columnExists(table: string, column: string) {
  const rows = await queryRowsRaw<{ count: number }>(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
    { table, column },
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function tableExists(table: string) {
  const rows = await queryRowsRaw<{ count: number }>(
    `SELECT COUNT(*) AS count FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table`,
    { table },
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

const CHANGES: Array<[string, string, string]> = [
  [
    "merge_power_purchaseorders",
    "paymentStatus",
    "ADD COLUMN `paymentStatus` VARCHAR(16) NULL COMMENT '付款状态：未付款/审批中/已付款/已驳回' AFTER `status`",
  ],
  [
    "merge_power_purchaseorders",
    "paymentApprovalId",
    "ADD COLUMN `paymentApprovalId` CHAR(36) NULL COMMENT '关联的成本款付款申请台账ID' AFTER `paymentStatus`",
  ],
  [
    "merge_power_purchaseorders",
    "paidAt",
    "ADD COLUMN `paidAt` DATETIME NULL COMMENT '付款审批通过时间' AFTER `paymentApprovalId`",
  ],
  [
    "merge_cloud_supplier_payments",
    "paymentApprovalId",
    "ADD COLUMN `paymentApprovalId` CHAR(36) NULL COMMENT '关联的成本款付款申请台账ID' AFTER `paid`",
  ],
  [
    "merge_po_settlement_invoices",
    "paymentApprovalId",
    "ADD COLUMN `paymentApprovalId` CHAR(36) NULL COMMENT '关联的成本款付款申请台账ID' AFTER `isPaid`",
  ],
];

async function main() {
  for (const [table, column, clause] of CHANGES) {
    if (!(await tableExists(table))) {
      console.log(`跳过 ${table}（表不存在）`);
      continue;
    }
    if (await columnExists(table, column)) {
      console.log(`${table}.${column} 已存在，跳过`);
      continue;
    }
    await executeRaw(`ALTER TABLE \`${table}\` ${clause}`);
    console.log(`已为 ${table} 添加 ${column}`);
  }

  const [stats] = await queryRowsRaw<{ total: number }>(
    "SELECT COUNT(*) AS total FROM merge_power_purchaseorders WHERE paymentStatus IS NOT NULL",
  );
  console.log(`采购订单里已有付款状态的行：${stats?.total ?? 0}`);
  console.log("成本款付款申请相关字段已就绪");
}

main()
  .catch((error) => {
    console.error("执行失败：", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
