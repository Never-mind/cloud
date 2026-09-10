-- 华为云供应商付款：新增应付金额快照字段。
-- 背景：前端“供应商付款”列表中的币种、应付未税金额、应付税率、应付汇率、应付税金、应付含税金额
-- 是按账期 + 供应商汇总计算的，数据库中原本没有对应列，外部系统无法直接取值。
-- 其中“应付汇率”经确认是废弃字段（页面从不填写、聚合结果恒为空），不再落库。
-- 本脚本只增加字段，不修改、删除或迁移任何数据；字段值由应用在账期数据变化时写入。
-- 使用前请在 Navicat 中先选中目标业务数据库；脚本不会自动选择数据库。
-- 通过 information_schema + PREPARE 判断字段是否存在，重复执行不会失败（MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS）。

SET @cloud_payment_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_cloud_supplier_payments' AND COLUMN_NAME = 'supplierPayableCurrency');
SET @cloud_payment_col_sql := IF(@cloud_payment_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_cloud_supplier_payments` ADD COLUMN `supplierPayableCurrency` VARCHAR(10) NULL COMMENT ''应付币种'' AFTER `supplierName`');
PREPARE cloud_payment_col_stmt FROM @cloud_payment_col_sql;
EXECUTE cloud_payment_col_stmt;
DEALLOCATE PREPARE cloud_payment_col_stmt;

SET @cloud_payment_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_cloud_supplier_payments' AND COLUMN_NAME = 'supplierPayableNetAmount');
SET @cloud_payment_col_sql := IF(@cloud_payment_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_cloud_supplier_payments` ADD COLUMN `supplierPayableNetAmount` DECIMAL(18,4) NULL COMMENT ''应付未税金额'' AFTER `supplierPayableCurrency`');
PREPARE cloud_payment_col_stmt FROM @cloud_payment_col_sql;
EXECUTE cloud_payment_col_stmt;
DEALLOCATE PREPARE cloud_payment_col_stmt;

SET @cloud_payment_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_cloud_supplier_payments' AND COLUMN_NAME = 'supplierTaxRate');
SET @cloud_payment_col_sql := IF(@cloud_payment_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_cloud_supplier_payments` ADD COLUMN `supplierTaxRate` DECIMAL(10,6) NULL COMMENT ''应付税率'' AFTER `supplierPayableNetAmount`');
PREPARE cloud_payment_col_stmt FROM @cloud_payment_col_sql;
EXECUTE cloud_payment_col_stmt;
DEALLOCATE PREPARE cloud_payment_col_stmt;

SET @cloud_payment_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_cloud_supplier_payments' AND COLUMN_NAME = 'supplierTaxAmount');
SET @cloud_payment_col_sql := IF(@cloud_payment_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_cloud_supplier_payments` ADD COLUMN `supplierTaxAmount` DECIMAL(18,4) NULL COMMENT ''应付税金'' AFTER `supplierTaxRate`');
PREPARE cloud_payment_col_stmt FROM @cloud_payment_col_sql;
EXECUTE cloud_payment_col_stmt;
DEALLOCATE PREPARE cloud_payment_col_stmt;

SET @cloud_payment_col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merge_cloud_supplier_payments' AND COLUMN_NAME = 'supplierPayableTotalAmount');
SET @cloud_payment_col_sql := IF(@cloud_payment_col_exists > 0, 'SELECT 1',
  'ALTER TABLE `merge_cloud_supplier_payments` ADD COLUMN `supplierPayableTotalAmount` DECIMAL(18,4) NULL COMMENT ''应付含税金额'' AFTER `supplierTaxAmount`');
PREPARE cloud_payment_col_stmt FROM @cloud_payment_col_sql;
EXECUTE cloud_payment_col_stmt;
DEALLOCATE PREPARE cloud_payment_col_stmt;

-- 回填说明：
-- 结构变更完成后执行 `npm run sync:cloud-supplier-payments` 重算全部账期的应付汇总，
-- 历史账期的应付字段会被补齐，之后由应用在账期数据变化时自动维护。
