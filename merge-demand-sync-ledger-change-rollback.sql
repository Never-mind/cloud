-- 回滚：删除需求同步台账的远端快照与变更明细字段。
-- 只能在已发布不再读写这两个字段的版本之后执行。
-- 使用前请在 Navicat 中先选中目标业务数据库；脚本不会自动选择数据库。

SET @demand_item_col_count := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_demand_sync_items' AND COLUMN_NAME = 'sourceDataJson');
SET @demand_item_col_sql := IF(@demand_item_col_count = 0, 'SELECT 1',
  'ALTER TABLE `merge_power_demand_sync_items` DROP COLUMN `sourceDataJson`');
PREPARE demand_item_col_stmt FROM @demand_item_col_sql;
EXECUTE demand_item_col_stmt;
DEALLOCATE PREPARE demand_item_col_stmt;

SET @demand_item_col_count := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_demand_sync_items' AND COLUMN_NAME = 'changeJson');
SET @demand_item_col_sql := IF(@demand_item_col_count = 0, 'SELECT 1',
  'ALTER TABLE `merge_power_demand_sync_items` DROP COLUMN `changeJson`');
PREPARE demand_item_col_stmt FROM @demand_item_col_sql;
EXECUTE demand_item_col_stmt;
DEALLOCATE PREPARE demand_item_col_stmt;
