import { loadEnvConfig } from "@next/env";
import { closeDb, queryRows } from "../src/lib/db";

loadEnvConfig(process.cwd());

async function main() {
  const [summary] = await queryRows<Record<string, unknown>>(`
    SELECT
      (SELECT COUNT(*) FROM internalserviceledgers WHERE ledgerType='spare') AS spareLedgers,
      (SELECT COUNT(*) FROM internalserviceledgers WHERE ledgerType='spare' AND spareBusinessKey IS NULL) AS missingBusinessKeys,
      (SELECT COUNT(*) FROM internalserviceledgers WHERE ledgerType='spare' AND spareFirst24MonthlyAmount IS NULL) AS missingFirst24Amounts,
      (SELECT COUNT(*) FROM internalserviceledgers WHERE ledgerType='spare' AND spareNext36MonthlyAmount IS NULL) AS missingNext36Amounts,
      (SELECT COUNT(*) FROM monthlyinternalservicefees WHERE sourceType='spare') AS spareMonthlyRows,
      (SELECT COUNT(*) FROM internalserviceledgers WHERE ledgerType='spare' AND status='附件导入') AS oldSpareStatuses,
      (SELECT COUNT(*) FROM internalservicespareaudits) AS auditRows,
      (SELECT COUNT(*) FROM internalserviceledgers ledger
         LEFT JOIN (
           SELECT ledgerId,COUNT(*) AS monthCount
           FROM monthlyinternalservicefees
           WHERE sourceType='spare'
           GROUP BY ledgerId
         ) months ON months.ledgerId=ledger.ledgerId
         WHERE ledger.ledgerType='spare' AND COALESCE(months.monthCount,0)<>60
      ) AS spareLedgersWithout60Months
  `);
  const normalized = Object.fromEntries(Object.entries(summary ?? {}).map(([key, value]) => [key, Number(value ?? 0)]));
  console.log(JSON.stringify(normalized, null, 2));
  if (
    normalized.missingBusinessKeys
    || normalized.missingFirst24Amounts
    || normalized.missingNext36Amounts
    || normalized.oldSpareStatuses
    || normalized.spareLedgersWithout60Months
  ) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "备件管理费验证失败");
    process.exitCode = 1;
  })
  .finally(closeDb);
