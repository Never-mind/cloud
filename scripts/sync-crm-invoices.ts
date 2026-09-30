import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeDb } from "../src/lib/db";
import { syncCrmInvoices } from "../src/lib/crm-invoice-sync-service";

loadLocalEnv();

/**
 * CRM 发票 / 回款同步（定时任务与手工补数共用）。
 * 用法：
 *   npm run sync:crm-invoices                 同步最近 3 个月（CRM_SYNC_MONTHS 可配）
 *   npm run sync:crm-invoices -- 2026-09      只同步指定账期（可传多个）
 *   npm run sync:crm-invoices -- 2026-09 --dry-run   只统计不写库
 */
async function main() {
  const args = process.argv.slice(2).map((value) => value.trim()).filter(Boolean);
  const dryRun = args.includes("--dry-run");
  const months = args.filter((value) => !value.startsWith("--"));
  const summary = await syncCrmInvoices({ months, triggerType: "script", dryRun });
  console.log(
    `CRM sync ${summary.status}${dryRun ? " (dry-run)" : ""}: months=${summary.months.join(",")} `
    + `invoices=${summary.invoiceFetched}(+${summary.invoiceCreated}/~${summary.invoiceUpdated}/void ${summary.invoiceVoided}) `
    + `receipts=${summary.receiptFetched}(+${summary.receiptCreated}/~${summary.receiptUpdated}) `
    + `backfilled=${summary.backfilled} mismatch=${summary.mismatch} unmatched=${summary.unmatched} `
    + `attachments=${summary.attachmentDownloaded}(failed ${summary.attachmentFailed})`,
  );
  for (const error of summary.errors) console.error(`[${error.scope}] ${error.message}`);
  if (summary.status !== "success") process.exitCode = 1;
}

main()
  .then(() => closeDb())
  .catch(async (error) => {
    console.error(error);
    await closeDb();
    process.exit(1);
  });

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
