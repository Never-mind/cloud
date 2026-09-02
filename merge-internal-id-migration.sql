-- MySQL 8 migration for merge_* tables
-- Generated from the connected database metadata.
-- Review the table list, take a full data backup, and execute during a maintenance window.
-- This script preserves UUIDs/business numbers and does not delete or rewrite business data.

-- merge_cloud_attachments: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_cloud_attachments` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_cloud_attachments`;
UPDATE `merge_cloud_attachments` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_cloud_attachments` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_cloud_attachments` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_cloud_attachments` ADD UNIQUE KEY `uk_internal_legacy_merge_cloud_attachments` (`id`);
ALTER TABLE `merge_cloud_attachments` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_cloud_import_batches: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_cloud_import_batches` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_cloud_import_batches`;
UPDATE `merge_cloud_import_batches` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_cloud_import_batches` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_cloud_import_batches` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_cloud_import_batches` ADD UNIQUE KEY `uk_internal_legacy_merge_cloud_import_batches` (`id`);
ALTER TABLE `merge_cloud_import_batches` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_cloud_mapping_accounts: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_cloud_mapping_accounts` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_cloud_mapping_accounts`;
UPDATE `merge_cloud_mapping_accounts` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_cloud_mapping_accounts` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_cloud_mapping_accounts` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_cloud_mapping_accounts` ADD UNIQUE KEY `uk_internal_legacy_merge_cloud_mapping_accounts` (`id`);
ALTER TABLE `merge_cloud_mapping_accounts` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_cloud_mappings: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_cloud_mappings` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_cloud_mappings`;
UPDATE `merge_cloud_mappings` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_cloud_mappings` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_cloud_mappings` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_cloud_mappings` ADD UNIQUE KEY `uk_internal_legacy_merge_cloud_mappings` (`id`);
ALTER TABLE `merge_cloud_mappings` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_cloud_rows: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_cloud_rows` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_cloud_rows`;
UPDATE `merge_cloud_rows` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_cloud_rows` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_cloud_rows` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_cloud_rows` ADD UNIQUE KEY `uk_internal_legacy_merge_cloud_rows` (`id`);
ALTER TABLE `merge_cloud_rows` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_cloud_supplier_payments: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_cloud_supplier_payments` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_cloud_supplier_payments`;
UPDATE `merge_cloud_supplier_payments` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_cloud_supplier_payments` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_cloud_supplier_payments` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_cloud_supplier_payments` ADD UNIQUE KEY `uk_internal_legacy_merge_cloud_supplier_payments` (`id`);
ALTER TABLE `merge_cloud_supplier_payments` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_common_attachments: attachmentId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_common_attachments` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_common_attachments`;
UPDATE `merge_common_attachments` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `attachmentId`;
ALTER TABLE `merge_common_attachments` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_common_attachments` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_common_attachments` ADD UNIQUE KEY `uk_internal_legacy_merge_common_attachments` (`attachmentId`);
ALTER TABLE `merge_common_attachments` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_common_customer_bank_accounts: accountId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_common_customer_bank_accounts` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_common_customer_bank_accounts`;
UPDATE `merge_common_customer_bank_accounts` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `accountId`;
ALTER TABLE `merge_common_customer_bank_accounts` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_common_customer_bank_accounts` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_common_customer_bank_accounts` ADD UNIQUE KEY `uk_internal_legacy_merge_common_customer_bank_accounts` (`accountId`);
ALTER TABLE `merge_common_customer_bank_accounts` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_common_customer_contacts: contactId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_common_customer_contacts` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_common_customer_contacts`;
UPDATE `merge_common_customer_contacts` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `contactId`;
ALTER TABLE `merge_common_customer_contacts` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_common_customer_contacts` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_common_customer_contacts` ADD UNIQUE KEY `uk_internal_legacy_merge_common_customer_contacts` (`contactId`);
ALTER TABLE `merge_common_customer_contacts` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_common_customers: customerId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_common_customers` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_common_customers`;
UPDATE `merge_common_customers` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `customerId`;
ALTER TABLE `merge_common_customers` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_common_customers` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_common_customers` ADD UNIQUE KEY `uk_internal_legacy_merge_common_customers` (`customerId`);
ALTER TABLE `merge_common_customers` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_common_document_files: fileId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_common_document_files` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_common_document_files`;
UPDATE `merge_common_document_files` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `fileId`;
ALTER TABLE `merge_common_document_files` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_common_document_files` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_common_document_files` ADD UNIQUE KEY `uk_internal_legacy_merge_common_document_files` (`fileId`);
ALTER TABLE `merge_common_document_files` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_common_document_folders: folderId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_common_document_folders` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_common_document_folders`;
UPDATE `merge_common_document_folders` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `folderId`;
ALTER TABLE `merge_common_document_folders` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_common_document_folders` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_common_document_folders` ADD UNIQUE KEY `uk_internal_legacy_merge_common_document_folders` (`folderId`);
ALTER TABLE `merge_common_document_folders` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_common_modules: moduleKey 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_common_modules` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_common_modules`;
UPDATE `merge_common_modules` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `moduleKey`;
ALTER TABLE `merge_common_modules` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_common_modules` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_common_modules` ADD UNIQUE KEY `uk_internal_legacy_merge_common_modules` (`moduleKey`);
ALTER TABLE `merge_common_modules` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_common_operation_logs: logId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_common_operation_logs` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_common_operation_logs`;
UPDATE `merge_common_operation_logs` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `logId`;
ALTER TABLE `merge_common_operation_logs` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_common_operation_logs` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_common_operation_logs` ADD UNIQUE KEY `uk_internal_legacy_merge_common_operation_logs` (`logId`);
ALTER TABLE `merge_common_operation_logs` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_common_supplier_bank_accounts: accountId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_common_supplier_bank_accounts` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_common_supplier_bank_accounts`;
UPDATE `merge_common_supplier_bank_accounts` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `accountId`;
ALTER TABLE `merge_common_supplier_bank_accounts` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_common_supplier_bank_accounts` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_common_supplier_bank_accounts` ADD UNIQUE KEY `uk_internal_legacy_merge_common_supplier_bank_accounts` (`accountId`);
ALTER TABLE `merge_common_supplier_bank_accounts` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_common_supplier_contacts: contactId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_common_supplier_contacts` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_common_supplier_contacts`;
UPDATE `merge_common_supplier_contacts` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `contactId`;
ALTER TABLE `merge_common_supplier_contacts` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_common_supplier_contacts` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_common_supplier_contacts` ADD UNIQUE KEY `uk_internal_legacy_merge_common_supplier_contacts` (`contactId`);
ALTER TABLE `merge_common_supplier_contacts` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_common_suppliers: supplierId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_common_suppliers` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_common_suppliers`;
UPDATE `merge_common_suppliers` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `supplierId`;
ALTER TABLE `merge_common_suppliers` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_common_suppliers` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_common_suppliers` ADD UNIQUE KEY `uk_internal_legacy_merge_common_suppliers` (`supplierId`);
ALTER TABLE `merge_common_suppliers` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_common_undertaking_unit_bank_accounts: accountId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_common_undertaking_unit_bank_accounts` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_common_undertaking_unit_bank_accounts`;
UPDATE `merge_common_undertaking_unit_bank_accounts` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `accountId`;
ALTER TABLE `merge_common_undertaking_unit_bank_accounts` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_common_undertaking_unit_bank_accounts` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_common_undertaking_unit_bank_accounts` ADD UNIQUE KEY `uk_internal_legacy_merge_common_undertaking_unit_bank_accounts` (`accountId`);
ALTER TABLE `merge_common_undertaking_unit_bank_accounts` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_common_undertaking_unit_contacts: contactId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_common_undertaking_unit_contacts` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_common_undertaking_unit_contacts`;
UPDATE `merge_common_undertaking_unit_contacts` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `contactId`;
ALTER TABLE `merge_common_undertaking_unit_contacts` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_common_undertaking_unit_contacts` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_common_undertaking_unit_contacts` ADD UNIQUE KEY `uk_internal_legacy_merge_common_undertaking_unit_contacts` (`contactId`);
ALTER TABLE `merge_common_undertaking_unit_contacts` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_common_undertaking_units: undertakingUnitId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_common_undertaking_units` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_common_undertaking_units`;
UPDATE `merge_common_undertaking_units` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `undertakingUnitId`;
ALTER TABLE `merge_common_undertaking_units` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_common_undertaking_units` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_common_undertaking_units` ADD UNIQUE KEY `uk_internal_legacy_merge_common_undertaking_units` (`undertakingUnitId`);
ALTER TABLE `merge_common_undertaking_units` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_common_user_permissions: userId, moduleKey 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_common_user_permissions` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_common_user_permissions`;
UPDATE `merge_common_user_permissions` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `userId`, `moduleKey`;
ALTER TABLE `merge_common_user_permissions` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_common_user_permissions` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_common_user_permissions` ADD UNIQUE KEY `uk_internal_legacy_merge_common_user_permissions` (`userId`, `moduleKey`);
ALTER TABLE `merge_common_user_permissions` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_common_user_preferences: userId, preferenceKey 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_common_user_preferences` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_common_user_preferences`;
UPDATE `merge_common_user_preferences` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `userId`, `preferenceKey`;
ALTER TABLE `merge_common_user_preferences` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_common_user_preferences` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_common_user_preferences` ADD UNIQUE KEY `uk_internal_legacy_merge_common_user_preferences` (`userId`, `preferenceKey`);
ALTER TABLE `merge_common_user_preferences` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_common_users: userId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_common_users` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_common_users`;
UPDATE `merge_common_users` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `userId`;
ALTER TABLE `merge_common_users` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_common_users` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_common_users` ADD UNIQUE KEY `uk_internal_legacy_merge_common_users` (`userId`);
ALTER TABLE `merge_common_users` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_po_customer_po_items: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_po_customer_po_items` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_po_customer_po_items`;
UPDATE `merge_po_customer_po_items` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_po_customer_po_items` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_po_customer_po_items` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_po_customer_po_items` ADD UNIQUE KEY `uk_internal_legacy_merge_po_customer_po_items` (`id`);
ALTER TABLE `merge_po_customer_po_items` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_po_customer_pos: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_po_customer_pos` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_po_customer_pos`;
UPDATE `merge_po_customer_pos` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_po_customer_pos` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_po_customer_pos` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_po_customer_pos` ADD UNIQUE KEY `uk_internal_legacy_merge_po_customer_pos` (`id`);
ALTER TABLE `merge_po_customer_pos` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_po_customer_product_aliases: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_po_customer_product_aliases` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_po_customer_product_aliases`;
UPDATE `merge_po_customer_product_aliases` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_po_customer_product_aliases` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_po_customer_product_aliases` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_po_customer_product_aliases` ADD UNIQUE KEY `uk_internal_legacy_merge_po_customer_product_aliases` (`id`);
ALTER TABLE `merge_po_customer_product_aliases` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_po_history_quotations: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_po_history_quotations` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_po_history_quotations`;
UPDATE `merge_po_history_quotations` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_po_history_quotations` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_po_history_quotations` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_po_history_quotations` ADD UNIQUE KEY `uk_internal_legacy_merge_po_history_quotations` (`id`);
ALTER TABLE `merge_po_history_quotations` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_po_product_masters: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_po_product_masters` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_po_product_masters`;
UPDATE `merge_po_product_masters` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_po_product_masters` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_po_product_masters` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_po_product_masters` ADD UNIQUE KEY `uk_internal_legacy_merge_po_product_masters` (`id`);
ALTER TABLE `merge_po_product_masters` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_po_quotation_items: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_po_quotation_items` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_po_quotation_items`;
UPDATE `merge_po_quotation_items` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_po_quotation_items` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_po_quotation_items` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_po_quotation_items` ADD UNIQUE KEY `uk_internal_legacy_merge_po_quotation_items` (`id`);
ALTER TABLE `merge_po_quotation_items` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_po_quotations: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_po_quotations` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_po_quotations`;
UPDATE `merge_po_quotations` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_po_quotations` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_po_quotations` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_po_quotations` ADD UNIQUE KEY `uk_internal_legacy_merge_po_quotations` (`id`);
ALTER TABLE `merge_po_quotations` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_po_settlement_attachments: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_po_settlement_attachments` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_po_settlement_attachments`;
UPDATE `merge_po_settlement_attachments` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_po_settlement_attachments` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_po_settlement_attachments` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_po_settlement_attachments` ADD UNIQUE KEY `uk_internal_legacy_merge_po_settlement_attachments` (`id`);
ALTER TABLE `merge_po_settlement_attachments` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_po_settlement_expenses: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_po_settlement_expenses` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_po_settlement_expenses`;
UPDATE `merge_po_settlement_expenses` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_po_settlement_expenses` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_po_settlement_expenses` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_po_settlement_expenses` ADD UNIQUE KEY `uk_internal_legacy_merge_po_settlement_expenses` (`id`);
ALTER TABLE `merge_po_settlement_expenses` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_po_settlement_invoices: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_po_settlement_invoices` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_po_settlement_invoices`;
UPDATE `merge_po_settlement_invoices` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_po_settlement_invoices` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_po_settlement_invoices` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_po_settlement_invoices` ADD UNIQUE KEY `uk_internal_legacy_merge_po_settlement_invoices` (`id`);
ALTER TABLE `merge_po_settlement_invoices` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_po_settlement_items: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_po_settlement_items` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_po_settlement_items`;
UPDATE `merge_po_settlement_items` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_po_settlement_items` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_po_settlement_items` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_po_settlement_items` ADD UNIQUE KEY `uk_internal_legacy_merge_po_settlement_items` (`id`);
ALTER TABLE `merge_po_settlement_items` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_po_settlement_projects: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_po_settlement_projects` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_po_settlement_projects`;
UPDATE `merge_po_settlement_projects` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_po_settlement_projects` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_po_settlement_projects` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_po_settlement_projects` ADD UNIQUE KEY `uk_internal_legacy_merge_po_settlement_projects` (`id`);
ALTER TABLE `merge_po_settlement_projects` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_po_settlement_sales: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_po_settlement_sales` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_po_settlement_sales`;
UPDATE `merge_po_settlement_sales` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_po_settlement_sales` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_po_settlement_sales` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_po_settlement_sales` ADD UNIQUE KEY `uk_internal_legacy_merge_po_settlement_sales` (`id`);
ALTER TABLE `merge_po_settlement_sales` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_po_tariff_rates: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_po_tariff_rates` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_po_tariff_rates`;
UPDATE `merge_po_tariff_rates` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_po_tariff_rates` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_po_tariff_rates` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_po_tariff_rates` ADD UNIQUE KEY `uk_internal_legacy_merge_po_tariff_rates` (`id`);
ALTER TABLE `merge_po_tariff_rates` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_appusers: userId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_appusers` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_appusers`;
UPDATE `merge_power_appusers` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `userId`;
ALTER TABLE `merge_power_appusers` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_appusers` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_appusers` ADD UNIQUE KEY `uk_internal_legacy_merge_power_appusers` (`userId`);
ALTER TABLE `merge_power_appusers` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_b6typeconfigs: b6Type 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_b6typeconfigs` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_b6typeconfigs`;
UPDATE `merge_power_b6typeconfigs` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `b6Type`;
ALTER TABLE `merge_power_b6typeconfigs` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_b6typeconfigs` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_b6typeconfigs` ADD UNIQUE KEY `uk_internal_legacy_merge_power_b6typeconfigs` (`b6Type`);
ALTER TABLE `merge_power_b6typeconfigs` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_balancesettlementfinals: finalSettlementNo 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_balancesettlementfinals` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_balancesettlementfinals`;
UPDATE `merge_power_balancesettlementfinals` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `finalSettlementNo`;
ALTER TABLE `merge_power_balancesettlementfinals` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_balancesettlementfinals` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_balancesettlementfinals` ADD UNIQUE KEY `uk_internal_legacy_merge_power_balancesettlementfinals` (`finalSettlementNo`);
ALTER TABLE `merge_power_balancesettlementfinals` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_balancesettlementfinalsources: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_balancesettlementfinalsources` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_balancesettlementfinalsources`;
UPDATE `merge_power_balancesettlementfinalsources` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_power_balancesettlementfinalsources` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_balancesettlementfinalsources` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_balancesettlementfinalsources` ADD UNIQUE KEY `uk_internal_legacy_merge_power_balancesettlementfinalsources` (`id`);
ALTER TABLE `merge_power_balancesettlementfinalsources` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_balancesettlementitems: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_balancesettlementitems` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_balancesettlementitems`;
UPDATE `merge_power_balancesettlementitems` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_power_balancesettlementitems` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_balancesettlementitems` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_balancesettlementitems` ADD UNIQUE KEY `uk_internal_legacy_merge_power_balancesettlementitems` (`id`);
ALTER TABLE `merge_power_balancesettlementitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_balancesettlements: settlementNo 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_balancesettlements` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_balancesettlements`;
UPDATE `merge_power_balancesettlements` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `settlementNo`;
ALTER TABLE `merge_power_balancesettlements` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_balancesettlements` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_balancesettlements` ADD UNIQUE KEY `uk_internal_legacy_merge_power_balancesettlements` (`settlementNo`);
ALTER TABLE `merge_power_balancesettlements` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_billingadjustmentitems: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_billingadjustmentitems` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_billingadjustmentitems`;
UPDATE `merge_power_billingadjustmentitems` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_power_billingadjustmentitems` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_billingadjustmentitems` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_billingadjustmentitems` ADD UNIQUE KEY `uk_internal_legacy_merge_power_billingadjustmentitems` (`id`);
ALTER TABLE `merge_power_billingadjustmentitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_billingadjustments: adjustmentNo 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_billingadjustments` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_billingadjustments`;
UPDATE `merge_power_billingadjustments` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `adjustmentNo`;
ALTER TABLE `merge_power_billingadjustments` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_billingadjustments` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_billingadjustments` ADD UNIQUE KEY `uk_internal_legacy_merge_power_billingadjustments` (`adjustmentNo`);
ALTER TABLE `merge_power_billingadjustments` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_billinginstanceledgers: ledgerId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_billinginstanceledgers` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_billinginstanceledgers`;
UPDATE `merge_power_billinginstanceledgers` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `ledgerId`;
ALTER TABLE `merge_power_billinginstanceledgers` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_billinginstanceledgers` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_billinginstanceledgers` ADD UNIQUE KEY `uk_internal_legacy_merge_power_billinginstanceledgers` (`ledgerId`);
ALTER TABLE `merge_power_billinginstanceledgers` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_billingstatementsnapshotitems: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_billingstatementsnapshotitems` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_billingstatementsnapshotitems`;
UPDATE `merge_power_billingstatementsnapshotitems` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_power_billingstatementsnapshotitems` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_billingstatementsnapshotitems` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_billingstatementsnapshotitems` ADD UNIQUE KEY `uk_internal_legacy_merge_power_billingstatementsnapshotitems` (`id`);
ALTER TABLE `merge_power_billingstatementsnapshotitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_billingstatementsnapshots: snapshotNo 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_billingstatementsnapshots` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_billingstatementsnapshots`;
UPDATE `merge_power_billingstatementsnapshots` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `snapshotNo`;
ALTER TABLE `merge_power_billingstatementsnapshots` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_billingstatementsnapshots` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_billingstatementsnapshots` ADD UNIQUE KEY `uk_internal_legacy_merge_power_billingstatementsnapshots` (`snapshotNo`);
ALTER TABLE `merge_power_billingstatementsnapshots` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_capexpricingitems: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_capexpricingitems` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_capexpricingitems`;
UPDATE `merge_power_capexpricingitems` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_power_capexpricingitems` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_capexpricingitems` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_capexpricingitems` ADD UNIQUE KEY `uk_internal_legacy_merge_power_capexpricingitems` (`id`);
ALTER TABLE `merge_power_capexpricingitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_capexpricingversions: versionId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_capexpricingversions` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_capexpricingversions`;
UPDATE `merge_power_capexpricingversions` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `versionId`;
ALTER TABLE `merge_power_capexpricingversions` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_capexpricingversions` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_capexpricingversions` ADD UNIQUE KEY `uk_internal_legacy_merge_power_capexpricingversions` (`versionId`);
ALTER TABLE `merge_power_capexpricingversions` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_contractitems: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_contractitems` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_contractitems`;
UPDATE `merge_power_contractitems` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_power_contractitems` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_contractitems` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_contractitems` ADD UNIQUE KEY `uk_internal_legacy_merge_power_contractitems` (`id`);
ALTER TABLE `merge_power_contractitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_countries: code 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_countries` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_countries`;
UPDATE `merge_power_countries` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `code`;
ALTER TABLE `merge_power_countries` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_countries` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_countries` ADD UNIQUE KEY `uk_internal_legacy_merge_power_countries` (`code`);
ALTER TABLE `merge_power_countries` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_customers: customerId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_customers` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_customers`;
UPDATE `merge_power_customers` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `customerId`;
ALTER TABLE `merge_power_customers` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_customers` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_customers` ADD UNIQUE KEY `uk_internal_legacy_merge_power_customers` (`customerId`);
ALTER TABLE `merge_power_customers` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_datacenters: dcCode 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_datacenters` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_datacenters`;
UPDATE `merge_power_datacenters` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `dcCode`;
ALTER TABLE `merge_power_datacenters` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_datacenters` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_datacenters` ADD UNIQUE KEY `uk_internal_legacy_merge_power_datacenters` (`dcCode`);
ALTER TABLE `merge_power_datacenters` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_deliverycontacts: contactId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_deliverycontacts` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_deliverycontacts`;
UPDATE `merge_power_deliverycontacts` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `contactId`;
ALTER TABLE `merge_power_deliverycontacts` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_deliverycontacts` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_deliverycontacts` ADD UNIQUE KEY `uk_internal_legacy_merge_power_deliverycontacts` (`contactId`);
ALTER TABLE `merge_power_deliverycontacts` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_deliverylocations: locationId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_deliverylocations` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_deliverylocations`;
UPDATE `merge_power_deliverylocations` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `locationId`;
ALTER TABLE `merge_power_deliverylocations` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_deliverylocations` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_deliverylocations` ADD UNIQUE KEY `uk_internal_legacy_merge_power_deliverylocations` (`locationId`);
ALTER TABLE `merge_power_deliverylocations` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_documentfiles: fileId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_documentfiles` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_documentfiles`;
UPDATE `merge_power_documentfiles` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `fileId`;
ALTER TABLE `merge_power_documentfiles` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_documentfiles` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_documentfiles` ADD UNIQUE KEY `uk_internal_legacy_merge_power_documentfiles` (`fileId`);
ALTER TABLE `merge_power_documentfiles` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_documentfolders: folderId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_documentfolders` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_documentfolders`;
UPDATE `merge_power_documentfolders` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `folderId`;
ALTER TABLE `merge_power_documentfolders` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_documentfolders` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_documentfolders` ADD UNIQUE KEY `uk_internal_legacy_merge_power_documentfolders` (`folderId`);
ALTER TABLE `merge_power_documentfolders` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_importjobs: jobId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_importjobs` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_importjobs`;
UPDATE `merge_power_importjobs` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `jobId`;
ALTER TABLE `merge_power_importjobs` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_importjobs` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_importjobs` ADD UNIQUE KEY `uk_internal_legacy_merge_power_importjobs` (`jobId`);
ALTER TABLE `merge_power_importjobs` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_instancecontracts: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_instancecontracts` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_instancecontracts`;
UPDATE `merge_power_instancecontracts` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_power_instancecontracts` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_instancecontracts` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_instancecontracts` ADD UNIQUE KEY `uk_internal_legacy_merge_power_instancecontracts` (`id`);
ALTER TABLE `merge_power_instancecontracts` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_instancemodels: deviceCode 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_instancemodels` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_instancemodels`;
UPDATE `merge_power_instancemodels` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `deviceCode`;
ALTER TABLE `merge_power_instancemodels` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_instancemodels` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_instancemodels` ADD UNIQUE KEY `uk_internal_legacy_merge_power_instancemodels` (`deviceCode`);
ALTER TABLE `merge_power_instancemodels` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_internalservicefeeadjustments: adjustmentNo 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_internalservicefeeadjustments` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_internalservicefeeadjustments`;
UPDATE `merge_power_internalservicefeeadjustments` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `adjustmentNo`;
ALTER TABLE `merge_power_internalservicefeeadjustments` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_internalservicefeeadjustments` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_internalservicefeeadjustments` ADD UNIQUE KEY `uk_internal_legacy_merge_power_internalservicefeeadjustments` (`adjustmentNo`);
ALTER TABLE `merge_power_internalservicefeeadjustments` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_internalservicefeesnapshotitems: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_internalservicefeesnapshotitems` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_internalservicefeesnapshotitems`;
UPDATE `merge_power_internalservicefeesnapshotitems` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_power_internalservicefeesnapshotitems` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_internalservicefeesnapshotitems` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_internalservicefeesnapshotitems` ADD UNIQUE KEY `uk_internal_legacy_merge_power_internalservicefeesnapshotitems` (`id`);
ALTER TABLE `merge_power_internalservicefeesnapshotitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_internalservicefeesnapshots: snapshotNo 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_internalservicefeesnapshots` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_internalservicefeesnapshots`;
UPDATE `merge_power_internalservicefeesnapshots` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `snapshotNo`;
ALTER TABLE `merge_power_internalservicefeesnapshots` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_internalservicefeesnapshots` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_internalservicefeesnapshots` ADD UNIQUE KEY `uk_internal_legacy_merge_power_internalservicefeesnapshots` (`snapshotNo`);
ALTER TABLE `merge_power_internalservicefeesnapshots` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_internalserviceledgers: ledgerId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_internalserviceledgers` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_internalserviceledgers`;
UPDATE `merge_power_internalserviceledgers` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `ledgerId`;
ALTER TABLE `merge_power_internalserviceledgers` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_internalserviceledgers` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_internalserviceledgers` ADD UNIQUE KEY `uk_internal_legacy_merge_power_internalserviceledgers` (`ledgerId`);
ALTER TABLE `merge_power_internalserviceledgers` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_modulefeatures: moduleKey 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_modulefeatures` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_modulefeatures`;
UPDATE `merge_power_modulefeatures` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `moduleKey`;
ALTER TABLE `merge_power_modulefeatures` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_modulefeatures` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_modulefeatures` ADD UNIQUE KEY `uk_internal_legacy_merge_power_modulefeatures` (`moduleKey`);
ALTER TABLE `merge_power_modulefeatures` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_monthlybillingwriteoffs: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_monthlybillingwriteoffs` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_monthlybillingwriteoffs`;
UPDATE `merge_power_monthlybillingwriteoffs` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_power_monthlybillingwriteoffs` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_monthlybillingwriteoffs` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_monthlybillingwriteoffs` ADD UNIQUE KEY `uk_internal_legacy_merge_power_monthlybillingwriteoffs` (`id`);
ALTER TABLE `merge_power_monthlybillingwriteoffs` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_monthlyinternalservicefees: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_monthlyinternalservicefees` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_monthlyinternalservicefees`;
UPDATE `merge_power_monthlyinternalservicefees` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_power_monthlyinternalservicefees` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_monthlyinternalservicefees` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_monthlyinternalservicefees` ADD UNIQUE KEY `uk_internal_legacy_merge_power_monthlyinternalservicefees` (`id`);
ALTER TABLE `merge_power_monthlyinternalservicefees` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_monthlyprepaymentwriteoffs: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_monthlyprepaymentwriteoffs` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_monthlyprepaymentwriteoffs`;
UPDATE `merge_power_monthlyprepaymentwriteoffs` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_power_monthlyprepaymentwriteoffs` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_monthlyprepaymentwriteoffs` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_monthlyprepaymentwriteoffs` ADD UNIQUE KEY `uk_internal_legacy_merge_power_monthlyprepaymentwriteoffs` (`id`);
ALTER TABLE `merge_power_monthlyprepaymentwriteoffs` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_prepaymentcontractitems: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_prepaymentcontractitems` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_prepaymentcontractitems`;
UPDATE `merge_power_prepaymentcontractitems` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_power_prepaymentcontractitems` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_prepaymentcontractitems` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_prepaymentcontractitems` ADD UNIQUE KEY `uk_internal_legacy_merge_power_prepaymentcontractitems` (`id`);
ALTER TABLE `merge_power_prepaymentcontractitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_prepaymentcontracts: contractNo 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_prepaymentcontracts` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_prepaymentcontracts`;
UPDATE `merge_power_prepaymentcontracts` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `contractNo`;
ALTER TABLE `merge_power_prepaymentcontracts` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_prepaymentcontracts` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_prepaymentcontracts` ADD UNIQUE KEY `uk_internal_legacy_merge_power_prepaymentcontracts` (`contractNo`);
ALTER TABLE `merge_power_prepaymentcontracts` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_prepaymentwriteoffadjustmentitems: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_prepaymentwriteoffadjustmentitems` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_prepaymentwriteoffadjustmentitems`;
UPDATE `merge_power_prepaymentwriteoffadjustmentitems` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_power_prepaymentwriteoffadjustmentitems` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_prepaymentwriteoffadjustmentitems` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_prepaymentwriteoffadjustmentitems` ADD UNIQUE KEY `uk_internal_legacy_merge_power_prepaymentwriteoffadjustmentitems` (`id`);
ALTER TABLE `merge_power_prepaymentwriteoffadjustmentitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_prepaymentwriteoffadjustments: adjustmentNo 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_prepaymentwriteoffadjustments` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_prepaymentwriteoffadjustments`;
UPDATE `merge_power_prepaymentwriteoffadjustments` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `adjustmentNo`;
ALTER TABLE `merge_power_prepaymentwriteoffadjustments` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_prepaymentwriteoffadjustments` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_prepaymentwriteoffadjustments` ADD UNIQUE KEY `uk_internal_legacy_merge_power_prepaymentwriteoffadjustments` (`adjustmentNo`);
ALTER TABLE `merge_power_prepaymentwriteoffadjustments` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_purchaseorderitems: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_purchaseorderitems` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_purchaseorderitems`;
UPDATE `merge_power_purchaseorderitems` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_power_purchaseorderitems` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_purchaseorderitems` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_purchaseorderitems` ADD UNIQUE KEY `uk_internal_legacy_merge_power_purchaseorderitems` (`id`);
ALTER TABLE `merge_power_purchaseorderitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_purchaseorderplanitems: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_purchaseorderplanitems` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_purchaseorderplanitems`;
UPDATE `merge_power_purchaseorderplanitems` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_power_purchaseorderplanitems` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_purchaseorderplanitems` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_purchaseorderplanitems` ADD UNIQUE KEY `uk_internal_legacy_merge_power_purchaseorderplanitems` (`id`);
ALTER TABLE `merge_power_purchaseorderplanitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_purchaseorders: poNo 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_purchaseorders` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_purchaseorders`;
UPDATE `merge_power_purchaseorders` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `poNo`;
ALTER TABLE `merge_power_purchaseorders` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_purchaseorders` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_purchaseorders` ADD UNIQUE KEY `uk_internal_legacy_merge_power_purchaseorders` (`poNo`);
ALTER TABLE `merge_power_purchaseorders` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_purchaseordersnitems: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_purchaseordersnitems` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_purchaseordersnitems`;
UPDATE `merge_power_purchaseordersnitems` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_power_purchaseordersnitems` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_purchaseordersnitems` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_purchaseordersnitems` ADD UNIQUE KEY `uk_internal_legacy_merge_power_purchaseordersnitems` (`id`);
ALTER TABLE `merge_power_purchaseordersnitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_requestitems: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_requestitems` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_requestitems`;
UPDATE `merge_power_requestitems` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_power_requestitems` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_requestitems` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_requestitems` ADD UNIQUE KEY `uk_internal_legacy_merge_power_requestitems` (`id`);
ALTER TABLE `merge_power_requestitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_requests: requestNo 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_requests` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_requests`;
UPDATE `merge_power_requests` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `requestNo`;
ALTER TABLE `merge_power_requests` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_requests` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_requests` ADD UNIQUE KEY `uk_internal_legacy_merge_power_requests` (`requestNo`);
ALTER TABLE `merge_power_requests` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_servicefeesnapshotitems: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_servicefeesnapshotitems` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_servicefeesnapshotitems`;
UPDATE `merge_power_servicefeesnapshotitems` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_power_servicefeesnapshotitems` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_servicefeesnapshotitems` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_servicefeesnapshotitems` ADD UNIQUE KEY `uk_internal_legacy_merge_power_servicefeesnapshotitems` (`id`);
ALTER TABLE `merge_power_servicefeesnapshotitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_servicefeesnapshots: snapshotNo 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_servicefeesnapshots` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_servicefeesnapshots`;
UPDATE `merge_power_servicefeesnapshots` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `snapshotNo`;
ALTER TABLE `merge_power_servicefeesnapshots` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_servicefeesnapshots` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_servicefeesnapshots` ADD UNIQUE KEY `uk_internal_legacy_merge_power_servicefeesnapshots` (`snapshotNo`);
ALTER TABLE `merge_power_servicefeesnapshots` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_shipments: shipmentId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_shipments` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_shipments`;
UPDATE `merge_power_shipments` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `shipmentId`;
ALTER TABLE `merge_power_shipments` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_shipments` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_shipments` ADD UNIQUE KEY `uk_internal_legacy_merge_power_shipments` (`shipmentId`);
ALTER TABLE `merge_power_shipments` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_suppliers: supplierId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_suppliers` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_suppliers`;
UPDATE `merge_power_suppliers` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `supplierId`;
ALTER TABLE `merge_power_suppliers` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_suppliers` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_suppliers` ADD UNIQUE KEY `uk_internal_legacy_merge_power_suppliers` (`supplierId`);
ALTER TABLE `merge_power_suppliers` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_undertakingunits: undertakingUnitId 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_undertakingunits` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_undertakingunits`;
UPDATE `merge_power_undertakingunits` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `undertakingUnitId`;
ALTER TABLE `merge_power_undertakingunits` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_undertakingunits` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_undertakingunits` ADD UNIQUE KEY `uk_internal_legacy_merge_power_undertakingunits` (`undertakingUnitId`);
ALTER TABLE `merge_power_undertakingunits` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_userpreferences: userId, preferenceKey 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_userpreferences` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_userpreferences`;
UPDATE `merge_power_userpreferences` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `userId`, `preferenceKey`;
ALTER TABLE `merge_power_userpreferences` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_userpreferences` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_userpreferences` ADD UNIQUE KEY `uk_internal_legacy_merge_power_userpreferences` (`userId`, `preferenceKey`);
ALTER TABLE `merge_power_userpreferences` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

-- merge_power_writeoffitems: id 保留为公开业务键，internalId 改为 InnoDB 主键
ALTER TABLE `merge_power_writeoffitems` ADD COLUMN `internalId` INT UNSIGNED NULL COMMENT '数据库内部自增主键' FIRST;
SET @merge_internal_id := 0;
SELECT @merge_internal_id := COALESCE(MAX(`internalId`), 0) FROM `merge_power_writeoffitems`;
UPDATE `merge_power_writeoffitems` SET `internalId` = (@merge_internal_id := @merge_internal_id + 1) WHERE `internalId` IS NULL ORDER BY `id`;
ALTER TABLE `merge_power_writeoffitems` ADD UNIQUE KEY `uk_internal_id` (`internalId`);
ALTER TABLE `merge_power_writeoffitems` MODIFY COLUMN `internalId` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键';
ALTER TABLE `merge_power_writeoffitems` ADD UNIQUE KEY `uk_internal_legacy_merge_power_writeoffitems` (`id`);
ALTER TABLE `merge_power_writeoffitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_id`, ADD PRIMARY KEY (`internalId`);

