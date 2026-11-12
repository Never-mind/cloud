export const prospectSchema = [
`CREATE TABLE IF NOT EXISTS merge_common_prospects (
 internalId INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 id VARCHAR(64) NOT NULL, name VARCHAR(255) NOT NULL, nameEn VARCHAR(255) NULL, shortName VARCHAR(255) NULL,
 country VARCHAR(100) NULL, city VARCHAR(100) NULL, address TEXT NULL, taxNumber VARCHAR(100) NULL,
 contactName VARCHAR(255) NULL, contactPhone VARCHAR(100) NULL, contactEmail VARCHAR(255) NULL,
 source VARCHAR(255) NULL, ownerName VARCHAR(255) NULL, status VARCHAR(32) NOT NULL DEFAULT 'new',
 lastFollowUpDate DATE NULL, nextFollowUpDate DATE NULL, remark TEXT NULL,
 customerId VARCHAR(64) NULL, convertedAt DATETIME NULL, convertedByName VARCHAR(255) NULL,
 version INT NOT NULL DEFAULT 1, createdByUserId VARCHAR(64) NULL, createdByName VARCHAR(255) NULL,
 updatedByUserId VARCHAR(64) NULL, updatedByName VARCHAR(255) NULL,
 createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uk_prospect_id (id), KEY idx_prospect_status (status,updatedAt), KEY idx_prospect_customer (customerId), KEY idx_prospect_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='潜在客户'`,
`CREATE TABLE IF NOT EXISTS merge_common_prospect_followups (
 internalId INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, id VARCHAR(64) NOT NULL,
 prospectId VARCHAR(64) NOT NULL, followedOn DATE NOT NULL, content TEXT NOT NULL,
 nextFollowUpDate DATE NULL, status VARCHAR(32) NOT NULL, createdByName VARCHAR(255) NULL,
 createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uk_prospect_followup (id), KEY idx_prospect_followups (prospectId,followedOn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='潜在客户跟进记录'`,
`CREATE TABLE IF NOT EXISTS merge_common_prospect_conversion_lock (
 id VARCHAR(32) NOT NULL PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`INSERT IGNORE INTO merge_common_prospect_conversion_lock (id) VALUES ('customers')`,
];
