import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const sourcePath = resolve(root, "schema.sql");
const outputPath = resolve(root, "cloud_power_schema.sql");

const tableNames = [
  "Countries",
  "DeliveryLocations",
  "DeliveryContacts",
  "Datacenters",
  "InstanceModels",
  "Suppliers",
  "InstanceContracts",
  "ContractItems",
  "Requests",
  "RequestItems",
  "PurchaseOrders",
  "PurchaseOrderItems",
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
  "WriteOffItems",
  "Shipments",
  "DocumentFolders",
  "DocumentFiles",
  "ImportJobs",
  "AppUsers",
];

let sql = readFileSync(sourcePath, "utf8");

sql = sql.replaceAll("`suanli`", "`cloud_power`");

for (const tableName of tableNames) {
  sql = sql.replaceAll(`\`${tableName}\``, `\`${tableName.toLowerCase()}\``);
}

writeFileSync(outputPath, sql, "utf8");

console.log(`Generated ${outputPath}`);
