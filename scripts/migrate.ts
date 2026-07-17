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
        \`countryCode\` VARCHAR(32) NOT NULL COMMENT 'country code',
        \`startDate\` DATE NOT NULL COMMENT 'statement start date',
        \`endDate\` DATE NOT NULL COMMENT 'statement end date',
        \`currencySummary\` VARCHAR(255) NULL COMMENT 'currency summary',
        \`totalQuantity\` DECIMAL(18, 4) NULL COMMENT 'total quantity',
        \`totalAmount\` DECIMAL(18, 4) NULL COMMENT 'total amount',
        \`itemCount\` INT NOT NULL DEFAULT 0 COMMENT 'item count',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
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
    "servicefeesnapshotitems",
    "serviceFeeAmountExcludingTax",
    "`serviceFeeAmountExcludingTax` DECIMAL(18, 4) NULL COMMENT 'monthly service fee amount VAT excluded' AFTER `serviceFeeAmount`",
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
