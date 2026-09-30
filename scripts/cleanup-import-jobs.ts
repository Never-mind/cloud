import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeDb, executeRaw, queryRowsRaw } from "../src/lib/db";

loadLocalEnv();

/**
 * 清理导入任务的"预览快照"占用的空间。
 *
 * 导入任务表（merge_power_importjobs）里的 previewJson 是上传文件的逐行解析结果，
 * 单个任务 10MB+，导入结束（已导入 / 预览有错误 / 已取消）之后就不再需要，
 * 但一直留在库里（实测 69 个任务占了 129MB）。
 *
 * 用法：
 *   npm run cleanup:import-jobs                 清理 7 天前结束的任务预览（保留任务记录与统计）
 *   npm run cleanup:import-jobs -- --days=30    自定义天数
 *   npm run cleanup:import-jobs -- --purge      连任务记录一起删（谨慎）
 *   npm run cleanup:import-jobs -- --dry-run    只统计
 *   npm run cleanup:import-jobs -- --optimize   清完顺手 OPTIMIZE TABLE 把磁盘空间还给系统
 *                                               （会短暂锁表，建议低峰期执行）
 */
const STATUS_FINISHED = ["已导入", "预览有错误", "已取消", "导入失败", "已完成"];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const purge = process.argv.includes("--purge");
  const optimize = process.argv.includes("--optimize");
  const days = Number(process.argv.find((value) => value.startsWith("--days="))?.split("=")[1] ?? 7);
  const keepDays = Number.isFinite(days) && days >= 0 ? days : 7;

  const placeholders = STATUS_FINISHED.map((_, index) => `:status${index}`).join(", ");
  const values = Object.fromEntries(STATUS_FINISHED.map((status, index) => [`status${index}`, status]));

  const [stats] = await queryRowsRaw<{ rowsCount: number; previewMb: number | string }>(
    `SELECT COUNT(*) AS rowsCount, ROUND(SUM(LENGTH(COALESCE(previewJson, ''))) / 1024 / 1024, 1) AS previewMb
       FROM merge_power_importjobs
      WHERE status IN (${placeholders}) AND createdAt < DATE_SUB(NOW(), INTERVAL :keepDays DAY)`,
    { ...values, keepDays },
  );
  console.log(`可清理的已结束任务：${stats?.rowsCount ?? 0} 个，预览占用 ${stats?.previewMb ?? 0} MB（保留最近 ${keepDays} 天）`);
  if (dryRun) return console.log("（dry-run，未执行）");

  if (purge) {
    const result = await executeRaw(
      `DELETE FROM merge_power_importjobs WHERE status IN (${placeholders}) AND createdAt < DATE_SUB(NOW(), INTERVAL :keepDays DAY)`,
      { ...values, keepDays },
    );
    console.log(`已删除 ${(result as { affectedRows?: number }).affectedRows ?? 0} 条历史导入任务记录`);
    return;
  }

  const result = await executeRaw(
    `UPDATE merge_power_importjobs SET previewJson = NULL
      WHERE status IN (${placeholders}) AND createdAt < DATE_SUB(NOW(), INTERVAL :keepDays DAY)
        AND previewJson IS NOT NULL`,
    { ...values, keepDays },
  );
  console.log(`已清空 ${(result as { affectedRows?: number }).affectedRows ?? 0} 条任务的预览快照（任务记录与统计保留）`);
  if (optimize) {
    // InnoDB 清空大字段后文件不会自动缩小，OPTIMIZE 重建表把空间还给系统
    await executeRaw("OPTIMIZE TABLE merge_power_importjobs");
    console.log("已执行 OPTIMIZE TABLE merge_power_importjobs（回收磁盘空间）");
  }
}

main()
  .catch((error) => {
    console.error("清理导入任务失败", error);
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
