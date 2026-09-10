-- 回滚：删除华为云供应商付款的应付金额快照字段。
-- 只能在已发布不再读写这些字段的版本之后执行。
-- 使用前请在 Navicat 中先选中目标业务数据库；脚本不会自动选择数据库。
-- 每个字段单独判断后再删除，重复执行不会失败（MySQL 8.0 不支持 DROP COLUMN IF EXISTS）。

SET @cloud_payment_col_count := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_cloud_supplier_payments' AND COLUMN_NAME = 'supplierPayableCurrency');
SET @cloud_payment_col_sql := IF(@cloud_payment_col_count = 0, 'SELECT 1',
  'ALTER TABLE `merge_cloud_supplier_payments` DROP COLUMN `supplierPayableCurrency`');
PREPARE cloud_payment_col_stmt FROM @cloud_payment_col_sql;
EXECUTE cloud_payment_col_stmt;
DEALLOCATE PREPARE cloud_payment_col_stmt;

SET @cloud_payment_col_count := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_cloud_supplier_payments' AND COLUMN_NAME = 'supplierPayableNetAmount');
SET @cloud_payment_col_sql := IF(@cloud_payment_col_count = 0, 'SELECT 1',
  'ALTER TABLE `merge_cloud_supplier_payments` DROP COLUMN `supplierPayableNetAmount`');
PREPARE cloud_payment_col_stmt FROM @cloud_payment_col_sql;
EXECUTE cloud_payment_col_stmt;
DEALLOCATE PREPARE cloud_payment_col_stmt;

SET @cloud_payment_col_count := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_cloud_supplier_payments' AND COLUMN_NAME = 'supplierTaxRate');
SET @cloud_payment_col_sql := IF(@cloud_payment_col_count = 0, 'SELECT 1',
  'ALTER TABLE `merge_cloud_supplier_payments` DROP COLUMN `supplierTaxRate`');
PREPARE cloud_payment_col_stmt FROM @cloud_payment_col_sql;
EXECUTE cloud_payment_col_stmt;
DEALLOCATE PREPARE cloud_payment_col_stmt;

SET @cloud_payment_col_count := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_cloud_supplier_payments' AND COLUMN_NAME = 'supplierTaxAmount');
SET @cloud_payment_col_sql := IF(@cloud_payment_col_count = 0, 'SELECT 1',
  'ALTER TABLE `merge_cloud_supplier_payments` DROP COLUMN `supplierTaxAmount`');
PREPARE cloud_payment_col_stmt FROM @cloud_payment_col_sql;
EXECUTE cloud_payment_col_stmt;
DEALLOCATE PREPARE cloud_payment_col_stmt;

SET @cloud_payment_col_count := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_cloud_supplier_payments' AND COLUMN_NAME = 'supplierPayableTotalAmount');
SET @cloud_payment_col_sql := IF(@cloud_payment_col_count = 0, 'SELECT 1',
  'ALTER TABLE `merge_cloud_supplier_payments` DROP COLUMN `supplierPayableTotalAmount`');
PREPARE cloud_payment_col_stmt FROM @cloud_payment_col_sql;
EXECUTE cloud_payment_col_stmt;
DEALLOCATE PREPARE cloud_payment_col_stmt;
