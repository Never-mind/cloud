import {loadEnvConfig} from "@next/env";
import {mkdir,writeFile} from "node:fs/promises";
loadEnvConfig(process.cwd());
async function main() {
  const {queryRowsRaw,executeRaw,closeDb}=await import("../src/lib/db");
  try {
    const statements:string[]=[];
    const schemas:Record<string,unknown>={};
    for(const table of ["merge_common_invoices","merge_common_feishu_approvals"]) {
      schemas[table]=await queryRowsRaw(`SHOW CREATE TABLE ${table}`);
      const columns=await queryRowsRaw("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table AND COLUMN_NAME='allocationPlanJson'",{table});
      if(!columns.length)statements.push(`ALTER TABLE ${table} ADD COLUMN allocationPlanJson LONGTEXT NULL COMMENT '多账期开票分摊与票面展示快照'`);
    }
    const [idsColumn]=await queryRowsRaw("SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='merge_common_feishu_approvals' AND COLUMN_NAME='allocationSourceIds'");
    if(idsColumn?.DATA_TYPE!=="text")statements.push("ALTER TABLE merge_common_feishu_approvals MODIFY COLUMN allocationSourceIds TEXT NULL COMMENT '合并账期来源ID'");
    const indexes=await queryRowsRaw("SHOW INDEX FROM merge_common_invoices");
    if(!indexes.some(row=>row.Key_name==='uk_invoice_unit_no')) statements.push("ALTER TABLE merge_common_invoices ADD UNIQUE KEY uk_invoice_unit_no (undertakingUnitId,invoiceNo)");
    if(indexes.some(row=>row.Key_name==='uk_invoice_no'))statements.push("ALTER TABLE merge_common_invoices DROP INDEX uk_invoice_no");
    if(!process.argv.includes("--apply")){console.log(JSON.stringify({mode:"plan",statements},null,2));return;}
    await mkdir("tmp/invoice-allocation-schema",{recursive:true});
    const backup=`tmp/invoice-allocation-schema/before-${Date.now()}.json`;
    await writeFile(backup,JSON.stringify(schemas,null,2),{flag:"wx"});
    for(const statement of statements)await executeRaw(statement);
    console.log(JSON.stringify({mode:"applied",statements:statements.length,schemaBackup:backup,businessRowsModified:0}));
  } finally {await closeDb();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Migration failed");process.exitCode=1;});
