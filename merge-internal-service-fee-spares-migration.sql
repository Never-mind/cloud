ALTER TABLE `merge_power_internalserviceledgers`
  ADD COLUMN `ledgerType` VARCHAR(16) NOT NULL DEFAULT 'instance' COMMENT 'instance/spare',
  ADD COLUMN `spareProcurementCost` DECIMAL(18,2) NULL COMMENT 'spare procurement cost USD',
  ADD COLUMN `spareContractExcludingTax` DECIMAL(18,2) NULL COMMENT 'spare contract amount excluding tax USD',
  ADD COLUMN `spareFirst24MonthlyAmount` DECIMAL(18,2) NULL COMMENT 'spare monthly management fee for first 24 months USD',
  ADD COLUMN `spareNext36MonthlyAmount` DECIMAL(18,2) NULL COMMENT 'spare monthly management fee for next 36 months USD',
  ADD COLUMN `spareBusinessKey` VARCHAR(255) NULL COMMENT 'spare deduplication key',
  ADD COLUMN `notes` TEXT NULL COMMENT 'notes',
  ADD COLUMN `voidedAt` DATETIME NULL COMMENT 'void timestamp',
  ADD COLUMN `createdBy` VARCHAR(255) NULL COMMENT 'created by user email',
  ADD COLUMN `updatedBy` VARCHAR(255) NULL COMMENT 'updated by user email',
  ADD KEY `idx_InternalServiceLedgers_type` (`ledgerType`),
  ADD KEY `idx_InternalServiceLedgers_spare_key` (`spareBusinessKey`);

CREATE TABLE IF NOT EXISTS `merge_power_internalservicespareaudits` (
  `id` CHAR(36) NOT NULL,
  `ledgerId` VARCHAR(96) NOT NULL COMMENT 'spare management fee ledger id',
  `action` VARCHAR(32) NOT NULL COMMENT 'create/import/update/void',
  `actor` VARCHAR(255) NOT NULL COMMENT 'operator',
  `reason` TEXT NULL COMMENT 'change reason',
  `beforeJson` LONGTEXT NULL COMMENT 'state before change',
  `afterJson` LONGTEXT NULL COMMENT 'state after change',
  `metadataJson` LONGTEXT NULL COMMENT 'supplementary metadata',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_InternalServiceSpareAudits_ledger` (`ledgerId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='InternalServiceSpareAudits';
