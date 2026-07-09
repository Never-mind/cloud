CREATE DATABASE IF NOT EXISTS `suanli`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `suanli`;

CREATE TABLE IF NOT EXISTS `Countries` (
  `code` VARCHAR(32) NOT NULL COMMENT 'country code PK',
  `nameZh` VARCHAR(255) NULL COMMENT 'country name zh',
  `nameEn` VARCHAR(255) NULL COMMENT 'country name en',
  `nameLocal` VARCHAR(255) NULL COMMENT 'country name local',
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Countries';

CREATE TABLE IF NOT EXISTS `DeliveryLocations` (
  `locationId` VARCHAR(64) NOT NULL COMMENT 'location id PK',
  `countryCode` VARCHAR(32) NOT NULL COMMENT 'country code',
  `locationType` VARCHAR(64) NULL COMMENT 'Datacenter/Warehouse/Office/Broker',
  `nameZh` VARCHAR(255) NULL COMMENT 'location name zh',
  `nameEn` VARCHAR(255) NULL COMMENT 'location name en',
  `fullAddress` TEXT NULL COMMENT 'full delivery address',
  PRIMARY KEY (`locationId`),
  KEY `idx_DeliveryLocations_countryCode` (`countryCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='DeliveryLocations';

CREATE TABLE IF NOT EXISTS `DeliveryContacts` (
  `contactId` VARCHAR(64) NOT NULL COMMENT 'contact id PK',
  `locationId` VARCHAR(64) NOT NULL COMMENT 'default location id',
  `name` VARCHAR(255) NULL COMMENT 'name',
  `phone` VARCHAR(64) NULL COMMENT 'phone',
  `email` VARCHAR(255) NULL COMMENT 'email',
  PRIMARY KEY (`contactId`),
  KEY `idx_DeliveryContacts_locationId` (`locationId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='DeliveryContacts';

CREATE TABLE IF NOT EXISTS `Datacenters` (
  `dcCode` VARCHAR(64) NOT NULL COMMENT 'datacenter code PK',
  `locationId` VARCHAR(64) NOT NULL COMMENT 'physical location id',
  `nameZh` VARCHAR(255) NULL COMMENT 'datacenter name zh',
  `nameEn` VARCHAR(255) NULL COMMENT 'datacenter name en',
  PRIMARY KEY (`dcCode`),
  UNIQUE KEY `uk_Datacenters_locationId` (`locationId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Datacenters';

CREATE TABLE IF NOT EXISTS `InstanceModels` (
  `deviceCode` VARCHAR(64) NOT NULL COMMENT 'device code PK',
  `modelCode` VARCHAR(128) NOT NULL COMMENT 'model code UK',
  `xxllCode` VARCHAR(128) NULL COMMENT 'xxll code',
  `nameZh` VARCHAR(255) NULL COMMENT 'instance model name zh',
  `nameEn` VARCHAR(255) NULL COMMENT 'instance model name en',
  PRIMARY KEY (`deviceCode`),
  UNIQUE KEY `uk_InstanceModels_modelCode` (`modelCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='InstanceModels';

CREATE TABLE IF NOT EXISTS `Suppliers` (
  `supplierId` VARCHAR(64) NOT NULL COMMENT 'supplier id PK',
  `supplierCode` VARCHAR(128) NOT NULL COMMENT 'ODM supplier code UK',
  `name` VARCHAR(255) NULL COMMENT 'name',
  PRIMARY KEY (`supplierId`),
  UNIQUE KEY `uk_Suppliers_supplierCode` (`supplierCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Suppliers';

CREATE TABLE IF NOT EXISTS `InstanceContracts` (
  `id` VARCHAR(128) NOT NULL COMMENT 'PK',
  `contractNo` VARCHAR(128) NOT NULL COMMENT 'contract no',
  `countryCode` VARCHAR(32) NOT NULL COMMENT 'country code',
  `deviceCode` VARCHAR(64) NULL COMMENT 'device code',
  `modelCode` VARCHAR(128) NULL COMMENT 'model code',
  `instanceModelEn` VARCHAR(255) NULL COMMENT 'instance model english name',
  `currency` VARCHAR(16) NULL COMMENT 'currency',
  `first24MonthPriceUSD` DECIMAL(18, 4) NULL COMMENT 'first 24 month tax included unit price',
  `next36MonthPriceUSD` DECIMAL(18, 4) NULL COMMENT 'next 36 month tax included unit price',
  `dateSigned` DATE NULL COMMENT 'date signed',
  `status` VARCHAR(64) NULL COMMENT 'contract status',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_InstanceContracts_contract_country_device` (`contractNo`, `countryCode`, `deviceCode`),
  KEY `idx_InstanceContracts_contractNo` (`contractNo`),
  KEY `idx_InstanceContracts_countryCode` (`countryCode`),
  KEY `idx_InstanceContracts_deviceCode` (`deviceCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='InstanceContracts';

CREATE TABLE IF NOT EXISTS `ContractItems` (
  `id` VARCHAR(64) NOT NULL COMMENT 'PK',
  `contractNo` VARCHAR(128) NOT NULL COMMENT 'contract no',
  `deviceCode` VARCHAR(64) NOT NULL COMMENT 'device code',
  `basePrice` DECIMAL(18, 4) NULL COMMENT 'contract base price',
  `currency` VARCHAR(16) NULL COMMENT 'currency',
  PRIMARY KEY (`id`),
  KEY `idx_ContractItems_contractNo` (`contractNo`),
  KEY `idx_ContractItems_deviceCode` (`deviceCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ContractItems';

CREATE TABLE IF NOT EXISTS `Requests` (
  `requestNo` VARCHAR(128) NOT NULL COMMENT 'request no PK',
  `countryCode` VARCHAR(32) NULL COMMENT 'country code',
  `contractNo` VARCHAR(128) NOT NULL COMMENT 'instance contract no',
  `batchName` VARCHAR(255) NULL COMMENT 'batch name',
  `requestType` VARCHAR(64) NULL COMMENT 'whole machine/spare parts',
  `status` VARCHAR(64) NULL COMMENT 'request status',
  `plannedDeliveryDate` DATE NULL COMMENT 'planned delivery date',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`requestNo`),
  KEY `idx_Requests_contractNo` (`contractNo`),
  KEY `idx_Requests_countryCode` (`countryCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Requests';

CREATE TABLE IF NOT EXISTS `RequestItems` (
  `id` VARCHAR(64) NOT NULL COMMENT 'PK',
  `requestNo` VARCHAR(128) NOT NULL COMMENT 'request no',
  `deviceCode` VARCHAR(64) NOT NULL COMMENT 'device code',
  `supplierId` VARCHAR(64) NOT NULL COMMENT 'supplier id',
  `requestedAt` DATE NULL COMMENT 'requested date',
  `quantity` INT NOT NULL DEFAULT 0 COMMENT 'device node quantity',
  PRIMARY KEY (`id`),
  KEY `idx_RequestItems_requestNo` (`requestNo`),
  KEY `idx_RequestItems_deviceCode` (`deviceCode`),
  KEY `idx_RequestItems_supplierId` (`supplierId`),
  CONSTRAINT `chk_RequestItems_quantity_nonnegative` CHECK (`quantity` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RequestItems';

CREATE TABLE IF NOT EXISTS `PurchaseOrders` (
  `poNo` VARCHAR(128) NOT NULL COMMENT 'PO no PK',
  `requestNo` VARCHAR(128) NULL COMMENT 'source request no',
  `status` VARCHAR(64) NOT NULL DEFAULT '草稿' COMMENT 'purchase status',
  `currency` VARCHAR(16) NULL COMMENT 'currency',
  `usdRate` DECIMAL(18, 8) NULL COMMENT 'USD rate',
  `paymentDate` DATE NULL COMMENT 'supplier payment date',
  `releasedAt` DATE NULL COMMENT 'PO release date',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`poNo`),
  KEY `idx_PurchaseOrders_requestNo` (`requestNo`),
  KEY `idx_PurchaseOrders_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PurchaseOrders';

CREATE TABLE IF NOT EXISTS `PurchaseOrderItems` (
  `id` VARCHAR(64) NOT NULL COMMENT 'PK',
  `poNo` VARCHAR(128) NOT NULL COMMENT 'PO no',
  `requestItemId` VARCHAR(64) NOT NULL COMMENT 'request item id',
  `unitPrice` DECIMAL(18, 4) NULL COMMENT 'unit price',
  `hardwareCoefficient` DECIMAL(18, 6) NULL COMMENT 'hardware coefficient',
  `softwareCoefficient` DECIMAL(18, 6) NULL COMMENT 'software coefficient',
  `totalCoefficient` DECIMAL(18, 6) NULL COMMENT 'total coefficient',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_PurchaseOrderItems_requestItemId` (`requestItemId`),
  KEY `idx_PurchaseOrderItems_poNo` (`poNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PurchaseOrderItems';

CREATE TABLE IF NOT EXISTS `PrepaymentContracts` (
  `contractNo` VARCHAR(128) NOT NULL COMMENT 'contract no PK',
  `status` VARCHAR(64) NOT NULL DEFAULT '草稿' COMMENT 'prepayment contract status',
  `currency` VARCHAR(16) NULL COMMENT 'contract currency',
  `effectiveDate` DATE NULL COMMENT 'effective date',
  `totalAmount` DECIMAL(18, 4) NULL COMMENT 'contract total amount',
  `confirmedAt` DATETIME NULL COMMENT 'confirmed time',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`contractNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PrepaymentContracts';

CREATE TABLE IF NOT EXISTS `PrepaymentContractItems` (
  `id` VARCHAR(64) NOT NULL COMMENT 'PK',
  `contractNo` VARCHAR(128) NOT NULL COMMENT 'prepayment contract no',
  `lineType` VARCHAR(32) NOT NULL DEFAULT 'instance' COMMENT 'instance/fee',
  `purchaseOrderItemId` VARCHAR(64) NULL COMMENT 'purchase order item id',
  `requestItemId` VARCHAR(64) NULL COMMENT 'request item id',
  `countryCode` VARCHAR(32) NULL COMMENT 'country code',
  `batchName` VARCHAR(255) NULL COMMENT 'batch name',
  `requestNo` VARCHAR(128) NULL COMMENT 'request no',
  `poNo` VARCHAR(128) NULL COMMENT 'PO no',
  `deviceCode` VARCHAR(64) NULL COMMENT 'device code',
  `modelCode` VARCHAR(128) NULL COMMENT 'model code',
  `nameEn` VARCHAR(255) NULL COMMENT 'instance english name',
  `quantity` INT NULL COMMENT 'quantity',
  `actualCurrency` VARCHAR(16) NULL COMMENT 'actual currency',
  `actualUnitPrice` DECIMAL(18, 4) NULL COMMENT 'actual unit price',
  `actualTotalAmount` DECIMAL(18, 4) NULL COMMENT 'actual total amount',
  `contractCurrency` VARCHAR(16) NULL COMMENT 'contract currency',
  `contractUnitPrice` DECIMAL(18, 4) NULL COMMENT 'contract unit price',
  `contractTotalAmount` DECIMAL(18, 4) NULL COMMENT 'contract total amount',
  `writeOffStartMonth` DATE NULL COMMENT 'write-off start month',
  `feeName` VARCHAR(255) NULL COMMENT 'fee name',
  `feeDescription` TEXT NULL COMMENT 'fee description',
  `prepaymentAmount` DECIMAL(18, 4) NULL COMMENT 'prepayment amount',
  `currency` VARCHAR(16) NULL COMMENT 'currency',
  `usdRate` DECIMAL(18, 8) NULL COMMENT 'USD rate',
  `paymentDate` DATE NULL COMMENT 'contract payment date',
  PRIMARY KEY (`id`),
  KEY `idx_PrepaymentContractItems_contractNo` (`contractNo`),
  KEY `idx_PrepaymentContractItems_purchaseOrderItemId` (`purchaseOrderItemId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PrepaymentContractItems';

CREATE TABLE IF NOT EXISTS `MonthlyPrepaymentWriteOffs` (
  `id` VARCHAR(96) NOT NULL COMMENT 'monthly write-off id',
  `contractNo` VARCHAR(128) NOT NULL COMMENT 'prepayment contract no',
  `contractLineId` VARCHAR(64) NOT NULL COMMENT 'prepayment contract line id',
  `writeOffMonth` DATE NOT NULL COMMENT 'write-off month first day',
  `monthIndex` INT NOT NULL COMMENT 'month index',
  `totalMonths` INT NOT NULL COMMENT 'total months',
  `currency` VARCHAR(16) NULL COMMENT 'currency',
  `originalAmount` DECIMAL(18, 4) NULL COMMENT 'original amount',
  `monthlyAmount` DECIMAL(18, 4) NULL COMMENT 'monthly write-off amount',
  `lineType` VARCHAR(32) NULL COMMENT 'instance/fee',
  `countryCode` VARCHAR(32) NULL COMMENT 'country code',
  `batchName` VARCHAR(255) NULL COMMENT 'batch name',
  `requestNo` VARCHAR(128) NULL COMMENT 'request no',
  `poNo` VARCHAR(128) NULL COMMENT 'PO no',
  `deviceCode` VARCHAR(64) NULL COMMENT 'device code',
  `modelCode` VARCHAR(128) NULL COMMENT 'model code',
  `nameEn` VARCHAR(255) NULL COMMENT 'instance english name',
  `quantity` INT NULL COMMENT 'quantity',
  `sourceType` VARCHAR(64) NULL COMMENT 'source type',
  `adjustmentNo` VARCHAR(128) NULL COMMENT 'adjustment no',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  PRIMARY KEY (`id`),
  KEY `idx_MonthlyPrepaymentWriteOffs_contractNo` (`contractNo`),
  KEY `idx_MonthlyPrepaymentWriteOffs_writeOffMonth` (`writeOffMonth`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MonthlyPrepaymentWriteOffs';

CREATE TABLE IF NOT EXISTS `PrepaymentWriteOffAdjustments` (
  `adjustmentNo` VARCHAR(128) NOT NULL COMMENT 'adjustment no',
  `status` VARCHAR(64) NOT NULL DEFAULT '草稿' COMMENT 'adjustment status',
  `countryCode` VARCHAR(32) NULL COMMENT 'country code',
  `batchName` VARCHAR(255) NULL COMMENT 'batch name',
  `contractNo` VARCHAR(128) NULL COMMENT 'prepayment contract no',
  `itemCount` INT NOT NULL DEFAULT 0 COMMENT 'item count',
  `differenceTotal` DECIMAL(18, 4) NULL COMMENT 'difference total',
  `reason` TEXT NULL COMMENT 'adjustment reason',
  `confirmedAt` DATETIME NULL COMMENT 'confirmed time',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`adjustmentNo`),
  KEY `idx_PrepaymentWriteOffAdjustments_status` (`status`),
  KEY `idx_PrepaymentWriteOffAdjustments_contractNo` (`contractNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PrepaymentWriteOffAdjustments';

CREATE TABLE IF NOT EXISTS `PrepaymentWriteOffAdjustmentItems` (
  `id` VARCHAR(160) NOT NULL COMMENT 'adjustment item id',
  `adjustmentNo` VARCHAR(128) NOT NULL COMMENT 'adjustment no',
  `monthlyWriteOffId` VARCHAR(96) NOT NULL COMMENT 'monthly write-off id',
  `contractNo` VARCHAR(128) NULL COMMENT 'prepayment contract no',
  `contractLineId` VARCHAR(64) NULL COMMENT 'prepayment contract line id',
  `writeOffMonth` DATE NULL COMMENT 'write-off month',
  `countryCode` VARCHAR(32) NULL COMMENT 'country code',
  `batchName` VARCHAR(255) NULL COMMENT 'batch name',
  `requestNo` VARCHAR(128) NULL COMMENT 'request no',
  `poNo` VARCHAR(128) NULL COMMENT 'PO no',
  `deviceCode` VARCHAR(64) NULL COMMENT 'device code',
  `modelCode` VARCHAR(128) NULL COMMENT 'model code',
  `nameEn` VARCHAR(255) NULL COMMENT 'instance english name',
  `quantity` INT NULL COMMENT 'quantity',
  `currency` VARCHAR(16) NULL COMMENT 'currency',
  `originalMonthlyAmount` DECIMAL(18, 4) NULL COMMENT 'original monthly amount',
  `adjustedMonthlyAmount` DECIMAL(18, 4) NULL COMMENT 'adjusted monthly amount',
  `differenceAmount` DECIMAL(18, 4) NULL COMMENT 'difference amount',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  PRIMARY KEY (`id`),
  KEY `idx_PrepaymentWriteOffAdjustmentItems_adjustmentNo` (`adjustmentNo`),
  KEY `idx_PrepaymentWriteOffAdjustmentItems_monthlyWriteOffId` (`monthlyWriteOffId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PrepaymentWriteOffAdjustmentItems';

CREATE TABLE IF NOT EXISTS `BillingInstanceLedgers` (
  `ledgerId` VARCHAR(96) NOT NULL COMMENT 'billing ledger id',
  `purchaseOrderItemId` VARCHAR(64) NOT NULL COMMENT 'purchase order item id',
  `countryCode` VARCHAR(32) NULL COMMENT 'country code',
  `batchName` VARCHAR(255) NULL COMMENT 'batch name',
  `requestNo` VARCHAR(128) NULL COMMENT 'request no',
  `poNo` VARCHAR(128) NULL COMMENT 'PO no',
  `deviceCode` VARCHAR(64) NULL COMMENT 'device code',
  `modelCode` VARCHAR(128) NULL COMMENT 'model code',
  `nameEn` VARCHAR(255) NULL COMMENT 'instance english name',
  `quantity` INT NULL COMMENT 'quantity',
  `actualCurrency` VARCHAR(16) NULL COMMENT 'actual currency',
  `actualUnitPrice` DECIMAL(18, 4) NULL COMMENT 'actual unit price',
  `instanceContractNo` VARCHAR(128) NULL COMMENT 'locked instance contract no',
  `contractCurrency` VARCHAR(16) NULL COMMENT 'contract currency',
  `first24MonthPrice` DECIMAL(18, 4) NULL COMMENT 'first 24 month price',
  `next36MonthPrice` DECIMAL(18, 4) NULL COMMENT 'next 36 month price',
  `startMonth` DATE NULL COMMENT 'billing start month',
  `status` VARCHAR(64) NOT NULL DEFAULT '核销中' COMMENT 'billing status',
  `confirmedAt` DATETIME NULL COMMENT 'confirmed time',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`ledgerId`),
  UNIQUE KEY `uk_BillingInstanceLedgers_purchaseOrderItemId` (`purchaseOrderItemId`),
  KEY `idx_BillingInstanceLedgers_requestNo` (`requestNo`),
  KEY `idx_BillingInstanceLedgers_deviceCode` (`deviceCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BillingInstanceLedgers';

CREATE TABLE IF NOT EXISTS `MonthlyBillingWriteOffs` (
  `id` VARCHAR(112) NOT NULL COMMENT 'monthly billing write-off id',
  `ledgerId` VARCHAR(96) NOT NULL COMMENT 'billing ledger id',
  `writeOffMonth` DATE NOT NULL COMMENT 'write-off month first day',
  `monthIndex` INT NOT NULL COMMENT 'month index',
  `stage` VARCHAR(32) NULL COMMENT 'first24/next36 stage',
  `countryCode` VARCHAR(32) NULL COMMENT 'country code',
  `batchName` VARCHAR(255) NULL COMMENT 'batch name',
  `requestNo` VARCHAR(128) NULL COMMENT 'request no',
  `poNo` VARCHAR(128) NULL COMMENT 'PO no',
  `deviceCode` VARCHAR(64) NULL COMMENT 'device code',
  `modelCode` VARCHAR(128) NULL COMMENT 'model code',
  `nameEn` VARCHAR(255) NULL COMMENT 'instance english name',
  `quantity` INT NULL COMMENT 'quantity',
  `instanceContractNo` VARCHAR(128) NULL COMMENT 'instance contract no',
  `currency` VARCHAR(16) NULL COMMENT 'currency',
  `monthlyAmount` DECIMAL(18, 4) NULL COMMENT 'monthly amount',
  `monthlyTotalAmount` DECIMAL(18, 4) NULL COMMENT 'monthly total amount',
  `sourceType` VARCHAR(32) NULL COMMENT 'initial/adjustment',
  `adjustmentNo` VARCHAR(128) NULL COMMENT 'adjustment no',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  PRIMARY KEY (`id`),
  KEY `idx_MonthlyBillingWriteOffs_ledgerId` (`ledgerId`),
  KEY `idx_MonthlyBillingWriteOffs_writeOffMonth` (`writeOffMonth`),
  KEY `idx_MonthlyBillingWriteOffs_adjustmentNo` (`adjustmentNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MonthlyBillingWriteOffs';

CREATE TABLE IF NOT EXISTS `BillingAdjustments` (
  `adjustmentNo` VARCHAR(128) NOT NULL COMMENT 'adjustment no',
  `instanceContractNo` VARCHAR(128) NULL COMMENT 'adjustment instance contract no',
  `status` VARCHAR(64) NOT NULL DEFAULT '草稿' COMMENT 'adjustment status',
  `itemCount` INT NOT NULL DEFAULT 0 COMMENT 'item count',
  `countryCode` VARCHAR(32) NULL COMMENT 'country code',
  `batchName` VARCHAR(255) NULL COMMENT 'batch name',
  `deviceCode` VARCHAR(64) NULL COMMENT 'device code',
  `currency` VARCHAR(16) NOT NULL DEFAULT 'USD' COMMENT 'currency',
  `effectiveMonth` DATE NULL COMMENT 'effective month',
  `adjustedFirst24MonthPrice` DECIMAL(18, 4) NULL COMMENT 'adjusted first 24 month price',
  `adjustedNext36MonthPrice` DECIMAL(18, 4) NULL COMMENT 'adjusted next 36 month price',
  `reason` TEXT NULL COMMENT 'adjustment reason',
  `confirmedAt` DATETIME NULL COMMENT 'confirmed time',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`adjustmentNo`),
  KEY `idx_BillingAdjustments_instanceContractNo` (`instanceContractNo`),
  KEY `idx_BillingAdjustments_target` (`countryCode`, `batchName`, `deviceCode`),
  KEY `idx_BillingAdjustments_effectiveMonth` (`effectiveMonth`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BillingAdjustments';

CREATE TABLE IF NOT EXISTS `BillingAdjustmentItems` (
  `id` VARCHAR(160) NOT NULL COMMENT 'adjustment item id',
  `adjustmentNo` VARCHAR(128) NOT NULL COMMENT 'adjustment no',
  `countryCode` VARCHAR(32) NULL COMMENT 'country code',
  `batchName` VARCHAR(255) NULL COMMENT 'batch name',
  `requestNo` VARCHAR(128) NULL COMMENT 'request no',
  `poNo` VARCHAR(128) NULL COMMENT 'PO no',
  `deviceCode` VARCHAR(64) NULL COMMENT 'device code',
  `modelCode` VARCHAR(128) NULL COMMENT 'model code',
  `nameEn` VARCHAR(255) NULL COMMENT 'instance english name',
  `quantity` INT NULL COMMENT 'quantity',
  `currency` VARCHAR(16) NOT NULL DEFAULT 'USD' COMMENT 'currency',
  `effectiveMonth` DATE NULL COMMENT 'effective month',
  `adjustedFirst24MonthPrice` DECIMAL(18, 4) NULL COMMENT 'adjusted first 24 month price',
  `adjustedNext36MonthPrice` DECIMAL(18, 4) NULL COMMENT 'adjusted next 36 month price',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  PRIMARY KEY (`id`),
  KEY `idx_BillingAdjustmentItems_adjustmentNo` (`adjustmentNo`),
  KEY `idx_BillingAdjustmentItems_target` (`countryCode`, `batchName`, `deviceCode`),
  KEY `idx_BillingAdjustmentItems_effectiveMonth` (`effectiveMonth`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BillingAdjustmentItems';

CREATE TABLE IF NOT EXISTS `BillingStatementSnapshots` (
  `snapshotNo` VARCHAR(128) NOT NULL COMMENT 'billing statement snapshot no',
  `countryCode` VARCHAR(32) NOT NULL COMMENT 'country code',
  `startDate` DATE NOT NULL COMMENT 'statement start date',
  `endDate` DATE NOT NULL COMMENT 'statement end date',
  `currencySummary` VARCHAR(255) NULL COMMENT 'currency summary',
  `totalQuantity` DECIMAL(18, 4) NULL COMMENT 'total quantity',
  `totalAmount` DECIMAL(18, 4) NULL COMMENT 'total amount',
  `itemCount` INT NOT NULL DEFAULT 0 COMMENT 'item count',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  PRIMARY KEY (`snapshotNo`),
  KEY `idx_BillingStatementSnapshots_countryCode` (`countryCode`),
  KEY `idx_BillingStatementSnapshots_dates` (`startDate`, `endDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BillingStatementSnapshots';

CREATE TABLE IF NOT EXISTS `BillingStatementSnapshotItems` (
  `id` VARCHAR(160) NOT NULL COMMENT 'billing statement snapshot item id',
  `snapshotNo` VARCHAR(128) NOT NULL COMMENT 'billing statement snapshot no',
  `countryCode` VARCHAR(32) NOT NULL COMMENT 'country code',
  `currency` VARCHAR(16) NULL COMMENT 'currency',
  `instanceContractNo` VARCHAR(128) NULL COMMENT 'instance contract no',
  `productType` VARCHAR(255) NULL COMMENT 'computing service product type',
  `unitPriceVatExcluded` DECIMAL(18, 4) NULL COMMENT 'unit price VAT excluded',
  `vatRate` DECIMAL(10, 6) NULL COMMENT 'VAT rate',
  `unitPriceVatIncluded` DECIMAL(18, 4) NULL COMMENT 'unit price VAT included',
  `quantity` DECIMAL(18, 4) NULL COMMENT 'quantity',
  `amount` DECIMAL(18, 4) NULL COMMENT 'amount VAT included',
  `startTime` DATE NOT NULL COMMENT 'start time',
  `endTime` DATE NOT NULL COMMENT 'end of charge time',
  `sourceIds` TEXT NULL COMMENT 'monthly billing source ids',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  PRIMARY KEY (`id`),
  KEY `idx_BillingStatementSnapshotItems_snapshotNo` (`snapshotNo`),
  KEY `idx_BillingStatementSnapshotItems_currency` (`currency`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BillingStatementSnapshotItems';

CREATE TABLE IF NOT EXISTS `ServiceFeeSnapshots` (
  `snapshotNo` VARCHAR(128) NOT NULL COMMENT 'service fee snapshot no',
  `status` VARCHAR(64) NOT NULL DEFAULT '已确认' COMMENT 'snapshot status',
  `startMonth` DATE NULL COMMENT 'start month',
  `endMonth` DATE NULL COMMENT 'end month',
  `countryCode` VARCHAR(32) NULL COMMENT 'country code',
  `batchName` VARCHAR(255) NULL COMMENT 'batch name',
  `keyword` VARCHAR(255) NULL COMMENT 'keyword filter',
  `billingTotal` DECIMAL(18, 4) NULL COMMENT 'billing total',
  `prepaymentTotal` DECIMAL(18, 4) NULL COMMENT 'prepayment total',
  `serviceFeeTotal` DECIMAL(18, 4) NULL COMMENT 'service fee total',
  `instanceServiceFeeTotal` DECIMAL(18, 4) NULL COMMENT 'instance service fee total',
  `feeServiceFeeTotal` DECIMAL(18, 4) NULL COMMENT 'non-instance fee service fee total',
  `confirmedAt` DATETIME NULL COMMENT 'confirmed time',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`snapshotNo`),
  KEY `idx_ServiceFeeSnapshots_months` (`startMonth`, `endMonth`),
  KEY `idx_ServiceFeeSnapshots_countryCode` (`countryCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ServiceFeeSnapshots';

CREATE TABLE IF NOT EXISTS `ServiceFeeSnapshotItems` (
  `id` VARCHAR(160) NOT NULL COMMENT 'service fee snapshot item id',
  `snapshotNo` VARCHAR(128) NOT NULL COMMENT 'service fee snapshot no',
  `writeOffMonth` DATE NOT NULL COMMENT 'write-off month',
  `countryCode` VARCHAR(32) NULL COMMENT 'country code',
  `batchName` VARCHAR(255) NULL COMMENT 'batch name',
  `requestNo` VARCHAR(128) NULL COMMENT 'request no',
  `poNo` VARCHAR(128) NULL COMMENT 'PO no',
  `deviceCode` VARCHAR(64) NULL COMMENT 'device code',
  `modelCode` VARCHAR(128) NULL COMMENT 'model code',
  `nameEn` VARCHAR(255) NULL COMMENT 'english name',
  `quantity` INT NULL COMMENT 'quantity',
  `currency` VARCHAR(16) NULL COMMENT 'currency',
  `billingCurrency` VARCHAR(16) NULL COMMENT 'monthly billing currency',
  `prepaymentCurrency` VARCHAR(16) NULL COMMENT 'monthly prepayment currency',
  `lineType` VARCHAR(32) NULL COMMENT 'instance/fee',
  `billingAmount` DECIMAL(18, 4) NULL COMMENT 'monthly billing amount',
  `prepaymentAmount` DECIMAL(18, 4) NULL COMMENT 'monthly prepayment amount',
  `serviceFeeAmount` DECIMAL(18, 4) NULL COMMENT 'monthly service fee amount',
  `billingSourceIds` TEXT NULL COMMENT 'billing source ids',
  `prepaymentSourceIds` TEXT NULL COMMENT 'prepayment source ids',
  `prepaymentContractNos` TEXT NULL COMMENT 'prepayment contract nos',
  `sourceNote` VARCHAR(255) NULL COMMENT 'source note',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  PRIMARY KEY (`id`),
  KEY `idx_ServiceFeeSnapshotItems_snapshotNo` (`snapshotNo`),
  KEY `idx_ServiceFeeSnapshotItems_writeOffMonth` (`writeOffMonth`),
  KEY `idx_ServiceFeeSnapshotItems_deviceCode` (`deviceCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ServiceFeeSnapshotItems';

CREATE TABLE IF NOT EXISTS `WriteOffItems` (
  `id` VARCHAR(64) NOT NULL COMMENT 'PK',
  `requestItemId` VARCHAR(64) NOT NULL COMMENT 'request item id',
  `prepaymentContractItemId` VARCHAR(64) NOT NULL COMMENT 'prepayment contract item id',
  `prepaymentAmountUSD` DECIMAL(18, 4) NULL COMMENT 'prepayment amount USD',
  `writeOffCurrency` VARCHAR(16) NULL COMMENT 'write-off currency',
  `writeOffRate` DECIMAL(18, 8) NULL COMMENT 'write-off rate',
  `startMonth` DATE NULL COMMENT 'start month first day',
  `totalMonths` INT NULL COMMENT 'total write-off months',
  PRIMARY KEY (`id`),
  KEY `idx_WriteOffItems_requestItemId` (`requestItemId`),
  KEY `idx_WriteOffItems_prepaymentContractItemId` (`prepaymentContractItemId`),
  CONSTRAINT `chk_WriteOffItems_totalMonths_positive` CHECK (`totalMonths` IS NULL OR `totalMonths` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='WriteOffItems';

CREATE TABLE IF NOT EXISTS `Shipments` (
  `shipmentId` VARCHAR(64) NOT NULL COMMENT 'shipment id PK',
  `poNo` VARCHAR(128) NOT NULL COMMENT 'PO no',
  `purchaseOrderItemId` VARCHAR(64) NULL COMMENT 'purchase order item id',
  `deviceCode` VARCHAR(64) NULL COMMENT 'instance device code',
  `nameEn` VARCHAR(255) NULL COMMENT 'instance english name',
  `destinationLocationId` VARCHAR(64) NOT NULL COMMENT 'destination location id',
  `recipientContactId` VARCHAR(64) NOT NULL COMMENT 'recipient contact id',
  `snapshotDestinationAddress` TEXT NOT NULL COMMENT 'immutable delivery address snapshot',
  `snapshotRecipientName` VARCHAR(255) NOT NULL COMMENT 'immutable recipient name snapshot',
  `snapshotRecipientPhone` VARCHAR(64) NOT NULL COMMENT 'immutable recipient phone snapshot',
  `transportMode` VARCHAR(64) NULL COMMENT 'air/sea',
  `isReceived` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'received flag',
  `crd` DATE NULL COMMENT 'CRD',
  `apdAt` DATE NULL COMMENT 'APD',
  `pickupAt` DATE NULL COMMENT 'ASD',
  `departedAt` DATE NULL COMMENT 'departed date',
  `arrivedAt` DATE NULL COMMENT 'arrived date',
  `customsClearedAt` DATE NULL COMMENT 'ATA customs cleared date',
  `deliveredAt` DATE NULL COMMENT 'delivered date',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`shipmentId`),
  KEY `idx_Shipments_poNo` (`poNo`),
  KEY `idx_Shipments_purchaseOrderItemId` (`purchaseOrderItemId`),
  KEY `idx_Shipments_destinationLocationId` (`destinationLocationId`),
  KEY `idx_Shipments_recipientContactId` (`recipientContactId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Shipments';

CREATE TABLE IF NOT EXISTS `DocumentFolders` (
  `folderId` VARCHAR(80) NOT NULL COMMENT 'folder id',
  `parentId` VARCHAR(80) NULL COMMENT 'parent folder id',
  `name` VARCHAR(255) NOT NULL COMMENT 'folder name',
  `sortOrder` INT NOT NULL DEFAULT 0 COMMENT 'sort order',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`folderId`),
  UNIQUE KEY `uk_DocumentFolders_parent_name` (`parentId`, `name`),
  KEY `idx_DocumentFolders_parentId` (`parentId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='DocumentFolders';

CREATE TABLE IF NOT EXISTS `DocumentFiles` (
  `fileId` VARCHAR(80) NOT NULL COMMENT 'file id',
  `folderId` VARCHAR(80) NOT NULL COMMENT 'folder id',
  `originalName` VARCHAR(255) NOT NULL COMMENT 'original file name',
  `storedName` VARCHAR(255) NOT NULL COMMENT 'stored file name',
  `filePath` VARCHAR(1024) NOT NULL COMMENT 'server file path',
  `mimeType` VARCHAR(255) NULL COMMENT 'mime type',
  `extension` VARCHAR(32) NULL COMMENT 'file extension',
  `category` VARCHAR(32) NOT NULL DEFAULT 'other' COMMENT 'file category',
  `fileSize` BIGINT NOT NULL DEFAULT 0 COMMENT 'file size bytes',
  `uploadedBy` VARCHAR(128) NULL COMMENT 'uploaded by',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`fileId`),
  KEY `idx_DocumentFiles_folderId` (`folderId`),
  KEY `idx_DocumentFiles_originalName` (`originalName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='DocumentFiles';
