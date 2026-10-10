/**
 * 飞书开票审批状态同步（轮询兜底）。
 *
 *   npm run feishu:approval-sync            同步一批（默认 50 条）
 *   npm run feishu:approval-sync -- --limit 200
 *   npm run feishu:approval-sync -- --check <instance_code>   只查单条，看飞书侧状态
 *
 * 做两件事：把审批中的状态拉回来、审批通过但还没出票的补出票。
 * 幂等：按 instance_code 记台账，出过票的不会再出。
 * 部署后建议挂成定时任务（每 1~5 分钟一次）。
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeDb } from "../src/lib/db";
import { fetchInvoiceApprovalInstance, syncPendingInvoiceApprovals } from "../src/lib/feishu-approval-service";

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
  const result = await syncPendingInvoiceApprovals(limit);
  console.log(`检查 ${result.checked} 条，状态/出票更新 ${result.updated} 条`);
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
