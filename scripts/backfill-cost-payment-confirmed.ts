import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeDb } from "../src/lib/db";
import { backfillCostPaymentConfirmedAt, syncCostPaymentApprovals } from "../src/lib/cost-payment-approval-service";

loadLocalEnv();

async function main() {
  const sync = await syncCostPaymentApprovals(100);
  const backfill = await backfillCostPaymentConfirmedAt(100);
  console.log(JSON.stringify({ sync, backfill }, null, 2));
}

main()
  .catch((error) => {
    console.error("回填失败：", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

function loadLocalEnv() {
  const filePath = resolve(process.cwd(), ".env.local");
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
