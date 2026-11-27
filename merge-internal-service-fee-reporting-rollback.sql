ALTER TABLE `merge_power_internalserviceledgers`
  DROP COLUMN `reportingCurrency`,
  DROP COLUMN `exchangeRate`,
  DROP COLUMN `procurementCurrency`,
  DROP COLUMN `procurementToContractRate`,
  DROP COLUMN `internalServiceFeeReportingTotal`;

ALTER TABLE `merge_power_monthlyinternalservicefees`
  DROP COLUMN `reportingCurrency`,
  DROP COLUMN `exchangeRate`,
  DROP COLUMN `internalServiceFeeReportingAmount`;

ALTER TABLE `merge_power_internalservicefeesnapshots`
  DROP COLUMN `reportingCurrency`,
  DROP COLUMN `totalReportingAmount`;

ALTER TABLE `merge_power_internalservicefeesnapshotitems`
  DROP COLUMN `reportingCurrency`,
  DROP COLUMN `exchangeRate`,
  DROP COLUMN `internalServiceFeeReportingAmount`;

ALTER TABLE `merge_power_internalservicejccomponents`
  DROP COLUMN `reportingCurrency`,
  DROP COLUMN `exchangeRate`,
  DROP COLUMN `ruleTotalReporting`,
  DROP COLUMN `approvedTotalReporting`,
  DROP COLUMN `fixedAdjustmentReporting`;

ALTER TABLE `merge_power_internalservicejcmonths`
  DROP COLUMN `reportingAmount`;
