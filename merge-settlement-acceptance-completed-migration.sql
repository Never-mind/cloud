-- 项目结算：新增「验收完成」状态对应的时间字段（采购中 → 采购完成 → 验收中 → 验收完成 → 已完结）。
-- 本脚本只增加字段，不修改或删除任何数据；重复执行不会失败。

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_po_settlement_projects' AND COLUMN_NAME = 'acceptanceCompletedAt');
SET @col_sql := IF(@col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_po_settlement_projects` ADD COLUMN `acceptanceCompletedAt` DATETIME NULL COMMENT ''acceptance completed time'' AFTER `acceptanceStartedAt`');
PREPARE col_stmt FROM @col_sql;
EXECUTE col_stmt;
DEALLOCATE PREPARE col_stmt;
