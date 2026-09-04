-- 算力采购订单服务费测算字段增量迁移
-- 适用对象：已有业务数据的 merge 数据库。
-- 本脚本只新增字段，不修改、不删除现有业务数据。
-- 请先在测试库或备份后执行；MySQL 8.0.29 及以上可重复执行。

ALTER TABLE `merge_power_purchaseorderitems`
  ADD COLUMN IF NOT EXISTS `powerPricingJson` LONGTEXT NULL COMMENT '算力服务费测算快照数据' AFTER `opexUnitPrice`,
  ADD COLUMN IF NOT EXISTS `powerFirst24VatIncluded` DECIMAL(18, 4) NULL COMMENT '前24个月算力服务价格（含VAT）' AFTER `powerPricingJson`,
  ADD COLUMN IF NOT EXISTS `powerNext36VatIncluded` DECIMAL(18, 4) NULL COMMENT '后36个月算力服务价格（含VAT）' AFTER `powerFirst24VatIncluded`,
  ADD COLUMN IF NOT EXISTS `powerFirst24Manual` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '前24个月价格是否手工调整' AFTER `powerNext36VatIncluded`,
  ADD COLUMN IF NOT EXISTS `powerNext36Manual` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '后36个月价格是否手工调整' AFTER `powerFirst24Manual`;
