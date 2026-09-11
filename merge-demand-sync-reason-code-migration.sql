-- 需求同步台账：新增结构化"不同步/处理原因"字段，便于按原因筛选与统计。
-- 取值：created / local_exists / remote_changed / blocked_mapping / remote_cancelled / out_of_scope / local_cancelled
-- 本脚本只增加字段，不修改或删除任何数据；重复执行不会失败。

SET @item_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_demand_sync_items' AND COLUMN_NAME = 'reasonCode');
SET @item_col_sql := IF(@item_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_power_demand_sync_items` ADD COLUMN `reasonCode` VARCHAR(32) NULL COMMENT ''sync skip/success reason code'' AFTER `changeJson`');
PREPARE item_col_stmt FROM @item_col_sql;
EXECUTE item_col_stmt;
DEALLOCATE PREPARE item_col_stmt;
