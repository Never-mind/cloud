import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import { closeDb, execute, physicalTableName, queryRows, queryRowsRaw } from '../src/lib/db';

loadEnvConfig(process.cwd());
async function main() {
  const apply = process.argv.includes('--apply');
  const [identity] = await queryRows('SELECT DATABASE() AS databaseName');
  console.log({host:process.env.DB_HOST ?? 'localhost',...identity,apply});
  const sql = await readFile(resolve('scripts/internal-service-fee-jc.sql'),'utf8');
  for (const statement of sql.split(';').filter((part) => part.trim())) {
    console.log(`${apply?'APPLY':'PLAN'}: ${statement.trim()}`);
    if (apply) await execute(statement);
  }
  const columns = [
    ['merge_power_internalservicejccomponents','reportingCurrency',"VARCHAR(16) NULL COMMENT 'reporting currency'"],
    ['merge_power_internalservicejccomponents','exchangeRate',"DECIMAL(18,10) NULL COMMENT 'source currency units per reporting currency'"],
    ['merge_power_internalservicejccomponents','ruleTotalReporting',"DECIMAL(18,2) NULL COMMENT 'rule total in reporting currency'"],
    ['merge_power_internalservicejccomponents','approvedTotalReporting',"DECIMAL(18,2) NULL COMMENT 'approved total in reporting currency'"],
    ['merge_power_internalservicejccomponents','fixedAdjustmentReporting',"DECIMAL(18,2) NULL COMMENT 'fixed adjustment in reporting currency'"],
    ['merge_power_internalservicejcmonths','reportingAmount',"DECIMAL(18,2) NULL COMMENT 'JC amount in reporting currency'"],
  ] as const;
  for (const [table,column,definition] of columns) {
    const [existing] = await queryRowsRaw<{count:number}>(
      "SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table AND COLUMN_NAME=:column",
      {table:physicalTableName(table),column},
    );
    if (Number(existing?.count ?? 0) > 0) continue;
    console.log(`${apply?'ALTER':'PLAN '} ${table}.${column}`);
    if (apply) await execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}
main().catch(error => {console.error(error instanceof Error ? error.message : '迁移失败');process.exitCode=1;}).finally(closeDb);
