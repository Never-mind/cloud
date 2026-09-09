-- Rollback for the instance model type extension.
-- Run only after deploying an application version that no longer reads/writes
-- merge_power_instancemodels.instanceType.

SET @instance_model_type_index_exists := (
  SELECT COUNT(*)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'merge_power_instancemodels'
     AND INDEX_NAME = 'idx_InstanceModels_instanceType'
);

SET @drop_instance_model_type_index_sql := IF(
  @instance_model_type_index_exists > 0,
  'ALTER TABLE `merge_power_instancemodels` DROP INDEX `idx_InstanceModels_instanceType`',
  'SELECT 1'
);
PREPARE drop_instance_model_type_index_stmt FROM @drop_instance_model_type_index_sql;
EXECUTE drop_instance_model_type_index_stmt;
DEALLOCATE PREPARE drop_instance_model_type_index_stmt;

SET @instance_model_type_column_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'merge_power_instancemodels'
     AND COLUMN_NAME = 'instanceType'
);

SET @drop_instance_model_type_column_sql := IF(
  @instance_model_type_column_exists > 0,
  'ALTER TABLE `merge_power_instancemodels` DROP COLUMN `instanceType`',
  'SELECT 1'
);
PREPARE drop_instance_model_type_column_stmt FROM @drop_instance_model_type_column_sql;
EXECUTE drop_instance_model_type_column_stmt;
DEALLOCATE PREPARE drop_instance_model_type_column_stmt;
