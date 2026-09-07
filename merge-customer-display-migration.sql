-- 客户展示名称统一迁移
--
-- 规则：客户主档存在时按“简称 -> 中文名称 -> 名称 -> 客户编码”展示；
-- 主档不存在时保留原快照，避免无主档数据被覆盖。
-- 使用前请在 Navicat 中先选中目标业务数据库；脚本不会自动选择数据库。
-- 脚本可重复执行：备份只保留首次迁移前的原值，更新逻辑使用当前客户主档。

SET @customer_display_migration_key = 'customer-display-v1';

CREATE TABLE IF NOT EXISTS `merge_common_customer_display_backup` (
  `migrationKey` VARCHAR(64) NOT NULL,
  `sourceTable` VARCHAR(64) NOT NULL,
  `sourceId` VARCHAR(128) NOT NULL,
  `customerId` VARCHAR(64) NULL,
  `originalCustomerName` VARCHAR(255) NULL,
  `canonicalCustomerName` VARCHAR(255) NULL,
  `backedUpAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`migrationKey`, `sourceTable`, `sourceId`),
  KEY `idx_customer_display_backup_customer` (`customerId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户展示名称迁移备份';

-- 迁移前审计：结果集会显示各来源表中已有客户主档且需要改名的记录数。
SELECT '项目结算' AS source,
       COUNT(*) AS rowsWithCustomerMaster,
       COALESCE(SUM(NOT (p.`customerName` <=> COALESCE(
         (SELECT COALESCE(NULLIF(TRIM(c.`shortName`), ''), NULLIF(TRIM(c.`nameCn`), ''), NULLIF(TRIM(c.`name`), ''), NULLIF(TRIM(c.`customerCode`), ''), NULLIF(TRIM(p.`customerName`), ''), NULLIF(TRIM(p.`customerId`), ''))
            FROM `merge_common_customers` c
           WHERE c.`customerId` = p.`customerId` OR c.`customerCode` = p.`customerId`
           LIMIT 1),
         NULLIF(TRIM(p.`customerName`), ''), NULLIF(TRIM(p.`customerId`), '')
       ))), 0) AS rowsToUpdate
  FROM `merge_po_settlement_projects` p
 WHERE EXISTS (SELECT 1 FROM `merge_common_customers` c WHERE c.`customerId` = p.`customerId` OR c.`customerCode` = p.`customerId`);

SELECT '客户产品别名' AS source,
       COUNT(*) AS rowsWithCustomerMaster,
       COALESCE(SUM(NOT (a.`customerName` <=> COALESCE(
         (SELECT COALESCE(NULLIF(TRIM(c.`shortName`), ''), NULLIF(TRIM(c.`nameCn`), ''), NULLIF(TRIM(c.`name`), ''), NULLIF(TRIM(c.`customerCode`), ''), NULLIF(TRIM(a.`customerName`), ''), NULLIF(TRIM(a.`customerId`), ''))
            FROM `merge_common_customers` c
           WHERE c.`customerId` = a.`customerId` OR c.`customerCode` = a.`customerId`
           LIMIT 1),
         NULLIF(TRIM(a.`customerName`), ''), NULLIF(TRIM(a.`customerId`), '')
       ))), 0) AS rowsToUpdate
  FROM `merge_po_customer_product_aliases` a
 WHERE EXISTS (SELECT 1 FROM `merge_common_customers` c WHERE c.`customerId` = a.`customerId` OR c.`customerCode` = a.`customerId`);

SELECT '服务映射' AS source,
       COUNT(*) AS rowsWithCustomerMaster,
       COALESCE(SUM(NOT (m.`customerName` <=> COALESCE(
         (SELECT COALESCE(NULLIF(TRIM(c.`shortName`), ''), NULLIF(TRIM(c.`nameCn`), ''), NULLIF(TRIM(c.`name`), ''), NULLIF(TRIM(c.`customerCode`), ''), NULLIF(TRIM(m.`customerName`), ''), NULLIF(TRIM(m.`customerId`), ''))
            FROM `merge_common_customers` c
           WHERE c.`customerId` = m.`customerId` OR c.`customerCode` = m.`customerId`
           LIMIT 1),
         NULLIF(TRIM(m.`customerName`), ''), NULLIF(TRIM(m.`customerId`), '')
       ))), 0) AS rowsToUpdate
  FROM `merge_cloud_mappings` m
 WHERE EXISTS (SELECT 1 FROM `merge_common_customers` c WHERE c.`customerId` = m.`customerId` OR c.`customerCode` = m.`customerId`);

START TRANSACTION;

INSERT IGNORE INTO `merge_common_customer_display_backup`
  (`migrationKey`, `sourceTable`, `sourceId`, `customerId`, `originalCustomerName`, `canonicalCustomerName`)
SELECT @customer_display_migration_key, 'merge_po_settlement_projects', p.`id`, p.`customerId`, p.`customerName`,
       COALESCE(
         (SELECT COALESCE(NULLIF(TRIM(c.`shortName`), ''), NULLIF(TRIM(c.`nameCn`), ''), NULLIF(TRIM(c.`name`), ''), NULLIF(TRIM(c.`customerCode`), ''), NULLIF(TRIM(p.`customerName`), ''), NULLIF(TRIM(p.`customerId`), ''))
            FROM `merge_common_customers` c
           WHERE c.`customerId` = p.`customerId` OR c.`customerCode` = p.`customerId`
           LIMIT 1),
         NULLIF(TRIM(p.`customerName`), ''), NULLIF(TRIM(p.`customerId`), '')
       )
  FROM `merge_po_settlement_projects` p;

INSERT IGNORE INTO `merge_common_customer_display_backup`
  (`migrationKey`, `sourceTable`, `sourceId`, `customerId`, `originalCustomerName`, `canonicalCustomerName`)
SELECT @customer_display_migration_key, 'merge_po_customer_product_aliases', a.`id`, a.`customerId`, a.`customerName`,
       COALESCE(
         (SELECT COALESCE(NULLIF(TRIM(c.`shortName`), ''), NULLIF(TRIM(c.`nameCn`), ''), NULLIF(TRIM(c.`name`), ''), NULLIF(TRIM(c.`customerCode`), ''), NULLIF(TRIM(a.`customerName`), ''), NULLIF(TRIM(a.`customerId`), ''))
            FROM `merge_common_customers` c
           WHERE c.`customerId` = a.`customerId` OR c.`customerCode` = a.`customerId`
           LIMIT 1),
         NULLIF(TRIM(a.`customerName`), ''), NULLIF(TRIM(a.`customerId`), '')
       )
  FROM `merge_po_customer_product_aliases` a;

INSERT IGNORE INTO `merge_common_customer_display_backup`
  (`migrationKey`, `sourceTable`, `sourceId`, `customerId`, `originalCustomerName`, `canonicalCustomerName`)
SELECT @customer_display_migration_key, 'merge_cloud_mappings', m.`id`, m.`customerId`, m.`customerName`,
       COALESCE(
         (SELECT COALESCE(NULLIF(TRIM(c.`shortName`), ''), NULLIF(TRIM(c.`nameCn`), ''), NULLIF(TRIM(c.`name`), ''), NULLIF(TRIM(c.`customerCode`), ''), NULLIF(TRIM(m.`customerName`), ''), NULLIF(TRIM(m.`customerId`), ''))
            FROM `merge_common_customers` c
           WHERE c.`customerId` = m.`customerId` OR c.`customerCode` = m.`customerId`
           LIMIT 1),
         NULLIF(TRIM(m.`customerName`), ''), NULLIF(TRIM(m.`customerId`), '')
       )
  FROM `merge_cloud_mappings` m;

UPDATE `merge_po_settlement_projects` p
   SET p.`customerName` = COALESCE(
     (SELECT COALESCE(NULLIF(TRIM(c.`shortName`), ''), NULLIF(TRIM(c.`nameCn`), ''), NULLIF(TRIM(c.`name`), ''), NULLIF(TRIM(c.`customerCode`), ''))
        FROM `merge_common_customers` c
       WHERE c.`customerId` = p.`customerId` OR c.`customerCode` = p.`customerId`
       LIMIT 1),
     NULLIF(TRIM(p.`customerName`), ''), NULLIF(TRIM(p.`customerId`), '')
   )
 WHERE EXISTS (SELECT 1 FROM `merge_common_customers` c WHERE c.`customerId` = p.`customerId` OR c.`customerCode` = p.`customerId`);

UPDATE `merge_po_customer_product_aliases` a
   SET a.`customerName` = COALESCE(
     (SELECT COALESCE(NULLIF(TRIM(c.`shortName`), ''), NULLIF(TRIM(c.`nameCn`), ''), NULLIF(TRIM(c.`name`), ''), NULLIF(TRIM(c.`customerCode`), ''))
        FROM `merge_common_customers` c
       WHERE c.`customerId` = a.`customerId` OR c.`customerCode` = a.`customerId`
       LIMIT 1),
     NULLIF(TRIM(a.`customerName`), ''), NULLIF(TRIM(a.`customerId`), '')
   )
 WHERE EXISTS (SELECT 1 FROM `merge_common_customers` c WHERE c.`customerId` = a.`customerId` OR c.`customerCode` = a.`customerId`);

UPDATE `merge_cloud_mappings` m
   SET m.`customerName` = COALESCE(
     (SELECT COALESCE(NULLIF(TRIM(c.`shortName`), ''), NULLIF(TRIM(c.`nameCn`), ''), NULLIF(TRIM(c.`name`), ''), NULLIF(TRIM(c.`customerCode`), ''))
        FROM `merge_common_customers` c
       WHERE c.`customerId` = m.`customerId` OR c.`customerCode` = m.`customerId`
       LIMIT 1),
     NULLIF(TRIM(m.`customerName`), ''), NULLIF(TRIM(m.`customerId`), '')
   )
 WHERE EXISTS (SELECT 1 FROM `merge_common_customers` c WHERE c.`customerId` = m.`customerId` OR c.`customerCode` = m.`customerId`);

COMMIT;

-- 迁移结果：可用备份行数核对本次覆盖范围；如需再次核对差异，可重复执行上面的审计查询。
SELECT '迁移完成' AS result,
       (SELECT COUNT(*) FROM `merge_common_customer_display_backup` WHERE `migrationKey` = @customer_display_migration_key) AS backedUpRows,
       CURRENT_TIMESTAMP AS completedAt;
