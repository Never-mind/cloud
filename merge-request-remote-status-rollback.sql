-- 回滚：删除需求单的远端履约状态字段。
-- 只能在已发布不再读写这些字段的版本之后执行。

SET @request_col_count := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_requests' AND COLUMN_NAME = 'remoteStatus');
SET @request_col_sql := IF(@request_col_count = 0, 'SELECT 1',
  'ALTER TABLE `merge_power_requests` DROP COLUMN `remoteStatus`');
PREPARE request_col_stmt FROM @request_col_sql;
EXECUTE request_col_stmt;
DEALLOCATE PREPARE request_col_stmt;

SET @request_col_count := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_requests' AND COLUMN_NAME = 'remoteStatusUpdatedAt');
SET @request_col_sql := IF(@request_col_count = 0, 'SELECT 1',
  'ALTER TABLE `merge_power_requests` DROP COLUMN `remoteStatusUpdatedAt`');
PREPARE request_col_stmt FROM @request_col_sql;
EXECUTE request_col_stmt;
DEALLOCATE PREPARE request_col_stmt;

SET @request_col_count := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_requests' AND COLUMN_NAME = 'remoteCancelledItemCount');
SET @request_col_sql := IF(@request_col_count = 0, 'SELECT 1',
  'ALTER TABLE `merge_power_requests` DROP COLUMN `remoteCancelledItemCount`');
PREPARE request_col_stmt FROM @request_col_sql;
EXECUTE request_col_stmt;
DEALLOCATE PREPARE request_col_stmt;
