CREATE DATABASE IF NOT EXISTS `suanli`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `suanli`;

CREATE TABLE IF NOT EXISTS `power_countries` (
  `code` VARCHAR(32) NOT NULL COMMENT 'country code PK',
  `nameZh` VARCHAR(255) NULL COMMENT 'country name zh',
  `nameEn` VARCHAR(255) NULL COMMENT 'country name en',
  `nameLocal` VARCHAR(255) NULL COMMENT 'country name local',
  `vatRate` DECIMAL(10, 6) NULL COMMENT 'VAT rate as decimal',
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Countries';

CREATE TABLE IF NOT EXISTS `power_deliverylocations` (
  `locationId` VARCHAR(64) NOT NULL COMMENT 'location id PK',
  `countryCode` VARCHAR(32) NOT NULL COMMENT 'country code',
  `locationType` VARCHAR(64) NULL COMMENT 'Datacenter/Warehouse/Office/Broker',
  `nameZh` VARCHAR(255) NULL COMMENT 'location name zh',
  `nameEn` VARCHAR(255) NULL COMMENT 'location name en',
  `fullAddress` TEXT NULL COMMENT 'full delivery address',
  PRIMARY KEY (`locationId`),
  KEY `idx_DeliveryLocations_countryCode` (`countryCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='DeliveryLocations';

CREATE TABLE IF NOT EXISTS `power_deliverycontacts` (
  `contactId` VARCHAR(64) NOT NULL COMMENT 'contact id PK',
  `locationId` VARCHAR(64) NOT NULL COMMENT 'default location id',
  `name` VARCHAR(255) NULL COMMENT 'name',
  `phone` VARCHAR(64) NULL COMMENT 'phone',
  `email` VARCHAR(255) NULL COMMENT 'email',
  PRIMARY KEY (`contactId`),
  KEY `idx_DeliveryContacts_locationId` (`locationId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='DeliveryContacts';

CREATE TABLE IF NOT EXISTS `power_datacenters` (
  `dcCode` VARCHAR(128) NOT NULL COMMENT 'datacenter code PK',
  `locationId` VARCHAR(512) NOT NULL COMMENT 'physical address or location id',
  `nameZh` VARCHAR(512) NULL COMMENT 'datacenter name zh',
  `nameEn` VARCHAR(512) NULL COMMENT 'datacenter name en',
  PRIMARY KEY (`dcCode`),
  UNIQUE KEY `uk_Datacenters_locationId` (`locationId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Datacenters';

CREATE TABLE IF NOT EXISTS `power_instancemodels` (
  `deviceCode` VARCHAR(64) NOT NULL COMMENT 'device code PK',
  `modelCode` VARCHAR(128) NOT NULL COMMENT 'model code UK',
  `xxllCode` VARCHAR(128) NULL COMMENT 'xxll code',
  `nameZh` VARCHAR(255) NULL COMMENT 'instance model name zh',
  `nameEn` VARCHAR(255) NULL COMMENT 'instance model name en',
  `b6Type` VARCHAR(64) NULL COMMENT 'default B6 type',
  PRIMARY KEY (`deviceCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='InstanceModels';

CREATE TABLE IF NOT EXISTS `power_suppliers` (
  `supplierId` VARCHAR(64) NOT NULL COMMENT 'supplier id PK',
  `supplierCode` VARCHAR(128) NOT NULL COMMENT 'ODM supplier code UK',
  `name` VARCHAR(255) NULL COMMENT 'name',
  PRIMARY KEY (`supplierId`),
  UNIQUE KEY `uk_Suppliers_supplierCode` (`supplierCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Suppliers';

CREATE TABLE IF NOT EXISTS `power_undertakingunits` (
  `undertakingUnitId` VARCHAR(64) NOT NULL COMMENT 'undertaking unit id PK',
  `undertakingUnitCode` VARCHAR(128) NOT NULL COMMENT 'undertaking unit code UK',
  `name` VARCHAR(255) NULL COMMENT 'name',
  PRIMARY KEY (`undertakingUnitId`),
  UNIQUE KEY `uk_UndertakingUnits_code` (`undertakingUnitCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='UndertakingUnits';

CREATE TABLE IF NOT EXISTS `power_customers` (
  `customerId` VARCHAR(64) NOT NULL COMMENT 'customer id PK',
  `customerCode` VARCHAR(128) NOT NULL COMMENT 'customer code UK',
  `name` VARCHAR(255) NULL COMMENT 'name',
  PRIMARY KEY (`customerId`),
  UNIQUE KEY `uk_Customers_customerCode` (`customerCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customers';

CREATE TABLE IF NOT EXISTS `power_instancecontracts` (
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

CREATE TABLE IF NOT EXISTS `power_contractitems` (
  `id` VARCHAR(64) NOT NULL COMMENT 'PK',
  `contractNo` VARCHAR(128) NOT NULL COMMENT 'contract no',
  `deviceCode` VARCHAR(64) NOT NULL COMMENT 'device code',
  `basePrice` DECIMAL(18, 4) NULL COMMENT 'contract base price',
  `currency` VARCHAR(16) NULL COMMENT 'currency',
  PRIMARY KEY (`id`),
  KEY `idx_ContractItems_contractNo` (`contractNo`),
  KEY `idx_ContractItems_deviceCode` (`deviceCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ContractItems';

CREATE TABLE IF NOT EXISTS `power_requests` (
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

CREATE TABLE IF NOT EXISTS `power_requestitems` (
  `id` VARCHAR(64) NOT NULL COMMENT 'PK',
  `requestNo` VARCHAR(128) NOT NULL COMMENT 'request no',
  `deviceCode` VARCHAR(64) NOT NULL COMMENT 'device code',
  `supplierId` VARCHAR(64) NOT NULL COMMENT 'supplier id',
  `undertakingUnitId` VARCHAR(64) NULL COMMENT 'undertaking unit id',
  `customerId` VARCHAR(64) NULL COMMENT 'customer id',
  `requestedAt` DATE NULL COMMENT 'requested date',
  `quantity` INT NOT NULL DEFAULT 0 COMMENT 'device node quantity',
  PRIMARY KEY (`id`),
  KEY `idx_RequestItems_requestNo` (`requestNo`),
  KEY `idx_RequestItems_requestNo_deviceCode` (`requestNo`, `deviceCode`),
  KEY `idx_RequestItems_deviceCode` (`deviceCode`),
  KEY `idx_RequestItems_supplierId` (`supplierId`),
  KEY `idx_RequestItems_undertakingUnitId` (`undertakingUnitId`),
  KEY `idx_RequestItems_customerId` (`customerId`),
  CONSTRAINT `chk_RequestItems_quantity_nonnegative` CHECK (`quantity` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RequestItems';

CREATE TABLE IF NOT EXISTS `power_purchaseorders` (
  `purchaseOrderId` VARCHAR(128) NOT NULL COMMENT 'system purchase order id',
  `poNo` VARCHAR(128) NOT NULL COMMENT 'PO no PK',
  `requestNo` VARCHAR(128) NULL COMMENT 'source request no',
  `sourceRequestNos` TEXT NULL COMMENT 'merged source request nos',
  `status` VARCHAR(64) NOT NULL DEFAULT '草稿' COMMENT 'purchase status',
  `currency` VARCHAR(16) NULL COMMENT 'currency',
  `usdRate` DECIMAL(18, 8) NULL COMMENT 'USD rate',
  `paymentDate` DATE NULL COMMENT 'supplier payment date',
  `releasedAt` DATE NULL COMMENT 'PO release date',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`poNo`),
  UNIQUE KEY `uk_PurchaseOrders_purchaseOrderId` (`purchaseOrderId`),
  KEY `idx_PurchaseOrders_requestNo` (`requestNo`),
  KEY `idx_PurchaseOrders_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PurchaseOrders';

CREATE TABLE IF NOT EXISTS `power_purchaseorderitems` (
  `id` VARCHAR(64) NOT NULL COMMENT 'PK',
  `purchaseOrderId` VARCHAR(128) NULL COMMENT 'system purchase order id',
  `poNo` VARCHAR(128) NOT NULL COMMENT 'PO no',
  `requestNo` VARCHAR(128) NULL COMMENT 'source request no',
  `requestItemId` VARCHAR(64) NOT NULL COMMENT 'request item id',
  `taxExcludedUnitPrice` DECIMAL(18, 4) NULL COMMENT 'tax excluded unit price',
  `taxSurcharge` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'tax surcharge',
  `unitPrice` DECIMAL(18, 4) NULL COMMENT 'tax included unit price',
  `capexUnitPrice` DECIMAL(18, 4) NULL COMMENT 'procurement CAPEX unit price',
  `opexUnitPrice` DECIMAL(18, 4) NULL COMMENT 'procurement OPEX unit price',
  `hardwareCoefficient` DECIMAL(18, 6) NULL COMMENT 'hardware coefficient',
  `softwareCoefficient` DECIMAL(18, 6) NULL COMMENT 'software coefficient',
  `totalCoefficient` DECIMAL(18, 6) NULL COMMENT 'total coefficient',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_PurchaseOrderItems_requestItemId` (`requestItemId`),
  KEY `idx_PurchaseOrderItems_purchaseOrderId` (`purchaseOrderId`),
  KEY `idx_PurchaseOrderItems_poNo` (`poNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PurchaseOrderItems';

CREATE TABLE IF NOT EXISTS `power_purchaseordersnitems` (
  `id` VARCHAR(64) NOT NULL COMMENT 'PK',
  `purchaseOrderId` VARCHAR(128) NOT NULL COMMENT 'system purchase order id',
  `poNo` VARCHAR(128) NOT NULL COMMENT 'PO no',
  `purchaseOrderItemId` VARCHAR(64) NULL COMMENT 'purchase order item id',
  `requestNo` VARCHAR(128) NULL COMMENT 'source request no',
  `deviceVendor` VARCHAR(255) NULL COMMENT 'device vendor',
  `finalParentSn` VARCHAR(255) NULL COMMENT 'final parent SN',
  `finalParentPn` VARCHAR(255) NULL COMMENT 'customer final parent PN',
  `finalParentPnDescription` VARCHAR(500) NULL COMMENT 'final parent PN description',
  `supplierFinalParentCode` VARCHAR(255) NULL COMMENT 'supplier final parent code',
  `supplierParentCode` VARCHAR(255) NULL COMMENT 'supplier parent code',
  `supplierParentSn` VARCHAR(255) NULL COMMENT 'supplier parent SN',
  `sn` VARCHAR(255) NOT NULL COMMENT 'serial number',
  `fixedAssetCode` VARCHAR(255) NULL COMMENT 'fixed asset code',
  `materialDescription` VARCHAR(500) NULL COMMENT 'material description',
  `shippingBatch` VARCHAR(255) NULL COMMENT 'shipping batch',
  `parentAssetNo` VARCHAR(255) NULL COMMENT 'customer parent asset no',
  `componentCategory` VARCHAR(255) NULL COMMENT 'component category',
  `packingListNo` VARCHAR(255) NULL COMMENT 'packing list no',
  `parentCode` VARCHAR(255) NULL COMMENT 'customer parent code',
  `finalParentCode` VARCHAR(255) NULL COMMENT 'customer final parent code',
  `supplierChildComponentCode` VARCHAR(255) NULL COMMENT 'supplier child component code',
  `customerChildComponentCode` VARCHAR(255) NULL COMMENT 'customer child component code',
  `supplierChildComponentDescription` VARCHAR(500) NULL COMMENT 'supplier child component description',
  `childComponentOriginalPn` VARCHAR(255) NULL COMMENT 'child component original PN',
  `childComponentOriginalSn` VARCHAR(255) NULL COMMENT 'child component original SN',
  `rackUnit` VARCHAR(255) NULL COMMENT 'rack unit',
  `site` VARCHAR(500) NULL COMMENT 'site',
  `contactPhone` VARCHAR(500) NULL COMMENT 'contact and phone',
  `level` VARCHAR(64) NULL COMMENT 'asset hierarchy level',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`id`),
  KEY `idx_PurchaseOrderSnItems_purchaseOrderId` (`purchaseOrderId`),
  KEY `idx_PurchaseOrderSnItems_purchaseOrderItemId` (`purchaseOrderItemId`),
  KEY `idx_PurchaseOrderSnItems_poNo` (`poNo`),
  KEY `idx_PurchaseOrderSnItems_sn` (`sn`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PurchaseOrderSnItems';

CREATE TABLE IF NOT EXISTS `power_purchaseorderplanitems` (
  `id` VARCHAR(64) NOT NULL COMMENT 'PK',
  `purchaseOrderId` VARCHAR(128) NOT NULL COMMENT 'system purchase order id',
  `poNo` VARCHAR(128) NOT NULL COMMENT 'PO no',
  `purchaseOrderItemId` VARCHAR(64) NULL COMMENT 'purchase order item id',
  `requestNo` VARCHAR(128) NULL COMMENT 'source request no',
  `sourcePlanId` VARCHAR(128) NULL COMMENT 'source demand plan item id',
  `quoteReceivedAt` DATE NULL COMMENT 'CEG quotation received date',
  `poIssuedAt` DATE NULL COMMENT 'supplier PO issued date',
  `receiptProofUploadedAt` DATE NULL COMMENT 'receipt proof uploaded date',
  `logisticsReceivedAt` DATE NULL COMMENT 'logistics receipt date',
  `ataAt` DATE NULL COMMENT 'ATA date',
  `ata` VARCHAR(255) NULL COMMENT 'ATA',
  `supplierCpd` DATE NULL COMMENT 'supplier CPD',
  `material` VARCHAR(500) NULL COMMENT 'material',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`id`),
  KEY `idx_PurchaseOrderPlanItems_purchaseOrderId` (`purchaseOrderId`),
  KEY `idx_PurchaseOrderPlanItems_purchaseOrderItemId` (`purchaseOrderItemId`),
  KEY `idx_PurchaseOrderPlanItems_poNo` (`poNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PurchaseOrderPlanItems';

CREATE TABLE IF NOT EXISTS `power_prepaymentcontracts` (
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

CREATE TABLE IF NOT EXISTS `power_prepaymentcontractitems` (
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
  `supplierId` VARCHAR(64) NULL COMMENT 'supplier id',
  `undertakingUnitId` VARCHAR(64) NULL COMMENT 'undertaking unit id',
  `customerId` VARCHAR(64) NULL COMMENT 'customer id',
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
  UNIQUE KEY `uk_PrepaymentContractItems_purchaseOrderItemId` (`purchaseOrderItemId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PrepaymentContractItems';

CREATE TABLE IF NOT EXISTS `power_monthlyprepaymentwriteoffs` (
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
  `supplierId` VARCHAR(64) NULL COMMENT 'supplier id',
  `undertakingUnitId` VARCHAR(64) NULL COMMENT 'undertaking unit id',
  `customerId` VARCHAR(64) NULL COMMENT 'customer id',
  `quantity` INT NULL COMMENT 'quantity',
  `sourceType` VARCHAR(64) NULL COMMENT 'source type',
  `adjustmentNo` VARCHAR(128) NULL COMMENT 'adjustment no',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  PRIMARY KEY (`id`),
  KEY `idx_MonthlyPrepaymentWriteOffs_contractNo` (`contractNo`),
  KEY `idx_MonthlyPrepaymentWriteOffs_contractLineId` (`contractLineId`),
  KEY `idx_MonthlyPrepaymentWriteOffs_writeOffMonth` (`writeOffMonth`),
  KEY `idx_MonthlyPrepaymentWriteOffs_country_batch_month` (`countryCode`, `batchName`, `writeOffMonth`),
  KEY `idx_MonthlyPrepaymentWriteOffs_country_month_batch` (`countryCode`, `writeOffMonth`, `batchName`),
  KEY `idx_MonthlyPrepaymentWriteOffs_batch_month` (`batchName`, `writeOffMonth`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MonthlyPrepaymentWriteOffs';

CREATE TABLE IF NOT EXISTS `power_prepaymentwriteoffadjustments` (
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

CREATE TABLE IF NOT EXISTS `power_prepaymentwriteoffadjustmentitems` (
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

CREATE TABLE IF NOT EXISTS `power_billinginstanceledgers` (
  `ledgerId` VARCHAR(96) NOT NULL COMMENT 'billing ledger id',
  `purchaseOrderItemId` VARCHAR(64) NOT NULL COMMENT 'purchase order item id',
  `countryCode` VARCHAR(32) NULL COMMENT 'country code',
  `batchName` VARCHAR(255) NULL COMMENT 'batch name',
  `requestNo` VARCHAR(128) NULL COMMENT 'request no',
  `poNo` VARCHAR(128) NULL COMMENT 'PO no',
  `deviceCode` VARCHAR(64) NULL COMMENT 'device code',
  `modelCode` VARCHAR(128) NULL COMMENT 'model code',
  `nameEn` VARCHAR(255) NULL COMMENT 'instance english name',
  `supplierId` VARCHAR(64) NULL COMMENT 'supplier id',
  `undertakingUnitId` VARCHAR(64) NULL COMMENT 'undertaking unit id',
  `customerId` VARCHAR(64) NULL COMMENT 'customer id',
  `quantity` INT NULL COMMENT 'quantity',
  `actualCurrency` VARCHAR(16) NULL COMMENT 'actual currency',
  `actualUnitPrice` DECIMAL(18, 4) NULL COMMENT 'actual unit price',
  `taxExcludedUnitPrice` DECIMAL(18, 4) NULL COMMENT 'tax excluded unit price',
  `taxSurcharge` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'tax surcharge',
  `vatRate` DECIMAL(10, 6) NULL COMMENT 'VAT rate',
  `selfCalculatedUnitPrice` DECIMAL(18, 4) NULL COMMENT 'self calculated VAT included unit price',
  `instanceContractNo` VARCHAR(128) NULL COMMENT 'locked instance contract no',
  `contractCurrency` VARCHAR(16) NULL COMMENT 'contract currency',
  `first24MonthPrice` DECIMAL(18, 4) NULL COMMENT 'first 24 month price',
  `next36MonthPrice` DECIMAL(18, 4) NULL COMMENT 'next 36 month price',
  `differenceUnitPrice` DECIMAL(18, 4) NULL COMMENT 'settlement difference unit price',
  `differenceTotalPrice` DECIMAL(18, 4) NULL COMMENT 'settlement difference total price',
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

CREATE TABLE IF NOT EXISTS `power_monthlybillingwriteoffs` (
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
  `supplierId` VARCHAR(64) NULL COMMENT 'supplier id',
  `undertakingUnitId` VARCHAR(64) NULL COMMENT 'undertaking unit id',
  `customerId` VARCHAR(64) NULL COMMENT 'customer id',
  `quantity` INT NULL COMMENT 'quantity',
  `instanceContractNo` VARCHAR(128) NULL COMMENT 'instance contract no',
  `currency` VARCHAR(16) NULL COMMENT 'currency',
  `monthlyAmount` DECIMAL(18, 4) NULL COMMENT 'monthly amount',
  `monthlyTotalAmount` DECIMAL(18, 4) NULL COMMENT 'monthly total amount',
  `selfCalculatedUnitPrice` DECIMAL(18, 4) NULL COMMENT 'self calculated VAT included unit price',
  `differenceUnitPrice` DECIMAL(18, 4) NULL COMMENT 'settlement difference unit price',
  `differenceTotalPrice` DECIMAL(18, 4) NULL COMMENT 'settlement difference total price',
  `sourceType` VARCHAR(32) NULL COMMENT 'initial/adjustment',
  `adjustmentNo` VARCHAR(128) NULL COMMENT 'adjustment no',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  PRIMARY KEY (`id`),
  KEY `idx_MonthlyBillingWriteOffs_ledgerId` (`ledgerId`),
  KEY `idx_MonthlyBillingWriteOffs_writeOffMonth` (`writeOffMonth`),
  KEY `idx_MonthlyBillingWriteOffs_country_batch_month` (`countryCode`, `batchName`, `writeOffMonth`),
  KEY `idx_MonthlyBillingWriteOffs_country_month_batch` (`countryCode`, `writeOffMonth`, `batchName`),
  KEY `idx_MonthlyBillingWriteOffs_batch_month` (`batchName`, `writeOffMonth`),
  KEY `idx_MonthlyBillingWriteOffs_adjustmentNo` (`adjustmentNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MonthlyBillingWriteOffs';

CREATE TABLE IF NOT EXISTS `power_billingadjustments` (
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

CREATE TABLE IF NOT EXISTS `power_billingadjustmentitems` (
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

CREATE TABLE IF NOT EXISTS `power_billingstatementsnapshots` (
  `snapshotNo` VARCHAR(128) NOT NULL COMMENT 'billing statement snapshot no',
  `status` VARCHAR(64) NOT NULL DEFAULT '未确认' COMMENT 'statement status',
  `countryCode` VARCHAR(32) NOT NULL COMMENT 'country code',
  `startDate` DATE NOT NULL COMMENT 'statement start date',
  `endDate` DATE NOT NULL COMMENT 'statement end date',
  `currencySummary` VARCHAR(255) NULL COMMENT 'currency summary',
  `totalQuantity` DECIMAL(18, 4) NULL COMMENT 'total quantity',
  `totalAmount` DECIMAL(18, 4) NULL COMMENT 'total amount',
  `itemCount` INT NOT NULL DEFAULT 0 COMMENT 'item count',
  `confirmedAt` DATETIME NULL COMMENT 'confirmed time',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`snapshotNo`),
  KEY `idx_BillingStatementSnapshots_countryCode` (`countryCode`),
  KEY `idx_BillingStatementSnapshots_dates` (`startDate`, `endDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BillingStatementSnapshots';

CREATE TABLE IF NOT EXISTS `power_billingstatementsnapshotitems` (
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

CREATE TABLE IF NOT EXISTS `power_servicefeesnapshots` (
  `snapshotNo` VARCHAR(128) NOT NULL COMMENT 'service fee snapshot no',
  `status` VARCHAR(64) NOT NULL DEFAULT '未确认' COMMENT 'statement status',
  `writeOffMonth` DATE NULL COMMENT 'write-off month',
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
  `repaymentStatus` VARCHAR(32) NOT NULL DEFAULT '未回款' COMMENT 'repayment status',
  `receivingUnitId` VARCHAR(64) NULL COMMENT 'receiving undertaking unit id',
  `payerCustomerId` VARCHAR(64) NULL COMMENT 'payer customer id',
  `repaymentCurrency` VARCHAR(16) NULL COMMENT 'repayment currency',
  `repaymentAmount` DECIMAL(18, 4) NULL COMMENT 'repayment amount',
  `repaymentDate` DATE NULL COMMENT 'repayment date',
  `repaymentUpdatedAt` DATETIME NULL COMMENT 'repayment updated time',
  `invoiceStatus` VARCHAR(32) NOT NULL DEFAULT '未开票' COMMENT 'manual invoice status',
  `invoiceOriginalName` VARCHAR(500) NULL COMMENT 'invoice original file name',
  `invoiceStoredName` VARCHAR(500) NULL COMMENT 'invoice stored file name',
  `invoiceFilePath` VARCHAR(1000) NULL COMMENT 'invoice file path',
  `invoiceMimeType` VARCHAR(255) NULL COMMENT 'invoice MIME type',
  `invoiceFileSize` BIGINT NULL COMMENT 'invoice file size',
  `invoiceUploadedBy` VARCHAR(255) NULL COMMENT 'invoice uploaded by',
  `invoiceUploadedAt` DATETIME NULL COMMENT 'invoice uploaded time',
  `confirmedAt` DATETIME NULL COMMENT 'confirmed time',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`snapshotNo`),
  KEY `idx_ServiceFeeSnapshots_writeOffMonth` (`writeOffMonth`),
  KEY `idx_ServiceFeeSnapshots_months` (`startMonth`, `endMonth`),
  KEY `idx_ServiceFeeSnapshots_countryCode` (`countryCode`),
  KEY `idx_ServiceFeeSnapshots_invoiceStatus` (`invoiceStatus`),
  KEY `idx_ServiceFeeSnapshots_repaymentStatus` (`repaymentStatus`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ServiceFeeSnapshots';

CREATE TABLE IF NOT EXISTS `power_servicefeesnapshotitems` (
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
  `supplierId` VARCHAR(64) NULL COMMENT 'supplier id',
  `undertakingUnitId` VARCHAR(64) NULL COMMENT 'undertaking unit id',
  `customerId` VARCHAR(64) NULL COMMENT 'customer id',
  `quantity` INT NULL COMMENT 'quantity',
  `currency` VARCHAR(16) NULL COMMENT 'currency',
  `billingCurrency` VARCHAR(16) NULL COMMENT 'monthly billing currency',
  `prepaymentCurrency` VARCHAR(16) NULL COMMENT 'monthly prepayment currency',
  `lineType` VARCHAR(32) NULL COMMENT 'instance/fee',
  `billingAmount` DECIMAL(18, 4) NULL COMMENT 'monthly billing amount',
  `prepaymentAmount` DECIMAL(18, 4) NULL COMMENT 'monthly prepayment amount',
  `serviceFeeAmount` DECIMAL(18, 4) NULL COMMENT 'monthly service fee amount',
  `serviceFeeAmountExcludingTax` DECIMAL(18, 4) NULL COMMENT 'monthly service fee amount VAT excluded',
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

CREATE TABLE IF NOT EXISTS `power_writeoffitems` (
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

CREATE TABLE IF NOT EXISTS `power_shipments` (
    `shipmentId` VARCHAR(64) NOT NULL COMMENT 'shipment id PK',
    `poNo` VARCHAR(128) NOT NULL COMMENT 'PO no',
    `batchName` VARCHAR(255) NULL COMMENT 'batch name',
    `purchaseOrderItemId` VARCHAR(64) NULL COMMENT 'purchase order item id',
    `deviceCode` VARCHAR(64) NULL COMMENT 'instance device code',
    `nameEn` VARCHAR(255) NULL COMMENT 'instance english name',
  `supplierId` VARCHAR(64) NULL COMMENT 'supplier id',
  `undertakingUnitId` VARCHAR(64) NULL COMMENT 'undertaking unit id',
  `dcCode` VARCHAR(64) NULL COMMENT 'datacenter code',
  `dcNameZh` VARCHAR(255) NULL COMMENT 'datacenter Chinese name',
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
  KEY `idx_Shipments_batchName` (`batchName`),
  KEY `idx_Shipments_purchaseOrderItemId` (`purchaseOrderItemId`),
  KEY `idx_Shipments_dcCode` (`dcCode`),
  KEY `idx_Shipments_destinationLocationId` (`destinationLocationId`),
  KEY `idx_Shipments_recipientContactId` (`recipientContactId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Shipments';

CREATE TABLE IF NOT EXISTS `power_documentfolders` (
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

CREATE TABLE IF NOT EXISTS `power_documentfiles` (
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

CREATE TABLE IF NOT EXISTS `power_importjobs` (
  `jobId` VARCHAR(96) NOT NULL COMMENT 'import job id',
  `targetKey` VARCHAR(64) NOT NULL COMMENT 'import target key',
  `targetTitle` VARCHAR(255) NOT NULL COMMENT 'import target title',
  `fileName` VARCHAR(255) NULL COMMENT 'uploaded file name',
  `status` VARCHAR(64) NOT NULL COMMENT 'preview/import status',
  `totalRows` INT NOT NULL DEFAULT 0 COMMENT 'total source rows',
  `successRows` INT NOT NULL DEFAULT 0 COMMENT 'successful source rows',
  `failedRows` INT NOT NULL DEFAULT 0 COMMENT 'failed source rows',
  `masterCount` INT NOT NULL DEFAULT 0 COMMENT 'generated master rows',
  `detailCount` INT NOT NULL DEFAULT 0 COMMENT 'generated detail rows',
  `previewJson` LONGTEXT NULL COMMENT 'preview payload json',
  `reportJson` LONGTEXT NULL COMMENT 'report json',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `confirmedAt` DATETIME NULL COMMENT 'confirmed time',
  PRIMARY KEY (`jobId`),
  KEY `idx_ImportJobs_targetKey` (`targetKey`),
  KEY `idx_ImportJobs_createdAt` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ImportJobs';

CREATE TABLE IF NOT EXISTS `power_appusers` (
  `userId` VARCHAR(80) NOT NULL COMMENT 'user id',
  `email` VARCHAR(255) NOT NULL COMMENT 'login email',
  `passwordHash` VARCHAR(128) NOT NULL COMMENT 'password hash',
  `passwordSalt` VARCHAR(64) NOT NULL COMMENT 'password salt',
  `displayName` VARCHAR(255) NULL COMMENT 'display name',
  `role` VARCHAR(64) NOT NULL DEFAULT 'admin' COMMENT 'user role',
  `status` VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT 'active/disabled',
  `lastLoginAt` DATETIME NULL COMMENT 'last login time',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`userId`),
  UNIQUE KEY `uk_AppUsers_email` (`email`),
  KEY `idx_AppUsers_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AppUsers';

CREATE TABLE IF NOT EXISTS `power_userpreferences` (
  `userId` VARCHAR(80) NOT NULL COMMENT 'app user id',
  `preferenceKey` VARCHAR(80) NOT NULL COMMENT 'preference key',
  `preferenceValue` LONGTEXT NOT NULL COMMENT 'preference JSON value',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`userId`, `preferenceKey`),
  KEY `idx_UserPreferences_updatedAt` (`updatedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='UserPreferences';

CREATE TABLE IF NOT EXISTS `power_modulefeatures` (
  `moduleKey` VARCHAR(128) NOT NULL COMMENT 'module key',
  `moduleName` VARCHAR(255) NOT NULL COMMENT 'module display name',
  `parentModuleKey` VARCHAR(128) NULL COMMENT 'parent navigation group',
  `enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'whether the module is enabled',
  `sortOrder` INT NOT NULL DEFAULT 0 COMMENT 'display order',
  `remark` VARCHAR(500) NULL COMMENT 'remark',
  `updatedBy` VARCHAR(255) NULL COMMENT 'last updater',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`moduleKey`),
  KEY `idx_ModuleFeatures_enabled_sort` (`enabled`, `sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ModuleFeatures';

CREATE TABLE IF NOT EXISTS `power_capexpricingversions` (
  `versionId` VARCHAR(96) NOT NULL COMMENT 'CAPEX/OPEX pricing version id',
  `versionNo` VARCHAR(128) NOT NULL COMMENT 'pricing version number',
  `countryCode` VARCHAR(32) NOT NULL COMMENT 'country code',
  `effectiveDate` DATE NOT NULL COMMENT 'effective date',
  `status` VARCHAR(32) NOT NULL DEFAULT '草稿' COMMENT '草稿/已确认/已废止',
  `sourceFileName` VARCHAR(255) NULL COMMENT 'source workbook name',
  `notes` TEXT NULL COMMENT 'notes',
  `confirmedAt` DATETIME NULL COMMENT 'confirmed time',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`versionId`),
  UNIQUE KEY `uk_CapexPricingVersions_version_country` (`versionNo`, `countryCode`),
  KEY `idx_CapexPricingVersions_country_effective` (`countryCode`, `effectiveDate`),
  KEY `idx_CapexPricingVersions_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='CapexOpexPricingVersions';

CREATE TABLE IF NOT EXISTS `power_b6typeconfigs` (
  `b6Type` VARCHAR(64) NOT NULL COMMENT 'B6 type code',
  `alias` VARCHAR(128) NULL COMMENT 'B6 type alias',
  `scope` VARCHAR(255) NULL COMMENT 'applicable scope',
  `fundingCostIncluded` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'equipment price includes funding cost',
  `spareCostIncluded` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'equipment price includes spare cost',
  `defaultFundingMonths` INT NULL COMMENT 'default funding occupancy months',
  `defaultSpareOccupancyMonths` INT NULL COMMENT 'default spare occupancy months',
  `overseasSpareServiceAvailable` TINYINT(1) NULL COMMENT 'overseas spare service available',
  `defaultSpareRate` DECIMAL(10, 6) NULL COMMENT 'default spare rate as decimal',
  `spareSettlementMethod` VARCHAR(128) NULL COMMENT 'spare settlement method',
  `slPricingInstruction` TEXT NULL COMMENT 'SL pricing instruction',
  `notes` TEXT NULL COMMENT 'notes',
  `status` VARCHAR(32) NOT NULL DEFAULT '启用' COMMENT '启用/停用',
  `sortOrder` INT NOT NULL DEFAULT 0 COMMENT 'sort order',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`b6Type`),
  KEY `idx_B6TypeConfigs_status_sort` (`status`, `sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='B6TypeConfigs';

INSERT IGNORE INTO `power_b6typeconfigs` (
  `b6Type`, `alias`, `scope`, `fundingCostIncluded`, `spareCostIncluded`, `defaultFundingMonths`,
  `defaultSpareOccupancyMonths`, `overseasSpareServiceAvailable`, `defaultSpareRate`,
  `spareSettlementMethod`, `slPricingInstruction`, `notes`, `status`, `sortOrder`
) VALUES
  ('B61', 'B61', '整机服务场景', 0, 0, NULL, NULL, NULL, NULL, '按SL模板费率', 'SL模板已含对应费率，避免重复计算', '资金占用月数与备件占用月数待确认。', '启用', 10),
  ('B62-A7', 'B62-A7', '整机已含备件费用', 1, 1, 0, 0, 0, 0, '备件单独结差', '整机价已含备件费用。', '不提供海外备件服务。', '启用', 20),
  ('B62-A8 (HT)', 'B62-A8', 'HT整机不含资金占用费', 0, 0, 2, NULL, 0, 0, '备件单独结差', '整机价不含资金占用费。', '备件占用月数待确认；不提供海外备件服务。', '启用', 30),
  ('B63 (HT)', 'B63', 'HT整机服务场景', 0, 0, 0, NULL, 0, 0, '备件单独结差', '整机价不含资金占用费。', '资金占用月数暂按0，需复核；备件占用月数待确认。', '启用', 40);

CREATE TABLE IF NOT EXISTS `power_capexpricingitems` (
  `id` VARCHAR(128) NOT NULL COMMENT 'CAPEX/OPEX pricing item id',
  `versionId` VARCHAR(96) NOT NULL COMMENT 'pricing version id',
  `lineNo` INT NOT NULL DEFAULT 0 COMMENT 'line sequence',
  `deviceCode` VARCHAR(64) NOT NULL COMMENT 'device code',
  `modelCode` VARCHAR(128) NULL COMMENT 'model code snapshot',
  `nameZh` VARCHAR(255) NULL COMMENT 'Chinese name snapshot',
  `nameEn` VARCHAR(255) NULL COMMENT 'English name snapshot',
  `b6Type` VARCHAR(64) NOT NULL COMMENT 'B6 type',
  `spareScenario` VARCHAR(64) NULL COMMENT 'spare/maintenance scenario',
  `spareOccupancyMonths` INT NULL COMMENT 'spare occupancy months snapshot',
  `overseasSpareServiceAvailable` TINYINT(1) NULL COMMENT 'overseas spare service availability snapshot',
  `spareRate` DECIMAL(10, 6) NULL COMMENT 'spare rate snapshot',
  `spareSettlementMethod` VARCHAR(128) NULL COMMENT 'spare settlement method snapshot',
  `priceCurrency` VARCHAR(16) NOT NULL DEFAULT 'CNY' COMMENT 'equipment price currency',
  `contractCurrency` VARCHAR(16) NOT NULL DEFAULT 'USD' COMMENT 'SL contract currency',
  `baseCapexPrice` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'equipment price excluding VAT',
  `exchangeRate` DECIMAL(18, 10) NOT NULL DEFAULT 0 COMMENT 'equipment price to contract currency rate',
  `deviceVatRate` DECIMAL(10, 6) NOT NULL DEFAULT 0 COMMENT 'local device VAT rate',
  `serviceVatRate` DECIMAL(10, 6) NOT NULL DEFAULT 0 COMMENT 'local service VAT rate',
  `brazilServiceTaxRate` DECIMAL(10, 6) NOT NULL DEFAULT 0 COMMENT 'Brazil service tax rate',
  `onsiteRmaRate` DECIMAL(10, 6) NOT NULL DEFAULT 0 COMMENT 'onsite and RMA rate',
  `fundingAnnualRate` DECIMAL(10, 6) NOT NULL DEFAULT 0 COMMENT 'funding annual rate',
  `fundingMonths` INT NOT NULL DEFAULT 0 COMMENT 'funding months',
  `fundingRatio` DECIMAL(18, 10) NOT NULL DEFAULT 0 COMMENT 'funding ratio',
  `fundingAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'funding amount',
  `capexTotal` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'CAPEX total',
  `transportClearanceRate` DECIMAL(10, 6) NOT NULL DEFAULT 0 COMMENT 'transport and clearance rate',
  `handlingRate` DECIMAL(10, 6) NOT NULL DEFAULT 0 COMMENT 'handling rate',
  `otherTaxRate` DECIMAL(10, 6) NOT NULL DEFAULT 0 COMMENT 'other tax rate',
  `ddpPrice` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'DDP price',
  `opexAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'OPEX amount',
  `rawCapexAnchorUsd` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'raw CAPEX anchor USD',
  `rawOpexAnchorUsd` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'raw OPEX anchor USD',
  `capexAnchorUsd` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'system CAPEX anchor USD',
  `opexAnchorUsd` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'system OPEX anchor USD',
  `sourceSnapshotJson` LONGTEXT NULL COMMENT 'input source snapshot JSON',
  `b6RuleSnapshotJson` LONGTEXT NULL COMMENT 'B6 rule snapshot JSON',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_CapexPricingItems_version_line` (`versionId`, `lineNo`),
  KEY `idx_CapexPricingItems_version` (`versionId`),
  KEY `idx_CapexPricingItems_device` (`deviceCode`),
  KEY `idx_CapexPricingItems_version_device_b6` (`versionId`, `deviceCode`, `b6Type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='CapexOpexPricingItems';

CREATE TABLE IF NOT EXISTS `power_balancesettlements` (
  `settlementNo` VARCHAR(128) NOT NULL COMMENT 'settlement document number',
  `title` VARCHAR(255) NULL COMMENT 'settlement title',
  `countryCode` VARCHAR(32) NULL COMMENT 'country code',
  `pricingVersionId` VARCHAR(96) NULL COMMENT 'CAPEX/OPEX pricing version id',
  `pricingVersionNo` VARCHAR(128) NULL COMMENT 'CAPEX/OPEX pricing version snapshot',
  `currency` VARCHAR(16) NOT NULL DEFAULT 'USD' COMMENT 'settlement currency',
  `status` VARCHAR(32) NOT NULL DEFAULT '草稿' COMMENT '草稿/已确认/已作废',
  `periodStart` DATE NULL COMMENT 'settlement period start',
  `periodEnd` DATE NULL COMMENT 'settlement period end',
  `itemCount` INT NOT NULL DEFAULT 0 COMMENT 'item count',
  `capexDifferenceTotal` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'CAPEX difference total',
  `opexDifferenceTotal` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'OPEX difference total',
  `differenceTotal` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'difference total',
  `sourceFileName` VARCHAR(255) NULL COMMENT 'historical import source file',
  `notes` TEXT NULL COMMENT 'notes',
  `confirmedAt` DATETIME NULL COMMENT 'confirmed time',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`settlementNo`),
  KEY `idx_BalanceSettlements_country_status` (`countryCode`, `status`),
  KEY `idx_BalanceSettlements_createdAt` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BalanceSettlements';

CREATE TABLE IF NOT EXISTS `power_balancesettlementitems` (
  `id` VARCHAR(128) NOT NULL COMMENT 'settlement line id',
  `settlementNo` VARCHAR(128) NOT NULL COMMENT 'settlement document number',
  `lineNo` INT NOT NULL DEFAULT 0 COMMENT 'line sequence',
  `itemType` VARCHAR(32) NOT NULL DEFAULT '实例' COMMENT '实例/备件/非实例费用',
  `countryCode` VARCHAR(32) NULL COMMENT 'country code',
  `batchName` VARCHAR(255) NULL COMMENT 'batch name',
  `requestNo` VARCHAR(128) NULL COMMENT 'request number',
  `poNo` VARCHAR(128) NULL COMMENT 'PO number',
  `purchaseOrderItemId` VARCHAR(128) NULL COMMENT 'purchase order item id',
  `requestItemId` VARCHAR(128) NULL COMMENT 'request item id',
  `deviceCode` VARCHAR(64) NULL COMMENT 'device code',
  `modelCode` VARCHAR(128) NULL COMMENT 'model code snapshot',
  `nameEn` VARCHAR(255) NULL COMMENT 'English name snapshot',
  `supplierId` VARCHAR(64) NULL COMMENT 'supplier id snapshot',
  `undertakingUnitId` VARCHAR(64) NULL COMMENT 'undertaking unit id snapshot',
  `customerId` VARCHAR(64) NULL COMMENT 'customer id snapshot',
  `quantity` DECIMAL(18, 4) NOT NULL DEFAULT 1 COMMENT 'quantity',
  `receiptDate` DATE NULL COMMENT 'receipt date snapshot',
  `paymentDate` DATE NULL COMMENT 'payment date snapshot',
  `procurementCurrency` VARCHAR(16) NULL COMMENT 'procurement currency',
  `purchaseUnitPrice` DECIMAL(18, 4) NULL COMMENT 'purchase unit price snapshot',
  `purchaseCapexUnitPrice` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'purchase CAPEX unit price',
  `purchaseOpexUnitPrice` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'purchase OPEX unit price',
  `settlementCurrency` VARCHAR(16) NOT NULL DEFAULT 'USD' COMMENT 'settlement currency',
  `settlementRate` DECIMAL(18, 10) NOT NULL DEFAULT 1 COMMENT 'procurement currency per settlement currency',
  `settlementCapexUnitPrice` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'settlement CAPEX unit price',
  `settlementOpexUnitPrice` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'settlement OPEX unit price',
  `anchorVersionId` VARCHAR(96) NULL COMMENT 'anchor version id snapshot',
  `anchorVersionNo` VARCHAR(128) NULL COMMENT 'anchor version number snapshot',
  `anchorItemId` VARCHAR(128) NULL COMMENT 'anchor item id snapshot',
  `anchorCapexUnitPrice` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'anchor CAPEX unit price',
  `anchorOpexUnitPrice` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'anchor OPEX unit price',
  `capexDifferenceUnitPrice` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'CAPEX difference unit price',
  `capexDifferenceTotal` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'CAPEX difference total',
  `opexDifferenceUnitPrice` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'OPEX difference unit price',
  `opexDifferenceTotal` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'OPEX difference total',
  `differenceTotal` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'difference total',
  `expenseCategory` VARCHAR(128) NULL COMMENT 'non-instance expense category',
  `expenseName` VARCHAR(255) NULL COMMENT 'non-instance expense name',
  `expenseType` VARCHAR(64) NULL COMMENT 'structured non-instance expense type',
  `differenceNature` VARCHAR(16) NULL COMMENT 'CAPEX or OPEX',
  `expenseDate` DATE NULL COMMENT 'expense date',
  `documentNo` VARCHAR(128) NULL COMMENT 'source document number',
  `deviceNodeQuantity` DECIMAL(18, 4) NULL COMMENT 'device node quantity',
  `deliveryQuantity` DECIMAL(18, 4) NULL COMMENT 'delivery quantity',
  `settlementQuantity` DECIMAL(18, 4) NULL COMMENT 'settlement quantity',
  `taxExcludedUnitPriceUsd` DECIMAL(18, 4) NULL COMMENT 'tax excluded unit price in USD',
  `priceConfirmation` VARCHAR(16) NULL COMMENT 'price confirmation YES or NO',
  `paymentExchangeRate` DECIMAL(18, 10) NULL COMMENT 'payment exchange rate',
  `taxExcludedTotalUsd` DECIMAL(18, 4) NULL COMMENT 'tax excluded total in USD',
  `taxExcludedTotalCny` DECIMAL(18, 4) NULL COMMENT 'tax excluded total in CNY',
  `equipmentTotalUsd` DECIMAL(18, 4) NULL COMMENT 'equipment total in USD',
  `localTaxRate` DECIMAL(10, 6) NULL COMMENT 'local tax rate',
  `calculatedTaxAmountUsd` DECIMAL(18, 4) NULL COMMENT 'calculated tax amount in USD',
  `feeCurrency` VARCHAR(16) NULL COMMENT 'fee original currency',
  `feeAmount` DECIMAL(18, 4) NULL COMMENT 'fee original amount',
  `expenseProvider` VARCHAR(255) NULL COMMENT 'expense provider',
  `usdExchangeRate` DECIMAL(18, 10) NULL COMMENT 'original currency per USD',
  `settlementAmountUsd` DECIMAL(18, 4) NULL COMMENT 'settlement amount in USD',
  `issRate` DECIMAL(10, 6) NULL COMMENT 'ISS tax rate',
  `issExcludedAmountUsd` DECIMAL(18, 4) NULL COMMENT 'amount excluding ISS in USD',
  `confirmationResult` VARCHAR(16) NULL COMMENT 'confirmation result',
  `sourceReference` VARCHAR(255) NULL COMMENT 'source reference',
  `sourceSnapshotJson` LONGTEXT NULL COMMENT 'source data snapshot JSON',
  `notes` TEXT NULL COMMENT 'notes',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`id`),
  KEY `idx_BalanceSettlementItems_settlement` (`settlementNo`, `lineNo`),
  KEY `idx_BalanceSettlementItems_purchase` (`purchaseOrderItemId`),
  KEY `idx_BalanceSettlementItems_country_batch` (`countryCode`, `batchName`),
  KEY `idx_BalanceSettlementItems_type` (`itemType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BalanceSettlementItems';

CREATE TABLE IF NOT EXISTS `power_balancesettlementfinals` (
  `finalSettlementNo` VARCHAR(128) NOT NULL COMMENT 'final settlement document number',
  `title` VARCHAR(255) NULL COMMENT 'final settlement title',
  `countryCode` VARCHAR(32) NOT NULL COMMENT 'country code',
  `currency` VARCHAR(16) NOT NULL COMMENT 'settlement currency',
  `status` VARCHAR(32) NOT NULL DEFAULT 'draft' COMMENT 'draft/confirmed/voided',
  `periodStart` DATE NOT NULL COMMENT 'settlement period start',
  `periodEnd` DATE NOT NULL COMMENT 'settlement period end',
  `sourceCount` INT NOT NULL DEFAULT 0 COMMENT 'source document count',
  `itemCount` INT NOT NULL DEFAULT 0 COMMENT 'source item count',
  `capexDifferenceTotal` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'CAPEX difference total',
  `opexDifferenceTotal` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'OPEX difference total',
  `differenceTotal` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'difference total',
  `notes` TEXT NULL COMMENT 'notes',
  `confirmedAt` DATETIME NULL COMMENT 'confirmed time',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
  PRIMARY KEY (`finalSettlementNo`),
  KEY `idx_BalanceSettlementFinals_filter` (`countryCode`, `currency`, `status`, `periodStart`, `periodEnd`),
  KEY `idx_BalanceSettlementFinals_createdAt` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BalanceSettlementFinals';

CREATE TABLE IF NOT EXISTS `power_balancesettlementfinalsources` (
  `id` VARCHAR(128) NOT NULL COMMENT 'final settlement source id',
  `finalSettlementNo` VARCHAR(128) NOT NULL COMMENT 'final settlement document number',
  `sourceSettlementNo` VARCHAR(128) NOT NULL COMMENT 'source settlement document number',
  `sourceTitle` VARCHAR(255) NULL COMMENT 'source settlement title snapshot',
  `sourceItemTypes` VARCHAR(255) NULL COMMENT 'source item type snapshot',
  `countryCode` VARCHAR(32) NOT NULL COMMENT 'country code snapshot',
  `currency` VARCHAR(16) NOT NULL COMMENT 'currency snapshot',
  `periodStart` DATE NOT NULL COMMENT 'period start snapshot',
  `periodEnd` DATE NOT NULL COMMENT 'period end snapshot',
  `itemCount` INT NOT NULL DEFAULT 0 COMMENT 'source item count snapshot',
  `capexDifferenceTotal` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'CAPEX difference total snapshot',
  `opexDifferenceTotal` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'OPEX difference total snapshot',
  `differenceTotal` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'difference total snapshot',
  `sourceSnapshotJson` LONGTEXT NULL COMMENT 'source settlement snapshot JSON',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_BalanceSettlementFinalSources_final_source` (`finalSettlementNo`, `sourceSettlementNo`),
  KEY `idx_BalanceSettlementFinalSources_source` (`sourceSettlementNo`),
  KEY `idx_BalanceSettlementFinalSources_final` (`finalSettlementNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BalanceSettlementFinalSources';

CREATE TABLE IF NOT EXISTS `power_internalserviceledgers` (
  `ledgerId` VARCHAR(96) NOT NULL,
  `countryCode` VARCHAR(32) NULL, `batchName` VARCHAR(255) NULL, `requestNo` VARCHAR(128) NULL, `poNo` VARCHAR(128) NULL,
  `deviceCode` VARCHAR(64) NULL, `modelCode` VARCHAR(128) NULL, `nameEn` VARCHAR(255) NULL,
  `supplierId` VARCHAR(64) NULL, `undertakingUnitId` VARCHAR(64) NULL, `customerId` VARCHAR(64) NULL, `quantity` INT NULL, `currency` VARCHAR(16) NULL,
  `vatRate` DECIMAL(10,6) NULL, `procurementTaxExcludedUnitPrice` DECIMAL(18,4) NULL, `procurementTaxSurcharge` DECIMAL(18,4) NULL,
  `contractRevenueIncludingTax` DECIMAL(18,2) NULL, `contractRevenueExcludingTax` DECIMAL(18,2) NULL,
  `procurementCost` DECIMAL(18,2) NULL, `internalServiceFeeTotal` DECIMAL(18,2) NULL, `archivedAmount` DECIMAL(18,2) NULL,
  `manualAmount` DECIMAL(18,2) NULL, `remainingAmount` DECIMAL(18,2) NULL, `unallocatedAmount` DECIMAL(18,2) NULL,
  `startMonth` DATE NULL, `status` VARCHAR(32) NOT NULL DEFAULT '已生成',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ledgerId`), KEY `idx_InternalServiceLedgers_country` (`countryCode`), KEY `idx_InternalServiceLedgers_request` (`requestNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='InternalServiceLedgers';

CREATE TABLE IF NOT EXISTS `power_monthlyinternalservicefees` (
  `id` VARCHAR(128) NOT NULL, `ledgerId` VARCHAR(96) NOT NULL, `writeOffMonth` DATE NOT NULL, `monthIndex` INT NOT NULL,
  `countryCode` VARCHAR(32) NULL, `batchName` VARCHAR(255) NULL, `requestNo` VARCHAR(128) NULL, `poNo` VARCHAR(128) NULL,
  `deviceCode` VARCHAR(64) NULL, `modelCode` VARCHAR(128) NULL, `nameEn` VARCHAR(255) NULL, `supplierId` VARCHAR(64) NULL,
  `undertakingUnitId` VARCHAR(64) NULL, `customerId` VARCHAR(64) NULL, `quantity` INT NULL, `currency` VARCHAR(16) NULL,
  `internalServiceFeeAmount` DECIMAL(18,2) NOT NULL DEFAULT 0, `sourceType` VARCHAR(32) NOT NULL DEFAULT 'auto',
  `adjustmentNo` VARCHAR(128) NULL, `archived` BOOLEAN NOT NULL DEFAULT FALSE, `archiveSnapshotNo` VARCHAR(128) NULL, `archivedAt` DATETIME NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `uk_MonthlyInternalServiceFees_ledger_month` (`ledgerId`, `writeOffMonth`),
  KEY `idx_MonthlyInternalServiceFees_month` (`writeOffMonth`), KEY `idx_MonthlyInternalServiceFees_country` (`countryCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MonthlyInternalServiceFees';

CREATE TABLE IF NOT EXISTS `power_internalservicefeeadjustments` (
  `adjustmentNo` VARCHAR(128) NOT NULL, `ledgerId` VARCHAR(96) NOT NULL, `countryCode` VARCHAR(32) NULL,
  `batchName` VARCHAR(255) NULL, `requestNo` VARCHAR(128) NULL, `poNo` VARCHAR(128) NULL, `deviceCode` VARCHAR(64) NULL,
  `supplierId` VARCHAR(64) NULL, `undertakingUnitId` VARCHAR(64) NULL, `customerId` VARCHAR(64) NULL, `startMonth` DATE NOT NULL, `endMonth` DATE NOT NULL,
  `monthlyAmount` DECIMAL(18,2) NOT NULL, `reason` TEXT NULL, `status` VARCHAR(32) NOT NULL DEFAULT '已确认',
  `confirmedAt` DATETIME NULL, `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`adjustmentNo`), KEY `idx_InternalServiceFeeAdjustments_ledger` (`ledgerId`), KEY `idx_InternalServiceFeeAdjustments_range` (`startMonth`, `endMonth`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='InternalServiceFeeAdjustments';

CREATE TABLE IF NOT EXISTS `power_internalservicefeesnapshots` (
  `snapshotNo` VARCHAR(128) NOT NULL, `archiveMonth` DATE NOT NULL, `countryCode` VARCHAR(32) NULL,
  `itemCount` INT NOT NULL DEFAULT 0, `totalAmount` DECIMAL(18,2) NOT NULL DEFAULT 0, `confirmedAt` DATETIME NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`snapshotNo`), KEY `idx_InternalServiceFeeSnapshots_month` (`archiveMonth`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='InternalServiceFeeSnapshots';

CREATE TABLE IF NOT EXISTS `power_internalservicefeesnapshotitems` (
  `id` VARCHAR(160) NOT NULL, `snapshotNo` VARCHAR(128) NOT NULL, `monthlyFeeId` VARCHAR(128) NOT NULL, `ledgerId` VARCHAR(96) NOT NULL,
  `writeOffMonth` DATE NOT NULL, `countryCode` VARCHAR(32) NULL, `batchName` VARCHAR(255) NULL, `requestNo` VARCHAR(128) NULL,
  `poNo` VARCHAR(128) NULL, `deviceCode` VARCHAR(64) NULL, `supplierId` VARCHAR(64) NULL, `undertakingUnitId` VARCHAR(64) NULL, `customerId` VARCHAR(64) NULL,
  `currency` VARCHAR(16) NULL, `internalServiceFeeAmount` DECIMAL(18,2) NOT NULL, `sourceType` VARCHAR(32) NULL,
  `adjustmentNo` VARCHAR(128) NULL, `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), KEY `idx_InternalServiceFeeSnapshotItems_snapshot` (`snapshotNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='InternalServiceFeeSnapshotItems';
