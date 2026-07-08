import { closeDb, execute, queryRows } from "../src/lib/db";

async function columnExists(tableName: string, columnName: string) {
  const rows = await queryRows<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :tableName
        AND COLUMN_NAME = :columnName
    `,
    { tableName, columnName },
  );

  return Number(rows[0]?.count ?? 0) > 0;
}

async function addColumnIfMissing(tableName: string, columnName: string, ddl: string) {
  if (!(await columnExists(tableName, columnName))) {
    await execute(`ALTER TABLE \`${tableName}\` ADD COLUMN ${ddl}`);
  }
}

async function addIndexIfMissing(tableName: string, indexName: string, ddl: string) {
  const rows = await queryRows<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :tableName
        AND INDEX_NAME = :indexName
    `,
    { tableName, indexName },
  );

  if (Number(rows[0]?.count ?? 0) === 0) {
    await execute(`ALTER TABLE \`${tableName}\` ADD ${ddl}`);
  }
}

async function createTableIfMissing(tableName: string, ddl: string) {
  const rows = await queryRows<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :tableName
    `,
    { tableName },
  );

  if (Number(rows[0]?.count ?? 0) === 0) {
    await execute(ddl);
  }
}

async function main() {
  await addColumnIfMissing(
    "instancecontracts",
    "deviceCode",
    "`deviceCode` VARCHAR(64) NULL COMMENT 'device code' AFTER `countryCode`",
  );
  await addColumnIfMissing(
    "instancecontracts",
    "modelCode",
    "`modelCode` VARCHAR(128) NULL COMMENT 'model code' AFTER `deviceCode`",
  );
  await addColumnIfMissing(
    "instancecontracts",
    "instanceModelEn",
    "`instanceModelEn` VARCHAR(255) NULL COMMENT 'instance model english name' AFTER `modelCode`",
  );
  await addColumnIfMissing(
    "instancecontracts",
    "currency",
    "`currency` VARCHAR(16) NULL COMMENT 'currency' AFTER `instanceModelEn`",
  );
  await addColumnIfMissing(
    "instancecontracts",
    "first24MonthPriceUSD",
    "`first24MonthPriceUSD` DECIMAL(18, 4) NULL COMMENT 'first 24 month tax included unit price' AFTER `currency`",
  );
  await addColumnIfMissing(
    "instancecontracts",
    "next36MonthPriceUSD",
    "`next36MonthPriceUSD` DECIMAL(18, 4) NULL COMMENT 'next 36 month tax included unit price' AFTER `first24MonthPriceUSD`",
  );
  await addIndexIfMissing(
    "instancecontracts",
    "idx_InstanceContracts_deviceCode",
    "KEY `idx_InstanceContracts_deviceCode` (`deviceCode`)",
  );
  await addColumnIfMissing(
    "requests",
    "countryCode",
    "`countryCode` VARCHAR(32) NULL COMMENT 'country code' AFTER `requestNo`",
  );
  await addColumnIfMissing(
    "requests",
    "plannedDeliveryDate",
    "`plannedDeliveryDate` DATE NULL COMMENT 'planned delivery date' AFTER `status`",
  );
  await addIndexIfMissing(
    "requests",
    "idx_Requests_countryCode",
    "KEY `idx_Requests_countryCode` (`countryCode`)",
  );
  await execute(
    `
      UPDATE requests
      SET countryCode = CASE
        WHEN requestNo LIKE 'REQ-2026-003%' OR contractNo LIKE '%BR%' THEN 'BR'
        WHEN contractNo LIKE '%CL%' THEN 'CL'
        ELSE countryCode
      END
      WHERE countryCode IS NULL OR countryCode = ''
    `,
  );
  await addColumnIfMissing(
    "purchaseorders",
    "requestNo",
    "`requestNo` VARCHAR(128) NULL COMMENT 'source request no' AFTER `poNo`",
  );
  await addColumnIfMissing(
    "purchaseorders",
    "status",
    "`status` VARCHAR(64) NOT NULL DEFAULT '草稿' COMMENT 'purchase status' AFTER `requestNo`",
  );
  await addIndexIfMissing(
    "purchaseorders",
    "idx_PurchaseOrders_requestNo",
    "KEY `idx_PurchaseOrders_requestNo` (`requestNo`)",
  );
  await addIndexIfMissing(
    "purchaseorders",
    "idx_PurchaseOrders_status",
    "KEY `idx_PurchaseOrders_status` (`status`)",
  );

  await addColumnIfMissing(
    "prepaymentcontracts",
    "status",
    "`status` VARCHAR(64) NOT NULL DEFAULT '草稿' COMMENT 'prepayment contract status' AFTER `contractNo`",
  );
  await addColumnIfMissing(
    "prepaymentcontracts",
    "currency",
    "`currency` VARCHAR(16) NULL COMMENT 'contract currency' AFTER `status`",
  );
  await addColumnIfMissing(
    "prepaymentcontracts",
    "totalAmount",
    "`totalAmount` DECIMAL(18, 4) NULL COMMENT 'contract total amount' AFTER `effectiveDate`",
  );
  await addColumnIfMissing(
    "prepaymentcontracts",
    "confirmedAt",
    "`confirmedAt` DATETIME NULL COMMENT 'confirmed time' AFTER `totalAmount`",
  );
  await addColumnIfMissing(
    "prepaymentcontracts",
    "createdAt",
    "`createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time' AFTER `confirmedAt`",
  );
  await addColumnIfMissing(
    "prepaymentcontracts",
    "updatedAt",
    "`updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time' AFTER `createdAt`",
  );

  await addColumnIfMissing(
    "prepaymentcontractitems",
    "lineType",
    "`lineType` VARCHAR(32) NOT NULL DEFAULT 'instance' COMMENT 'instance/fee' AFTER `contractNo`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "purchaseOrderItemId",
    "`purchaseOrderItemId` VARCHAR(64) NULL COMMENT 'purchase order item id' AFTER `lineType`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "requestItemId",
    "`requestItemId` VARCHAR(64) NULL COMMENT 'request item id' AFTER `purchaseOrderItemId`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "batchName",
    "`batchName` VARCHAR(255) NULL COMMENT 'batch name' AFTER `requestItemId`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "countryCode",
    "`countryCode` VARCHAR(32) NULL COMMENT 'country code' AFTER `requestItemId`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "requestNo",
    "`requestNo` VARCHAR(128) NULL COMMENT 'request no' AFTER `batchName`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "poNo",
    "`poNo` VARCHAR(128) NULL COMMENT 'PO no' AFTER `requestNo`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "deviceCode",
    "`deviceCode` VARCHAR(64) NULL COMMENT 'device code' AFTER `poNo`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "modelCode",
    "`modelCode` VARCHAR(128) NULL COMMENT 'model code' AFTER `deviceCode`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "nameEn",
    "`nameEn` VARCHAR(255) NULL COMMENT 'instance english name' AFTER `modelCode`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "quantity",
    "`quantity` INT NULL COMMENT 'quantity' AFTER `nameEn`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "actualCurrency",
    "`actualCurrency` VARCHAR(16) NULL COMMENT 'actual currency' AFTER `quantity`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "actualUnitPrice",
    "`actualUnitPrice` DECIMAL(18, 4) NULL COMMENT 'actual unit price' AFTER `actualCurrency`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "actualTotalAmount",
    "`actualTotalAmount` DECIMAL(18, 4) NULL COMMENT 'actual total amount' AFTER `actualUnitPrice`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "contractCurrency",
    "`contractCurrency` VARCHAR(16) NULL COMMENT 'contract currency' AFTER `actualTotalAmount`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "contractUnitPrice",
    "`contractUnitPrice` DECIMAL(18, 4) NULL COMMENT 'contract unit price' AFTER `contractCurrency`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "contractTotalAmount",
    "`contractTotalAmount` DECIMAL(18, 4) NULL COMMENT 'contract total amount' AFTER `contractUnitPrice`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "writeOffStartMonth",
    "`writeOffStartMonth` DATE NULL COMMENT 'write-off start month' AFTER `contractTotalAmount`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "feeName",
    "`feeName` VARCHAR(255) NULL COMMENT 'fee name' AFTER `writeOffStartMonth`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "feeDescription",
    "`feeDescription` TEXT NULL COMMENT 'fee description' AFTER `feeName`",
  );
  await addIndexIfMissing(
    "prepaymentcontractitems",
    "idx_PrepaymentContractItems_purchaseOrderItemId",
    "KEY `idx_PrepaymentContractItems_purchaseOrderItemId` (`purchaseOrderItemId`)",
  );
  await execute(
    `
      UPDATE prepaymentcontractitems pci
      LEFT JOIN requests req ON req.requestNo = pci.requestNo
      SET pci.countryCode = req.countryCode
      WHERE (pci.countryCode IS NULL OR pci.countryCode = '')
        AND req.countryCode IS NOT NULL
    `,
  );

  await createTableIfMissing(
    "monthlyprepaymentwriteoffs",
    `
      CREATE TABLE \`monthlyprepaymentwriteoffs\` (
        \`id\` VARCHAR(96) NOT NULL COMMENT 'monthly write-off id',
        \`contractNo\` VARCHAR(128) NOT NULL COMMENT 'prepayment contract no',
        \`contractLineId\` VARCHAR(64) NOT NULL COMMENT 'prepayment contract line id',
        \`writeOffMonth\` DATE NOT NULL COMMENT 'write-off month first day',
        \`monthIndex\` INT NOT NULL COMMENT 'month index',
        \`totalMonths\` INT NOT NULL COMMENT 'total months',
        \`currency\` VARCHAR(16) NULL COMMENT 'currency',
        \`originalAmount\` DECIMAL(18, 4) NULL COMMENT 'original amount',
        \`monthlyAmount\` DECIMAL(18, 4) NULL COMMENT 'monthly write-off amount',
        \`lineType\` VARCHAR(32) NULL COMMENT 'instance/fee',
        \`countryCode\` VARCHAR(32) NULL COMMENT 'country code',
        \`batchName\` VARCHAR(255) NULL COMMENT 'batch name',
        \`requestNo\` VARCHAR(128) NULL COMMENT 'request no',
        \`poNo\` VARCHAR(128) NULL COMMENT 'PO no',
        \`deviceCode\` VARCHAR(64) NULL COMMENT 'device code',
        \`modelCode\` VARCHAR(128) NULL COMMENT 'model code',
        \`nameEn\` VARCHAR(255) NULL COMMENT 'instance english name',
        \`quantity\` INT NULL COMMENT 'quantity',
        \`sourceType\` VARCHAR(64) NULL COMMENT 'source type',
        \`adjustmentNo\` VARCHAR(128) NULL COMMENT 'adjustment no',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        PRIMARY KEY (\`id\`),
        KEY \`idx_MonthlyPrepaymentWriteOffs_contractNo\` (\`contractNo\`),
        KEY \`idx_MonthlyPrepaymentWriteOffs_writeOffMonth\` (\`writeOffMonth\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MonthlyPrepaymentWriteOffs'
    `,
  );
  await addColumnIfMissing(
    "monthlyprepaymentwriteoffs",
    "countryCode",
    "`countryCode` VARCHAR(32) NULL COMMENT 'country code' AFTER `lineType`",
  );
  await addColumnIfMissing(
    "monthlyprepaymentwriteoffs",
    "sourceType",
    "`sourceType` VARCHAR(64) NULL COMMENT 'source type' AFTER `quantity`",
  );
  await addColumnIfMissing(
    "monthlyprepaymentwriteoffs",
    "adjustmentNo",
    "`adjustmentNo` VARCHAR(128) NULL COMMENT 'adjustment no' AFTER `sourceType`",
  );
  await execute(
    `
      UPDATE monthlyprepaymentwriteoffs mwo
      LEFT JOIN prepaymentcontractitems pci ON pci.id = mwo.contractLineId
      SET mwo.countryCode = pci.countryCode
      WHERE (mwo.countryCode IS NULL OR mwo.countryCode = '')
        AND pci.countryCode IS NOT NULL
    `,
  );
  await createTableIfMissing(
    "prepaymentwriteoffadjustments",
    `
      CREATE TABLE \`prepaymentwriteoffadjustments\` (
        \`adjustmentNo\` VARCHAR(128) NOT NULL COMMENT 'adjustment no',
        \`status\` VARCHAR(64) NOT NULL DEFAULT '草稿' COMMENT 'adjustment status',
        \`countryCode\` VARCHAR(32) NULL COMMENT 'country code',
        \`batchName\` VARCHAR(255) NULL COMMENT 'batch name',
        \`contractNo\` VARCHAR(128) NULL COMMENT 'prepayment contract no',
        \`itemCount\` INT NOT NULL DEFAULT 0 COMMENT 'item count',
        \`differenceTotal\` DECIMAL(18, 4) NULL COMMENT 'difference total',
        \`reason\` TEXT NULL COMMENT 'adjustment reason',
        \`confirmedAt\` DATETIME NULL COMMENT 'confirmed time',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
        PRIMARY KEY (\`adjustmentNo\`),
        KEY \`idx_PrepaymentWriteOffAdjustments_status\` (\`status\`),
        KEY \`idx_PrepaymentWriteOffAdjustments_contractNo\` (\`contractNo\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PrepaymentWriteOffAdjustments'
    `,
  );
  await createTableIfMissing(
    "prepaymentwriteoffadjustmentitems",
    `
      CREATE TABLE \`prepaymentwriteoffadjustmentitems\` (
        \`id\` VARCHAR(160) NOT NULL COMMENT 'adjustment item id',
        \`adjustmentNo\` VARCHAR(128) NOT NULL COMMENT 'adjustment no',
        \`monthlyWriteOffId\` VARCHAR(96) NOT NULL COMMENT 'monthly write-off id',
        \`contractNo\` VARCHAR(128) NULL COMMENT 'prepayment contract no',
        \`contractLineId\` VARCHAR(64) NULL COMMENT 'prepayment contract line id',
        \`writeOffMonth\` DATE NULL COMMENT 'write-off month',
        \`countryCode\` VARCHAR(32) NULL COMMENT 'country code',
        \`batchName\` VARCHAR(255) NULL COMMENT 'batch name',
        \`requestNo\` VARCHAR(128) NULL COMMENT 'request no',
        \`poNo\` VARCHAR(128) NULL COMMENT 'PO no',
        \`deviceCode\` VARCHAR(64) NULL COMMENT 'device code',
        \`modelCode\` VARCHAR(128) NULL COMMENT 'model code',
        \`nameEn\` VARCHAR(255) NULL COMMENT 'instance english name',
        \`quantity\` INT NULL COMMENT 'quantity',
        \`currency\` VARCHAR(16) NULL COMMENT 'currency',
        \`originalMonthlyAmount\` DECIMAL(18, 4) NULL COMMENT 'original monthly amount',
        \`adjustedMonthlyAmount\` DECIMAL(18, 4) NULL COMMENT 'adjusted monthly amount',
        \`differenceAmount\` DECIMAL(18, 4) NULL COMMENT 'difference amount',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        PRIMARY KEY (\`id\`),
        KEY \`idx_PrepaymentWriteOffAdjustmentItems_adjustmentNo\` (\`adjustmentNo\`),
        KEY \`idx_PrepaymentWriteOffAdjustmentItems_monthlyWriteOffId\` (\`monthlyWriteOffId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PrepaymentWriteOffAdjustmentItems'
    `,
  );
  await createTableIfMissing(
    "billinginstanceledgers",
    `
      CREATE TABLE \`billinginstanceledgers\` (
        \`ledgerId\` VARCHAR(96) NOT NULL COMMENT 'billing ledger id',
        \`purchaseOrderItemId\` VARCHAR(64) NOT NULL COMMENT 'purchase order item id',
        \`countryCode\` VARCHAR(32) NULL COMMENT 'country code',
        \`batchName\` VARCHAR(255) NULL COMMENT 'batch name',
        \`requestNo\` VARCHAR(128) NULL COMMENT 'request no',
        \`poNo\` VARCHAR(128) NULL COMMENT 'PO no',
        \`deviceCode\` VARCHAR(64) NULL COMMENT 'device code',
        \`modelCode\` VARCHAR(128) NULL COMMENT 'model code',
        \`nameEn\` VARCHAR(255) NULL COMMENT 'instance english name',
        \`quantity\` INT NULL COMMENT 'quantity',
        \`actualCurrency\` VARCHAR(16) NULL COMMENT 'actual currency',
        \`actualUnitPrice\` DECIMAL(18, 4) NULL COMMENT 'actual unit price',
        \`instanceContractNo\` VARCHAR(128) NULL COMMENT 'locked instance contract no',
        \`contractCurrency\` VARCHAR(16) NULL COMMENT 'contract currency',
        \`first24MonthPrice\` DECIMAL(18, 4) NULL COMMENT 'first 24 month price',
        \`next36MonthPrice\` DECIMAL(18, 4) NULL COMMENT 'next 36 month price',
        \`startMonth\` DATE NULL COMMENT 'billing start month',
        \`status\` VARCHAR(64) NOT NULL DEFAULT '核销中' COMMENT 'billing status',
        \`confirmedAt\` DATETIME NULL COMMENT 'confirmed time',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
        PRIMARY KEY (\`ledgerId\`),
        UNIQUE KEY \`uk_BillingInstanceLedgers_purchaseOrderItemId\` (\`purchaseOrderItemId\`),
        KEY \`idx_BillingInstanceLedgers_requestNo\` (\`requestNo\`),
        KEY \`idx_BillingInstanceLedgers_deviceCode\` (\`deviceCode\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BillingInstanceLedgers'
    `,
  );
  await createTableIfMissing(
    "monthlybillingwriteoffs",
    `
      CREATE TABLE \`monthlybillingwriteoffs\` (
        \`id\` VARCHAR(112) NOT NULL COMMENT 'monthly billing write-off id',
        \`ledgerId\` VARCHAR(96) NOT NULL COMMENT 'billing ledger id',
        \`writeOffMonth\` DATE NOT NULL COMMENT 'write-off month first day',
        \`monthIndex\` INT NOT NULL COMMENT 'month index',
        \`stage\` VARCHAR(32) NULL COMMENT 'first24/next36 stage',
        \`countryCode\` VARCHAR(32) NULL COMMENT 'country code',
        \`batchName\` VARCHAR(255) NULL COMMENT 'batch name',
        \`requestNo\` VARCHAR(128) NULL COMMENT 'request no',
        \`poNo\` VARCHAR(128) NULL COMMENT 'PO no',
        \`deviceCode\` VARCHAR(64) NULL COMMENT 'device code',
        \`modelCode\` VARCHAR(128) NULL COMMENT 'model code',
        \`nameEn\` VARCHAR(255) NULL COMMENT 'instance english name',
        \`quantity\` INT NULL COMMENT 'quantity',
        \`instanceContractNo\` VARCHAR(128) NULL COMMENT 'instance contract no',
        \`currency\` VARCHAR(16) NULL COMMENT 'currency',
        \`monthlyAmount\` DECIMAL(18, 4) NULL COMMENT 'monthly amount',
        \`monthlyTotalAmount\` DECIMAL(18, 4) NULL COMMENT 'monthly total amount',
        \`sourceType\` VARCHAR(32) NULL COMMENT 'initial/adjustment',
        \`adjustmentNo\` VARCHAR(128) NULL COMMENT 'adjustment no',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        PRIMARY KEY (\`id\`),
        KEY \`idx_MonthlyBillingWriteOffs_ledgerId\` (\`ledgerId\`),
        KEY \`idx_MonthlyBillingWriteOffs_writeOffMonth\` (\`writeOffMonth\`),
        KEY \`idx_MonthlyBillingWriteOffs_adjustmentNo\` (\`adjustmentNo\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MonthlyBillingWriteOffs'
    `,
  );
  await addColumnIfMissing(
    "monthlybillingwriteoffs",
    "monthlyTotalAmount",
    "`monthlyTotalAmount` DECIMAL(18, 4) NULL COMMENT 'monthly total amount' AFTER `monthlyAmount`",
  );
  await execute(
    "UPDATE monthlybillingwriteoffs SET monthlyTotalAmount = ROUND(COALESCE(quantity, 0) * COALESCE(monthlyAmount, 0), 4) WHERE monthlyTotalAmount IS NULL",
  );
  await execute(
    `
      UPDATE monthlybillingwriteoffs mbw
      INNER JOIN billingadjustments ba ON ba.adjustmentNo = mbw.adjustmentNo
      SET mbw.currency = ba.currency,
          mbw.monthlyTotalAmount = ROUND(COALESCE(mbw.quantity, 0) * COALESCE(mbw.monthlyAmount, 0), 4)
      WHERE COALESCE(mbw.adjustmentNo, '') <> ''
        AND COALESCE(ba.currency, '') <> ''
    `,
  );
  await createTableIfMissing(
    "billingadjustments",
    `
      CREATE TABLE \`billingadjustments\` (
        \`adjustmentNo\` VARCHAR(128) NOT NULL COMMENT 'adjustment no',
        \`status\` VARCHAR(64) NOT NULL DEFAULT '草稿' COMMENT 'adjustment status',
        \`countryCode\` VARCHAR(32) NULL COMMENT 'country code',
        \`batchName\` VARCHAR(255) NULL COMMENT 'batch name',
        \`deviceCode\` VARCHAR(64) NULL COMMENT 'device code',
        \`currency\` VARCHAR(16) NOT NULL DEFAULT 'USD' COMMENT 'currency',
        \`effectiveMonth\` DATE NULL COMMENT 'effective month',
        \`adjustedFirst24MonthPrice\` DECIMAL(18, 4) NULL COMMENT 'adjusted first 24 month price',
        \`adjustedNext36MonthPrice\` DECIMAL(18, 4) NULL COMMENT 'adjusted next 36 month price',
        \`reason\` TEXT NULL COMMENT 'adjustment reason',
        \`confirmedAt\` DATETIME NULL COMMENT 'confirmed time',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
        PRIMARY KEY (\`adjustmentNo\`),
        KEY \`idx_BillingAdjustments_target\` (\`countryCode\`, \`batchName\`, \`deviceCode\`),
        KEY \`idx_BillingAdjustments_effectiveMonth\` (\`effectiveMonth\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BillingAdjustments'
    `,
  );
  await addColumnIfMissing(
    "billingadjustments",
    "currency",
    "`currency` VARCHAR(16) NOT NULL DEFAULT 'USD' COMMENT 'currency' AFTER `deviceCode`",
  );
  await createTableIfMissing(
    "servicefeesnapshots",
    `
      CREATE TABLE \`servicefeesnapshots\` (
        \`snapshotNo\` VARCHAR(128) NOT NULL COMMENT 'service fee snapshot no',
        \`status\` VARCHAR(64) NOT NULL DEFAULT '已确认' COMMENT 'snapshot status',
        \`startMonth\` DATE NULL COMMENT 'start month',
        \`endMonth\` DATE NULL COMMENT 'end month',
        \`countryCode\` VARCHAR(32) NULL COMMENT 'country code',
        \`batchName\` VARCHAR(255) NULL COMMENT 'batch name',
        \`keyword\` VARCHAR(255) NULL COMMENT 'keyword filter',
        \`billingTotal\` DECIMAL(18, 4) NULL COMMENT 'billing total',
        \`prepaymentTotal\` DECIMAL(18, 4) NULL COMMENT 'prepayment total',
        \`serviceFeeTotal\` DECIMAL(18, 4) NULL COMMENT 'service fee total',
        \`instanceServiceFeeTotal\` DECIMAL(18, 4) NULL COMMENT 'instance service fee total',
        \`feeServiceFeeTotal\` DECIMAL(18, 4) NULL COMMENT 'non-instance fee service fee total',
        \`confirmedAt\` DATETIME NULL COMMENT 'confirmed time',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
        PRIMARY KEY (\`snapshotNo\`),
        KEY \`idx_ServiceFeeSnapshots_months\` (\`startMonth\`, \`endMonth\`),
        KEY \`idx_ServiceFeeSnapshots_countryCode\` (\`countryCode\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ServiceFeeSnapshots'
    `,
  );
  await createTableIfMissing(
    "servicefeesnapshotitems",
    `
      CREATE TABLE \`servicefeesnapshotitems\` (
        \`id\` VARCHAR(160) NOT NULL COMMENT 'service fee snapshot item id',
        \`snapshotNo\` VARCHAR(128) NOT NULL COMMENT 'service fee snapshot no',
        \`writeOffMonth\` DATE NOT NULL COMMENT 'write-off month',
        \`countryCode\` VARCHAR(32) NULL COMMENT 'country code',
        \`batchName\` VARCHAR(255) NULL COMMENT 'batch name',
        \`requestNo\` VARCHAR(128) NULL COMMENT 'request no',
        \`poNo\` VARCHAR(128) NULL COMMENT 'PO no',
        \`deviceCode\` VARCHAR(64) NULL COMMENT 'device code',
        \`modelCode\` VARCHAR(128) NULL COMMENT 'model code',
        \`nameEn\` VARCHAR(255) NULL COMMENT 'english name',
        \`quantity\` INT NULL COMMENT 'quantity',
        \`currency\` VARCHAR(16) NULL COMMENT 'currency',
        \`billingCurrency\` VARCHAR(16) NULL COMMENT 'monthly billing currency',
        \`prepaymentCurrency\` VARCHAR(16) NULL COMMENT 'monthly prepayment currency',
        \`lineType\` VARCHAR(32) NULL COMMENT 'instance/fee',
        \`billingAmount\` DECIMAL(18, 4) NULL COMMENT 'monthly billing amount',
        \`prepaymentAmount\` DECIMAL(18, 4) NULL COMMENT 'monthly prepayment amount',
        \`serviceFeeAmount\` DECIMAL(18, 4) NULL COMMENT 'monthly service fee amount',
        \`billingSourceIds\` TEXT NULL COMMENT 'billing source ids',
        \`prepaymentSourceIds\` TEXT NULL COMMENT 'prepayment source ids',
        \`prepaymentContractNos\` TEXT NULL COMMENT 'prepayment contract nos',
        \`sourceNote\` VARCHAR(255) NULL COMMENT 'source note',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        PRIMARY KEY (\`id\`),
        KEY \`idx_ServiceFeeSnapshotItems_snapshotNo\` (\`snapshotNo\`),
        KEY \`idx_ServiceFeeSnapshotItems_writeOffMonth\` (\`writeOffMonth\`),
        KEY \`idx_ServiceFeeSnapshotItems_deviceCode\` (\`deviceCode\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ServiceFeeSnapshotItems'
    `,
  );
  await addColumnIfMissing(
    "servicefeesnapshotitems",
    "billingCurrency",
    "`billingCurrency` VARCHAR(16) NULL COMMENT 'monthly billing currency' AFTER `currency`",
  );
  await addColumnIfMissing(
    "servicefeesnapshotitems",
    "prepaymentCurrency",
    "`prepaymentCurrency` VARCHAR(16) NULL COMMENT 'monthly prepayment currency' AFTER `billingCurrency`",
  );

  await addColumnIfMissing(
    "shipments",
    "purchaseOrderItemId",
    "`purchaseOrderItemId` VARCHAR(64) NULL COMMENT 'purchase order item id' AFTER `poNo`",
  );
  await addColumnIfMissing(
    "shipments",
    "deviceCode",
    "`deviceCode` VARCHAR(64) NULL COMMENT 'instance device code' AFTER `purchaseOrderItemId`",
  );
  await addColumnIfMissing(
    "shipments",
    "nameEn",
    "`nameEn` VARCHAR(255) NULL COMMENT 'instance english name' AFTER `deviceCode`",
  );
  await addIndexIfMissing(
    "shipments",
    "idx_Shipments_purchaseOrderItemId",
    "KEY `idx_Shipments_purchaseOrderItemId` (`purchaseOrderItemId`)",
  );
}

main()
  .then(() => {
    console.log("Migration completed.");
    return closeDb();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
