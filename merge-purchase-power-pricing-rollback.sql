-- 采购订单算力服务价格改造回滚
-- 注意：回滚会删除采购明细币种和算力服务费测算字段，字段中的历史数据无法恢复。

ALTER TABLE `merge_power_purchaseorders`
  MODIFY COLUMN `usdRate` DECIMAL(18,8) NULL COMMENT 'USD比率';

SET @purchase_item_currency_drop = (
  SELECT CASE WHEN COUNT(*) > 0
    THEN 'ALTER TABLE `merge_power_purchaseorderitems` DROP COLUMN `currency`'
    ELSE 'SELECT 1'
  END
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'merge_power_purchaseorderitems'
    AND COLUMN_NAME = 'currency'
);
PREPARE purchase_item_currency_drop_statement FROM @purchase_item_currency_drop;
EXECUTE purchase_item_currency_drop_statement;
DEALLOCATE PREPARE purchase_item_currency_drop_statement;

SET @purchase_power_pricing_drop = (
  SELECT CASE WHEN COUNT(*) = 5
    THEN 'ALTER TABLE `merge_power_purchaseorderitems` DROP COLUMN `powerPricingJson`, DROP COLUMN `powerFirst24VatIncluded`, DROP COLUMN `powerNext36VatIncluded`, DROP COLUMN `powerFirst24Manual`, DROP COLUMN `powerNext36Manual`'
    ELSE 'SELECT 1'
  END
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'merge_power_purchaseorderitems'
    AND COLUMN_NAME IN ('powerPricingJson', 'powerFirst24VatIncluded', 'powerNext36VatIncluded', 'powerFirst24Manual', 'powerNext36Manual')
);
PREPARE purchase_power_pricing_drop_statement FROM @purchase_power_pricing_drop;
EXECUTE purchase_power_pricing_drop_statement;
DEALLOCATE PREPARE purchase_power_pricing_drop_statement;
