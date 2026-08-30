import fs from "node:fs/promises";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import mysql from "mysql2/promise";

const database = process.env.DB_NAME ?? "merge";
const connection = await mysql.createConnection({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "root",
  database,
  multipleStatements: true,
});

const commonSchema = `
CREATE TABLE IF NOT EXISTS common_customers (
  customerId VARCHAR(64) NOT NULL PRIMARY KEY,
  customerCode VARCHAR(100) NULL,
  name VARCHAR(255) NOT NULL,
  nameCn VARCHAR(255) NULL,
  nameEn VARCHAR(255) NULL,
  shortName VARCHAR(255) NULL,
  taxNumber VARCHAR(100) NULL,
  country VARCHAR(100) NULL,
  city VARCHAR(100) NULL,
  address TEXT NULL,
  contactName VARCHAR(255) NULL,
  contactPhone VARCHAR(100) NULL,
  contactEmail VARCHAR(255) NULL,
  businessTypes TEXT NULL,
  cooperationStatus VARCHAR(30) NOT NULL DEFAULT 'not_cooperated',
  website VARCHAR(500) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  remark TEXT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_common_customers_name (name),
  UNIQUE KEY uk_common_customers_code (customerCode),
  KEY idx_common_customers_keyword (name, shortName, contactPhone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS common_suppliers (
  supplierId VARCHAR(64) NOT NULL PRIMARY KEY,
  supplierCode VARCHAR(100) NOT NULL,
  nameCn VARCHAR(255) NOT NULL,
  nameEn VARCHAR(255) NULL,
  shortName VARCHAR(255) NULL,
  country VARCHAR(100) NULL,
  city VARCHAR(100) NULL,
  registeredAddress TEXT NULL,
  taxNumber VARCHAR(100) NULL,
  supplierType VARCHAR(30) NOT NULL DEFAULT 'third_party',
  supplyCategories TEXT NULL,
  brands TEXT NULL,
  cooperationStatus VARCHAR(30) NOT NULL DEFAULT 'not_cooperated',
  website VARCHAR(500) NULL,
  remark TEXT NULL,
  contactName VARCHAR(255) NULL,
  contactPhone VARCHAR(100) NULL,
  contactEmail VARCHAR(255) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_common_suppliers_code (supplierCode),
  UNIQUE KEY uk_common_suppliers_name (nameCn),
  KEY idx_common_suppliers_keyword (supplierCode, nameCn, shortName),
  KEY idx_common_suppliers_status (cooperationStatus, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS common_undertaking_units (
  undertakingUnitId VARCHAR(64) NOT NULL PRIMARY KEY,
  undertakingUnitCode VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  entityCode VARCHAR(100) NULL,
  entityName VARCHAR(255) NULL,
  nameCn VARCHAR(255) NULL,
  nameEn VARCHAR(255) NULL,
  shortName VARCHAR(255) NULL,
  country VARCHAR(100) NULL,
  city VARCHAR(100) NULL,
  registeredAddress TEXT NULL,
  taxNumber VARCHAR(100) NULL,
  address TEXT NULL,
  remark TEXT NULL,
  cooperationStatus VARCHAR(30) NOT NULL DEFAULT 'not_cooperated',
  website VARCHAR(500) NULL,
  bankAccount VARCHAR(255) NULL,
  contactName VARCHAR(255) NULL,
  contactPhone VARCHAR(100) NULL,
  contactEmail VARCHAR(255) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_common_undertaking_units_code (undertakingUnitCode),
  UNIQUE KEY uk_common_undertaking_units_name (name),
  KEY idx_common_undertaking_units_keyword (undertakingUnitCode, name, shortName)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS common_customer_contacts (
  contactId VARCHAR(64) NOT NULL PRIMARY KEY,
  customerId VARCHAR(64) NOT NULL,
  name VARCHAR(255) NULL,
  title VARCHAR(255) NULL,
  phone VARCHAR(100) NULL,
  email VARCHAR(255) NULL,
  isPrimary TINYINT(1) NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_common_customer_contacts_customer (customerId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS common_customer_bank_accounts (
  accountId VARCHAR(64) NOT NULL PRIMARY KEY,
  customerId VARCHAR(64) NOT NULL,
  accountName VARCHAR(255) NULL,
  bankName VARCHAR(255) NULL,
  bankAccount VARCHAR(255) NULL,
  bankRoutingNumber VARCHAR(100) NULL,
  swiftCode VARCHAR(100) NULL,
  currency VARCHAR(20) NOT NULL DEFAULT 'USD',
  otherCurrency VARCHAR(50) NULL,
  bankAddress TEXT NULL,
  isDefault TINYINT(1) NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_common_customer_accounts_customer (customerId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS common_supplier_contacts (
  contactId VARCHAR(64) NOT NULL PRIMARY KEY,
  supplierId VARCHAR(64) NOT NULL,
  name VARCHAR(255) NULL,
  title VARCHAR(255) NULL,
  phone VARCHAR(100) NULL,
  email VARCHAR(255) NULL,
  isPrimary TINYINT(1) NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_common_supplier_contacts_supplier (supplierId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS common_supplier_bank_accounts (
  accountId VARCHAR(64) NOT NULL PRIMARY KEY,
  supplierId VARCHAR(64) NOT NULL,
  accountName VARCHAR(255) NULL,
  bankName VARCHAR(255) NULL,
  bankAccount VARCHAR(255) NULL,
  bankRoutingNumber VARCHAR(100) NULL,
  swiftCode VARCHAR(100) NULL,
  currency VARCHAR(50) NULL,
  bankAddress TEXT NULL,
  isDefault TINYINT(1) NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_common_supplier_accounts_supplier (supplierId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS common_undertaking_unit_contacts (
  contactId VARCHAR(64) NOT NULL PRIMARY KEY,
  undertakingUnitId VARCHAR(64) NOT NULL,
  name VARCHAR(255) NULL,
  title VARCHAR(255) NULL,
  phone VARCHAR(100) NULL,
  email VARCHAR(255) NULL,
  isPrimary TINYINT(1) NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_common_undertaking_contacts_unit (undertakingUnitId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS common_undertaking_unit_bank_accounts (
  accountId VARCHAR(64) NOT NULL PRIMARY KEY,
  undertakingUnitId VARCHAR(64) NOT NULL,
  accountName VARCHAR(255) NULL,
  bankName VARCHAR(255) NULL,
  bankAccount VARCHAR(255) NULL,
  bankRoutingNumber VARCHAR(100) NULL,
  swiftCode VARCHAR(100) NULL,
  currency VARCHAR(50) NULL,
  bankAddress TEXT NULL,
  isDefault TINYINT(1) NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_common_undertaking_accounts_unit (undertakingUnitId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS common_attachments (
  attachmentId VARCHAR(64) NOT NULL PRIMARY KEY,
  ownerType VARCHAR(64) NOT NULL,
  ownerId VARCHAR(64) NOT NULL,
  fileName VARCHAR(255) NOT NULL,
  fileType VARCHAR(255) NULL,
  fileSize BIGINT NOT NULL DEFAULT 0,
  dataUrl LONGTEXT NOT NULL,
  uploadedByUserId VARCHAR(80) NULL,
  uploadedByName VARCHAR(255) NULL,
  uploadedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_common_attachments_owner (ownerType, ownerId, uploadedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS common_users (
  userId VARCHAR(80) NOT NULL PRIMARY KEY,
  displayName VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  passwordHash VARCHAR(128) NOT NULL,
  passwordSalt VARCHAR(64) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'user',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  lastLoginAt DATETIME NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_common_users_email (email),
  KEY idx_common_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS common_modules (
  moduleKey VARCHAR(128) NOT NULL PRIMARY KEY,
  moduleName VARCHAR(255) NOT NULL,
  parentModuleKey VARCHAR(128) NULL,
  domainKey VARCHAR(32) NOT NULL,
  route VARCHAR(500) NULL,
  sortOrder INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  adminOnly TINYINT(1) NOT NULL DEFAULT 0,
  remark VARCHAR(500) NULL,
  updatedByUserId VARCHAR(80) NULL,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_common_modules_domain (domainKey, sortOrder),
  KEY idx_common_modules_parent (parentModuleKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS common_user_permissions (
  userId VARCHAR(80) NOT NULL,
  moduleKey VARCHAR(128) NOT NULL,
  canView TINYINT(1) NOT NULL DEFAULT 0,
  canCreate TINYINT(1) NOT NULL DEFAULT 0,
  canUpdate TINYINT(1) NOT NULL DEFAULT 0,
  canDelete TINYINT(1) NOT NULL DEFAULT 0,
  canExport TINYINT(1) NOT NULL DEFAULT 0,
  canImport TINYINT(1) NOT NULL DEFAULT 0,
  canConfirm TINYINT(1) NOT NULL DEFAULT 0,
  updatedByUserId VARCHAR(80) NULL,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (userId, moduleKey),
  KEY idx_common_permissions_module (moduleKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS common_user_preferences (
  userId VARCHAR(80) NOT NULL,
  preferenceKey VARCHAR(128) NOT NULL,
  preferenceValue JSON NOT NULL,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (userId, preferenceKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS common_operation_logs (
  logId VARCHAR(80) NOT NULL PRIMARY KEY,
  userId VARCHAR(80) NULL,
  userName VARCHAR(255) NULL,
  domainKey VARCHAR(32) NULL,
  moduleKey VARCHAR(128) NULL,
  action VARCHAR(32) NOT NULL,
  entityType VARCHAR(128) NULL,
  entityId VARCHAR(128) NULL,
  requestId VARCHAR(128) NULL,
  detailJson JSON NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_common_operation_logs_entity (entityType, entityId),
  KEY idx_common_operation_logs_user (userId, createdAt),
  KEY idx_common_operation_logs_created (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS common_document_folders (
  folderId VARCHAR(80) NOT NULL PRIMARY KEY,
  parentId VARCHAR(80) NULL,
  name VARCHAR(255) NOT NULL,
  domainKey VARCHAR(32) NULL,
  sortOrder INT NOT NULL DEFAULT 0,
  createdByUserId VARCHAR(80) NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_common_document_folders_parent (parentId),
  KEY idx_common_document_folders_domain (domainKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS common_document_files (
  fileId VARCHAR(80) NOT NULL PRIMARY KEY,
  folderId VARCHAR(80) NOT NULL,
  fileName VARCHAR(255) NOT NULL,
  fileType VARCHAR(255) NULL,
  fileSize BIGINT NOT NULL DEFAULT 0,
  dataUrl LONGTEXT NOT NULL,
  uploadedByUserId VARCHAR(80) NULL,
  uploadedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_common_document_files_folder (folderId),
  KEY idx_common_document_files_uploaded (uploadedByUserId, uploadedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_product_masters (
  id CHAR(36) NOT NULL PRIMARY KEY,
  masterCode VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  nameEn VARCHAR(255) NULL,
  specification VARCHAR(255) NULL,
  brand VARCHAR(255) NULL,
  category VARCHAR(255) NULL,
  unit VARCHAR(50) NOT NULL DEFAULT 'pcs',
  suggestedPurchaseUnitPrice DECIMAL(14,4) NOT NULL DEFAULT 0,
  length DECIMAL(14,4) NOT NULL DEFAULT 0,
  width DECIMAL(14,4) NOT NULL DEFAULT 0,
  height DECIMAL(14,4) NOT NULL DEFAULT 0,
  grossWeight DECIMAL(14,4) NOT NULL DEFAULT 0,
  hsCodeCn VARCHAR(100) NULL,
  hsCodeMx VARCHAR(100) NULL,
  needNom TINYINT(1) NOT NULL DEFAULT 0,
  description TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_po_product_masters_code (masterCode),
  KEY idx_po_product_masters_keyword (masterCode, name, category),
  KEY idx_po_product_masters_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_product_models (
  id CHAR(36) NOT NULL PRIMARY KEY,
  masterId CHAR(36) NOT NULL,
  modelCode VARCHAR(100) NOT NULL,
  brand VARCHAR(255) NOT NULL,
  model VARCHAR(255) NOT NULL,
  series VARCHAR(255) NULL,
  supplierId VARCHAR(64) NULL,
  purchaseCurrency VARCHAR(10) NOT NULL DEFAULT 'USD',
  suggestedPurchaseUnitPrice DECIMAL(14,4) NOT NULL DEFAULT 0,
  length DECIMAL(14,4) NOT NULL DEFAULT 0,
  width DECIMAL(14,4) NOT NULL DEFAULT 0,
  height DECIMAL(14,4) NOT NULL DEFAULT 0,
  grossWeight DECIMAL(14,4) NOT NULL DEFAULT 0,
  hsCodeCn VARCHAR(100) NULL,
  hsCodeMx VARCHAR(100) NULL,
  isMagnetic TINYINT(1) NOT NULL DEFAULT 0,
  isElectric TINYINT(1) NOT NULL DEFAULT 0,
  needNom TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_po_product_models_code (modelCode),
  KEY idx_po_product_models_master (masterId, status),
  KEY idx_po_product_models_keyword (brand, model)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_product_specifications (
  id CHAR(36) NOT NULL PRIMARY KEY,
  modelId CHAR(36) NOT NULL,
  specProductCode VARCHAR(100) NOT NULL,
  specCode VARCHAR(100) NULL,
  specKey VARCHAR(255) NOT NULL,
  specName VARCHAR(255) NOT NULL,
  mode VARCHAR(20) NOT NULL DEFAULT 'fixed',
  parameterValue DECIMAL(14,4) NULL,
  parameterUnit VARCHAR(50) NULL,
  purchaseCurrency VARCHAR(10) NOT NULL DEFAULT 'USD',
  suggestedPurchaseUnitPrice DECIMAL(14,4) NOT NULL DEFAULT 0,
  length DECIMAL(14,4) NOT NULL DEFAULT 0,
  width DECIMAL(14,4) NOT NULL DEFAULT 0,
  height DECIMAL(14,4) NOT NULL DEFAULT 0,
  grossWeight DECIMAL(14,4) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_po_product_specs_product_code (specProductCode),
  UNIQUE KEY uk_po_product_specs_model_key (modelId, specKey),
  KEY idx_po_product_specs_model (modelId, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_customer_pos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  poNo VARCHAR(100) NOT NULL,
  customerId VARCHAR(64) NOT NULL,
  poDate DATE NOT NULL,
  deliveryDate DATE NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  remark TEXT NULL,
  quotationId CHAR(36) NULL,
  quotationNo VARCHAR(100) NULL,
  createdByUserId VARCHAR(80) NULL,
  createdByName VARCHAR(255) NULL,
  updatedByUserId VARCHAR(80) NULL,
  updatedByName VARCHAR(255) NULL,
  confirmedByUserId VARCHAR(80) NULL,
  confirmedByName VARCHAR(255) NULL,
  confirmedAt DATETIME NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_po_customer_pos_no (poNo),
  KEY idx_po_customer_pos_customer (customerId, status),
  KEY idx_po_customer_pos_date (poDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_customer_po_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  poId CHAR(36) NOT NULL,
  lineNo INT NOT NULL DEFAULT 1,
  customerSku VARCHAR(100) NULL,
  customerProductName VARCHAR(255) NOT NULL,
  customerSpec VARCHAR(255) NULL,
  customerBrand VARCHAR(255) NULL,
  unit VARCHAR(50) NULL,
  quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
  targetUnitPrice DECIMAL(14,4) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  matchedProductId CHAR(36) NULL,
  matchedProductCode VARCHAR(100) NULL,
  productMasterId CHAR(36) NULL,
  productModelId CHAR(36) NULL,
  productSpecId CHAR(36) NULL,
  matchStatus VARCHAR(20) NOT NULL DEFAULT 'unmatched',
  remark TEXT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_po_customer_po_items_po (poId, lineNo),
  KEY idx_po_customer_po_items_code (matchedProductCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_quotations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  quotationNo VARCHAR(100) NOT NULL,
  customerId VARCHAR(64) NULL,
  contractingUnitId VARCHAR(64) NULL,
  sourcePoId CHAR(36) NULL,
  sourcePoNo VARCHAR(100) NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  totalAmount DECIMAL(14,4) NOT NULL DEFAULT 0,
  totalProfit DECIMAL(14,4) NOT NULL DEFAULT 0,
  grossMarginRate DECIMAL(10,6) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  remark TEXT NULL,
  createdByUserId VARCHAR(80) NULL,
  createdByName VARCHAR(255) NULL,
  updatedByUserId VARCHAR(80) NULL,
  updatedByName VARCHAR(255) NULL,
  confirmedByUserId VARCHAR(80) NULL,
  confirmedByName VARCHAR(255) NULL,
  confirmedAt DATETIME NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_po_quotations_no (quotationNo),
  KEY idx_po_quotations_customer (customerId, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_quotation_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  quotationId CHAR(36) NOT NULL,
  lineNo INT NOT NULL DEFAULT 1,
  productCode VARCHAR(100) NOT NULL,
  productName VARCHAR(255) NOT NULL,
  productMasterId CHAR(36) NULL,
  productModelId CHAR(36) NULL,
  productSpecId CHAR(36) NULL,
  quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
  unitPrice DECIMAL(14,4) NOT NULL DEFAULT 0,
  amount DECIMAL(14,4) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  remark TEXT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_po_quotation_items_quotation (quotationId, lineNo),
  KEY idx_po_quotation_items_product (productCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_history_quotations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  quotationId CHAR(36) NULL,
  quotationDate DATE NOT NULL,
  customerId VARCHAR(64) NULL,
  productCode VARCHAR(100) NOT NULL,
  productName VARCHAR(255) NOT NULL,
  productMasterId CHAR(36) NULL,
  productModelId CHAR(36) NULL,
  productSpecId CHAR(36) NULL,
  customerPrice DECIMAL(14,4) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  remark TEXT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_po_history_customer_product (customerId, productCode, quotationDate),
  KEY idx_po_history_product (productCode, quotationDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const settlementSchema = `
CREATE TABLE IF NOT EXISTS po_settlement_projects (
  id CHAR(36) NOT NULL PRIMARY KEY,
  projectNo VARCHAR(100) NOT NULL,
  quotationId CHAR(36) NOT NULL,
  quotationNo VARCHAR(100) NOT NULL,
  customerId VARCHAR(64) NULL,
  customerName VARCHAR(255) NULL,
  contractingUnitId VARCHAR(64) NULL,
  contractingUnitName VARCHAR(255) NULL,
  remark TEXT NULL,
  exchangeRateUsd DECIMAL(18,8) NOT NULL DEFAULT 1,
  exchangeRateMxn DECIMAL(18,8) NOT NULL DEFAULT 1,
  quotedPurchaseCostUsd DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '采购成本（未税 USD）',
  purchasedCostUsd DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '已采购成本（未税 USD）',
  quotedSalesRevenueUsd DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '销售收入（未税 USD）',
  receivedRevenueTaxIncludedUsd DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '已销售收入（含税 USD）',
  receivedRevenueUsd DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '已销售收入（未税 USD）',
  grossProfitUsd DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '项目毛利（未税 USD）',
  status VARCHAR(32) NOT NULL DEFAULT 'purchasing',
  procurementCompletedAt DATETIME NULL,
  acceptanceStartedAt DATETIME NULL,
  closedAt DATETIME NULL,
  createdByUserId VARCHAR(80) NULL,
  createdByName VARCHAR(255) NULL,
  updatedByUserId VARCHAR(80) NULL,
  updatedByName VARCHAR(255) NULL,
  confirmedByUserId VARCHAR(80) NULL,
  confirmedByName VARCHAR(255) NULL,
  confirmedAt DATETIME NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_po_settlement_projects_quotation (quotationId),
  UNIQUE KEY uk_po_settlement_projects_no (projectNo),
  KEY idx_po_settlement_projects_filter (status, customerId, createdAt),
  KEY idx_po_settlement_projects_keyword (projectNo, quotationNo, customerName)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_settlement_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  projectId CHAR(36) NOT NULL,
  quotationItemId CHAR(36) NOT NULL,
  lineNo INT NOT NULL DEFAULT 1,
  productId CHAR(36) NULL,
  productCode VARCHAR(100) NOT NULL,
  productName VARCHAR(255) NOT NULL,
  brand VARCHAR(255) NULL,
  plannedQty DECIMAL(18,4) NOT NULL DEFAULT 0,
  purchaseQty DECIMAL(18,4) NOT NULL DEFAULT 0,
  purchaseUnitPrice DECIMAL(18,4) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  priceType VARCHAR(20) NOT NULL DEFAULT 'tax_excluded',
  taxRate DECIMAL(10,6) NOT NULL DEFAULT 0,
  quotedWarehouseCostUsd DECIMAL(18,4) NOT NULL DEFAULT 0,
  quotedSalesRevenueUsd DECIMAL(18,4) NOT NULL DEFAULT 0,
  purchasedCostUsd DECIMAL(18,4) NOT NULL DEFAULT 0,
  invoiceNo VARCHAR(100) NULL,
  ordered TINYINT(1) NOT NULL DEFAULT 0,
  orderedAt DATETIME NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_po_settlement_items_quotation (quotationItemId),
  KEY idx_po_settlement_items_project (projectId, ordered)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_settlement_expenses (
  id CHAR(36) NOT NULL PRIMARY KEY,
  projectId CHAR(36) NOT NULL,
  type VARCHAR(40) NOT NULL DEFAULT 'other',
  description VARCHAR(255) NULL,
  amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
  priceType VARCHAR(20) NOT NULL DEFAULT 'tax_included',
  taxRate DECIMAL(10,6) NOT NULL DEFAULT 0,
  costUsd DECIMAL(18,4) NOT NULL DEFAULT 0,
  invoiceNo VARCHAR(100) NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_po_settlement_expenses_project (projectId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_settlement_sales (
  id CHAR(36) NOT NULL PRIMARY KEY,
  projectId CHAR(36) NOT NULL,
  description VARCHAR(255) NULL,
  amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  priceType VARCHAR(20) NOT NULL DEFAULT 'tax_included',
  taxRate DECIMAL(10,6) NOT NULL DEFAULT 0,
  receivedRevenueTaxIncludedUsd DECIMAL(18,4) NOT NULL DEFAULT 0,
  receivedRevenueUsd DECIMAL(18,4) NOT NULL DEFAULT 0,
  invoiceNo VARCHAR(100) NULL,
  receivedAt DATE NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_po_settlement_sales_project (projectId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_settlement_invoices (
  id CHAR(36) NOT NULL PRIMARY KEY,
  projectId CHAR(36) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'cost',
  accountPeriod VARCHAR(100) NULL,
  accountingDate DATE NULL,
  companyEntity VARCHAR(255) NULL,
  invoiceEntity VARCHAR(255) NULL,
  invoiceDate DATE NULL,
  invoiceNo VARCHAR(100) NULL,
  invoiceTotal DECIMAL(18,4) NOT NULL DEFAULT 0,
  invoiceTaxExcludedTotal DECIMAL(18,4) NOT NULL DEFAULT 0,
  taxRate DECIMAL(10,6) NOT NULL DEFAULT 0,
  invoiceTaxAmount DECIMAL(18,4) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
  exchangeRate DECIMAL(18,8) NOT NULL DEFAULT 1,
  usdAmount DECIMAL(18,4) NOT NULL DEFAULT 0,
  isPaid TINYINT(1) NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_po_settlement_invoices_project (projectId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_settlement_attachments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  projectId CHAR(36) NOT NULL,
  invoiceId CHAR(36) NULL,
  fileName VARCHAR(255) NOT NULL,
  fileType VARCHAR(255) NULL,
  fileSize BIGINT NOT NULL DEFAULT 0,
  dataUrl LONGTEXT NOT NULL,
  description VARCHAR(255) NULL,
  uploadedByUserId VARCHAR(80) NULL,
  uploadedByName VARCHAR(255) NULL,
  uploadedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_po_settlement_attachments_project (projectId),
  KEY idx_po_settlement_attachments_invoice (invoiceId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const cloudSchema = `
CREATE TABLE IF NOT EXISTS cloud_rows (
  id VARCHAR(128) NOT NULL PRIMARY KEY,
  importBatchId VARCHAR(80) NULL,
  period VARCHAR(16) NOT NULL,
  batchCode VARCHAR(100) NOT NULL,
  mappingId VARCHAR(80) NULL,
  supplierId VARCHAR(64) NULL,
  supplierName VARCHAR(255) NULL,
  undertakingUnitId VARCHAR(64) NULL,
  customerId VARCHAR(64) NULL,
  customer VARCHAR(255) NOT NULL,
  account VARCHAR(255) NOT NULL,
  owner VARCHAR(100) NULL,
  cloudReconciler VARCHAR(255) NULL,
  collectionEntity VARCHAR(255) NULL,
  catalogAmount DECIMAL(18,4) NOT NULL DEFAULT 0,
  partnerAmount DECIMAL(18,4) NULL,
  voucherCustomerAmount DECIMAL(18,4) NULL,
  voucherSupplierAmount DECIMAL(18,4) NULL,
  supplierPayablePayer VARCHAR(255) NULL,
  supplierPayablePayee VARCHAR(255) NULL,
  supplierPayableNetAmount DECIMAL(18,4) NULL,
  supplierTaxAmount DECIMAL(18,4) NULL,
  supplierPayableTotalAmount DECIMAL(18,4) NULL,
  supplierPayable DECIMAL(18,4) NOT NULL DEFAULT 0,
  supplierTaxRate DECIMAL(10,6) NOT NULL DEFAULT 0.160000,
  customerReceivablePayer VARCHAR(255) NULL,
  customerReceivablePayee VARCHAR(255) NULL,
  customerReceivableNetAmount DECIMAL(18,4) NULL,
  customerReceivableTaxAmount DECIMAL(18,4) NULL,
  customerReceivableTotalAmount DECIMAL(18,4) NULL,
  customerReceivable DECIMAL(18,4) NOT NULL DEFAULT 0,
  customerTaxRate DECIMAL(10,6) NULL,
  theoreticalGrossProfit DECIMAL(18,4) NULL,
  settlementGrossProfit DECIMAL(18,4) NULL,
  grossProfit DECIMAL(18,4) NOT NULL DEFAULT 0,
  calculationLogic VARCHAR(100) NULL,
  customerDiscount DECIMAL(10,6) NULL,
  remark TEXT NULL,
  collectionInvoice VARCHAR(20) NOT NULL DEFAULT 'not_issued',
  collected TINYINT(1) NOT NULL DEFAULT 0,
  confirmed TINYINT(1) NOT NULL DEFAULT 0,
  confirmedAt DATETIME NULL,
  paymentDate DATE NULL,
  collectionPayer VARCHAR(255) NULL,
  collectionPayee VARCHAR(255) NULL,
  collectionPayerCustomerId VARCHAR(64) NULL,
  collectionPayeeUndertakingUnitId VARCHAR(64) NULL,
  collectionCurrency VARCHAR(10) NULL,
  collectionExchangeRate DECIMAL(18,8) NULL,
  collectionNetAmount DECIMAL(18,4) NULL,
  collectionTaxRate DECIMAL(10,6) NULL,
  collectionTaxAmount DECIMAL(18,4) NULL,
  collectionTotalAmount DECIMAL(18,4) NULL,
  collectionDate DATE NULL,
  collectionRegisteredAt DATETIME NULL,
  collectionProofFile VARCHAR(255) NULL,
  invoiceFile VARCHAR(255) NULL,
  invoiceNo VARCHAR(100) NULL,
  invoiceCurrency VARCHAR(10) NULL,
  invoicePayer VARCHAR(255) NULL,
  invoicePayee VARCHAR(255) NULL,
  invoicePayerCustomerId VARCHAR(64) NULL,
  invoicePayeeUndertakingUnitId VARCHAR(64) NULL,
  invoiceNetAmount DECIMAL(18,4) NULL,
  invoiceTaxRate DECIMAL(10,6) NULL,
  invoiceTaxAmount DECIMAL(18,4) NULL,
  invoiceTotalAmount DECIMAL(18,4) NULL,
  invoiceExchangeRate DECIMAL(18,8) NULL,
  invoiceDate DATE NULL,
  createdByUserId VARCHAR(80) NULL,
  createdByName VARCHAR(255) NULL,
  updatedByUserId VARCHAR(80) NULL,
  updatedByName VARCHAR(255) NULL,
  confirmedByUserId VARCHAR(80) NULL,
  confirmedByName VARCHAR(255) NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cloud_rows_period (period, batchCode),
  KEY idx_cloud_rows_customer (customerId, account),
  KEY idx_cloud_rows_supplier (supplierId, period),
  KEY idx_cloud_rows_status (confirmed, collected, collectionInvoice)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cloud_mappings (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  supplierId VARCHAR(64) NOT NULL,
  supplierName VARCHAR(255) NOT NULL,
  undertakingUnitId VARCHAR(64) NOT NULL,
  undertakingUnitName VARCHAR(255) NOT NULL,
  customerId VARCHAR(64) NOT NULL,
  customerName VARCHAR(255) NOT NULL,
  reconciler VARCHAR(100) NOT NULL,
  calculationLogic VARCHAR(30) NOT NULL DEFAULT 'catalog',
  customCalculationLogic VARCHAR(255) NULL,
  userDiscount DECIMAL(10,6) NULL,
  remark TEXT NULL,
  createdByUserId VARCHAR(80) NULL,
  createdByName VARCHAR(255) NULL,
  updatedByUserId VARCHAR(80) NULL,
  updatedByName VARCHAR(255) NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cloud_mappings_customer (customerId),
  KEY idx_cloud_mappings_supplier (supplierId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cloud_mapping_accounts (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  mappingId VARCHAR(80) NOT NULL,
  account VARCHAR(255) NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cloud_mapping_account (mappingId, account),
  KEY idx_cloud_mapping_accounts_mapping (mappingId),
  KEY idx_cloud_mapping_accounts_account (account)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cloud_import_batches (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  batchCode VARCHAR(100) NOT NULL,
  period VARCHAR(16) NOT NULL,
  fileName VARCHAR(255) NOT NULL,
  rowCount INT NOT NULL DEFAULT 0,
  importedByUserId VARCHAR(80) NULL,
  importedByName VARCHAR(255) NULL,
  importedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cloud_import_batches_code (batchCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cloud_supplier_payments (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  period VARCHAR(16) NOT NULL,
  supplierId VARCHAR(64) NULL,
  supplierName VARCHAR(255) NOT NULL,
  payerUnitId VARCHAR(64) NULL,
  payerUnitName VARCHAR(255) NULL,
  currency VARCHAR(10) NULL,
  paymentExchangeRate DECIMAL(18,8) NULL,
  paymentNetAmount DECIMAL(18,4) NULL,
  paymentTaxRate DECIMAL(10,6) NULL,
  paymentTaxAmount DECIMAL(18,4) NULL,
  paymentTotalAmount DECIMAL(18,4) NULL,
  paymentDate DATE NULL,
  paymentRegisteredAt DATETIME NULL,
  invoiceNo VARCHAR(100) NULL,
  invoiceCurrency VARCHAR(10) NULL,
  invoiceExchangeRate DECIMAL(18,8) NULL,
  invoiceNetAmount DECIMAL(18,4) NULL,
  invoiceTaxRate DECIMAL(10,6) NULL,
  invoiceTaxAmount DECIMAL(18,4) NULL,
  invoiceTotalAmount DECIMAL(18,4) NULL,
  invoiceDate DATE NULL,
  invoiceStatus VARCHAR(20) NOT NULL DEFAULT 'not_issued',
  invoiceFile VARCHAR(255) NULL,
  paid TINYINT(1) NOT NULL DEFAULT 0,
  createdByUserId VARCHAR(80) NULL,
  createdByName VARCHAR(255) NULL,
  updatedByUserId VARCHAR(80) NULL,
  updatedByName VARCHAR(255) NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cloud_supplier_payment_period (period, supplierId),
  KEY idx_cloud_supplier_payment_status (period, paid, invoiceStatus)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cloud_attachments (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  ownerType VARCHAR(40) NOT NULL,
  ownerId VARCHAR(128) NOT NULL,
  fileName VARCHAR(255) NOT NULL,
  fileType VARCHAR(255) NULL,
  fileSize BIGINT NOT NULL DEFAULT 0,
  dataUrl LONGTEXT NOT NULL,
  uploadedByUserId VARCHAR(80) NULL,
  uploadedByName VARCHAR(255) NULL,
  uploadedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cloud_attachments_owner (ownerType, ownerId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_tariff_rates (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  deviceType VARCHAR(255) NOT NULL,
  hsCode VARCHAR(100) NOT NULL,
  taxRate DECIMAL(10,6) NOT NULL DEFAULT 0,
  needNom TINYINT(1) NOT NULL DEFAULT 0,
  remark VARCHAR(500) NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_po_tariff_rate_device_hs (deviceType, hsCode),
  KEY idx_po_tariff_rates_hs (hsCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS po_customer_product_aliases (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  customerId VARCHAR(64) NOT NULL,
  customerName VARCHAR(255) NOT NULL,
  customerSku VARCHAR(100) NULL,
  customerProductName VARCHAR(255) NOT NULL,
  customerSpec VARCHAR(255) NULL,
  customerBrand VARCHAR(255) NULL,
  productId VARCHAR(80) NULL,
  productCode VARCHAR(100) NOT NULL,
  productName VARCHAR(255) NOT NULL,
  productMasterId VARCHAR(80) NULL,
  productModelId VARCHAR(80) NULL,
  productSpecId VARCHAR(80) NULL,
  specificationKey VARCHAR(255) NULL,
  specificationName VARCHAR(255) NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_po_customer_alias_lookup (customerId, customerSku, customerProductName)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

function createPasswordSalt() {
  return randomBytes(16).toString("hex");
}

function hashPassword(password, salt) {
  return pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
}

async function ensureColumn(tableName, columnName, definition) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count
       FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
    [database, tableName, columnName],
  );
  if (Number(rows[0]?.count ?? 0) === 0) {
    await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  }
}

async function hasColumn(tableName, columnName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count
       FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
    [database, tableName, columnName],
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function hasIndex(tableName, indexName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count
       FROM information_schema.statistics
      WHERE table_schema = ? AND table_name = ? AND index_name = ?`,
    [database, tableName, indexName],
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function dropColumn(tableName, columnName, dependentIndexName) {
  if (!(await hasColumn(tableName, columnName))) return;
  if (dependentIndexName && await hasIndex(tableName, dependentIndexName)) {
    await connection.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${dependentIndexName}\``);
  }
  await connection.query(`ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``);
}

const adminSalt = createPasswordSalt();
const adminPassword = process.env.ADMIN_INITIAL_PASSWORD ?? "admin@luzcorp.com";
const adminHash = hashPassword(adminPassword, adminSalt);

const demandPlanTextColumns = {
  power_purchaseordersnitems: [
    "sn", "fixedAssetCode", "poNo", "materialDescription", "shippingBatch", "parentAssetNo",
    "componentCategory", "packingListNo", "parentCode", "finalParentCode", "supplierFinalParentCode",
    "deviceVendor", "childSparePartCode", "childTopSn", "supplierParentSn", "supplierChildComponentCode",
    "supplierParentCode", "customerChildComponentCode", "customerChildComponentOriginalSn", "rackUnit",
    "finalParentSn", "finalParentPnDescription", "childComponentDescription", "finalParentPn",
    "childComponentOriginalSn", "childComponentOriginalPn", "supplierChildComponentDescription", "site",
    "contactPhone", "rowId", "tenantId", "template", "version", "businessFlowId", "coreDocument",
    "processName", "processVersion", "upstreamDocumentId", "upstreamDocumentItemId", "upstreamDocumentType",
    "businessFlowInstanceId", "sourceId",
  ],
  power_purchaseorderplanitems: [
    "sourcePlanId", "material", "materialName", "formFactor", "unit", "batch", "sn", "remark", "templateIdentifier",
    "poStatus", "rowId", "headerId", "slMaterialCode", "codeDescription", "modelType", "productName",
    "belongingModelName", "cabinetNodeCode", "atpOrder", "orderPriority", "datacenterOwner",
    "documentNoDescription", "computeMode", "productType", "category", "dataCenter", "customizationFlag",
    "supplyType", "supplyInformation", "deliveryContact", "deliveryContactPhone", "computeSupplier",
    "country", "province", "procurementFulfillmentManager", "supplierCode", "odmSupplierCodeV", "batchNo",
    "city", "deliveryAddress", "urgentOrder", "waybillNo", "logisticsCurrentStatus",
    "supplierUnsatisfiedExplanation", "firstDeliveryFailureReason", "productionProgress",
    "purchaseOrderItemRelation", "transportMode", "purchaseOrderNo", "fulfillmentUnit", "odmSupplierCode",
    "odmSupplierName", "tenantId", "template", "version", "businessFlowId", "coreDocument", "logisticsName",
    "processVersion", "upstreamDocumentItemId", "upstreamDocumentType", "businessFlowInstanceId",
  ],
};
const demandPlanDatetimeColumns = {
  power_purchaseordersnitems: ["timestamp"],
  power_purchaseorderplanitems: [
    "wholeMachineSupplierPoActivatedAt", "quoteReceivedAt", "poIssuedAt", "wholeMachineSupplierPoConfirmedAt",
    "receiptProofUploadedAt", "logisticsReceivedAt", "ataAt", "supplierCpd", "requestedAt", "supplyDate",
    "dssEpd", "crd", "rsd", "rpd", "cpd", "esd", "eta", "logisticsArrivalTransferAt", "firstDeliveryAt",
    "apd", "asd", "computeSupplierInstructionReceivedAt", "supplierFeedbackEsd", "supplierFeedbackEta",
    "apdAt", "asdAt", "rsd2", "supplierPoActivatedAt", "timestamp",
  ],
};
const demandPlanNumberColumns = {
  power_purchaseordersnitems: [],
  power_purchaseorderplanitems: [
    "requestedQuantity", "shippedQuantity", "pendingShipmentQuantity", "shippedTotalQuantity",
    "totalModelQuantity", "matchedQuantity", "price", "weight", "volume", "pieceCount",
    "originalRequestedQuantity",
  ],
};

async function ensureDemandPlanColumns() {
  for (const [tableName, columns] of Object.entries(demandPlanTextColumns)) {
    for (const columnName of columns) await ensureColumn(tableName, columnName, "TEXT NULL");
  }
  for (const [tableName, columns] of Object.entries(demandPlanDatetimeColumns)) {
    for (const columnName of columns) await ensureColumn(tableName, columnName, "DATETIME NULL");
  }
  for (const [tableName, columns] of Object.entries(demandPlanNumberColumns)) {
    for (const columnName of columns) await ensureColumn(tableName, columnName, "DECIMAL(18, 4) NULL");
  }
}

const cloudRowColumns = [
  ["cloudReconciler", "VARCHAR(255) NULL"],
  ["voucherCustomerAmount", "DECIMAL(18,4) NULL"],
  ["voucherSupplierAmount", "DECIMAL(18,4) NULL"],
  ["supplierPayablePayer", "VARCHAR(255) NULL"],
  ["supplierPayablePayee", "VARCHAR(255) NULL"],
  ["collectionPayerCustomerId", "VARCHAR(64) NULL"],
  ["collectionPayeeUndertakingUnitId", "VARCHAR(64) NULL"],
  ["supplierPayableNetAmount", "DECIMAL(18,4) NULL"],
  ["supplierTaxAmount", "DECIMAL(18,4) NULL"],
  ["supplierPayableTotalAmount", "DECIMAL(18,4) NULL"],
  ["customerReceivablePayer", "VARCHAR(255) NULL"],
  ["customerReceivablePayee", "VARCHAR(255) NULL"],
  ["customerReceivableNetAmount", "DECIMAL(18,4) NULL"],
  ["customerReceivableTaxAmount", "DECIMAL(18,4) NULL"],
  ["customerReceivableTotalAmount", "DECIMAL(18,4) NULL"],
  ["theoreticalGrossProfit", "DECIMAL(18,4) NULL"],
  ["settlementGrossProfit", "DECIMAL(18,4) NULL"],
  ["invoiceNo", "VARCHAR(100) NULL"],
  ["invoiceCurrency", "VARCHAR(10) NULL"],
  ["invoicePayer", "VARCHAR(255) NULL"],
  ["invoicePayee", "VARCHAR(255) NULL"],
  ["invoicePayerCustomerId", "VARCHAR(64) NULL"],
  ["invoicePayeeUndertakingUnitId", "VARCHAR(64) NULL"],
  ["invoiceNetAmount", "DECIMAL(18,4) NULL"],
  ["invoiceTaxRate", "DECIMAL(10,6) NULL"],
  ["invoiceTaxAmount", "DECIMAL(18,4) NULL"],
  ["invoiceTotalAmount", "DECIMAL(18,4) NULL"],
  ["invoiceExchangeRate", "DECIMAL(18,8) NULL"],
  ["invoiceDate", "DATE NULL"],
];

async function ensureCloudRowColumns() {
  for (const [columnName, definition] of cloudRowColumns) await ensureColumn("cloud_rows", columnName, definition);
  for (const columnName of [
    "collectionSupplier", "collectionSupplierName", "collectionCustomer", "collectionCustomerName", "collectionUndertakingUnit", "collectionUndertakingUnitName",
    "invoiceSupplier", "invoiceSupplierName", "invoiceCustomer", "invoiceCustomerName", "invoiceUndertakingUnit", "invoiceUndertakingUnitName",
  ]) await dropColumn("cloud_rows", columnName);
}

async function ensureCloudSupplierPaymentColumns() {
  for (const [columnName, definition] of [
    ["invoiceNo", "VARCHAR(100) NULL"],
    ["invoiceCurrency", "VARCHAR(10) NULL"],
    ["invoiceExchangeRate", "DECIMAL(18,8) NULL"],
    ["invoiceNetAmount", "DECIMAL(18,4) NULL"],
    ["invoiceTaxRate", "DECIMAL(10,6) NULL"],
    ["invoiceTaxAmount", "DECIMAL(18,4) NULL"],
    ["invoiceTotalAmount", "DECIMAL(18,4) NULL"],
    ["invoiceDate", "DATE NULL"],
  ]) await ensureColumn("cloud_supplier_payments", columnName, definition);
}

try {
  const powerSchema = (await fs.readFile(new URL("../schema.sql", import.meta.url), "utf8"))
    .replaceAll("`suanli`", `\`${database}\``)
    .replace(
      /(`deviceCode` VARCHAR\(64\) NULL COMMENT 'device code',\r?\n\s+)`requestType` VARCHAR\(64\) NULL COMMENT 'whole machine\/spare parts snapshot',(\r?\n\s+`modelCode` VARCHAR\(128\) NULL COMMENT 'model code',)/,
      "$1$2",
    );
  await connection.query(powerSchema);
  await ensureDemandPlanColumns();
  for (const tableName of ["power_requests", "power_purchaseorders"]) {
    for (const [columnName, definition] of [
      ["createdByUserId", "VARCHAR(80) NULL"],
      ["createdByName", "VARCHAR(255) NULL"],
      ["updatedByUserId", "VARCHAR(80) NULL"],
      ["updatedByName", "VARCHAR(255) NULL"],
      ["confirmedByUserId", "VARCHAR(80) NULL"],
      ["confirmedByName", "VARCHAR(255) NULL"],
    ]) {
      await ensureColumn(tableName, columnName, definition);
    }
  }
  await connection.query(commonSchema);
  for (const [columnName, definition] of [
    ["entityCode", "VARCHAR(100) NULL"],
    ["entityName", "VARCHAR(255) NULL"],
  ]) {
    await ensureColumn("common_undertaking_units", columnName, definition);
  }
  await ensureColumn("common_customers", "businessTypes", "TEXT NULL");
  await ensureColumn("common_customers", "city", "VARCHAR(100) NULL");
  await ensureColumn("common_customers", "cooperationStatus", "VARCHAR(30) NOT NULL DEFAULT 'not_cooperated'");
  await ensureColumn("common_customers", "website", "VARCHAR(500) NULL");
  await ensureColumn("common_undertaking_units", "cooperationStatus", "VARCHAR(30) NOT NULL DEFAULT 'not_cooperated'");
  await ensureColumn("common_undertaking_units", "website", "VARCHAR(500) NULL");
  for (const [tableName, indexName] of [
    ["common_customer_contacts", "idx_common_customer_contacts_customer"],
    ["common_customer_bank_accounts", "idx_common_customer_accounts_customer"],
    ["common_supplier_contacts", "idx_common_supplier_contacts_supplier"],
    ["common_supplier_bank_accounts", "idx_common_supplier_accounts_supplier"],
    ["common_undertaking_unit_contacts", "idx_common_undertaking_contacts_unit"],
    ["common_undertaking_unit_bank_accounts", "idx_common_undertaking_accounts_unit"],
  ]) {
    if (await hasIndex(tableName, indexName)) {
      await connection.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\``);
    }
  }
  for (const tableName of [
    "common_customer_contacts",
    "common_customer_bank_accounts",
    "common_supplier_contacts",
    "common_supplier_bank_accounts",
    "common_undertaking_unit_contacts",
    "common_undertaking_unit_bank_accounts",
  ]) {
    await dropColumn(tableName, "sortOrder");
    const ownerColumn = tableName.includes("customer") ? "customerId" : tableName.includes("supplier") ? "supplierId" : "undertakingUnitId";
    const indexName = tableName.includes("customer")
      ? `${tableName.includes("contacts") ? "idx_common_customer_contacts_customer" : "idx_common_customer_accounts_customer"}`
      : tableName.includes("supplier")
        ? `${tableName.includes("contacts") ? "idx_common_supplier_contacts_supplier" : "idx_common_supplier_accounts_supplier"}`
        : `${tableName.includes("contacts") ? "idx_common_undertaking_contacts_unit" : "idx_common_undertaking_accounts_unit"}`;
    if (!(await hasIndex(tableName, indexName))) {
      await connection.query(`ALTER TABLE \`${tableName}\` ADD KEY \`${indexName}\` (\`${ownerColumn}\`)`);
    }
  }
  await dropColumn("common_customers", "postalCode");
  await connection.query(settlementSchema);
  await connection.query(cloudSchema);
  await ensureCloudRowColumns();
  await ensureCloudSupplierPaymentColumns();
  await connection.execute(
    `INSERT IGNORE INTO common_users
      (userId, displayName, email, passwordHash, passwordSalt, role, status)
     VALUES (?, ?, ?, ?, ?, 'admin', 'active')`,
    ["admin", "管理员", "admin@luzcorp.com", adminHash, adminSalt],
  );
  await connection.execute(
    `INSERT IGNORE INTO common_modules
      (moduleKey, moduleName, domainKey, route, sortOrder, enabled, adminOnly, remark)
     VALUES
      ('domain-power', '算力交付', 'power', '/', 10, 1, 0, '算力交付一级目录'),
      ('domain-po', '集采系统', 'po', NULL, 20, 1, 0, '集采系统一级目录'),
      ('domain-cloud', '华为云服务', 'cloud', NULL, 30, 1, 0, '华为云服务一级目录')`,
  );
  console.log(`Merge schema initialized in database '${database}'.`);
} finally {
  await connection.end();
}
