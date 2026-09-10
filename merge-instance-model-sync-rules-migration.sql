-- 实例型号远程同步规则调整：为同步台账增加分类型统计列。
-- 背景：远端 Material 按 material_type 分为 Equipment / Component / Material，
-- 建档键随之分流（Equipment 用 Customer Part No.，其余用 Customer Item Code），
-- 因此需要按类型记录新增数量，并单独记录被编码规则阻断的条数。
-- 本脚本只增加字段，不修改、删除或迁移任何数据。
-- 使用前请在 Navicat 中先选中目标业务数据库；脚本不会自动选择数据库。
-- 通过 information_schema + PREPARE 判断字段是否存在，重复执行不会失败（MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS）。

SET @material_sync_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_material_sync_runs' AND COLUMN_NAME = 'createdEquipmentCount');
SET @material_sync_col_sql := IF(@material_sync_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_power_material_sync_runs` ADD COLUMN `createdEquipmentCount` INT NOT NULL DEFAULT 0 COMMENT ''created Equipment instance models'' AFTER `createdCount`');
PREPARE material_sync_col_stmt FROM @material_sync_col_sql;
EXECUTE material_sync_col_stmt;
DEALLOCATE PREPARE material_sync_col_stmt;

SET @material_sync_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_material_sync_runs' AND COLUMN_NAME = 'createdComponentCount');
SET @material_sync_col_sql := IF(@material_sync_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_power_material_sync_runs` ADD COLUMN `createdComponentCount` INT NOT NULL DEFAULT 0 COMMENT ''created Component instance models'' AFTER `createdEquipmentCount`');
PREPARE material_sync_col_stmt FROM @material_sync_col_sql;
EXECUTE material_sync_col_stmt;
DEALLOCATE PREPARE material_sync_col_stmt;

SET @material_sync_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_material_sync_runs' AND COLUMN_NAME = 'createdMaterialCount');
SET @material_sync_col_sql := IF(@material_sync_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_power_material_sync_runs` ADD COLUMN `createdMaterialCount` INT NOT NULL DEFAULT 0 COMMENT ''created Material instance models'' AFTER `createdComponentCount`');
PREPARE material_sync_col_stmt FROM @material_sync_col_sql;
EXECUTE material_sync_col_stmt;
DEALLOCATE PREPARE material_sync_col_stmt;

SET @material_sync_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_material_sync_runs' AND COLUMN_NAME = 'blockedByPartNoCount');
SET @material_sync_col_sql := IF(@material_sync_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_power_material_sync_runs` ADD COLUMN `blockedByPartNoCount` INT NOT NULL DEFAULT 0 COMMENT ''Equipment rows blocked by customer part no rule'' AFTER `createdMaterialCount`');
PREPARE material_sync_col_stmt FROM @material_sync_col_sql;
EXECUTE material_sync_col_stmt;
DEALLOCATE PREPARE material_sync_col_stmt;

SET @material_sync_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_material_sync_runs' AND COLUMN_NAME = 'skippedTypeCount');
SET @material_sync_col_sql := IF(@material_sync_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_power_material_sync_runs` ADD COLUMN `skippedTypeCount` INT NOT NULL DEFAULT 0 COMMENT ''rows skipped because material_type is unsupported'' AFTER `blockedByPartNoCount`');
PREPARE material_sync_col_stmt FROM @material_sync_col_sql;
EXECUTE material_sync_col_stmt;
DEALLOCATE PREPARE material_sync_col_stmt;

SET @material_sync_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_power_material_sync_runs' AND COLUMN_NAME = 'dryRun');
SET @material_sync_col_sql := IF(@material_sync_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_power_material_sync_runs` ADD COLUMN `dryRun` TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''dry run flag'' AFTER `skippedTypeCount`');
PREPARE material_sync_col_stmt FROM @material_sync_col_sql;
EXECUTE material_sync_col_stmt;
DEALLOCATE PREPARE material_sync_col_stmt;
