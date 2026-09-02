-- 本脚本只增加本轮业务字段，不修改、删除或迁移任何数据。
-- 使用前请在 Navicat 中先选中目标业务数据库；脚本不会自动选择数据库。
-- 适用于 MySQL 8.0.29+，重复执行不会因字段已存在而失败。

ALTER TABLE `merge_power_servicefeesnapshots`
  ADD COLUMN IF NOT EXISTS `receivableDate` DATE NULL COMMENT '应收日期' AFTER `invoiceAmountIncludingTax`;

ALTER TABLE `merge_po_settlement_invoices`
  ADD COLUMN IF NOT EXISTS `companyEntityId` VARCHAR(64) NULL COMMENT '承接单位ID' AFTER `companyEntity`,
  ADD COLUMN IF NOT EXISTS `invoiceEntityId` VARCHAR(64) NULL COMMENT '供应商或客户ID' AFTER `invoiceEntity`,
  ADD COLUMN IF NOT EXISTS `invoiceEntityType` VARCHAR(20) NULL COMMENT '发票主体类型' AFTER `invoiceEntityId`,
  ADD COLUMN IF NOT EXISTS `receivableDate` DATE NULL COMMENT '应收日期' AFTER `invoiceDate`;

ALTER TABLE `merge_cloud_rows`
  ADD COLUMN IF NOT EXISTS `receivableDate` DATE NULL COMMENT '应收日期' AFTER `collectionDate`;

ALTER TABLE `merge_cloud_supplier_payments`
  ADD COLUMN IF NOT EXISTS `receivableDate` DATE NULL COMMENT '应收日期' AFTER `paymentDate`;
