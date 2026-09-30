import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeDb, executeRaw, queryRowsRaw, type Row } from "../src/lib/db";
import {
  resolveCloudAttachmentContext,
  resolveCommonAttachmentContext,
  resolveDocumentContext,
  resolveSettlementContext,
  storeFile,
} from "../src/lib/file-storage-service";
import { isObsEnabled } from "../src/lib/obs-config";

loadLocalEnv();

/**
 * 把历史附件从数据库搬到 OBS。
 *
 * 用法：
 *   npm run storage:migrate-obs               只处理 storageProvider='db' 的行
 *   npm run storage:migrate-obs -- --dry-run  只统计，不上传
 *   npm run storage:migrate-obs -- --table=merge_po_settlement_attachments
 *   npm run storage:migrate-obs -- --purge-db-copy   上传成功后清空 dataUrl（默认保留兜底）
 *
 * 库里原内容默认保留；确认无误后再跑 --purge-db-copy 释放空间。
 */
type TablePlan = {
  table: string;
  idColumn: string;
  context: (row: Row) => Promise<Parameters<typeof storeFile>[0]["context"]>;
  isInvoice?: (row: Row) => boolean;
};

const PLANS: TablePlan[] = [
  {
    table: "merge_common_attachments",
    idColumn: "attachmentId",
    context: (row) => resolveCommonAttachmentContext(String(row.ownerType ?? ""), String(row.ownerId ?? "")),
  },
  {
    table: "merge_cloud_attachments",
    idColumn: "id",
    context: (row) => resolveCloudAttachmentContext(String(row.ownerType ?? ""), String(row.ownerId ?? "")),
    isInvoice: (row) => ["invoice", "crm_invoice", "supplier_payment"].includes(String(row.ownerType ?? "")) || /发票|invoice/i.test(String(row.fileName ?? "")),
  },
  {
    table: "merge_po_settlement_attachments",
    idColumn: "id",
    context: (row) => resolveSettlementContext(String(row.projectId ?? "")),
    isInvoice: (row) => Boolean(row.invoiceId) || /发票|invoice/i.test(String(row.fileName ?? "")),
  },
  {
    table: "merge_common_document_files",
    idColumn: "fileId",
    context: (row) => resolveDocumentContext(String(row.folderId ?? "")),
    isInvoice: (row) => /发票|invoice/i.test(String(row.fileName ?? "")),
  },
];

async function migrateTable(plan: TablePlan, options: { dryRun: boolean; purgeDbCopy: boolean }) {
  const rows = await queryRowsRaw<Row>(
    `SELECT * FROM \`${plan.table}\` WHERE dataUrl IS NOT NULL AND dataUrl <> ''
       AND (storageKey IS NULL OR storageKey = '')`,
  );
  console.log(`\n== ${plan.table}：待迁移 ${rows.length} 条`);
  let uploaded = 0;
  let skipped = 0;
  for (const row of rows) {
    const dataUrl = String(row.dataUrl ?? "");
    const match = dataUrl.match(/^data:([^;,]+)?;base64,([\s\S]*)$/);
    const bytes = match ? Buffer.from(match[2], "base64") : Buffer.from(dataUrl, "utf8");
    const name = String(row.fileName ?? `${plan.idColumn}.bin`);
    if (options.dryRun) {
      console.log(`  [dry-run] ${name}（${(bytes.length / 1024).toFixed(0)} KB）`);
      uploaded += 1;
      continue;
    }
    try {
      const stored = await storeFile({
        context: await plan.context(row),
        attachmentId: String(row[plan.idColumn] ?? ""),
        fileName: name,
        fileType: String(row.fileType ?? "application/octet-stream"),
        bytes,
        isInvoice: plan.isInvoice?.(row) ?? false,
      });
      if (stored.provider !== "obs" || !stored.storageKey) { skipped += 1; continue; }
      await executeRaw(
        `UPDATE \`${plan.table}\` SET storageProvider = 'obs', storageKey = :storageKey, fileName = :fileName
           ${options.purgeDbCopy ? ", dataUrl = ''" : ""}
         WHERE ${plan.idColumn} = :id`,
        { storageKey: stored.storageKey, fileName: stored.fileName, id: String(row[plan.idColumn] ?? "") },
      );
      uploaded += 1;
      console.log(`  ✔ ${name} → ${stored.storageKey}`);
    } catch (error) {
      skipped += 1;
      console.error(`  ✘ ${name}：${error instanceof Error ? error.message : error}`);
    }
  }
  return { uploaded, skipped };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const purgeDbCopy = process.argv.includes("--purge-db-copy");
  const tableFilter = process.argv.find((value) => value.startsWith("--table="))?.split("=")[1];
  if (!isObsEnabled()) throw new Error("OBS 未启用：请先在 .env.local 配置 OBS_ACCESS_KEY_ID / OBS_SECRET_ACCESS_KEY");
  const plans = tableFilter ? PLANS.filter((plan) => plan.table === tableFilter) : PLANS;
  if (!plans.length) throw new Error(`未知表：${tableFilter}`);
  console.log(`迁移开始${dryRun ? "（dry-run）" : ""}${purgeDbCopy ? "（上传成功后清空数据库副本）" : ""}`);
  let uploaded = 0;
  let skipped = 0;
  for (const plan of plans) {
    const result = await migrateTable(plan, { dryRun, purgeDbCopy });
    uploaded += result.uploaded;
    skipped += result.skipped;
  }
  console.log(`\n完成：迁移 ${uploaded} 条，跳过/失败 ${skipped} 条`);
}

main()
  .catch((error) => {
    console.error(error);
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
