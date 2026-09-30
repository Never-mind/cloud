import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { obsDeleteObject, obsListObjects, obsPutObject } from "../src/lib/obs-client";
import { isObsEnabled, resolveObsConfig } from "../src/lib/obs-config";

loadLocalEnv();

/**
 * OBS 连通性与权限自检：列目录（读）、上传（写）、删除。
 * 部署后用这个脚本确认"密钥有读写权限、目录前缀正确"。
 * 用法：npm run obs:check
 */
async function main() {
  const config = resolveObsConfig();
  console.log(`OBS 开关：${isObsEnabled() ? "已启用" : "未启用（缺少 OBS_ACCESS_KEY_ID / OBS_SECRET_ACCESS_KEY，或显式 OBS_ENABLED=0）"}`);
  if (!config) {
    console.log("未启用时所有上传会回落到「文件存数据库」，系统功能不受影响。");
    return;
  }
  console.log(`配置：${config.endpoint} / ${config.bucket} / 前缀 ${config.prefix}/`);

  let failures = 0;
  try {
    const listed = await obsListObjects({ prefix: `${config.prefix}/`, delimiter: "/", maxKeys: 20 });
    console.log(`✔ 列目录：子目录 ${listed.folders.length} 个、文件 ${listed.objects.length} 个`);
    for (const folder of listed.folders.slice(0, 10)) console.log(`   - ${folder.prefix}`);
  } catch (error) {
    failures += 1;
    console.error(`✘ 列目录失败：${error instanceof Error ? error.message : error}`);
  }

  const probeKey = `${config.prefix}/.selfcheck-${Date.now()}.txt`;
  const content = Buffer.from(`obs selfcheck ${new Date().toISOString()}\n`);
  try {
    await obsPutObject(probeKey, content, "text/plain");
    console.log(`✔ 上传：${probeKey}`);
  } catch (error) {
    failures += 1;
    console.error(`✘ 上传失败：${error instanceof Error ? error.message : error}`);
    console.error("   需要给该 Access Key 的账号授权：obs:object:PutObject（写）、obs:object:DeleteObject（删），资源范围建议只给 <bucket>/<prefix>/*");
  }

  if (failures === 0) {
    try {
      await obsDeleteObject(probeKey);
      console.log(`✔ 删除：${probeKey}（自检对象已清理）`);
    } catch (error) {
      failures += 1;
      console.error(`✘ 删除失败：${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(failures === 0 ? "\nOBS 自检通过，可以打开 OBS_ENABLED=1。" : "\nOBS 自检未通过，先修权限；系统此时仍走「文件存数据库」。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
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
