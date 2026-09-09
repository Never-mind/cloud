import { closeDb, execute } from "../src/lib/db";

const BATCH_SIZE = 2_000;
const configuredDays = Number(process.env.OPERATION_LOG_RETENTION_DAYS ?? 365);
const retentionDays = Number.isFinite(configuredDays) && configuredDays > 0
  ? Math.floor(configuredDays)
  : 365;
const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1_000);

async function main() {
  let deleted = 0;
  while (true) {
    const result = await execute(
      `DELETE FROM merge_common_operation_logs
        WHERE createdAt < :cutoff
        ORDER BY createdAt
        LIMIT ${BATCH_SIZE}`,
      { cutoff },
    ) as { affectedRows?: number };
    const affectedRows = Number(result?.affectedRows ?? 0);
    deleted += affectedRows;
    if (affectedRows < BATCH_SIZE) break;
  }
  console.log(`Operation log cleanup complete: deleted ${deleted} rows older than ${retentionDays} days.`);
}

main()
  .catch((error) => {
    console.error("Operation log cleanup failed", error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
