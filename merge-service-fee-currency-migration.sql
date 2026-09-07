-- 本脚本仅增加服务费对账单币种字段，不修改或删除任何现有数据。
-- 使用前请在 Navicat 中先选中目标业务数据库；脚本不会自动选择数据库。
-- 兼容不支持 ADD COLUMN IF NOT EXISTS 的 MySQL 版本，重复执行不会因字段已存在而失败。

SET @service_fee_currency_ddl = (
  SELECT CASE WHEN COUNT(*) = 0
    THEN 'ALTER TABLE `merge_power_servicefeesnapshots` ADD COLUMN `serviceFeeCurrency` VARCHAR(16) NULL COMMENT ''服务费币种'' AFTER `countryCode`'
    ELSE 'SELECT 1'
  END
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'merge_power_servicefeesnapshots'
    AND COLUMN_NAME = 'serviceFeeCurrency'
);

PREPARE service_fee_currency_statement FROM @service_fee_currency_ddl;
EXECUTE service_fee_currency_statement;
DEALLOCATE PREPARE service_fee_currency_statement;
