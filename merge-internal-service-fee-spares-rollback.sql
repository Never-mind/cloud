DROP TABLE IF EXISTS `merge_power_internalservicespareaudits`;

ALTER TABLE `merge_power_internalserviceledgers`
  DROP INDEX `idx_InternalServiceLedgers_spare_key`,
  DROP INDEX `idx_InternalServiceLedgers_type`,
  DROP COLUMN `updatedBy`,
  DROP COLUMN `createdBy`,
  DROP COLUMN `voidedAt`,
  DROP COLUMN `notes`,
  DROP COLUMN `spareBusinessKey`,
  DROP COLUMN `spareNext36MonthlyAmount`,
  DROP COLUMN `spareFirst24MonthlyAmount`,
  DROP COLUMN `spareContractExcludingTax`,
  DROP COLUMN `spareProcurementCost`,
  DROP COLUMN `ledgerType`;
