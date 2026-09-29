import fs from "node:fs";
import path from "node:path";
import { closeDb } from "../src/lib/db";
import { runNotificationScan } from "../src/lib/notification-service";

/** 读取 .env.local（仅补齐未设置的环境变量），供计划任务直接调用。 */
function loadEnvFile() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * 扫描并发送到点的消息通知。
 * 计划任务用法：npm run notify:run
 */
async function main() {
  loadEnvFile();
  const dryRun = process.argv.includes("--dry-run");
  const result = await runNotificationScan({ dryRun });
  console.log(
    `消息通知${dryRun ? "（试运行）" : ""}完成：启用规则 ${result.rules} 条，到点单据 ${result.due} 条，` +
    `生成通知 ${result.created} 条，飞书发送成功 ${result.sent} 条，失败 ${result.failed} 条，去重跳过 ${result.skipped} 条`,
  );
  for (const detail of result.details) {
    console.log(`  ${detail.status.padEnd(10)} ${detail.rule} | ${detail.projectNo} | ${detail.recipient}${detail.error ? ` | ${detail.error}` : ""}`);
  }
}

main()
  .catch((error) => {
    console.error("消息通知发送失败", error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
