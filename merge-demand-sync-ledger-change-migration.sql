-- 需求同步台账：新增远端快照与变更明细字段。
-- 背景：需要在台账里保留上次同步的远端明细内容，才能展示"客户改了哪些字段"的 diff，
-- 并支持把状态已不在可同步范围的明细也记进台账（status = out_of_scope）。
-- 本脚本只增加字段，不修改、删除或迁移任何数据。
-- 使用前请在 Navicat 中先选中目标业务数据库；脚本不会自动选择数据库。
-- 重复执行不会失败（MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS，这里用 information_schema + PREPARE 判断）。

SET @demand_item_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_demand_sync_items' AND COLUMN_NAME = 'sourceDataJson');
SET @demand_item_col_sql := IF(@demand_item_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_power_demand_sync_items` ADD COLUMN `sourceDataJson` LONGTEXT NULL COMMENT ''remote demand item payload snapshot'' AFTER `errorMessage`');
PREPARE demand_item_col_stmt FROM @demand_item_col_sql;
EXECUTE demand_item_col_stmt;
DEALLOCATE PREPARE demand_item_col_stmt;

SET @demand_item_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_demand_sync_items' AND COLUMN_NAME = 'changeJson');
SET @demand_item_col_sql := IF(@demand_item_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_power_demand_sync_items` ADD COLUMN `changeJson` TEXT NULL COMMENT ''field level remote change list'' AFTER `sourceDataJson`');
PREPARE demand_item_col_stmt FROM @demand_item_col_sql;
EXECUTE demand_item_col_stmt;
DEALLOCATE PREPARE demand_item_col_stmt;

-- 回填说明：新增字段为空时，"变更明细"会在下次同步后才开始积累；
-- 台账里已有的记录不会被改动，首次同步会把当次远端内容写入 sourceDataJson 作为比对基线。
