-- 需求单：新增远端履约状态字段（Issued to Supplier / Confirmed / Committed / Handed Over / Shipped / Arrived / Received / Cancelled）。
-- 背景：远端状态在需求明细行上，本地需求单是主单，需要聚合后落库，供列表展示与筛选。
-- 本脚本只增加字段，不修改或删除任何数据。
-- 使用前请在 Navicat 中先选中目标业务数据库；脚本不会自动选择数据库。
-- 重复执行不会失败（MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS，这里用 information_schema + PREPARE 判断）。

SET @request_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_requests' AND COLUMN_NAME = 'remoteStatus');
SET @request_col_sql := IF(@request_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_power_requests` ADD COLUMN `remoteStatus` VARCHAR(32) NULL COMMENT ''remote fulfillment status'' AFTER `plannedDeliveryDate`');
PREPARE request_col_stmt FROM @request_col_sql;
EXECUTE request_col_stmt;
DEALLOCATE PREPARE request_col_stmt;

SET @request_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_requests' AND COLUMN_NAME = 'remoteStatusUpdatedAt');
SET @request_col_sql := IF(@request_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_power_requests` ADD COLUMN `remoteStatusUpdatedAt` DATETIME NULL COMMENT ''remote status update time'' AFTER `remoteStatus`');
PREPARE request_col_stmt FROM @request_col_sql;
EXECUTE request_col_stmt;
DEALLOCATE PREPARE request_col_stmt;

SET @request_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_requests' AND COLUMN_NAME = 'remoteCancelledItemCount');
SET @request_col_sql := IF(@request_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_power_requests` ADD COLUMN `remoteCancelledItemCount` INT NOT NULL DEFAULT 0 COMMENT ''remote cancelled item count'' AFTER `remoteStatusUpdatedAt`');
PREPARE request_col_stmt FROM @request_col_sql;
EXECUTE request_col_stmt;
DEALLOCATE PREPARE request_col_stmt;

-- 回填说明：字段为空表示该需求单尚未同步过远端状态；下次需求同步会自动写入。
