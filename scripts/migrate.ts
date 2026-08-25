import { createPasswordSalt, hashPassword, INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD } from "../src/lib/auth";
import {
  purchaseOrderPlanFieldSpecs,
  purchaseOrderSnFieldSpecs,
  sqlTypeForDemandPlanField,
} from "../src/lib/purchase-order-demand-plan-fields";
import {
  closeDb,
  execute,
  executeRaw,
  LOGICAL_TABLE_NAMES,
  physicalTableName,
  queryRowsRaw,
} from "../src/lib/db";

async function columnExists(tableName: string, columnName: string) {
  const rows = await queryRowsRaw<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :tableName
        AND COLUMN_NAME = :columnName
    `,
    { tableName: physicalTableName(tableName), columnName },
  );

  return Number(rows[0]?.count ?? 0) > 0;
}

async function addColumnIfMissing(tableName: string, columnName: string, ddl: string) {
  if (!(await columnExists(tableName, columnName))) {
    await execute(`ALTER TABLE \`${tableName}\` ADD COLUMN ${ddl}`);
  }
}

async function modifyColumnIfPresent(tableName: string, columnName: string, ddl: string) {
  if (await columnExists(tableName, columnName)) {
    await execute(`ALTER TABLE \`${tableName}\` MODIFY COLUMN ${ddl}`);
  }
}

async function addIndexIfMissing(tableName: string, indexName: string, ddl: string) {
  const rows = await queryRowsRaw<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :tableName
        AND INDEX_NAME = :indexName
    `,
    { tableName: physicalTableName(tableName), indexName },
  );

  if (Number(rows[0]?.count ?? 0) === 0) {
    await execute(`ALTER TABLE \`${tableName}\` ADD ${ddl}`);
  }
}

async function addUniquePrepaymentPurchaseItemIndexIfSafe() {
  const duplicateRows = await queryRowsRaw<{ total: number }>(
    `
      SELECT COUNT(*) AS total
      FROM (
        SELECT purchaseOrderItemId
        FROM ${physicalTableName("prepaymentcontractitems")}
        WHERE purchaseOrderItemId IS NOT NULL
          AND purchaseOrderItemId <> ''
        GROUP BY purchaseOrderItemId
        HAVING COUNT(*) > 1
      ) AS duplicates
    `,
  );
  if (Number(duplicateRows[0]?.total ?? 0) > 0) {
    console.warn("检测到历史预付款实例重复占用，暂不创建唯一索引；请处理重复合同后再次执行迁移。");
    return;
  }
  await addIndexIfMissing(
    "prepaymentcontractitems",
    "uk_PrepaymentContractItems_purchaseOrderItemId",
    "UNIQUE KEY `uk_PrepaymentContractItems_purchaseOrderItemId` (`purchaseOrderItemId`)",
  );
}

async function dropIndexIfExists(tableName: string, indexName: string) {
  const rows = await queryRowsRaw<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :tableName
        AND INDEX_NAME = :indexName
    `,
    { tableName: physicalTableName(tableName), indexName },
  );

  if (Number(rows[0]?.count ?? 0) > 0) {
    await execute(`ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\``);
  }
}

async function createTableIfMissing(tableName: string, ddl: string) {
  const rows = await queryRowsRaw<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :tableName
    `,
    { tableName: physicalTableName(tableName) },
  );

  if (Number(rows[0]?.count ?? 0) === 0) {
    await execute(ddl);
  }
}

async function tableExists(tableName: string) {
  const rows = await queryRowsRaw<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :tableName
    `,
    { tableName },
  );

  return Number(rows[0]?.count ?? 0) > 0;
}

async function ensureAuditColumns() {
  for (const tableName of LOGICAL_TABLE_NAMES) {
    if (!(await tableExists(physicalTableName(tableName)))) continue;
    await addColumnIfMissing(
      tableName,
      "createdAt",
      "`createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time'",
    );
    await addColumnIfMissing(
      tableName,
      "updatedAt",
      "`updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time'",
    );
  }
}

async function renameLegacyTables() {
  for (const tableName of LOGICAL_TABLE_NAMES) {
    const physicalName = physicalTableName(tableName);
    if (physicalName === tableName) continue;

    const [legacyExists, physicalExists] = await Promise.all([tableExists(tableName), tableExists(physicalName)]);
    if (legacyExists && !physicalExists) {
      await executeRaw(`RENAME TABLE \`${tableName}\` TO \`${physicalName}\``);
    }
  }
}

async function main() {
  await renameLegacyTables();
  await dropIndexIfExists("instancemodels", "uk_InstanceModels_modelCode");

  // Existing imports use this field for a full physical address, not only a short location ID.
  await modifyColumnIfPresent(
    "datacenters",
    "dcCode",
    "`dcCode` VARCHAR(128) NOT NULL COMMENT 'datacenter code PK'",
  );
  await modifyColumnIfPresent(
    "datacenters",
    "locationId",
    "`locationId` VARCHAR(512) NOT NULL COMMENT 'physical address or location id'",
  );
  await modifyColumnIfPresent(
    "datacenters",
    "nameZh",
    "`nameZh` VARCHAR(512) NULL COMMENT 'datacenter name zh'",
  );
  await modifyColumnIfPresent(
    "datacenters",
    "nameEn",
    "`nameEn` VARCHAR(512) NULL COMMENT 'datacenter name en'",
  );

  await addColumnIfMissing(
    "instancemodels",
    "b6Type",
    "`b6Type` VARCHAR(64) NULL COMMENT 'default B6 type' AFTER `nameEn`",
  );

  await addColumnIfMissing(
    "countries",
    "nameEn",
    "`nameEn` VARCHAR(255) NULL COMMENT 'country English name'",
  );
  await addColumnIfMissing(
    "countries",
    "nameLocal",
    "`nameLocal` VARCHAR(255) NULL COMMENT 'country local name' AFTER `nameEn`",
  );
  await addColumnIfMissing(
    "countries",
    "vatRate",
    "`vatRate` DECIMAL(10, 6) NULL COMMENT 'VAT rate as decimal' AFTER `nameLocal`",
  );
  await createTableIfMissing(
    "undertakingunits",
    `
      CREATE TABLE \`undertakingunits\` (
        \`undertakingUnitId\` VARCHAR(64) NOT NULL COMMENT 'undertaking unit id PK',
        \`undertakingUnitCode\` VARCHAR(128) NOT NULL COMMENT 'undertaking unit code UK',
        \`name\` VARCHAR(255) NULL COMMENT 'name',
        PRIMARY KEY (\`undertakingUnitId\`),
        UNIQUE KEY \`uk_UndertakingUnits_code\` (\`undertakingUnitCode\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='UndertakingUnits'
    `,
  );
  await createTableIfMissing(
    "customers",
    `
      CREATE TABLE \`customers\` (
        \`customerId\` VARCHAR(64) NOT NULL COMMENT 'customer id PK',
        \`customerCode\` VARCHAR(128) NOT NULL COMMENT 'customer code UK',
        \`name\` VARCHAR(255) NULL COMMENT 'name',
        PRIMARY KEY (\`customerId\`),
        UNIQUE KEY \`uk_Customers_customerCode\` (\`customerCode\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Customers'
    `,
  );
  await addColumnIfMissing("requestitems", "customerId", "`customerId` VARCHAR(64) NULL COMMENT 'customer id' AFTER `undertakingUnitId`");
  await addIndexIfMissing("requestitems", "idx_RequestItems_customerId", "KEY `idx_RequestItems_customerId` (`customerId`)");
  await addIndexIfMissing("requestitems", "idx_RequestItems_requestNo_deviceCode", "KEY `idx_RequestItems_requestNo_deviceCode` (`requestNo`, `deviceCode`)");
  await addColumnIfMissing(
    "requestitems",
    "undertakingUnitId",
    "`undertakingUnitId` VARCHAR(64) NULL COMMENT 'undertaking unit id' AFTER `supplierId`",
  );
  await addIndexIfMissing(
    "requestitems",
    "idx_RequestItems_undertakingUnitId",
    "KEY `idx_RequestItems_undertakingUnitId` (`undertakingUnitId`)",
  );
  await addColumnIfMissing(
    "purchaseorderitems",
    "taxExcludedUnitPrice",
    "`taxExcludedUnitPrice` DECIMAL(18, 4) NULL COMMENT 'tax excluded unit price' AFTER `requestItemId`",
  );
  await addColumnIfMissing(
    "purchaseorderitems",
    "taxSurcharge",
    "`taxSurcharge` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'tax surcharge' AFTER `taxExcludedUnitPrice`",
  );
  await execute(
    "UPDATE purchaseorderitems SET taxExcludedUnitPrice = COALESCE(taxExcludedUnitPrice, unitPrice), taxSurcharge = COALESCE(taxSurcharge, 0) WHERE taxExcludedUnitPrice IS NULL OR taxSurcharge IS NULL",
  );
  await createTableIfMissing(
    "purchaseordersnitems",
    `
      CREATE TABLE \`purchaseordersnitems\` (
        \`id\` VARCHAR(64) NOT NULL COMMENT 'PK',
        \`purchaseOrderId\` VARCHAR(128) NOT NULL COMMENT 'system purchase order id',
        \`poNo\` VARCHAR(128) NOT NULL COMMENT 'PO no',
        \`purchaseOrderItemId\` VARCHAR(64) NULL COMMENT 'purchase order item id',
        \`requestNo\` VARCHAR(128) NULL COMMENT 'source request no',
        \`deviceVendor\` VARCHAR(255) NULL COMMENT 'device vendor',
        \`finalParentSn\` VARCHAR(255) NULL COMMENT 'final parent SN',
        \`finalParentPn\` VARCHAR(255) NULL COMMENT 'customer final parent PN',
        \`finalParentPnDescription\` VARCHAR(500) NULL COMMENT 'final parent PN description',
        \`supplierFinalParentCode\` VARCHAR(255) NULL COMMENT 'supplier final parent code',
        \`supplierParentCode\` VARCHAR(255) NULL COMMENT 'supplier parent code',
        \`supplierParentSn\` VARCHAR(255) NULL COMMENT 'supplier parent SN',
        \`sn\` VARCHAR(255) NOT NULL COMMENT 'serial number',
        \`fixedAssetCode\` VARCHAR(255) NULL COMMENT 'fixed asset code',
        \`materialDescription\` VARCHAR(500) NULL COMMENT 'material description',
        \`shippingBatch\` VARCHAR(255) NULL COMMENT 'shipping batch',
        \`parentAssetNo\` VARCHAR(255) NULL COMMENT 'customer parent asset no',
        \`componentCategory\` VARCHAR(255) NULL COMMENT 'component category',
        \`packingListNo\` VARCHAR(255) NULL COMMENT 'packing list no',
        \`parentCode\` VARCHAR(255) NULL COMMENT 'customer parent code',
        \`finalParentCode\` VARCHAR(255) NULL COMMENT 'customer final parent code',
        \`supplierChildComponentCode\` VARCHAR(255) NULL COMMENT 'supplier child component code',
        \`customerChildComponentCode\` VARCHAR(255) NULL COMMENT 'customer child component code',
        \`supplierChildComponentDescription\` VARCHAR(500) NULL COMMENT 'supplier child component description',
        \`childComponentOriginalPn\` VARCHAR(255) NULL COMMENT 'child component original PN',
        \`childComponentOriginalSn\` VARCHAR(255) NULL COMMENT 'child component original SN',
        \`rackUnit\` VARCHAR(255) NULL COMMENT 'rack unit',
        \`site\` VARCHAR(500) NULL COMMENT 'site',
        \`contactPhone\` VARCHAR(500) NULL COMMENT 'contact and phone',
        \`level\` VARCHAR(64) NULL COMMENT 'asset hierarchy level',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
        PRIMARY KEY (\`id\`),
        KEY \`idx_PurchaseOrderSnItems_purchaseOrderId\` (\`purchaseOrderId\`),
        KEY \`idx_PurchaseOrderSnItems_purchaseOrderItemId\` (\`purchaseOrderItemId\`),
        KEY \`idx_PurchaseOrderSnItems_poNo\` (\`poNo\`),
        KEY \`idx_PurchaseOrderSnItems_sn\` (\`sn\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PurchaseOrderSnItems'
    `,
  );
  await createTableIfMissing(
    "purchaseorderplanitems",
    `
      CREATE TABLE \`purchaseorderplanitems\` (
        \`id\` VARCHAR(64) NOT NULL COMMENT 'PK',
        \`purchaseOrderId\` VARCHAR(128) NOT NULL COMMENT 'system purchase order id',
        \`poNo\` VARCHAR(128) NOT NULL COMMENT 'PO no',
        \`purchaseOrderItemId\` VARCHAR(64) NULL COMMENT 'purchase order item id',
        \`requestNo\` VARCHAR(128) NULL COMMENT 'source request no',
        \`sourcePlanId\` VARCHAR(128) NULL COMMENT 'source demand plan item id',
        \`quoteReceivedAt\` DATE NULL COMMENT 'CEG quotation received date',
        \`poIssuedAt\` DATE NULL COMMENT 'supplier PO issued date',
        \`receiptProofUploadedAt\` DATE NULL COMMENT 'receipt proof uploaded date',
        \`logisticsReceivedAt\` DATE NULL COMMENT 'logistics receipt date',
        \`ataAt\` DATE NULL COMMENT 'ATA date',
        \`ata\` VARCHAR(255) NULL COMMENT 'ATA',
        \`supplierCpd\` DATE NULL COMMENT 'supplier CPD',
        \`material\` VARCHAR(500) NULL COMMENT 'material',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
        PRIMARY KEY (\`id\`),
        KEY \`idx_PurchaseOrderPlanItems_purchaseOrderId\` (\`purchaseOrderId\`),
        KEY \`idx_PurchaseOrderPlanItems_purchaseOrderItemId\` (\`purchaseOrderItemId\`),
        KEY \`idx_PurchaseOrderPlanItems_poNo\` (\`poNo\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PurchaseOrderPlanItems'
    `,
  );
  for (const field of purchaseOrderSnFieldSpecs) {
    await addColumnIfMissing(
      "purchaseordersnitems",
      field.key,
      `\`${field.key}\` ${sqlTypeForDemandPlanField(field)} COMMENT '${field.label}'`,
    );
  }
  for (const field of purchaseOrderPlanFieldSpecs) {
    await addColumnIfMissing(
      "purchaseorderplanitems",
      field.key,
      `\`${field.key}\` ${sqlTypeForDemandPlanField(field)} COMMENT '${field.label}'`,
    );
  }
  for (const columnName of [
    "quoteReceivedAt",
    "poIssuedAt",
    "receiptProofUploadedAt",
    "logisticsReceivedAt",
    "ataAt",
    "ata",
    "supplierCpd",
  ]) {
    await modifyColumnIfPresent(
      "purchaseorderplanitems",
      columnName,
      `\`${columnName}\` DATETIME NULL COMMENT '${columnName}'`,
    );
  }
  for (const [columnName, ddl] of [
    ["deviceVendor", "`deviceVendor` VARCHAR(255) NULL COMMENT 'device vendor' AFTER `requestNo`"],
    ["finalParentSn", "`finalParentSn` VARCHAR(255) NULL COMMENT 'final parent SN' AFTER `deviceVendor`"],
    ["finalParentPn", "`finalParentPn` VARCHAR(255) NULL COMMENT 'customer final parent PN' AFTER `finalParentSn`"],
    ["finalParentPnDescription", "`finalParentPnDescription` VARCHAR(500) NULL COMMENT 'final parent PN description' AFTER `finalParentPn`"],
    ["supplierFinalParentCode", "`supplierFinalParentCode` VARCHAR(255) NULL COMMENT 'supplier final parent code' AFTER `finalParentPnDescription`"],
    ["supplierParentCode", "`supplierParentCode` VARCHAR(255) NULL COMMENT 'supplier parent code' AFTER `supplierFinalParentCode`"],
    ["supplierParentSn", "`supplierParentSn` VARCHAR(255) NULL COMMENT 'supplier parent SN' AFTER `supplierParentCode`"],
    ["supplierChildComponentCode", "`supplierChildComponentCode` VARCHAR(255) NULL COMMENT 'supplier child component code' AFTER `finalParentCode`"],
    ["customerChildComponentCode", "`customerChildComponentCode` VARCHAR(255) NULL COMMENT 'customer child component code' AFTER `supplierChildComponentCode`"],
    ["supplierChildComponentDescription", "`supplierChildComponentDescription` VARCHAR(500) NULL COMMENT 'supplier child component description' AFTER `customerChildComponentCode`"],
    ["childComponentOriginalPn", "`childComponentOriginalPn` VARCHAR(255) NULL COMMENT 'child component original PN' AFTER `supplierChildComponentDescription`"],
    ["childComponentOriginalSn", "`childComponentOriginalSn` VARCHAR(255) NULL COMMENT 'child component original SN' AFTER `childComponentOriginalPn`"],
    ["rackUnit", "`rackUnit` VARCHAR(255) NULL COMMENT 'rack unit' AFTER `childComponentOriginalSn`"],
    ["site", "`site` VARCHAR(500) NULL COMMENT 'site' AFTER `rackUnit`"],
    ["contactPhone", "`contactPhone` VARCHAR(500) NULL COMMENT 'contact and phone' AFTER `site`"],
  ] as const) {
    await addColumnIfMissing("purchaseordersnitems", columnName, ddl);
  }
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "supplierId",
    "`supplierId` VARCHAR(64) NULL COMMENT 'supplier id' AFTER `nameEn`",
  );
  await addColumnIfMissing(
    "prepaymentcontractitems",
    "undertakingUnitId",
    "`undertakingUnitId` VARCHAR(64) NULL COMMENT 'undertaking unit id' AFTER `supplierId`",
  );
  await addColumnIfMissing(
    "billinginstanceledgers",
    "supplierId",
    "`supplierId` VARCHAR(64) NULL COMMENT 'supplier id' AFTER `nameEn`",
  );
  await addColumnIfMissing(
    "billinginstanceledgers",
    "undertakingUnitId",
    "`undertakingUnitId` VARCHAR(64) NULL COMMENT 'undertaking unit id' AFTER `supplierId`",
  );
  await addColumnIfMissing(
    "billinginstanceledgers",
    "taxExcludedUnitPrice",
    "`taxExcludedUnitPrice` DECIMAL(18, 4) NULL COMMENT 'tax excluded unit price' AFTER `actualUnitPrice`",
  );
  await addColumnIfMissing(
    "billinginstanceledgers",
    "taxSurcharge",
    "`taxSurcharge` DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT 'tax surcharge' AFTER `taxExcludedUnitPrice`",
  );
  await addColumnIfMissing(
    "billinginstanceledgers",
    "vatRate",
    "`vatRate` DECIMAL(10, 6) NULL COMMENT 'VAT rate' AFTER `taxSurcharge`",
  );
  await addColumnIfMissing(
    "billinginstanceledgers",
    "selfCalculatedUnitPrice",
    "`selfCalculatedUnitPrice` DECIMAL(18, 4) NULL COMMENT 'self calculated VAT included unit price' AFTER `vatRate`",
  );
  await addColumnIfMissing(
    "billinginstanceledgers",
    "differenceUnitPrice",
    "`differenceUnitPrice` DECIMAL(18, 4) NULL COMMENT 'settlement difference unit price' AFTER `next36MonthPrice`",
  );
  await addColumnIfMissing(
    "billinginstanceledgers",
    "differenceTotalPrice",
    "`differenceTotalPrice` DECIMAL(18, 4) NULL COMMENT 'settlement difference total price' AFTER `differenceUnitPrice`",
  );
  for (const [column, ddl] of [
    ["supplierId", "`supplierId` VARCHAR(64) NULL COMMENT 'supplier id' AFTER `nameEn`"],
    ["undertakingUnitId", "`undertakingUnitId` VARCHAR(64) NULL COMMENT 'undertaking unit id' AFTER `supplierId`"],
    ["selfCalculatedUnitPrice", "`selfCalculatedUnitPrice` DECIMAL(18, 4) NULL COMMENT 'self calculated VAT included unit price' AFTER `monthlyTotalAmount`"],
    ["differenceUnitPrice", "`differenceUnitPrice` DECIMAL(18, 4) NULL COMMENT 'settlement difference unit price' AFTER `selfCalculatedUnitPrice`"],
    ["differenceTotalPrice", "`differenceTotalPrice` DECIMAL(18, 4) NULL COMMENT 'settlement difference total price' AFTER `differenceUnitPrice`"],
  ] as const) {
    await addColumnIfMissing("monthlybillingwriteoffs", column, ddl);
  }
  await addColumnIfMissing(
    "monthlyprepaymentwriteoffs",
    "supplierId",
    "`supplierId` VARCHAR(64) NULL COMMENT 'supplier id' AFTER `nameEn`",
  );
  await addColumnIfMissing(
    "monthlyprepaymentwriteoffs",
    "undertakingUnitId",
    "`undertakingUnitId` VARCHAR(64) NULL COMMENT 'undertaking unit id' AFTER `supplierId`",
  );
  await addColumnIfMissing(
    "servicefeesnapshotitems",
    "supplierId",
    "`supplierId` VARCHAR(64) NULL COMMENT 'supplier id' AFTER `nameEn`",
  );
  await addColumnIfMissing(
    "servicefeesnapshotitems",
    "undertakingUnitId",
    "`undertakingUnitId` VARCHAR(64) NULL COMMENT 'undertaking unit id' AFTER `supplierId`",
  );
  await addColumnIfMissing(
    "shipments",
    "supplierId",
    "`supplierId` VARCHAR(64) NULL COMMENT 'supplier id' AFTER `nameEn`",
  );
  await addColumnIfMissing(
    "shipments",
    "undertakingUnitId",
    "`undertakingUnitId` VARCHAR(64) NULL COMMENT 'undertaking unit id' AFTER `supplierId`",
  );

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
    "purchaseOrderId",
    "`purchaseOrderId` VARCHAR(128) NULL COMMENT 'system purchase order id' FIRST",
  );
  await execute(
    `
      UPDATE purchaseorders
      SET purchaseOrderId = poNo
      WHERE purchaseOrderId IS NULL OR purchaseOrderId = ''
    `,
  );
  await addIndexIfMissing(
    "purchaseorders",
    "uk_PurchaseOrders_purchaseOrderId",
    "UNIQUE KEY `uk_PurchaseOrders_purchaseOrderId` (`purchaseOrderId`)",
  );
  await addColumnIfMissing(
    "purchaseorders",
    "requestNo",
    "`requestNo` VARCHAR(128) NULL COMMENT 'source request no' AFTER `poNo`",
  );
  await addColumnIfMissing(
    "purchaseorders",
    "sourceRequestNos",
    "`sourceRequestNos` TEXT NULL COMMENT 'merged source request nos' AFTER `requestNo`",
  );
  await execute(
    `
      UPDATE purchaseorders
      SET sourceRequestNos = requestNo
      WHERE (sourceRequestNos IS NULL OR sourceRequestNos = '')
        AND requestNo IS NOT NULL
        AND requestNo <> ''
    `,
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
    "purchaseorderitems",
    "purchaseOrderId",
    "`purchaseOrderId` VARCHAR(128) NULL COMMENT 'system purchase order id' AFTER `id`",
  );
  await execute(
    `
      UPDATE purchaseorderitems poi
      INNER JOIN purchaseorders po ON po.poNo = poi.poNo
      SET poi.purchaseOrderId = po.purchaseOrderId
      WHERE poi.purchaseOrderId IS NULL OR poi.purchaseOrderId = ''
    `,
  );
  await addColumnIfMissing(
    "purchaseorderitems",
    "requestNo",
    "`requestNo` VARCHAR(128) NULL COMMENT 'source request no' AFTER `poNo`",
  );
  await execute(
    `
      UPDATE purchaseorderitems poi
      INNER JOIN requestitems ri ON ri.id = poi.requestItemId
      SET poi.requestNo = ri.requestNo
      WHERE poi.requestNo IS NULL OR poi.requestNo = ''
    `,
  );
  await addIndexIfMissing(
    "purchaseorderitems",
    "idx_PurchaseOrderItems_purchaseOrderId",
    "KEY `idx_PurchaseOrderItems_purchaseOrderId` (`purchaseOrderId`)",
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
    "UPDATE prepaymentcontractitems SET purchaseOrderItemId = NULL WHERE purchaseOrderItemId = ''",
  );
  await addUniquePrepaymentPurchaseItemIndexIfSafe();
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
  await addIndexIfMissing(
    "monthlyprepaymentwriteoffs",
    "idx_MonthlyPrepaymentWriteOffs_contractLineId",
    "KEY `idx_MonthlyPrepaymentWriteOffs_contractLineId` (`contractLineId`)",
  );
  await addIndexIfMissing(
    "monthlyprepaymentwriteoffs",
    "idx_MonthlyPrepaymentWriteOffs_country_batch_month",
    "KEY `idx_MonthlyPrepaymentWriteOffs_country_batch_month` (`countryCode`, `batchName`, `writeOffMonth`)",
  );
  await addIndexIfMissing(
    "monthlyprepaymentwriteoffs",
    "idx_MonthlyPrepaymentWriteOffs_country_month_batch",
    "KEY `idx_MonthlyPrepaymentWriteOffs_country_month_batch` (`countryCode`, `writeOffMonth`, `batchName`)",
  );
  await addIndexIfMissing(
    "monthlyprepaymentwriteoffs",
    "idx_MonthlyPrepaymentWriteOffs_batch_month",
    "KEY `idx_MonthlyPrepaymentWriteOffs_batch_month` (`batchName`, `writeOffMonth`)",
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
    "countryCode",
    "`countryCode` VARCHAR(32) NULL COMMENT 'country code' AFTER `stage`",
  );
  await addIndexIfMissing(
    "monthlybillingwriteoffs",
    "idx_MonthlyBillingWriteOffs_country_batch_month",
    "KEY `idx_MonthlyBillingWriteOffs_country_batch_month` (`countryCode`, `batchName`, `writeOffMonth`)",
  );
  await addIndexIfMissing(
    "monthlybillingwriteoffs",
    "idx_MonthlyBillingWriteOffs_country_month_batch",
    "KEY `idx_MonthlyBillingWriteOffs_country_month_batch` (`countryCode`, `writeOffMonth`, `batchName`)",
  );
  await addIndexIfMissing(
    "monthlybillingwriteoffs",
    "idx_MonthlyBillingWriteOffs_batch_month",
    "KEY `idx_MonthlyBillingWriteOffs_batch_month` (`batchName`, `writeOffMonth`)",
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
        \`instanceContractNo\` VARCHAR(128) NULL COMMENT 'adjustment instance contract no',
        \`status\` VARCHAR(64) NOT NULL DEFAULT '草稿' COMMENT 'adjustment status',
        \`itemCount\` INT NOT NULL DEFAULT 0 COMMENT 'item count',
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
        KEY \`idx_BillingAdjustments_instanceContractNo\` (\`instanceContractNo\`),
        KEY \`idx_BillingAdjustments_target\` (\`countryCode\`, \`batchName\`, \`deviceCode\`),
        KEY \`idx_BillingAdjustments_effectiveMonth\` (\`effectiveMonth\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BillingAdjustments'
    `,
  );
  await addColumnIfMissing(
    "billingadjustments",
    "instanceContractNo",
    "`instanceContractNo` VARCHAR(128) NULL COMMENT 'adjustment instance contract no' AFTER `adjustmentNo`",
  );
  await addColumnIfMissing(
    "billingadjustments",
    "itemCount",
    "`itemCount` INT NOT NULL DEFAULT 0 COMMENT 'item count' AFTER `status`",
  );
  await addColumnIfMissing(
    "billingadjustments",
    "currency",
    "`currency` VARCHAR(16) NOT NULL DEFAULT 'USD' COMMENT 'currency' AFTER `deviceCode`",
  );
  await addIndexIfMissing(
    "billingadjustments",
    "idx_BillingAdjustments_instanceContractNo",
    "KEY `idx_BillingAdjustments_instanceContractNo` (`instanceContractNo`)",
  );
  await createTableIfMissing(
    "billingadjustmentitems",
    `
      CREATE TABLE \`billingadjustmentitems\` (
        \`id\` VARCHAR(160) NOT NULL COMMENT 'adjustment item id',
        \`adjustmentNo\` VARCHAR(128) NOT NULL COMMENT 'adjustment no',
        \`countryCode\` VARCHAR(32) NULL COMMENT 'country code',
        \`batchName\` VARCHAR(255) NULL COMMENT 'batch name',
        \`requestNo\` VARCHAR(128) NULL COMMENT 'request no',
        \`poNo\` VARCHAR(128) NULL COMMENT 'PO no',
        \`deviceCode\` VARCHAR(64) NULL COMMENT 'device code',
        \`modelCode\` VARCHAR(128) NULL COMMENT 'model code',
        \`nameEn\` VARCHAR(255) NULL COMMENT 'instance english name',
        \`quantity\` INT NULL COMMENT 'quantity',
        \`currency\` VARCHAR(16) NOT NULL DEFAULT 'USD' COMMENT 'currency',
        \`effectiveMonth\` DATE NULL COMMENT 'effective month',
        \`adjustedFirst24MonthPrice\` DECIMAL(18, 4) NULL COMMENT 'adjusted first 24 month price',
        \`adjustedNext36MonthPrice\` DECIMAL(18, 4) NULL COMMENT 'adjusted next 36 month price',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        PRIMARY KEY (\`id\`),
        KEY \`idx_BillingAdjustmentItems_adjustmentNo\` (\`adjustmentNo\`),
        KEY \`idx_BillingAdjustmentItems_target\` (\`countryCode\`, \`batchName\`, \`deviceCode\`),
        KEY \`idx_BillingAdjustmentItems_effectiveMonth\` (\`effectiveMonth\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BillingAdjustmentItems'
    `,
  );
  await execute(
    `
      INSERT IGNORE INTO billingadjustmentitems
        (id, adjustmentNo, countryCode, batchName, deviceCode, currency, effectiveMonth,
         adjustedFirst24MonthPrice, adjustedNext36MonthPrice)
      SELECT
        CONCAT('BAI-', adjustmentNo, '-001'),
        adjustmentNo,
        countryCode,
        batchName,
        deviceCode,
        currency,
        effectiveMonth,
        adjustedFirst24MonthPrice,
        adjustedNext36MonthPrice
      FROM billingadjustments
      WHERE COALESCE(countryCode, '') <> ''
        AND COALESCE(batchName, '') <> ''
        AND COALESCE(deviceCode, '') <> ''
    `,
  );
  await execute(
    `
      UPDATE billingadjustments ba
      LEFT JOIN (
        SELECT adjustmentNo, COUNT(*) AS itemCount
        FROM billingadjustmentitems
        GROUP BY adjustmentNo
      ) items ON items.adjustmentNo = ba.adjustmentNo
      SET ba.itemCount = COALESCE(items.itemCount, 0)
      WHERE ba.itemCount = 0
    `,
  );
  await createTableIfMissing(
    "billingstatementsnapshots",
    `
      CREATE TABLE \`billingstatementsnapshots\` (
        \`snapshotNo\` VARCHAR(128) NOT NULL COMMENT 'billing statement snapshot no',
        \`status\` VARCHAR(64) NOT NULL DEFAULT '未确认' COMMENT 'statement status',
        \`countryCode\` VARCHAR(32) NOT NULL COMMENT 'country code',
        \`startDate\` DATE NOT NULL COMMENT 'statement start date',
        \`endDate\` DATE NOT NULL COMMENT 'statement end date',
        \`currencySummary\` VARCHAR(255) NULL COMMENT 'currency summary',
        \`totalQuantity\` DECIMAL(18, 4) NULL COMMENT 'total quantity',
        \`totalAmount\` DECIMAL(18, 4) NULL COMMENT 'total amount',
        \`itemCount\` INT NOT NULL DEFAULT 0 COMMENT 'item count',
        \`confirmedAt\` DATETIME NULL COMMENT 'confirmed time',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
        PRIMARY KEY (\`snapshotNo\`),
        KEY \`idx_BillingStatementSnapshots_countryCode\` (\`countryCode\`),
        KEY \`idx_BillingStatementSnapshots_dates\` (\`startDate\`, \`endDate\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BillingStatementSnapshots'
    `,
  );
  await createTableIfMissing(
    "billingstatementsnapshotitems",
    `
      CREATE TABLE \`billingstatementsnapshotitems\` (
        \`id\` VARCHAR(160) NOT NULL COMMENT 'billing statement snapshot item id',
        \`snapshotNo\` VARCHAR(128) NOT NULL COMMENT 'billing statement snapshot no',
        \`countryCode\` VARCHAR(32) NOT NULL COMMENT 'country code',
        \`currency\` VARCHAR(16) NULL COMMENT 'currency',
        \`instanceContractNo\` VARCHAR(128) NULL COMMENT 'instance contract no',
        \`productType\` VARCHAR(255) NULL COMMENT 'computing service product type',
        \`unitPriceVatExcluded\` DECIMAL(18, 4) NULL COMMENT 'unit price VAT excluded',
        \`vatRate\` DECIMAL(10, 6) NULL COMMENT 'VAT rate',
        \`unitPriceVatIncluded\` DECIMAL(18, 4) NULL COMMENT 'unit price VAT included',
        \`quantity\` DECIMAL(18, 4) NULL COMMENT 'quantity',
        \`amount\` DECIMAL(18, 4) NULL COMMENT 'amount VAT included',
        \`startTime\` DATE NOT NULL COMMENT 'start time',
        \`endTime\` DATE NOT NULL COMMENT 'end of charge time',
        \`sourceIds\` TEXT NULL COMMENT 'monthly billing source ids',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        PRIMARY KEY (\`id\`),
        KEY \`idx_BillingStatementSnapshotItems_snapshotNo\` (\`snapshotNo\`),
        KEY \`idx_BillingStatementSnapshotItems_currency\` (\`currency\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BillingStatementSnapshotItems'
    `,
  );
  await createTableIfMissing(
    "servicefeesnapshots",
    `
      CREATE TABLE \`servicefeesnapshots\` (
        \`snapshotNo\` VARCHAR(128) NOT NULL COMMENT 'service fee snapshot no',
        \`status\` VARCHAR(64) NOT NULL DEFAULT '未确认' COMMENT 'statement status',
        \`writeOffMonth\` DATE NULL COMMENT 'write-off month',
        \`startMonth\` DATE NULL COMMENT 'start month',
        \`endMonth\` DATE NULL COMMENT 'end month',
        \`countryCode\` VARCHAR(32) NULL COMMENT 'country code',
        \`batchName\` VARCHAR(255) NULL COMMENT 'batch name',
        \`keyword\` VARCHAR(255) NULL COMMENT 'keyword filter',
        \`billingTotal\` DECIMAL(18, 4) NULL COMMENT 'billing total',
        \`prepaymentTotal\` DECIMAL(18, 4) NULL COMMENT 'prepayment total',
        \`serviceFeeTotal\` DECIMAL(18, 4) NULL COMMENT 'service fee total',
        \`serviceFeeTotalExcludingTax\` DECIMAL(18, 4) NULL COMMENT 'service fee total VAT excluded',
        \`vatRate\` DECIMAL(10, 6) NULL COMMENT 'VAT rate snapshot',
        \`instanceServiceFeeTotal\` DECIMAL(18, 4) NULL COMMENT 'instance service fee total',
        \`feeServiceFeeTotal\` DECIMAL(18, 4) NULL COMMENT 'non-instance fee service fee total',
        \`invoiceStatus\` VARCHAR(32) NOT NULL DEFAULT '未开票' COMMENT 'manual invoice status',
        \`invoiceOriginalName\` VARCHAR(500) NULL COMMENT 'invoice original file name',
        \`invoiceStoredName\` VARCHAR(500) NULL COMMENT 'invoice stored file name',
        \`invoiceFilePath\` VARCHAR(1000) NULL COMMENT 'invoice file path',
        \`invoiceMimeType\` VARCHAR(255) NULL COMMENT 'invoice MIME type',
        \`invoiceFileSize\` BIGINT NULL COMMENT 'invoice file size',
        \`invoiceUploadedBy\` VARCHAR(255) NULL COMMENT 'invoice uploaded by',
        \`invoiceUploadedAt\` DATETIME NULL COMMENT 'invoice uploaded time',
        \`confirmedAt\` DATETIME NULL COMMENT 'confirmed time',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
        PRIMARY KEY (\`snapshotNo\`),
        KEY \`idx_ServiceFeeSnapshots_writeOffMonth\` (\`writeOffMonth\`),
        KEY \`idx_ServiceFeeSnapshots_months\` (\`startMonth\`, \`endMonth\`),
        KEY \`idx_ServiceFeeSnapshots_countryCode\` (\`countryCode\`),
        KEY \`idx_ServiceFeeSnapshots_invoiceStatus\` (\`invoiceStatus\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ServiceFeeSnapshots'
    `,
  );
  await addColumnIfMissing(
    "billingstatementsnapshots",
    "status",
    "`status` VARCHAR(64) NOT NULL DEFAULT '已确认' COMMENT 'statement status' AFTER `snapshotNo`",
  );
  await addColumnIfMissing(
    "billingstatementsnapshots",
    "confirmedAt",
    "`confirmedAt` DATETIME NULL COMMENT 'confirmed time' AFTER `itemCount`",
  );
  await addColumnIfMissing(
    "billingstatementsnapshots",
    "updatedAt",
    "`updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time' AFTER `createdAt`",
  );
  await execute(
    `
      UPDATE billingstatementsnapshots
      SET status = COALESCE(NULLIF(status, ''), '已确认'),
          confirmedAt = CASE
            WHEN COALESCE(NULLIF(status, ''), '已确认') = '已确认' THEN COALESCE(confirmedAt, createdAt)
            ELSE confirmedAt
          END
    `,
  );
  await modifyColumnIfPresent(
    "billingstatementsnapshots",
    "status",
    "`status` VARCHAR(64) NOT NULL DEFAULT '未确认' COMMENT 'statement status'",
  );
  await addColumnIfMissing(
    "servicefeesnapshots",
    "writeOffMonth",
    "`writeOffMonth` DATE NULL COMMENT 'write-off month' AFTER `status`",
  );
  await addColumnIfMissing(
    "servicefeesnapshots",
    "invoiceStatus",
    "`invoiceStatus` VARCHAR(32) NOT NULL DEFAULT '未开票' COMMENT 'manual invoice status' AFTER `feeServiceFeeTotal`",
  );
  await addColumnIfMissing("servicefeesnapshots", "invoiceOriginalName", "`invoiceOriginalName` VARCHAR(500) NULL COMMENT 'invoice original file name' AFTER `invoiceStatus`");
  await addColumnIfMissing("servicefeesnapshots", "invoiceStoredName", "`invoiceStoredName` VARCHAR(500) NULL COMMENT 'invoice stored file name' AFTER `invoiceOriginalName`");
  await addColumnIfMissing("servicefeesnapshots", "invoiceFilePath", "`invoiceFilePath` VARCHAR(1000) NULL COMMENT 'invoice file path' AFTER `invoiceStoredName`");
  await addColumnIfMissing("servicefeesnapshots", "invoiceMimeType", "`invoiceMimeType` VARCHAR(255) NULL COMMENT 'invoice MIME type' AFTER `invoiceFilePath`");
  await addColumnIfMissing("servicefeesnapshots", "invoiceFileSize", "`invoiceFileSize` BIGINT NULL COMMENT 'invoice file size' AFTER `invoiceMimeType`");
  await addColumnIfMissing("servicefeesnapshots", "invoiceUploadedBy", "`invoiceUploadedBy` VARCHAR(255) NULL COMMENT 'invoice uploaded by' AFTER `invoiceFileSize`");
  await addColumnIfMissing("servicefeesnapshots", "invoiceUploadedAt", "`invoiceUploadedAt` DATETIME NULL COMMENT 'invoice uploaded time' AFTER `invoiceUploadedBy`");
  await addColumnIfMissing("servicefeesnapshots", "repaymentStatus", "`repaymentStatus` VARCHAR(32) NOT NULL DEFAULT '未回款' COMMENT 'repayment status' AFTER `feeServiceFeeTotal`");
  await addColumnIfMissing("servicefeesnapshots", "receivingUnitId", "`receivingUnitId` VARCHAR(64) NULL COMMENT 'receiving undertaking unit id' AFTER `repaymentStatus`");
  await addColumnIfMissing("servicefeesnapshots", "payerCustomerId", "`payerCustomerId` VARCHAR(64) NULL COMMENT 'payer customer id' AFTER `receivingUnitId`");
  await addColumnIfMissing("servicefeesnapshots", "repaymentCurrency", "`repaymentCurrency` VARCHAR(16) NULL COMMENT 'repayment currency' AFTER `payerCustomerId`");
  await addColumnIfMissing("servicefeesnapshots", "repaymentAmount", "`repaymentAmount` DECIMAL(18, 4) NULL COMMENT 'repayment amount' AFTER `repaymentCurrency`");
  await addColumnIfMissing("servicefeesnapshots", "repaymentDate", "`repaymentDate` DATE NULL COMMENT 'repayment date' AFTER `repaymentAmount`");
  await addColumnIfMissing("servicefeesnapshots", "repaymentUpdatedAt", "`repaymentUpdatedAt` DATETIME NULL COMMENT 'repayment updated time' AFTER `repaymentDate`");
  await addColumnIfMissing("servicefeesnapshots", "serviceFeeTotalExcludingTax", "`serviceFeeTotalExcludingTax` DECIMAL(18, 4) NULL COMMENT 'service fee total VAT excluded' AFTER `serviceFeeTotal`");
  await addColumnIfMissing("servicefeesnapshots", "vatRate", "`vatRate` DECIMAL(10, 6) NULL COMMENT 'VAT rate snapshot' AFTER `serviceFeeTotalExcludingTax`");
  await modifyColumnIfPresent(
    "servicefeesnapshots",
    "status",
    "`status` VARCHAR(64) NOT NULL DEFAULT '未确认' COMMENT 'statement status'",
  );
  await addIndexIfMissing(
    "servicefeesnapshots",
    "idx_ServiceFeeSnapshots_writeOffMonth",
    "KEY `idx_ServiceFeeSnapshots_writeOffMonth` (`writeOffMonth`)",
  );
  await addIndexIfMissing(
    "servicefeesnapshots",
    "idx_ServiceFeeSnapshots_repaymentStatus",
    "KEY `idx_ServiceFeeSnapshots_repaymentStatus` (`repaymentStatus`)",
  );
  await addIndexIfMissing(
    "servicefeesnapshots",
    "idx_ServiceFeeSnapshots_invoiceStatus",
    "KEY `idx_ServiceFeeSnapshots_invoiceStatus` (`invoiceStatus`)",
  );
  await createTableIfMissing(
    "servicefeesnapshotitems",
    `
      CREATE TABLE \`servicefeesnapshotitems\` (
        \`id\` VARCHAR(160) NOT NULL COMMENT 'service fee snapshot item id',
        \`snapshotNo\` VARCHAR(128) NOT NULL COMMENT 'service fee snapshot no',
        \`writeOffMonth\` DATE NOT NULL COMMENT 'write-off month',
        \`countryCode\` VARCHAR(32) NULL COMMENT 'country code',
        \`vatRate\` DECIMAL(10, 6) NULL COMMENT 'VAT rate snapshot',
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
        \`serviceFeeAmountExcludingTax\` DECIMAL(18, 4) NULL COMMENT 'monthly service fee amount VAT excluded',
        \`billingSourceIds\` TEXT NULL COMMENT 'billing source ids',
        \`prepaymentSourceIds\` TEXT NULL COMMENT 'prepayment source ids',
        \`prepaymentContractNos\` TEXT NULL COMMENT 'prepayment contract nos',
        \`sourceNote\` VARCHAR(255) NULL COMMENT 'source note',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
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
  await addColumnIfMissing("servicefeesnapshotitems", "supplierId", "`supplierId` VARCHAR(64) NULL COMMENT 'supplier id' AFTER `nameEn`");
  await addColumnIfMissing("servicefeesnapshotitems", "vatRate", "`vatRate` DECIMAL(10, 6) NULL COMMENT 'VAT rate snapshot' AFTER `countryCode`");
  await addColumnIfMissing("servicefeesnapshotitems", "undertakingUnitId", "`undertakingUnitId` VARCHAR(64) NULL COMMENT 'undertaking unit id' AFTER `supplierId`");
  await addColumnIfMissing("servicefeesnapshotitems", "customerId", "`customerId` VARCHAR(64) NULL COMMENT 'customer id' AFTER `undertakingUnitId`");
  await addColumnIfMissing(
    "servicefeesnapshotitems",
    "prepaymentCurrency",
    "`prepaymentCurrency` VARCHAR(16) NULL COMMENT 'monthly prepayment currency' AFTER `billingCurrency`",
  );
  await addColumnIfMissing(
    "servicefeesnapshotitems",
    "serviceFeeAmountExcludingTax",
    "`serviceFeeAmountExcludingTax` DECIMAL(18, 4) NULL COMMENT 'monthly service fee amount VAT excluded' AFTER `serviceFeeAmount`",
  );
  await execute(
    `
      UPDATE servicefeesnapshots snapshot
      LEFT JOIN (
        SELECT snapshotNo,
               SUM(COALESCE(serviceFeeAmountExcludingTax, 0)) AS serviceFeeTotalExcludingTax,
               CASE WHEN COUNT(DISTINCT countryCode) = 1 THEN MAX(countryCode) ELSE NULL END AS countryCode
        FROM servicefeesnapshotitems
        GROUP BY snapshotNo
      ) items ON items.snapshotNo = snapshot.snapshotNo
      LEFT JOIN countries country ON country.code = COALESCE(NULLIF(snapshot.countryCode, ''), items.countryCode)
      SET snapshot.serviceFeeTotalExcludingTax = COALESCE(snapshot.serviceFeeTotalExcludingTax, items.serviceFeeTotalExcludingTax),
          snapshot.vatRate = COALESCE(snapshot.vatRate, country.vatRate)
      WHERE snapshot.serviceFeeTotalExcludingTax IS NULL OR snapshot.vatRate IS NULL
    `,
  );
  await execute(
    `
      UPDATE servicefeesnapshotitems item
      INNER JOIN servicefeesnapshots snapshot ON snapshot.snapshotNo = item.snapshotNo
      SET item.vatRate = snapshot.vatRate
      WHERE item.vatRate IS NULL AND snapshot.vatRate IS NOT NULL
    `,
  );
  await execute(
    `
      UPDATE servicefeesnapshots snapshot
      LEFT JOIN (
        SELECT snapshotNo,
               CASE WHEN COUNT(DISTINCT countryCode) = 1 THEN MAX(countryCode) ELSE NULL END AS inferredCountryCode,
               CASE WHEN COUNT(DISTINCT writeOffMonth) = 1 THEN MAX(writeOffMonth) ELSE NULL END AS inferredWriteOffMonth
        FROM servicefeesnapshotitems
        GROUP BY snapshotNo
      ) items ON items.snapshotNo = snapshot.snapshotNo
      SET snapshot.countryCode = COALESCE(NULLIF(snapshot.countryCode, ''), items.inferredCountryCode),
          snapshot.writeOffMonth = COALESCE(snapshot.writeOffMonth, items.inferredWriteOffMonth, snapshot.startMonth, snapshot.endMonth),
          snapshot.status = COALESCE(NULLIF(snapshot.status, ''), '已确认'),
          snapshot.confirmedAt = CASE
            WHEN COALESCE(NULLIF(snapshot.status, ''), '已确认') = '已确认' THEN COALESCE(snapshot.confirmedAt, snapshot.createdAt)
            ELSE snapshot.confirmedAt
          END,
          snapshot.invoiceStatus = COALESCE(NULLIF(snapshot.invoiceStatus, ''), '未开票')
    `,
  );

  await addColumnIfMissing(
    "shipments",
    "purchaseOrderItemId",
    "`purchaseOrderItemId` VARCHAR(64) NULL COMMENT 'purchase order item id' AFTER `poNo`",
  );
  await addColumnIfMissing(
    "shipments",
    "batchName",
    "`batchName` VARCHAR(255) NULL COMMENT 'batch name' AFTER `poNo`",
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
  await addColumnIfMissing(
    "shipments",
    "dcCode",
    "`dcCode` VARCHAR(64) NULL COMMENT 'datacenter code' AFTER `nameEn`",
  );
  await addColumnIfMissing(
    "shipments",
    "dcNameZh",
    "`dcNameZh` VARCHAR(255) NULL COMMENT 'datacenter Chinese name' AFTER `dcCode`",
  );
  await addIndexIfMissing(
    "shipments",
    "idx_Shipments_batchName",
    "KEY `idx_Shipments_batchName` (`batchName`)",
  );
  await addIndexIfMissing(
    "shipments",
    "idx_Shipments_purchaseOrderItemId",
    "KEY `idx_Shipments_purchaseOrderItemId` (`purchaseOrderItemId`)",
  );
  await addIndexIfMissing(
    "shipments",
    "idx_Shipments_dcCode",
    "KEY `idx_Shipments_dcCode` (`dcCode`)",
  );
  await execute(
    `
      UPDATE shipments s
      LEFT JOIN purchaseorderitems poi ON poi.id = s.purchaseOrderItemId
      LEFT JOIN requestitems ri ON ri.id = poi.requestItemId
      LEFT JOIN requests req ON req.requestNo = ri.requestNo
      SET s.batchName = req.batchName
      WHERE (s.batchName IS NULL OR s.batchName = '')
        AND req.batchName IS NOT NULL
    `,
  );

  await createTableIfMissing(
    "documentfolders",
    `
      CREATE TABLE \`documentfolders\` (
        \`folderId\` VARCHAR(80) NOT NULL COMMENT 'folder id',
        \`parentId\` VARCHAR(80) NULL COMMENT 'parent folder id',
        \`name\` VARCHAR(255) NOT NULL COMMENT 'folder name',
        \`sortOrder\` INT NOT NULL DEFAULT 0 COMMENT 'sort order',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
        PRIMARY KEY (\`folderId\`),
        UNIQUE KEY \`uk_DocumentFolders_parent_name\` (\`parentId\`, \`name\`),
        KEY \`idx_DocumentFolders_parentId\` (\`parentId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='DocumentFolders'
    `,
  );
  await createTableIfMissing(
    "documentfiles",
    `
      CREATE TABLE \`documentfiles\` (
        \`fileId\` VARCHAR(80) NOT NULL COMMENT 'file id',
        \`folderId\` VARCHAR(80) NOT NULL COMMENT 'folder id',
        \`originalName\` VARCHAR(255) NOT NULL COMMENT 'original file name',
        \`storedName\` VARCHAR(255) NOT NULL COMMENT 'stored file name',
        \`filePath\` VARCHAR(1024) NOT NULL COMMENT 'server file path',
        \`mimeType\` VARCHAR(255) NULL COMMENT 'mime type',
        \`extension\` VARCHAR(32) NULL COMMENT 'file extension',
        \`category\` VARCHAR(32) NOT NULL DEFAULT 'other' COMMENT 'file category',
        \`fileSize\` BIGINT NOT NULL DEFAULT 0 COMMENT 'file size bytes',
        \`uploadedBy\` VARCHAR(128) NULL COMMENT 'uploaded by',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
        PRIMARY KEY (\`fileId\`),
        KEY \`idx_DocumentFiles_folderId\` (\`folderId\`),
        KEY \`idx_DocumentFiles_originalName\` (\`originalName\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='DocumentFiles'
    `,
  );

  await createTableIfMissing(
    "importjobs",
    `
      CREATE TABLE \`importjobs\` (
        \`jobId\` VARCHAR(96) NOT NULL COMMENT 'import job id',
        \`targetKey\` VARCHAR(64) NOT NULL COMMENT 'import target key',
        \`targetTitle\` VARCHAR(255) NOT NULL COMMENT 'import target title',
        \`fileName\` VARCHAR(255) NULL COMMENT 'uploaded file name',
        \`status\` VARCHAR(64) NOT NULL COMMENT 'preview/import status',
        \`totalRows\` INT NOT NULL DEFAULT 0 COMMENT 'total source rows',
        \`successRows\` INT NOT NULL DEFAULT 0 COMMENT 'successful source rows',
        \`failedRows\` INT NOT NULL DEFAULT 0 COMMENT 'failed source rows',
        \`masterCount\` INT NOT NULL DEFAULT 0 COMMENT 'generated master rows',
        \`detailCount\` INT NOT NULL DEFAULT 0 COMMENT 'generated detail rows',
        \`previewJson\` LONGTEXT NULL COMMENT 'preview payload json',
        \`reportJson\` LONGTEXT NULL COMMENT 'report json',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
        \`confirmedAt\` DATETIME NULL COMMENT 'confirmed time',
        PRIMARY KEY (\`jobId\`),
        KEY \`idx_ImportJobs_targetKey\` (\`targetKey\`),
        KEY \`idx_ImportJobs_createdAt\` (\`createdAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ImportJobs'
    `,
  );
  await createTableIfMissing(
    "appusers",
    `
      CREATE TABLE \`appusers\` (
        \`userId\` VARCHAR(80) NOT NULL COMMENT 'user id',
        \`email\` VARCHAR(255) NOT NULL COMMENT 'login email',
        \`passwordHash\` VARCHAR(128) NOT NULL COMMENT 'password hash',
        \`passwordSalt\` VARCHAR(64) NOT NULL COMMENT 'password salt',
        \`displayName\` VARCHAR(255) NULL COMMENT 'display name',
        \`role\` VARCHAR(64) NOT NULL DEFAULT 'admin' COMMENT 'user role',
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT 'active/disabled',
        \`lastLoginAt\` DATETIME NULL COMMENT 'last login time',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
        PRIMARY KEY (\`userId\`),
        UNIQUE KEY \`uk_AppUsers_email\` (\`email\`),
        KEY \`idx_AppUsers_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AppUsers'
    `,
  );
  await createTableIfMissing(
    "userpreferences",
    `
      CREATE TABLE \`userpreferences\` (
        \`userId\` VARCHAR(80) NOT NULL COMMENT 'app user id',
        \`preferenceKey\` VARCHAR(80) NOT NULL COMMENT 'preference key',
        \`preferenceValue\` LONGTEXT NOT NULL COMMENT 'preference JSON value',
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
        PRIMARY KEY (\`userId\`, \`preferenceKey\`),
        KEY \`idx_UserPreferences_updatedAt\` (\`updatedAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='UserPreferences'
    `,
  );
  await createTableIfMissing(
    "modulefeatures",
    `
      CREATE TABLE \`modulefeatures\` (
        \`moduleKey\` VARCHAR(128) NOT NULL COMMENT 'module key',
        \`moduleName\` VARCHAR(255) NOT NULL COMMENT 'module display name',
        \`parentModuleKey\` VARCHAR(128) NULL COMMENT 'parent navigation group',
        \`enabled\` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'whether the module is enabled',
        \`sortOrder\` INT NOT NULL DEFAULT 0 COMMENT 'display order',
        \`remark\` VARCHAR(500) NULL COMMENT 'remark',
        \`updatedBy\` VARCHAR(255) NULL COMMENT 'last updater',
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
        PRIMARY KEY (\`moduleKey\`),
        KEY \`idx_ModuleFeatures_enabled_sort\` (\`enabled\`, \`sortOrder\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ModuleFeatures'
    `,
  );
  await createTableIfMissing(
    "capexpricingversions",
    `
      CREATE TABLE \`capexpricingversions\` (
        \`versionId\` VARCHAR(96) NOT NULL COMMENT 'CAPEX/OPEX pricing version id',
        \`versionNo\` VARCHAR(128) NOT NULL COMMENT 'pricing version number',
        \`countryCode\` VARCHAR(32) NOT NULL COMMENT 'country code',
        \`effectiveDate\` DATE NOT NULL COMMENT 'effective date',
        \`status\` VARCHAR(32) NOT NULL DEFAULT '草稿' COMMENT '草稿/已确认/已废止',
        \`sourceFileName\` VARCHAR(255) NULL COMMENT 'source workbook name',
        \`notes\` TEXT NULL COMMENT 'notes',
        \`confirmedAt\` DATETIME NULL COMMENT 'confirmed time',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
        PRIMARY KEY (\`versionId\`),
        UNIQUE KEY \`uk_CapexPricingVersions_version_country\` (\`versionNo\`, \`countryCode\`),
        KEY \`idx_CapexPricingVersions_country_effective\` (\`countryCode\`, \`effectiveDate\`),
        KEY \`idx_CapexPricingVersions_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='CapexOpexPricingVersions'
    `,
  );
  await createTableIfMissing(
    "b6typeconfigs",
    `
      CREATE TABLE \`b6typeconfigs\` (
        \`b6Type\` VARCHAR(64) NOT NULL COMMENT 'B6 type code',
        \`alias\` VARCHAR(128) NULL COMMENT 'B6 type alias',
        \`scope\` VARCHAR(255) NULL COMMENT 'applicable scope',
        \`fundingCostIncluded\` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'equipment price includes funding cost',
        \`spareCostIncluded\` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'equipment price includes spare cost',
        \`defaultFundingMonths\` INT NULL COMMENT 'default funding occupancy months',
        \`defaultSpareOccupancyMonths\` INT NULL COMMENT 'default spare occupancy months',
        \`overseasSpareServiceAvailable\` TINYINT(1) NULL COMMENT 'overseas spare service available',
        \`defaultSpareRate\` DECIMAL(10, 6) NULL COMMENT 'default spare rate as decimal',
        \`spareSettlementMethod\` VARCHAR(128) NULL COMMENT 'spare settlement method',
        \`slPricingInstruction\` TEXT NULL COMMENT 'SL pricing instruction',
        \`notes\` TEXT NULL COMMENT 'notes',
        \`status\` VARCHAR(32) NOT NULL DEFAULT '启用' COMMENT '启用/停用',
        \`sortOrder\` INT NOT NULL DEFAULT 0 COMMENT 'sort order',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
        PRIMARY KEY (\`b6Type\`),
        KEY \`idx_B6TypeConfigs_status_sort\` (\`status\`, \`sortOrder\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='B6TypeConfigs'
    `,
  );
  await execute(`
    INSERT IGNORE INTO b6typeconfigs (
      b6Type, alias, scope, fundingCostIncluded, spareCostIncluded, defaultFundingMonths,
      defaultSpareOccupancyMonths, overseasSpareServiceAvailable, defaultSpareRate,
      spareSettlementMethod, slPricingInstruction, notes, status, sortOrder
    ) VALUES
      ('B61', 'B61', '整机服务场景', 0, 0, NULL, NULL, NULL, NULL, '按SL模板费率', 'SL模板已含对应费率，避免重复计算', '资金占用月数与备件占用月数待确认。', '启用', 10),
      ('B62-A7', 'B62-A7', '整机已含备件费用', 1, 1, 0, 0, 0, 0, '备件单独结差', '整机价已含备件费用。', '不提供海外备件服务。', '启用', 20),
      ('B62-A8 (HT)', 'B62-A8', 'HT整机不含资金占用费', 0, 0, 2, NULL, 0, 0, '备件单独结差', '整机价不含资金占用费。', '备件占用月数待确认；不提供海外备件服务。', '启用', 30),
      ('B63 (HT)', 'B63', 'HT整机服务场景', 0, 0, 0, NULL, 0, 0, '备件单独结差', '整机价不含资金占用费。', '资金占用月数暂按0，需复核；备件占用月数待确认。', '启用', 40)
  `);
  await execute("UPDATE b6typeconfigs SET alias = 'B62-A8' WHERE b6Type = 'B62-A8 (HT)' AND alias = 'B62-A8 (HT)'");
  await execute("UPDATE b6typeconfigs SET alias = 'B63' WHERE b6Type = 'B63 (HT)' AND alias = 'B63 (HT)'");
  await createTableIfMissing(
    "capexpricingitems",
    `
      CREATE TABLE \`capexpricingitems\` (
        \`id\` VARCHAR(128) NOT NULL COMMENT 'CAPEX/OPEX pricing item id',
        \`versionId\` VARCHAR(96) NOT NULL COMMENT 'pricing version id',
        \`lineNo\` INT NOT NULL DEFAULT 0 COMMENT 'line sequence',
        \`deviceCode\` VARCHAR(64) NOT NULL COMMENT 'device code',
        \`modelCode\` VARCHAR(128) NULL COMMENT 'model code snapshot', \`nameZh\` VARCHAR(255) NULL COMMENT 'Chinese name snapshot', \`nameEn\` VARCHAR(255) NULL COMMENT 'English name snapshot',
        \`b6Type\` VARCHAR(64) NOT NULL COMMENT 'B6 type', \`spareScenario\` VARCHAR(64) NULL COMMENT 'spare/maintenance scenario',
        \`spareOccupancyMonths\` INT NULL COMMENT 'spare occupancy months snapshot', \`overseasSpareServiceAvailable\` TINYINT(1) NULL COMMENT 'overseas spare service availability snapshot',
        \`spareRate\` DECIMAL(10, 6) NULL COMMENT 'spare rate snapshot', \`spareSettlementMethod\` VARCHAR(128) NULL COMMENT 'spare settlement method snapshot',
        \`priceCurrency\` VARCHAR(16) NOT NULL DEFAULT 'CNY' COMMENT 'equipment price currency', \`contractCurrency\` VARCHAR(16) NOT NULL DEFAULT 'USD' COMMENT 'SL contract currency',
        \`baseCapexPrice\` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT 'equipment price excluding VAT', \`exchangeRate\` DECIMAL(18,10) NOT NULL DEFAULT 0 COMMENT 'equipment price to contract currency rate',
        \`deviceVatRate\` DECIMAL(10,6) NOT NULL DEFAULT 0 COMMENT 'local device VAT rate', \`serviceVatRate\` DECIMAL(10,6) NOT NULL DEFAULT 0 COMMENT 'local service VAT rate', \`brazilServiceTaxRate\` DECIMAL(10,6) NOT NULL DEFAULT 0 COMMENT 'Brazil service tax rate',
        \`onsiteRmaRate\` DECIMAL(10,6) NOT NULL DEFAULT 0 COMMENT 'onsite and RMA rate', \`fundingAnnualRate\` DECIMAL(10,6) NOT NULL DEFAULT 0 COMMENT 'funding annual rate', \`fundingMonths\` INT NOT NULL DEFAULT 0 COMMENT 'funding months',
        \`fundingRatio\` DECIMAL(18,10) NOT NULL DEFAULT 0 COMMENT 'funding ratio', \`fundingAmount\` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT 'funding amount', \`capexTotal\` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT 'CAPEX total',
        \`transportClearanceRate\` DECIMAL(10,6) NOT NULL DEFAULT 0 COMMENT 'transport and clearance rate', \`handlingRate\` DECIMAL(10,6) NOT NULL DEFAULT 0 COMMENT 'handling rate', \`otherTaxRate\` DECIMAL(10,6) NOT NULL DEFAULT 0 COMMENT 'other tax rate',
        \`ddpPrice\` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT 'DDP price', \`opexAmount\` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT 'OPEX amount',
        \`rawCapexAnchorUsd\` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT 'raw CAPEX anchor USD', \`rawOpexAnchorUsd\` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT 'raw OPEX anchor USD',
        \`capexAnchorUsd\` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT 'system CAPEX anchor USD', \`opexAnchorUsd\` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT 'system OPEX anchor USD',
        \`sourceSnapshotJson\` LONGTEXT NULL COMMENT 'input source snapshot JSON', \`b6RuleSnapshotJson\` LONGTEXT NULL COMMENT 'B6 rule snapshot JSON',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time', \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
        PRIMARY KEY (\`id\`), UNIQUE KEY \`uk_CapexPricingItems_version_line\` (\`versionId\`, \`lineNo\`),
        KEY \`idx_CapexPricingItems_version\` (\`versionId\`), KEY \`idx_CapexPricingItems_device\` (\`deviceCode\`),
        KEY \`idx_CapexPricingItems_version_device_b6\` (\`versionId\`, \`deviceCode\`, \`b6Type\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='CapexOpexPricingItems'
    `,
  );
  await addColumnIfMissing(
    "capexpricingitems",
    "spareOccupancyMonths",
    "`spareOccupancyMonths` INT NULL COMMENT 'spare occupancy months snapshot' AFTER `spareScenario`",
  );
  await addColumnIfMissing(
    "capexpricingitems",
    "overseasSpareServiceAvailable",
    "`overseasSpareServiceAvailable` TINYINT(1) NULL COMMENT 'overseas spare service availability snapshot' AFTER `spareOccupancyMonths`",
  );
  await addColumnIfMissing(
    "capexpricingitems",
    "spareRate",
    "`spareRate` DECIMAL(10, 6) NULL COMMENT 'spare rate snapshot' AFTER `overseasSpareServiceAvailable`",
  );
  await addColumnIfMissing(
    "capexpricingitems",
    "spareSettlementMethod",
    "`spareSettlementMethod` VARCHAR(128) NULL COMMENT 'spare settlement method snapshot' AFTER `spareRate`",
  );
  await addColumnIfMissing(
    "capexpricingitems",
    "b6RuleSnapshotJson",
    "`b6RuleSnapshotJson` LONGTEXT NULL COMMENT 'B6 rule snapshot JSON' AFTER `sourceSnapshotJson`",
  );
  await addColumnIfMissing(
    "purchaseorderitems",
    "capexUnitPrice",
    "`capexUnitPrice` DECIMAL(18, 4) NULL COMMENT 'procurement CAPEX unit price' AFTER `unitPrice`",
  );
  await addColumnIfMissing(
    "purchaseorderitems",
    "opexUnitPrice",
    "`opexUnitPrice` DECIMAL(18, 4) NULL COMMENT 'procurement OPEX unit price' AFTER `capexUnitPrice`",
  );
  await createTableIfMissing(
    "balancesettlements",
    `
      CREATE TABLE \`balancesettlements\` (
        \`settlementNo\` VARCHAR(128) NOT NULL COMMENT 'settlement document number',
        \`title\` VARCHAR(255) NULL COMMENT 'settlement title', \`countryCode\` VARCHAR(32) NULL COMMENT 'country code',
        \`pricingVersionId\` VARCHAR(96) NULL COMMENT 'CAPEX/OPEX pricing version id', \`pricingVersionNo\` VARCHAR(128) NULL COMMENT 'CAPEX/OPEX pricing version snapshot',
        \`currency\` VARCHAR(16) NOT NULL DEFAULT 'USD' COMMENT 'settlement currency', \`status\` VARCHAR(32) NOT NULL DEFAULT '草稿' COMMENT '草稿/已确认/已作废',
        \`periodStart\` DATE NULL COMMENT 'settlement period start', \`periodEnd\` DATE NULL COMMENT 'settlement period end',
        \`itemCount\` INT NOT NULL DEFAULT 0 COMMENT 'item count', \`capexDifferenceTotal\` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT 'CAPEX difference total',
        \`opexDifferenceTotal\` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT 'OPEX difference total', \`differenceTotal\` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT 'difference total',
        \`sourceFileName\` VARCHAR(255) NULL COMMENT 'historical import source file', \`notes\` TEXT NULL COMMENT 'notes',
        \`confirmedAt\` DATETIME NULL COMMENT 'confirmed time', \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
        PRIMARY KEY (\`settlementNo\`), KEY \`idx_BalanceSettlements_country_status\` (\`countryCode\`, \`status\`),
        KEY \`idx_BalanceSettlements_createdAt\` (\`createdAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BalanceSettlements'
    `,
  );
  await createTableIfMissing(
    "balancesettlementitems",
    `
      CREATE TABLE \`balancesettlementitems\` (
        \`id\` VARCHAR(128) NOT NULL COMMENT 'settlement line id', \`settlementNo\` VARCHAR(128) NOT NULL COMMENT 'settlement document number',
        \`lineNo\` INT NOT NULL DEFAULT 0 COMMENT 'line sequence', \`itemType\` VARCHAR(32) NOT NULL DEFAULT '实例' COMMENT '实例/备件/非实例费用',
        \`countryCode\` VARCHAR(32) NULL, \`batchName\` VARCHAR(255) NULL, \`requestNo\` VARCHAR(128) NULL, \`poNo\` VARCHAR(128) NULL,
        \`purchaseOrderItemId\` VARCHAR(128) NULL, \`requestItemId\` VARCHAR(128) NULL, \`deviceCode\` VARCHAR(64) NULL,
        \`modelCode\` VARCHAR(128) NULL, \`nameEn\` VARCHAR(255) NULL, \`supplierId\` VARCHAR(64) NULL, \`undertakingUnitId\` VARCHAR(64) NULL,
        \`quantity\` DECIMAL(18,4) NOT NULL DEFAULT 1, \`receiptDate\` DATE NULL, \`paymentDate\` DATE NULL,
        \`procurementCurrency\` VARCHAR(16) NULL, \`purchaseUnitPrice\` DECIMAL(18,4) NULL, \`purchaseCapexUnitPrice\` DECIMAL(18,4) NOT NULL DEFAULT 0,
        \`purchaseOpexUnitPrice\` DECIMAL(18,4) NOT NULL DEFAULT 0, \`settlementCurrency\` VARCHAR(16) NOT NULL DEFAULT 'USD',
        \`settlementRate\` DECIMAL(18,10) NOT NULL DEFAULT 1, \`settlementCapexUnitPrice\` DECIMAL(18,4) NOT NULL DEFAULT 0,
        \`settlementOpexUnitPrice\` DECIMAL(18,4) NOT NULL DEFAULT 0, \`anchorVersionId\` VARCHAR(96) NULL, \`anchorVersionNo\` VARCHAR(128) NULL,
        \`anchorItemId\` VARCHAR(128) NULL, \`anchorCapexUnitPrice\` DECIMAL(18,4) NOT NULL DEFAULT 0, \`anchorOpexUnitPrice\` DECIMAL(18,4) NOT NULL DEFAULT 0,
        \`capexDifferenceUnitPrice\` DECIMAL(18,4) NOT NULL DEFAULT 0, \`capexDifferenceTotal\` DECIMAL(18,4) NOT NULL DEFAULT 0,
        \`opexDifferenceUnitPrice\` DECIMAL(18,4) NOT NULL DEFAULT 0, \`opexDifferenceTotal\` DECIMAL(18,4) NOT NULL DEFAULT 0,
        \`differenceTotal\` DECIMAL(18,4) NOT NULL DEFAULT 0, \`expenseCategory\` VARCHAR(128) NULL, \`expenseName\` VARCHAR(255) NULL,
        \`sourceSnapshotJson\` LONGTEXT NULL, \`notes\` TEXT NULL, \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`), KEY \`idx_BalanceSettlementItems_settlement\` (\`settlementNo\`, \`lineNo\`),
        KEY \`idx_BalanceSettlementItems_purchase\` (\`purchaseOrderItemId\`), KEY \`idx_BalanceSettlementItems_country_batch\` (\`countryCode\`, \`batchName\`),
        KEY \`idx_BalanceSettlementItems_type\` (\`itemType\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BalanceSettlementItems'
    `,
  );
  await createTableIfMissing(
    "balancesettlementfinals",
    `
      CREATE TABLE \`balancesettlementfinals\` (
        \`finalSettlementNo\` VARCHAR(128) NOT NULL COMMENT 'final settlement document number',
        \`title\` VARCHAR(255) NULL COMMENT 'final settlement title', \`countryCode\` VARCHAR(32) NOT NULL COMMENT 'country code',
        \`currency\` VARCHAR(16) NOT NULL COMMENT 'settlement currency', \`status\` VARCHAR(32) NOT NULL DEFAULT 'draft' COMMENT 'draft/confirmed/voided',
        \`periodStart\` DATE NOT NULL COMMENT 'settlement period start', \`periodEnd\` DATE NOT NULL COMMENT 'settlement period end',
        \`sourceCount\` INT NOT NULL DEFAULT 0 COMMENT 'source document count', \`itemCount\` INT NOT NULL DEFAULT 0 COMMENT 'source item count',
        \`capexDifferenceTotal\` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT 'CAPEX difference total',
        \`opexDifferenceTotal\` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT 'OPEX difference total',
        \`differenceTotal\` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT 'difference total', \`notes\` TEXT NULL COMMENT 'notes',
        \`confirmedAt\` DATETIME NULL COMMENT 'confirmed time', \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`finalSettlementNo\`), KEY \`idx_BalanceSettlementFinals_filter\` (\`countryCode\`, \`currency\`, \`status\`, \`periodStart\`, \`periodEnd\`),
        KEY \`idx_BalanceSettlementFinals_createdAt\` (\`createdAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BalanceSettlementFinals'
    `,
  );
  for (const [column, definition] of [
    ["expenseType", "`expenseType` VARCHAR(64) NULL COMMENT 'structured non-instance expense type'"],
    ["differenceNature", "`differenceNature` VARCHAR(16) NULL COMMENT 'CAPEX or OPEX'"],
    ["expenseDate", "`expenseDate` DATE NULL COMMENT 'expense date'"],
    ["documentNo", "`documentNo` VARCHAR(128) NULL COMMENT 'source document number'"],
    ["deviceNodeQuantity", "`deviceNodeQuantity` DECIMAL(18,4) NULL COMMENT 'device node quantity'"],
    ["deliveryQuantity", "`deliveryQuantity` DECIMAL(18,4) NULL COMMENT 'delivery quantity'"],
    ["settlementQuantity", "`settlementQuantity` DECIMAL(18,4) NULL COMMENT 'settlement quantity'"],
    ["taxExcludedUnitPriceUsd", "`taxExcludedUnitPriceUsd` DECIMAL(18,4) NULL COMMENT 'tax excluded unit price in USD'"],
    ["priceConfirmation", "`priceConfirmation` VARCHAR(16) NULL COMMENT 'price confirmation YES or NO'"],
    ["paymentExchangeRate", "`paymentExchangeRate` DECIMAL(18,10) NULL COMMENT 'payment exchange rate'"],
    ["taxExcludedTotalUsd", "`taxExcludedTotalUsd` DECIMAL(18,4) NULL COMMENT 'tax excluded total in USD'"],
    ["taxExcludedTotalCny", "`taxExcludedTotalCny` DECIMAL(18,4) NULL COMMENT 'tax excluded total in CNY'"],
    ["equipmentTotalUsd", "`equipmentTotalUsd` DECIMAL(18,4) NULL COMMENT 'equipment total in USD'"],
    ["localTaxRate", "`localTaxRate` DECIMAL(10,6) NULL COMMENT 'local tax rate'"],
    ["calculatedTaxAmountUsd", "`calculatedTaxAmountUsd` DECIMAL(18,4) NULL COMMENT 'calculated tax amount in USD'"],
    ["feeCurrency", "`feeCurrency` VARCHAR(16) NULL COMMENT 'fee original currency'"],
    ["feeAmount", "`feeAmount` DECIMAL(18,4) NULL COMMENT 'fee original amount'"],
    ["expenseProvider", "`expenseProvider` VARCHAR(255) NULL COMMENT 'expense provider'"],
    ["usdExchangeRate", "`usdExchangeRate` DECIMAL(18,10) NULL COMMENT 'original currency per USD'"],
    ["settlementAmountUsd", "`settlementAmountUsd` DECIMAL(18,4) NULL COMMENT 'settlement amount in USD'"],
    ["issRate", "`issRate` DECIMAL(10,6) NULL COMMENT 'ISS tax rate'"],
    ["issExcludedAmountUsd", "`issExcludedAmountUsd` DECIMAL(18,4) NULL COMMENT 'amount excluding ISS in USD'"],
    ["confirmationResult", "`confirmationResult` VARCHAR(16) NULL COMMENT 'confirmation result'"],
    ["sourceReference", "`sourceReference` VARCHAR(255) NULL COMMENT 'source reference'"],
  ] as const) {
    await addColumnIfMissing("balancesettlementitems", column, definition);
  }
  await createTableIfMissing(
    "balancesettlementfinalsources",
    `
      CREATE TABLE \`balancesettlementfinalsources\` (
        \`id\` VARCHAR(128) NOT NULL COMMENT 'final settlement source id', \`finalSettlementNo\` VARCHAR(128) NOT NULL COMMENT 'final settlement document number',
        \`sourceSettlementNo\` VARCHAR(128) NOT NULL COMMENT 'source settlement document number', \`sourceTitle\` VARCHAR(255) NULL COMMENT 'source title snapshot',
        \`sourceItemTypes\` VARCHAR(255) NULL COMMENT 'source item types snapshot', \`countryCode\` VARCHAR(32) NOT NULL COMMENT 'country code snapshot',
        \`currency\` VARCHAR(16) NOT NULL COMMENT 'currency snapshot', \`periodStart\` DATE NOT NULL COMMENT 'period start snapshot', \`periodEnd\` DATE NOT NULL COMMENT 'period end snapshot',
        \`itemCount\` INT NOT NULL DEFAULT 0 COMMENT 'source item count snapshot', \`capexDifferenceTotal\` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT 'CAPEX difference total snapshot',
        \`opexDifferenceTotal\` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT 'OPEX difference total snapshot', \`differenceTotal\` DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT 'difference total snapshot',
        \`sourceSnapshotJson\` LONGTEXT NULL COMMENT 'source settlement snapshot JSON', \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`), UNIQUE KEY \`uk_BalanceSettlementFinalSources_final_source\` (\`finalSettlementNo\`, \`sourceSettlementNo\`),
        KEY \`idx_BalanceSettlementFinalSources_source\` (\`sourceSettlementNo\`), KEY \`idx_BalanceSettlementFinalSources_final\` (\`finalSettlementNo\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BalanceSettlementFinalSources'
    `,
  );
  await createTableIfMissing(
    "internalserviceledgers",
    `
      CREATE TABLE \`internalserviceledgers\` (
        \`ledgerId\` VARCHAR(96) NOT NULL COMMENT 'billing ledger id',
        \`countryCode\` VARCHAR(32) NULL, \`batchName\` VARCHAR(255) NULL, \`requestNo\` VARCHAR(128) NULL,
        \`poNo\` VARCHAR(128) NULL, \`deviceCode\` VARCHAR(64) NULL, \`modelCode\` VARCHAR(128) NULL,
        \`nameEn\` VARCHAR(255) NULL, \`supplierId\` VARCHAR(64) NULL, \`undertakingUnitId\` VARCHAR(64) NULL,
        \`quantity\` INT NULL, \`currency\` VARCHAR(16) NULL, \`vatRate\` DECIMAL(10,6) NULL,
        \`procurementTaxExcludedUnitPrice\` DECIMAL(18,4) NULL, \`procurementTaxSurcharge\` DECIMAL(18,4) NULL,
        \`contractRevenueIncludingTax\` DECIMAL(18,2) NULL, \`contractRevenueExcludingTax\` DECIMAL(18,2) NULL,
        \`procurementCost\` DECIMAL(18,2) NULL, \`internalServiceFeeTotal\` DECIMAL(18,2) NULL,
        \`archivedAmount\` DECIMAL(18,2) NULL, \`manualAmount\` DECIMAL(18,2) NULL,
        \`remainingAmount\` DECIMAL(18,2) NULL, \`unallocatedAmount\` DECIMAL(18,2) NULL,
        \`startMonth\` DATE NULL, \`status\` VARCHAR(32) NOT NULL DEFAULT '已生成',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`ledgerId\`), KEY \`idx_InternalServiceLedgers_country\` (\`countryCode\`),
        KEY \`idx_InternalServiceLedgers_request\` (\`requestNo\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='InternalServiceLedgers'
    `,
  );
  await createTableIfMissing(
    "monthlyinternalservicefees",
    `
      CREATE TABLE \`monthlyinternalservicefees\` (
        \`id\` VARCHAR(128) NOT NULL, \`ledgerId\` VARCHAR(96) NOT NULL, \`writeOffMonth\` DATE NOT NULL,
        \`monthIndex\` INT NOT NULL, \`countryCode\` VARCHAR(32) NULL, \`batchName\` VARCHAR(255) NULL,
        \`requestNo\` VARCHAR(128) NULL, \`poNo\` VARCHAR(128) NULL, \`deviceCode\` VARCHAR(64) NULL,
        \`modelCode\` VARCHAR(128) NULL, \`nameEn\` VARCHAR(255) NULL, \`supplierId\` VARCHAR(64) NULL,
        \`undertakingUnitId\` VARCHAR(64) NULL, \`customerId\` VARCHAR(64) NULL, \`quantity\` INT NULL, \`currency\` VARCHAR(16) NULL,
        \`internalServiceFeeAmount\` DECIMAL(18,2) NOT NULL DEFAULT 0, \`sourceType\` VARCHAR(32) NOT NULL DEFAULT 'auto',
        \`adjustmentNo\` VARCHAR(128) NULL, \`archived\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`archiveSnapshotNo\` VARCHAR(128) NULL, \`archivedAt\` DATETIME NULL,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`), UNIQUE KEY \`uk_MonthlyInternalServiceFees_ledger_month\` (\`ledgerId\`, \`writeOffMonth\`),
        KEY \`idx_MonthlyInternalServiceFees_month\` (\`writeOffMonth\`), KEY \`idx_MonthlyInternalServiceFees_country\` (\`countryCode\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MonthlyInternalServiceFees'
    `,
  );
  await createTableIfMissing(
    "internalservicefeeadjustments",
    `
      CREATE TABLE \`internalservicefeeadjustments\` (
        \`adjustmentNo\` VARCHAR(128) NOT NULL, \`ledgerId\` VARCHAR(96) NOT NULL,
        \`countryCode\` VARCHAR(32) NULL, \`batchName\` VARCHAR(255) NULL, \`requestNo\` VARCHAR(128) NULL,
        \`poNo\` VARCHAR(128) NULL, \`deviceCode\` VARCHAR(64) NULL, \`supplierId\` VARCHAR(64) NULL,
        \`undertakingUnitId\` VARCHAR(64) NULL, \`customerId\` VARCHAR(64) NULL, \`startMonth\` DATE NOT NULL, \`endMonth\` DATE NOT NULL,
        \`monthlyAmount\` DECIMAL(18,2) NOT NULL, \`reason\` TEXT NULL, \`status\` VARCHAR(32) NOT NULL DEFAULT '已确认',
        \`confirmedAt\` DATETIME NULL, \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`adjustmentNo\`), KEY \`idx_InternalServiceFeeAdjustments_ledger\` (\`ledgerId\`),
        KEY \`idx_InternalServiceFeeAdjustments_range\` (\`startMonth\`, \`endMonth\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='InternalServiceFeeAdjustments'
    `,
  );
  await createTableIfMissing(
    "internalservicefeesnapshots",
    `
      CREATE TABLE \`internalservicefeesnapshots\` (
        \`snapshotNo\` VARCHAR(128) NOT NULL, \`archiveMonth\` DATE NOT NULL, \`countryCode\` VARCHAR(32) NULL,
        \`itemCount\` INT NOT NULL DEFAULT 0, \`totalAmount\` DECIMAL(18,2) NOT NULL DEFAULT 0,
        \`confirmedAt\` DATETIME NULL, \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`snapshotNo\`), KEY \`idx_InternalServiceFeeSnapshots_month\` (\`archiveMonth\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='InternalServiceFeeSnapshots'
    `,
  );
  await createTableIfMissing(
    "internalservicefeesnapshotitems",
    `
      CREATE TABLE \`internalservicefeesnapshotitems\` (
        \`id\` VARCHAR(160) NOT NULL, \`snapshotNo\` VARCHAR(128) NOT NULL, \`monthlyFeeId\` VARCHAR(128) NOT NULL,
        \`ledgerId\` VARCHAR(96) NOT NULL, \`writeOffMonth\` DATE NOT NULL, \`countryCode\` VARCHAR(32) NULL,
        \`batchName\` VARCHAR(255) NULL, \`requestNo\` VARCHAR(128) NULL, \`poNo\` VARCHAR(128) NULL,
        \`deviceCode\` VARCHAR(64) NULL, \`supplierId\` VARCHAR(64) NULL, \`undertakingUnitId\` VARCHAR(64) NULL, \`customerId\` VARCHAR(64) NULL,
        \`currency\` VARCHAR(16) NULL, \`internalServiceFeeAmount\` DECIMAL(18,2) NOT NULL,
        \`sourceType\` VARCHAR(32) NULL, \`adjustmentNo\` VARCHAR(128) NULL, \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`), KEY \`idx_InternalServiceFeeSnapshotItems_snapshot\` (\`snapshotNo\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='InternalServiceFeeSnapshotItems'
    `,
  );
  for (const tableName of [
    "prepaymentcontractitems",
    "monthlyprepaymentwriteoffs",
    "billinginstanceledgers",
    "monthlybillingwriteoffs",
    "servicefeesnapshotitems",
    "balancesettlementitems",
    "internalserviceledgers",
    "monthlyinternalservicefees",
    "internalservicefeeadjustments",
    "internalservicefeesnapshotitems",
  ]) {
    await addColumnIfMissing(tableName, "customerId", "`customerId` VARCHAR(64) NULL COMMENT 'customer id'");
  }
  await execute(`
    UPDATE billinginstanceledgers ledger
    LEFT JOIN purchaseorderitems purchaseItem ON purchaseItem.id = ledger.purchaseOrderItemId
    LEFT JOIN requestitems requestItem ON requestItem.id = purchaseItem.requestItemId
    LEFT JOIN requestitems fallback ON fallback.requestNo = ledger.requestNo AND fallback.deviceCode = ledger.deviceCode
    SET ledger.customerId = COALESCE(NULLIF(ledger.customerId, ''), requestItem.customerId, fallback.customerId)
    WHERE NULLIF(ledger.customerId, '') IS NULL
  `);
  await execute(`
    UPDATE monthlybillingwriteoffs monthly
    LEFT JOIN billinginstanceledgers ledger ON ledger.ledgerId = monthly.ledgerId
    LEFT JOIN requestitems fallback ON fallback.requestNo = monthly.requestNo AND fallback.deviceCode = monthly.deviceCode
    SET monthly.customerId = COALESCE(NULLIF(monthly.customerId, ''), ledger.customerId, fallback.customerId)
    WHERE NULLIF(monthly.customerId, '') IS NULL
  `);
  await execute(`
    UPDATE prepaymentcontractitems contractItem
    LEFT JOIN requestitems requestItem ON requestItem.id = contractItem.requestItemId
    LEFT JOIN requestitems fallback ON fallback.requestNo = contractItem.requestNo AND fallback.deviceCode = contractItem.deviceCode
    SET contractItem.customerId = COALESCE(NULLIF(contractItem.customerId, ''), requestItem.customerId, fallback.customerId)
    WHERE NULLIF(contractItem.customerId, '') IS NULL
  `);
  await execute(`
    UPDATE monthlyprepaymentwriteoffs monthly
    LEFT JOIN prepaymentcontractitems contractItem ON contractItem.id = monthly.contractLineId
    LEFT JOIN requestitems fallback ON fallback.requestNo = monthly.requestNo AND fallback.deviceCode = monthly.deviceCode
    SET monthly.customerId = COALESCE(NULLIF(monthly.customerId, ''), contractItem.customerId, fallback.customerId)
    WHERE NULLIF(monthly.customerId, '') IS NULL
  `);
  await execute(`
    UPDATE servicefeesnapshotitems item
    LEFT JOIN requestitems requestItem ON requestItem.requestNo = item.requestNo AND requestItem.deviceCode = item.deviceCode
    SET item.customerId = COALESCE(NULLIF(item.customerId, ''), requestItem.customerId)
    WHERE NULLIF(item.customerId, '') IS NULL
  `);
  for (const tableName of ["internalserviceledgers", "monthlyinternalservicefees", "internalservicefeeadjustments", "internalservicefeesnapshotitems", "balancesettlementitems"]) {
    await execute(`
      UPDATE \`${tableName}\` item
      LEFT JOIN requestitems requestItem ON requestItem.requestNo = item.requestNo AND requestItem.deviceCode = item.deviceCode
      SET item.customerId = COALESCE(NULLIF(item.customerId, ''), requestItem.customerId)
      WHERE NULLIF(item.customerId, '') IS NULL
    `);
  }
  await ensureAuditColumns();
  await addIndexIfMissing(
    "documentfolders",
    "uk_DocumentFolders_parent_name",
    "UNIQUE KEY `uk_DocumentFolders_parent_name` (`parentId`, `name`)",
  );
  await addIndexIfMissing(
    "documentfiles",
    "idx_DocumentFiles_folderId",
    "KEY `idx_DocumentFiles_folderId` (`folderId`)",
  );
  await execute(
    `
      INSERT IGNORE INTO documentfolders (folderId, parentId, name, sortOrder)
      VALUES
        ('ROOT', NULL, '文档管理', 0),
        ('ROOT-MX', 'ROOT', 'MX', 1),
        ('ROOT-CL', 'ROOT', 'CL', 2),
        ('ROOT-BR', 'ROOT', 'BR', 3)
    `,
  );

  const passwordSalt = createPasswordSalt();
  await execute(
    `
      INSERT IGNORE INTO appusers
        (userId, email, passwordHash, passwordSalt, displayName, role, status)
      VALUES
        (:userId, :email, :passwordHash, :passwordSalt, :displayName, 'admin', 'active')
    `,
    {
      userId: "admin",
      email: INITIAL_ADMIN_EMAIL.trim().toLowerCase(),
      passwordHash: hashPassword(INITIAL_ADMIN_PASSWORD, passwordSalt),
      passwordSalt,
      displayName: "Admin",
    },
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
