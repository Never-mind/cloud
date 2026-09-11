-- 需求单：新增取消登记字段（远端履约状态取消时自动取消本地需求单，并记录取消来源）。
-- 用途：区分"远端取消自动联动"与"本地人工取消/删除"，便于日后追溯为什么不再同步。
-- 本脚本只增加字段，不修改或删除任何数据；重复执行不会失败。

SET @request_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_requests' AND COLUMN_NAME = 'cancelReason');
SET @request_col_sql := IF(@request_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_power_requests` ADD COLUMN `cancelReason` VARCHAR(32) NULL COMMENT ''remote_cancelled/local_manual/local_deleted'' AFTER `remoteCancelledItemCount`');
PREPARE request_col_stmt FROM @request_col_sql;
EXECUTE request_col_stmt;
DEALLOCATE PREPARE request_col_stmt;

SET @request_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_requests' AND COLUMN_NAME = 'cancelledAt');
SET @request_col_sql := IF(@request_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_power_requests` ADD COLUMN `cancelledAt` DATETIME NULL COMMENT ''cancel time'' AFTER `cancelReason`');
PREPARE request_col_stmt FROM @request_col_sql;
EXECUTE request_col_stmt;
DEALLOCATE PREPARE request_col_stmt;

SET @request_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_requests' AND COLUMN_NAME = 'cancelledByName');
SET @request_col_sql := IF(@request_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_power_requests` ADD COLUMN `cancelledByName` VARCHAR(255) NULL COMMENT ''cancel operator'' AFTER `cancelledAt`');
PREPARE request_col_stmt FROM @request_col_sql;
EXECUTE request_col_stmt;
DEALLOCATE PREPARE request_col_stmt;
