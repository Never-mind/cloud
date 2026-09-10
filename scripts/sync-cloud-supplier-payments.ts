import { closeDb } from "../src/lib/db";
import { syncAllCloudSupplierPayments, syncCloudSupplierPaymentPeriods } from "../src/lib/cloud-service";

/**
 * 重算华为云供应商付款的应付汇总，用于历史账期回填或映射调整后的修复。
 * 用法：
 *   npm run sync:cloud-supplier-payments            重算全部账期
 *   npm run sync:cloud-supplier-payments -- 202607  只重算指定账期（可传多个）
 */
async function main() {
  const periods = process.argv.slice(2).map((value) => value.trim()).filter(Boolean);
  const result = periods.length ? await syncCloudSupplierPaymentPeriods(periods) : await syncAllCloudSupplierPayments();
  console.log(
    `Cloud supplier payable sync complete: periods=${result.periods.join(",") || "-"} created=${result.created} updated=${result.updated} removed=${result.removed} cleared=${result.cleared}`,
  );
}

main()
  .then(() => closeDb())
  .catch(async (error) => {
    console.error(error);
    await closeDb();
    process.exit(1);
  });
