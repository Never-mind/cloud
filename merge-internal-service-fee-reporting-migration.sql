-- Management fee reporting currency and normalized procurement currency.
-- Run after the existing management-fee tables are present.
ALTER TABLE `merge_power_internalserviceledgers`
  ADD COLUMN `reportingCurrency` VARCHAR(16) NULL COMMENT 'reporting currency',
  ADD COLUMN `exchangeRate` DECIMAL(18,10) NULL COMMENT 'source currency units per reporting currency',
  ADD COLUMN `procurementCurrency` VARCHAR(16) NULL COMMENT 'procurement item currency',
  ADD COLUMN `procurementToContractRate` DECIMAL(18,10) NULL COMMENT 'contract currency units per procurement currency',
  ADD COLUMN `internalServiceFeeReportingTotal` DECIMAL(18,2) NULL COMMENT 'management fee total in reporting currency';

ALTER TABLE `merge_power_monthlyinternalservicefees`
  ADD COLUMN `reportingCurrency` VARCHAR(16) NULL COMMENT 'reporting currency',
  ADD COLUMN `exchangeRate` DECIMAL(18,10) NULL COMMENT 'source currency units per reporting currency',
  ADD COLUMN `internalServiceFeeReportingAmount` DECIMAL(18,2) NULL COMMENT 'management fee in reporting currency';

ALTER TABLE `merge_power_internalservicefeesnapshots`
  ADD COLUMN `reportingCurrency` VARCHAR(16) NULL COMMENT 'reporting currency summary',
  ADD COLUMN `totalReportingAmount` DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT 'management fee total in reporting currency';

ALTER TABLE `merge_power_internalservicefeesnapshotitems`
  ADD COLUMN `reportingCurrency` VARCHAR(16) NULL COMMENT 'reporting currency',
  ADD COLUMN `exchangeRate` DECIMAL(18,10) NULL COMMENT 'source currency units per reporting currency',
  ADD COLUMN `internalServiceFeeReportingAmount` DECIMAL(18,2) NULL COMMENT 'management fee in reporting currency';

ALTER TABLE `merge_power_internalservicejccomponents`
  ADD COLUMN `reportingCurrency` VARCHAR(16) NULL COMMENT 'reporting currency',
  ADD COLUMN `exchangeRate` DECIMAL(18,10) NULL COMMENT 'source currency units per reporting currency',
  ADD COLUMN `ruleTotalReporting` DECIMAL(18,2) NULL COMMENT 'rule total in reporting currency',
  ADD COLUMN `approvedTotalReporting` DECIMAL(18,2) NULL COMMENT 'approved total in reporting currency',
  ADD COLUMN `fixedAdjustmentReporting` DECIMAL(18,2) NULL COMMENT 'fixed adjustment in reporting currency';

ALTER TABLE `merge_power_internalservicejcmonths`
  ADD COLUMN `reportingAmount` DECIMAL(18,2) NULL COMMENT 'JC amount in reporting currency';
