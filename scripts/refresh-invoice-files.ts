import { closeDb, queryRowsRaw } from "../src/lib/db";
import { regenerateInvoiceFile } from "../src/lib/invoice-service";

/**
 * 批量重出票面。
 *
 * 用途：补了承接单位的银行账户 / 注册地址 / 签章图，或者客户抬头地址改了以后，
 * 把**已经开出去**的票面按当前档案重新渲染一遍（票号与快照文本不变），
 * 同时把来源单据上挂着的那份附件一起刷新。
 *
 * 用法：
 *   npm run invoices:refresh              # 所有未作废的系统生成票
 *   npm run invoices:refresh -- INV-2026  # 只处理票号包含该串的
 *   npm run invoices:refresh -- --dry-run # 只列出将要处理的票
 */
type InvoiceRow = {
  id: string;
  invoiceNo: string;
  source: string;
  status: string;
  sellerName: string | null;
  amountIncludingTax: string | null;
  fileSize: number | null;
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const keyword = args.find((value) => !value.startsWith("--")) ?? "";

async function main() {
  const rows = await queryRowsRaw<InvoiceRow>(
    `SELECT id, invoiceNo, source, status, sellerName, amountIncludingTax, fileSize
       FROM merge_common_invoices
      WHERE source = 'generated' AND status <> 'void' ${keyword ? "AND invoiceNo LIKE :keyword" : ""}
      ORDER BY invoiceNo`,
    keyword ? { keyword: `%${keyword}%` } : {},
  );
  if (!rows.length) {
    console.log("没有需要重出的票面。");
    return;
  }
  console.log(`待处理 ${rows.length} 张票${keyword ? `（票号含 ${keyword}）` : ""}：`);
  for (const row of rows) console.log(`  ${row.invoiceNo} · ${row.sellerName ?? "-"} · ${row.amountIncludingTax ?? "-"}`);
  if (dryRun) {
    console.log("\n（仅预演，未写库。去掉 --dry-run 正式执行。）");
    return;
  }
  let ok = 0;
  for (const row of rows) {
    try {
      const updated = await regenerateInvoiceFile(row.id, { userId: null, name: "批量重出票面" });
      console.log(`✔ ${row.invoiceNo} 已重出（${row.fileSize ?? 0} → ${updated?.fileSize ?? 0} 字节）`);
      ok += 1;
    } catch (error) {
      console.error(`✘ ${row.invoiceNo} 失败：${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(`\n完成：成功 ${ok} / 共 ${rows.length}。`);
}

main()
  .catch((error) => {
    console.error("批量重出票面失败", error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
