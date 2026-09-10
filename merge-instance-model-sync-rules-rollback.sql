-- 回滚：删除实例型号同步台账的分类型统计列。
-- 只能在已发布不再读写这些字段的版本之后执行。
-- 使用前请在 Navicat 中先选中目标业务数据库；脚本不会自动选择数据库。
-- 每个字段单独判断后再删除，重复执行不会失败（MySQL 8.0 不支持 DROP COLUMN IF EXISTS）。

SET @material_sync_col_count := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_material_sync_runs' AND COLUMN_NAME = 'createdEquipmentCount');
SET @material_sync_col_sql := IF(@material_sync_col_count = 0, 'SELECT 1',
  'ALTER TABLE `merge_power_material_sync_runs` DROP COLUMN `createdEquipmentCount`');
PREPARE material_sync_col_stmt FROM @material_sync_col_sql;
EXECUTE material_sync_col_stmt;
DEALLOCATE PREPARE material_sync_col_stmt;

SET @material_sync_col_count := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_material_sync_runs' AND COLUMN_NAME = 'createdComponentCount');
SET @material_sync_col_sql := IF(@material_sync_col_count = 0, 'SELECT 1',
  'ALTER TABLE `merge_power_material_sync_runs` DROP COLUMN `createdComponentCount`');
PREPARE material_sync_col_stmt FROM @material_sync_col_sql;
EXECUTE material_sync_col_stmt;
DEALLOCATE PREPARE material_sync_col_stmt;

SET @material_sync_col_count := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_material_sync_runs' AND COLUMN_NAME = 'createdMaterialCount');
SET @material_sync_col_sql := IF(@material_sync_col_count = 0, 'SELECT 1',
  'ALTER TABLE `merge_power_material_sync_runs` DROP COLUMN `createdMaterialCount`');
PREPARE material_sync_col_stmt FROM @material_sync_col_sql;
EXECUTE material_sync_col_stmt;
DEALLOCATE PREPARE material_sync_col_stmt;

SET @material_sync_col_count := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_material_sync_runs' AND COLUMN_NAME = 'blockedByPartNoCount');
SET @material_sync_col_sql := IF(@material_sync_col_count = 0, 'SELECT 1',
  'ALTER TABLE `merge_power_material_sync_runs` DROP COLUMN `blockedByPartNoCount`');
PREPARE material_sync_col_stmt FROM @material_sync_col_sql;
EXECUTE material_sync_col_stmt;
DEALLOCATE PREPARE material_sync_col_stmt;

SET @material_sync_col_count := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_material_sync_runs' AND COLUMN_NAME = 'skippedTypeCount');
SET @material_sync_col_sql := IF(@material_sync_col_count = 0, 'SELECT 1',
  'ALTER TABLE `merge_power_material_sync_runs` DROP COLUMN `skippedTypeCount`');
PREPARE material_sync_col_stmt FROM @material_sync_col_sql;
EXECUTE material_sync_col_stmt;
DEALLOCATE PREPARE material_sync_col_stmt;

SET @material_sync_col_count := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_material_sync_runs' AND COLUMN_NAME = 'dryRun');
SET @material_sync_col_sql := IF(@material_sync_col_count = 0, 'SELECT 1',
  'ALTER TABLE `merge_power_material_sync_runs` DROP COLUMN `dryRun`');
PREPARE material_sync_col_stmt FROM @material_sync_col_sql;
EXECUTE material_sync_col_stmt;
DEALLOCATE PREPARE material_sync_col_stmt;
