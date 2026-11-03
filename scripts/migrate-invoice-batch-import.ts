import { loadEnvConfig } from "@next/env";
import { mkdir,writeFile } from "node:fs/promises";
loadEnvConfig(process.cwd());
export const batchImportSchema=[
`CREATE TABLE IF NOT EXISTS merge_common_invoice_import_batches (
 id VARCHAR(64) NOT NULL PRIMARY KEY, fileName VARCHAR(255) NOT NULL, fileHash VARCHAR(64) NOT NULL,
 createdBy VARCHAR(255) NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_invoice_batch_owner (createdBy,createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
`CREATE TABLE IF NOT EXISTS merge_common_invoice_import_rows (
 id VARCHAR(64) NOT NULL PRIMARY KEY, batchId VARCHAR(64) NOT NULL, rowNo INT NOT NULL,
 rowKey VARCHAR(128) NOT NULL, inputHash VARCHAR(64) NOT NULL, rawJson LONGTEXT NOT NULL, previewJson LONGTEXT NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'ready', invoiceId VARCHAR(64) NULL, message TEXT NULL, version INT NOT NULL DEFAULT 1,
 createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uk_invoice_batch_row (batchId,rowNo), KEY idx_invoice_import_key (rowKey), KEY idx_invoice_import_invoice (invoiceId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`];
async function main(){
 const db=await import("../src/lib/db");
 try{
  await db.queryRowsRaw("SELECT importBatchId,importRowKey FROM merge_common_invoices LIMIT 0");
  const [identity]=await db.queryRowsRaw("SELECT DATABASE() AS databaseName");
  if(!process.argv.includes('--apply')){console.log(JSON.stringify({mode:'plan',...identity,statements:batchImportSchema},null,2));return;}
  const backup:Record<string,unknown>={};
  for(const table of ['merge_common_invoice_import_batches','merge_common_invoice_import_rows']) {
   const rows=await db.queryRowsRaw("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table",{table});
   backup[table]=rows.length?await db.queryRowsRaw(`SHOW CREATE TABLE ${table}`):null;
  }
  await mkdir('tmp/invoice-batch-import',{recursive:true});
  const path=`tmp/invoice-batch-import/schema-before-${Date.now()}.json`;
  await writeFile(path,JSON.stringify(backup,null,2),{flag:'wx'});
  for(const sql of batchImportSchema) await db.executeRaw(sql);
  console.log(JSON.stringify({mode:'applied',...identity,statements:batchImportSchema.length,backup:path}));
 }finally{await db.closeDb();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
