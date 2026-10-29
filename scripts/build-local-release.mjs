import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const name = process.argv[2];
if (!name || !/^[a-z][a-z0-9-]+$/.test(name)) throw new Error("Provide a release directory name using lowercase letters, numbers and hyphens.");
const release = join(root, "tmp", name);
if (existsSync(release)) throw new Error("Release already exists; inspect before rebuilding.");
mkdirSync(release, { recursive: true });
cpSync(join(root, "src"), join(release, "src"), { recursive: true });
// With src/app, middleware must live in src too. Verify the source and build
// output so isolated releases cannot silently drop the workspace/auth boundary.
if (!existsSync(join(release, "src/middleware.ts"))) throw new Error("Missing src/middleware.ts");
for (const file of ["package.json", "package-lock.json", "tsconfig.json", "next-env.d.ts", "next.config.ts", "postcss.config.mjs"]) {
  copyFileSync(join(root, file), join(release, file));
}
require("@next/env").loadEnvConfig(root, false);
const result = spawnSync(process.execPath, [require.resolve("next/dist/bin/next"), "build", "--webpack"], {
  cwd: release, stdio: "inherit", env: {
    ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
    FEISHU_INVOICE_AUTO_SYNC: "0", FEISHU_PAYMENT_AUTO_SYNC: "0", FRAPPE_DEMAND_AUTO_SYNC: "0",
    DB_HOST: "127.0.0.1", DB_PORT: "1", DB_USER: "isolated_build", DB_PASSWORD: "isolated_build", DB_NAME: "isolated_build",
  },
});
if (result.status !== 0) process.exit(result.status ?? 1);
const manifest = JSON.parse(readFileSync(join(release, ".next/server/middleware-manifest.json"), "utf8"));
if (!manifest.middleware?.["/"]?.files?.length) throw new Error("Refusing release: root middleware was not built.");
console.log("Verified release includes root middleware: " + release);
