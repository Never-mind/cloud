-- Rollback for merge_* internalId migration
-- Only execute after stopping the application and confirming a backup.
-- This removes internalId but preserves the original UUID/business-number values.

-- merge_cloud_attachments: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_cloud_attachments` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_cloud_attachments` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_cloud_attachments`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_cloud_import_batches: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_cloud_import_batches` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_cloud_import_batches` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_cloud_import_batches`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_cloud_mapping_accounts: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_cloud_mapping_accounts` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_cloud_mapping_accounts` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_cloud_mapping_accounts`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_cloud_mappings: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_cloud_mappings` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_cloud_mappings` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_cloud_mappings`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_cloud_rows: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_cloud_rows` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_cloud_rows` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_cloud_rows`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_cloud_supplier_payments: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_cloud_supplier_payments` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_cloud_supplier_payments` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_cloud_supplier_payments`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_common_attachments: 恢复原主键 attachmentId，不恢复或重生成任何业务数据
ALTER TABLE `merge_common_attachments` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_common_attachments` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_common_attachments`, ADD PRIMARY KEY (`attachmentId`), DROP COLUMN `internalId`;

-- merge_common_customer_bank_accounts: 恢复原主键 accountId，不恢复或重生成任何业务数据
ALTER TABLE `merge_common_customer_bank_accounts` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_common_customer_bank_accounts` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_common_customer_bank_accounts`, ADD PRIMARY KEY (`accountId`), DROP COLUMN `internalId`;

-- merge_common_customer_contacts: 恢复原主键 contactId，不恢复或重生成任何业务数据
ALTER TABLE `merge_common_customer_contacts` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_common_customer_contacts` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_common_customer_contacts`, ADD PRIMARY KEY (`contactId`), DROP COLUMN `internalId`;

-- merge_common_customers: 恢复原主键 customerId，不恢复或重生成任何业务数据
ALTER TABLE `merge_common_customers` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_common_customers` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_common_customers`, ADD PRIMARY KEY (`customerId`), DROP COLUMN `internalId`;

-- merge_common_document_files: 恢复原主键 fileId，不恢复或重生成任何业务数据
ALTER TABLE `merge_common_document_files` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_common_document_files` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_common_document_files`, ADD PRIMARY KEY (`fileId`), DROP COLUMN `internalId`;

-- merge_common_document_folders: 恢复原主键 folderId，不恢复或重生成任何业务数据
ALTER TABLE `merge_common_document_folders` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_common_document_folders` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_common_document_folders`, ADD PRIMARY KEY (`folderId`), DROP COLUMN `internalId`;

-- merge_common_modules: 恢复原主键 moduleKey，不恢复或重生成任何业务数据
ALTER TABLE `merge_common_modules` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_common_modules` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_common_modules`, ADD PRIMARY KEY (`moduleKey`), DROP COLUMN `internalId`;

-- merge_common_operation_logs: 恢复原主键 logId，不恢复或重生成任何业务数据
ALTER TABLE `merge_common_operation_logs` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_common_operation_logs` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_common_operation_logs`, ADD PRIMARY KEY (`logId`), DROP COLUMN `internalId`;

-- merge_common_supplier_bank_accounts: 恢复原主键 accountId，不恢复或重生成任何业务数据
ALTER TABLE `merge_common_supplier_bank_accounts` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_common_supplier_bank_accounts` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_common_supplier_bank_accounts`, ADD PRIMARY KEY (`accountId`), DROP COLUMN `internalId`;

-- merge_common_supplier_contacts: 恢复原主键 contactId，不恢复或重生成任何业务数据
ALTER TABLE `merge_common_supplier_contacts` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_common_supplier_contacts` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_common_supplier_contacts`, ADD PRIMARY KEY (`contactId`), DROP COLUMN `internalId`;

-- merge_common_suppliers: 恢复原主键 supplierId，不恢复或重生成任何业务数据
ALTER TABLE `merge_common_suppliers` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_common_suppliers` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_common_suppliers`, ADD PRIMARY KEY (`supplierId`), DROP COLUMN `internalId`;

-- merge_common_undertaking_unit_bank_accounts: 恢复原主键 accountId，不恢复或重生成任何业务数据
ALTER TABLE `merge_common_undertaking_unit_bank_accounts` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_common_undertaking_unit_bank_accounts` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_common_undertaking_unit_bank_accounts`, ADD PRIMARY KEY (`accountId`), DROP COLUMN `internalId`;

-- merge_common_undertaking_unit_contacts: 恢复原主键 contactId，不恢复或重生成任何业务数据
ALTER TABLE `merge_common_undertaking_unit_contacts` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_common_undertaking_unit_contacts` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_common_undertaking_unit_contacts`, ADD PRIMARY KEY (`contactId`), DROP COLUMN `internalId`;

-- merge_common_undertaking_units: 恢复原主键 undertakingUnitId，不恢复或重生成任何业务数据
ALTER TABLE `merge_common_undertaking_units` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_common_undertaking_units` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_common_undertaking_units`, ADD PRIMARY KEY (`undertakingUnitId`), DROP COLUMN `internalId`;

-- merge_common_user_permissions: 恢复原主键 userId, moduleKey，不恢复或重生成任何业务数据
ALTER TABLE `merge_common_user_permissions` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_common_user_permissions` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_common_user_permissions`, ADD PRIMARY KEY (`userId`, `moduleKey`), DROP COLUMN `internalId`;

-- merge_common_user_preferences: 恢复原主键 userId, preferenceKey，不恢复或重生成任何业务数据
ALTER TABLE `merge_common_user_preferences` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_common_user_preferences` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_common_user_preferences`, ADD PRIMARY KEY (`userId`, `preferenceKey`), DROP COLUMN `internalId`;

-- merge_common_users: 恢复原主键 userId，不恢复或重生成任何业务数据
ALTER TABLE `merge_common_users` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_common_users` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_common_users`, ADD PRIMARY KEY (`userId`), DROP COLUMN `internalId`;

-- merge_po_customer_po_items: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_po_customer_po_items` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_po_customer_po_items` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_po_customer_po_items`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_po_customer_pos: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_po_customer_pos` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_po_customer_pos` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_po_customer_pos`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_po_customer_product_aliases: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_po_customer_product_aliases` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_po_customer_product_aliases` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_po_customer_product_aliases`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_po_history_quotations: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_po_history_quotations` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_po_history_quotations` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_po_history_quotations`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_po_product_masters: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_po_product_masters` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_po_product_masters` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_po_product_masters`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_po_quotation_items: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_po_quotation_items` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_po_quotation_items` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_po_quotation_items`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_po_quotations: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_po_quotations` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_po_quotations` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_po_quotations`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_po_settlement_attachments: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_po_settlement_attachments` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_po_settlement_attachments` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_po_settlement_attachments`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_po_settlement_expenses: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_po_settlement_expenses` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_po_settlement_expenses` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_po_settlement_expenses`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_po_settlement_invoices: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_po_settlement_invoices` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_po_settlement_invoices` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_po_settlement_invoices`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_po_settlement_items: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_po_settlement_items` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_po_settlement_items` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_po_settlement_items`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_po_settlement_projects: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_po_settlement_projects` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_po_settlement_projects` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_po_settlement_projects`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_po_settlement_sales: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_po_settlement_sales` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_po_settlement_sales` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_po_settlement_sales`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_po_tariff_rates: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_po_tariff_rates` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_po_tariff_rates` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_po_tariff_rates`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_power_appusers: 恢复原主键 userId，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_appusers` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_appusers` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_appusers`, ADD PRIMARY KEY (`userId`), DROP COLUMN `internalId`;

-- merge_power_b6typeconfigs: 恢复原主键 b6Type，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_b6typeconfigs` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_b6typeconfigs` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_b6typeconfigs`, ADD PRIMARY KEY (`b6Type`), DROP COLUMN `internalId`;

-- merge_power_balancesettlementfinals: 恢复原主键 finalSettlementNo，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_balancesettlementfinals` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_balancesettlementfinals` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_balancesettlementfinals`, ADD PRIMARY KEY (`finalSettlementNo`), DROP COLUMN `internalId`;

-- merge_power_balancesettlementfinalsources: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_balancesettlementfinalsources` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_balancesettlementfinalsources` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_balancesettlementfinalsources`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_power_balancesettlementitems: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_balancesettlementitems` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_balancesettlementitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_balancesettlementitems`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_power_balancesettlements: 恢复原主键 settlementNo，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_balancesettlements` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_balancesettlements` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_balancesettlements`, ADD PRIMARY KEY (`settlementNo`), DROP COLUMN `internalId`;

-- merge_power_billingadjustmentitems: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_billingadjustmentitems` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_billingadjustmentitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_billingadjustmentitems`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_power_billingadjustments: 恢复原主键 adjustmentNo，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_billingadjustments` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_billingadjustments` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_billingadjustments`, ADD PRIMARY KEY (`adjustmentNo`), DROP COLUMN `internalId`;

-- merge_power_billinginstanceledgers: 恢复原主键 ledgerId，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_billinginstanceledgers` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_billinginstanceledgers` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_billinginstanceledgers`, ADD PRIMARY KEY (`ledgerId`), DROP COLUMN `internalId`;

-- merge_power_billingstatementsnapshotitems: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_billingstatementsnapshotitems` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_billingstatementsnapshotitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_billingstatementsnapshotitems`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_power_billingstatementsnapshots: 恢复原主键 snapshotNo，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_billingstatementsnapshots` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_billingstatementsnapshots` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_billingstatementsnapshots`, ADD PRIMARY KEY (`snapshotNo`), DROP COLUMN `internalId`;

-- merge_power_capexpricingitems: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_capexpricingitems` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_capexpricingitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_capexpricingitems`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_power_capexpricingversions: 恢复原主键 versionId，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_capexpricingversions` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_capexpricingversions` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_capexpricingversions`, ADD PRIMARY KEY (`versionId`), DROP COLUMN `internalId`;

-- merge_power_contractitems: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_contractitems` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_contractitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_contractitems`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_power_countries: 恢复原主键 code，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_countries` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_countries` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_countries`, ADD PRIMARY KEY (`code`), DROP COLUMN `internalId`;

-- merge_power_customers: 恢复原主键 customerId，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_customers` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_customers` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_customers`, ADD PRIMARY KEY (`customerId`), DROP COLUMN `internalId`;

-- merge_power_datacenters: 恢复原主键 dcCode，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_datacenters` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_datacenters` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_datacenters`, ADD PRIMARY KEY (`dcCode`), DROP COLUMN `internalId`;

-- merge_power_deliverycontacts: 恢复原主键 contactId，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_deliverycontacts` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_deliverycontacts` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_deliverycontacts`, ADD PRIMARY KEY (`contactId`), DROP COLUMN `internalId`;

-- merge_power_deliverylocations: 恢复原主键 locationId，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_deliverylocations` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_deliverylocations` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_deliverylocations`, ADD PRIMARY KEY (`locationId`), DROP COLUMN `internalId`;

-- merge_power_documentfiles: 恢复原主键 fileId，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_documentfiles` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_documentfiles` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_documentfiles`, ADD PRIMARY KEY (`fileId`), DROP COLUMN `internalId`;

-- merge_power_documentfolders: 恢复原主键 folderId，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_documentfolders` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_documentfolders` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_documentfolders`, ADD PRIMARY KEY (`folderId`), DROP COLUMN `internalId`;

-- merge_power_importjobs: 恢复原主键 jobId，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_importjobs` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_importjobs` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_importjobs`, ADD PRIMARY KEY (`jobId`), DROP COLUMN `internalId`;

-- merge_power_instancecontracts: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_instancecontracts` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_instancecontracts` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_instancecontracts`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_power_instancemodels: 恢复原主键 deviceCode，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_instancemodels` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_instancemodels` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_instancemodels`, ADD PRIMARY KEY (`deviceCode`), DROP COLUMN `internalId`;

-- merge_power_internalservicefeeadjustments: 恢复原主键 adjustmentNo，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_internalservicefeeadjustments` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_internalservicefeeadjustments` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_internalservicefeeadjustments`, ADD PRIMARY KEY (`adjustmentNo`), DROP COLUMN `internalId`;

-- merge_power_internalservicefeesnapshotitems: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_internalservicefeesnapshotitems` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_internalservicefeesnapshotitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_internalservicefeesnapshotitems`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_power_internalservicefeesnapshots: 恢复原主键 snapshotNo，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_internalservicefeesnapshots` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_internalservicefeesnapshots` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_internalservicefeesnapshots`, ADD PRIMARY KEY (`snapshotNo`), DROP COLUMN `internalId`;

-- merge_power_internalserviceledgers: 恢复原主键 ledgerId，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_internalserviceledgers` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_internalserviceledgers` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_internalserviceledgers`, ADD PRIMARY KEY (`ledgerId`), DROP COLUMN `internalId`;

-- merge_power_modulefeatures: 恢复原主键 moduleKey，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_modulefeatures` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_modulefeatures` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_modulefeatures`, ADD PRIMARY KEY (`moduleKey`), DROP COLUMN `internalId`;

-- merge_power_monthlybillingwriteoffs: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_monthlybillingwriteoffs` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_monthlybillingwriteoffs` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_monthlybillingwriteoffs`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_power_monthlyinternalservicefees: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_monthlyinternalservicefees` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_monthlyinternalservicefees` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_monthlyinternalservicefees`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_power_monthlyprepaymentwriteoffs: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_monthlyprepaymentwriteoffs` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_monthlyprepaymentwriteoffs` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_monthlyprepaymentwriteoffs`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_power_prepaymentcontractitems: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_prepaymentcontractitems` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_prepaymentcontractitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_prepaymentcontractitems`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_power_prepaymentcontracts: 恢复原主键 contractNo，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_prepaymentcontracts` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_prepaymentcontracts` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_prepaymentcontracts`, ADD PRIMARY KEY (`contractNo`), DROP COLUMN `internalId`;

-- merge_power_prepaymentwriteoffadjustmentitems: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_prepaymentwriteoffadjustmentitems` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_prepaymentwriteoffadjustmentitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_prepaymentwriteoffadjustmentitems`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_power_prepaymentwriteoffadjustments: 恢复原主键 adjustmentNo，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_prepaymentwriteoffadjustments` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_prepaymentwriteoffadjustments` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_prepaymentwriteoffadjustments`, ADD PRIMARY KEY (`adjustmentNo`), DROP COLUMN `internalId`;

-- merge_power_purchaseorderitems: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_purchaseorderitems` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_purchaseorderitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_purchaseorderitems`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_power_purchaseorderplanitems: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_purchaseorderplanitems` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_purchaseorderplanitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_purchaseorderplanitems`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_power_purchaseorders: 恢复原主键 poNo，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_purchaseorders` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_purchaseorders` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_purchaseorders`, ADD PRIMARY KEY (`poNo`), DROP COLUMN `internalId`;

-- merge_power_purchaseordersnitems: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_purchaseordersnitems` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_purchaseordersnitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_purchaseordersnitems`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_power_requestitems: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_requestitems` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_requestitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_requestitems`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_power_requests: 恢复原主键 requestNo，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_requests` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_requests` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_requests`, ADD PRIMARY KEY (`requestNo`), DROP COLUMN `internalId`;

-- merge_power_servicefeesnapshotitems: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_servicefeesnapshotitems` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_servicefeesnapshotitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_servicefeesnapshotitems`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

-- merge_power_servicefeesnapshots: 恢复原主键 snapshotNo，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_servicefeesnapshots` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_servicefeesnapshots` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_servicefeesnapshots`, ADD PRIMARY KEY (`snapshotNo`), DROP COLUMN `internalId`;

-- merge_power_shipments: 恢复原主键 shipmentId，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_shipments` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_shipments` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_shipments`, ADD PRIMARY KEY (`shipmentId`), DROP COLUMN `internalId`;

-- merge_power_suppliers: 恢复原主键 supplierId，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_suppliers` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_suppliers` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_suppliers`, ADD PRIMARY KEY (`supplierId`), DROP COLUMN `internalId`;

-- merge_power_undertakingunits: 恢复原主键 undertakingUnitId，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_undertakingunits` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_undertakingunits` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_undertakingunits`, ADD PRIMARY KEY (`undertakingUnitId`), DROP COLUMN `internalId`;

-- merge_power_userpreferences: 恢复原主键 userId, preferenceKey，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_userpreferences` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_userpreferences` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_userpreferences`, ADD PRIMARY KEY (`userId`, `preferenceKey`), DROP COLUMN `internalId`;

-- merge_power_writeoffitems: 恢复原主键 id，不恢复或重生成任何业务数据
ALTER TABLE `merge_power_writeoffitems` MODIFY COLUMN `internalId` INT UNSIGNED NULL;
ALTER TABLE `merge_power_writeoffitems` DROP PRIMARY KEY, DROP INDEX `uk_internal_legacy_merge_power_writeoffitems`, ADD PRIMARY KEY (`id`), DROP COLUMN `internalId`;

