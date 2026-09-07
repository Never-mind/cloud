-- 采购订单算力服务价格改造迁移
-- 变更：采购明细币种、采购订单合同汇率精度及历史明细币种回填。
-- 使用前请在 Navicat 中选中目标业务数据库；脚本可重复执行。

SET @purchase_item_currency_ddl = (
  SELECT CASE WHEN COUNT(*) = 0
    THEN 'ALTER TABLE `merge_power_purchaseorderitems` ADD COLUMN `currency` VARCHAR(3) NULL COMMENT ''采购币种：CNY或USD'' AFTER `requestType`'
    ELSE 'SELECT 1'
  END
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'merge_power_purchaseorderitems'
    AND COLUMN_NAME = 'currency'
);
PREPARE purchase_item_currency_statement FROM @purchase_item_currency_ddl;
EXECUTE purchase_item_currency_statement;
DEALLOCATE PREPARE purchase_item_currency_statement;

SET @purchase_power_pricing_ddl = (
  SELECT CASE WHEN COUNT(*) = 0
    THEN 'ALTER TABLE `merge_power_purchaseorderitems` ADD COLUMN `powerPricingJson` LONGTEXT NULL COMMENT ''算力服务费测算快照数据'' AFTER `opexUnitPrice`, ADD COLUMN `powerFirst24VatIncluded` DECIMAL(18,4) NULL COMMENT ''前24个月算力服务价格（含VAT）'' AFTER `powerPricingJson`, ADD COLUMN `powerNext36VatIncluded` DECIMAL(18,4) NULL COMMENT ''后36个月算力服务价格（含VAT）'' AFTER `powerFirst24VatIncluded`, ADD COLUMN `powerFirst24Manual` TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''前24个月价格是否手工调整'' AFTER `powerNext36VatIncluded`, ADD COLUMN `powerNext36Manual` TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''后36个月价格是否手工调整'' AFTER `powerFirst24Manual`'
    ELSE 'SELECT 1'
  END
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'merge_power_purchaseorderitems'
    AND COLUMN_NAME IN ('powerPricingJson', 'powerFirst24VatIncluded', 'powerNext36VatIncluded', 'powerFirst24Manual', 'powerNext36Manual')
);
PREPARE purchase_power_pricing_statement FROM @purchase_power_pricing_ddl;
EXECUTE purchase_power_pricing_statement;
DEALLOCATE PREPARE purchase_power_pricing_statement;

ALTER TABLE `merge_power_purchaseorders`
  MODIFY COLUMN `usdRate` DECIMAL(24,15) NULL COMMENT 'CNY兑USD合同汇率';

UPDATE `merge_power_purchaseorderitems` item
LEFT JOIN `merge_power_purchaseorders` purchaseOrder
  ON purchaseOrder.`purchaseOrderId` = item.`purchaseOrderId`
  OR purchaseOrder.`poNo` = item.`poNo`
SET item.`currency` = CASE
  WHEN UPPER(TRIM(COALESCE(purchaseOrder.`currency`, ''))) IN ('CNY', 'USD')
    THEN UPPER(TRIM(purchaseOrder.`currency`))
  ELSE 'USD'
END
WHERE item.`currency` IS NULL OR TRIM(item.`currency`) = '';

UPDATE `merge_power_purchaseorderitems`
SET `currency` = 'USD'
WHERE UPPER(TRIM(COALESCE(`currency`, ''))) NOT IN ('CNY', 'USD');

-- 历史版本曾把 USD 采购单的默认汇率写成 1。仅修正空值或这个已知历史默认值，
-- 不覆盖其他明确录入的汇率；明细币种优先于主单币种。
UPDATE `merge_power_purchaseorders` purchaseOrder
SET `usdRate` = 0.147664224105783
WHERE (
    UPPER(TRIM(COALESCE(purchaseOrder.`currency`, ''))) = 'USD'
    OR EXISTS (
      SELECT 1
      FROM `merge_power_purchaseorderitems` item
      WHERE (
          item.`purchaseOrderId` = purchaseOrder.`purchaseOrderId`
          OR ((item.`purchaseOrderId` IS NULL OR item.`purchaseOrderId` = '') AND item.`poNo` = purchaseOrder.`poNo`)
        )
        AND UPPER(TRIM(COALESCE(item.`currency`, ''))) = 'USD'
    )
  )
  AND (purchaseOrder.`usdRate` IS NULL OR purchaseOrder.`usdRate` = 1);

-- 如需回填缺失的算力服务费测算快照及两个服务价格，请在应用代码目录执行 `npm run migrate`。
-- 该过程会跳过已有测算快照和手工调整价格。
