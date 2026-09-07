-- 客户展示名称统一迁移回滚
-- 使用前请在 Navicat 中先选中目标业务数据库；脚本不会自动选择数据库。
-- 仅回滚 merge-customer-display-migration.sql 创建的备份，不删除备份表。

SET @customer_display_migration_key = 'customer-display-v1';

START TRANSACTION;

UPDATE `merge_po_settlement_projects` p
  INNER JOIN `merge_common_customer_display_backup` b
    ON b.`migrationKey` = @customer_display_migration_key
   AND b.`sourceTable` = 'merge_po_settlement_projects'
   AND b.`sourceId` = p.`id`
   SET p.`customerName` = b.`originalCustomerName`;

UPDATE `merge_po_customer_product_aliases` a
  INNER JOIN `merge_common_customer_display_backup` b
    ON b.`migrationKey` = @customer_display_migration_key
   AND b.`sourceTable` = 'merge_po_customer_product_aliases'
   AND b.`sourceId` = a.`id`
   SET a.`customerName` = b.`originalCustomerName`;

UPDATE `merge_cloud_mappings` m
  INNER JOIN `merge_common_customer_display_backup` b
    ON b.`migrationKey` = @customer_display_migration_key
   AND b.`sourceTable` = 'merge_cloud_mappings'
   AND b.`sourceId` = m.`id`
   SET m.`customerName` = b.`originalCustomerName`;

COMMIT;

SELECT '回滚完成' AS result,
       (SELECT COUNT(*) FROM `merge_common_customer_display_backup` WHERE `migrationKey` = @customer_display_migration_key) AS restoredRows,
       CURRENT_TIMESTAMP AS completedAt;
