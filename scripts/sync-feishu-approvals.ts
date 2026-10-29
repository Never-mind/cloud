/**
 * 飞书开票审批状态同步（轮询兜底）。
 *
 *   npm run feishu:approval-sync            同步一批（默认 50 条）
 *   npm run feishu:approval-sync -- --limit 200
 *   npm run feishu:approval-sync -- --check <instance_code>   只查单条，看飞书侧状态
 *
 * 同步审批状态，取回财务回票原件；正常回票自动登记并回填账期。
 * 已通过但未完成登记的审批继续检查附件；正常登记后退出队列。
 * 常驻服务已内置轮询；非长驻部署可另配定时任务运行本命令。
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeDb } from "../src/lib/db";
import { fetchInvoiceApprovalInstance } from "../src/lib/feishu-approval-service";
import { syncInvoiceApprovalBatch } from "../src/lib/invoice-approval-sync-batch";

// 定时任务在裸 node 环境跑，必须自己加载 .env.local，否则拿不到飞书应用凭证
loadLocalEnv();

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "") : "";
}

async function main() {
  const checkCode = argValue("--check");
  if (checkCode) {
    console.log(JSON.stringify(await fetchInvoiceApprovalInstance(checkCode), null, 2));
    return;
  }
  const limit = Number(argValue("--limit") || 50) || 50;
  const result = await syncInvoiceApprovalBatch(limit);
  if (result.skipped) { console.log("另一实例正在同步，本轮跳过"); return; }
  console.log(`检查 ${result.checked} 条，审批状态变化 ${result.updated} 条；正常回票已自动登记，异常请查看审批与回票`);
  for (const error of result.errors) console.log(`  ✘ ${error.instanceCode}：${error.error}`);
  if (!result.errors.length) console.log("  没有失败项");
}

main()
  .catch((error) => {
    console.error("同步失败：", error instanceof Error ? error.message : error);
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
