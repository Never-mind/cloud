-- Additive only. No historical data is imported or confirmed by this migration.
CREATE TABLE IF NOT EXISTS merge_power_internalservicejccomponents (
 id VARCHAR(64) NOT NULL PRIMARY KEY, ledgerId VARCHAR(96) NOT NULL, itemId VARCHAR(160) NOT NULL, adjustmentNo VARCHAR(128) NOT NULL,
 countryCode VARCHAR(32) NOT NULL, batchName VARCHAR(255) NOT NULL, deviceCode VARCHAR(64) NOT NULL, currency VARCHAR(16) NOT NULL,
 reportingCurrency VARCHAR(16) NULL, exchangeRate DECIMAL(18,10) NULL,
 effectiveMonth DATE NOT NULL, endMonth DATE NOT NULL, resumeMonth DATE NULL, postingMonth DATE NULL,
 ruleTotal DECIMAL(18,2) NOT NULL, ruleTotalReporting DECIMAL(18,2) NULL,
 baselineRuleTotal DECIMAL(18,2) NULL, approvedTotal DECIMAL(18,2) NULL,
 approvedTotalReporting DECIMAL(18,2) NULL, fixedAdjustment DECIMAL(18,2) NOT NULL DEFAULT 0,
 fixedAdjustmentReporting DECIMAL(18,2) NULL,
 reason TEXT NULL, version INT NOT NULL DEFAULT 0, confirmedAt DATETIME NULL, confirmedBy VARCHAR(255) NULL,
 createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uk_jc_source(ledgerId,itemId), KEY idx_jc_adjustment(adjustmentNo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS merge_power_internalservicejcmonths (
 componentId VARCHAR(64) NOT NULL, month DATE NOT NULL, amount DECIMAL(18,2) NOT NULL,
 reportingAmount DECIMAL(18,2) NULL,
 source VARCHAR(32) NOT NULL DEFAULT 'auto', registered BOOLEAN NOT NULL DEFAULT FALSE, archived BOOLEAN NOT NULL DEFAULT FALSE,
 snapshotNo VARCHAR(128) NULL, reason TEXT NULL, registeredBy VARCHAR(255) NULL,
 createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(componentId,month), KEY idx_jc_month(month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS merge_power_internalservicejcaudit (
 id VARCHAR(64) NOT NULL PRIMARY KEY, componentId VARCHAR(64) NOT NULL, action VARCHAR(32) NOT NULL,
 actor VARCHAR(255) NOT NULL, reason TEXT NOT NULL, approvedTotal DECIMAL(18,2) NULL, baselineRuleTotal DECIMAL(18,2) NULL, fixedAdjustment DECIMAL(18,2) NOT NULL,
 beforeState JSON NULL, afterState JSON NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_jc_audit(componentId,createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
