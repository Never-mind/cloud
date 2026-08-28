import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const sourcePath = resolve(root, "schema.sql");
const targetDatabase = process.env.DEPLOY_DB_NAME ?? process.env.DB_NAME ?? "merge";
const outputPath = resolve(root, `${targetDatabase}_schema.sql`);

const tableNames = [
  "Countries",
  "DeliveryLocations",
  "DeliveryContacts",
  "Datacenters",
  "InstanceModels",
  "Suppliers",
  "Customers",
  "InstanceContracts",
  "ContractItems",
  "Requests",
  "RequestItems",
  "PurchaseOrders",
  "PurchaseOrderItems",
  "PurchaseOrderSnItems",
  "PurchaseOrderPlanItems",
  "PrepaymentContracts",
  "PrepaymentContractItems",
  "MonthlyPrepaymentWriteOffs",
  "PrepaymentWriteOffAdjustments",
  "PrepaymentWriteOffAdjustmentItems",
  "BillingInstanceLedgers",
  "MonthlyBillingWriteOffs",
  "BillingAdjustments",
  "BillingAdjustmentItems",
  "BillingStatementSnapshots",
  "BillingStatementSnapshotItems",
  "ServiceFeeSnapshots",
  "ServiceFeeSnapshotItems",
  "CapexPricingVersions",
  "B6TypeConfigs",
  "CapexPricingItems",
  "BalanceSettlements",
  "BalanceSettlementItems",
  "BalanceSettlementFinals",
  "BalanceSettlementFinalSources",
  "WriteOffItems",
  "Shipments",
  "DocumentFolders",
  "DocumentFiles",
  "ImportJobs",
  "AppUsers",
  "ModuleFeatures",
];

let sql = readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, "");

sql = sql.replaceAll("`suanli`", `\`${targetDatabase}\``);

for (const tableName of tableNames) {
  const logicalName = tableName.toLowerCase();
  const physicalName = logicalName.startsWith("power_") ? logicalName : `power_${logicalName}`;
  sql = sql.replaceAll(`\`${tableName}\``, `\`${physicalName}\``);
  sql = sql.replaceAll(`\`${logicalName}\``, `\`${physicalName}\``);
}

writeFileSync(outputPath, sql.replace(/^\uFEFF/, ""), "utf8");

console.log(`Generated ${outputPath}`);
