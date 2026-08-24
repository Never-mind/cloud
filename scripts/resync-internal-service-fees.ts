import { closeDb } from "../src/lib/db";
import { syncInternalServiceLedgers } from "../src/lib/internal-service-fee-service";

async function main() {
  const result = await syncInternalServiceLedgers();
  console.log(`Internal service fee ledgers synchronized: ${result.count}`);
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
