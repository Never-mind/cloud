import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { parseEnv } from "node:util";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";

// 默认只生成计划；--apply 必须指定之前生成的备份目录。
async function main() {
  const mode = process.argv[2] || "--plan";
  assert(["--plan", "--apply", "--verify"].includes(mode), "Use --plan, --apply or --verify");
  assert(mode === "--plan" || process.argv[3], "Apply/verify requires an existing plan directory");
  const directory = path.resolve(process.argv[3] || `backup/service-fee-finance-status-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  const save = (name: string, value: unknown) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2) + "\n");
  const configPath = fs.existsSync(".env.local") ? ".env.local" : ".env";
  const env = { ...process.env, ...parseEnv(fs.readFileSync(configPath, "utf8")) };
  assert(env.DB_HOST && env.DB_USER && env.DB_NAME, "Database settings missing");
  const db = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, dateStrings: true, charset: "utf8mb4", connectTimeout: 15000 });
  let committed = false;
  try {
    await db.query(mode === "--apply" ? "START TRANSACTION" : "START TRANSACTION READ ONLY");
    const [[identity]] = await db.query<RowDataPacket[]>("SELECT DATABASE() AS databaseName, @@server_uuid AS serverUuid");
    if (mode === "--plan") {
      assert(!fs.existsSync(path.join(directory, "plan.json")), "Plan already exists; choose a new directory");
      const [schema] = await db.query<RowDataPacket[]>("SHOW COLUMNS FROM merge_power_servicefeesnapshots");
      for (const key of ["invoiceStatus", "repaymentStatus"]) assert(/^varchar\(/i.test(schema.find(r => r.Field === key)?.Type), `${key} must be VARCHAR`);
      const [rows] = await db.query<RowDataPacket[]>("SELECT * FROM merge_power_servicefeesnapshots WHERE ABS(serviceFeeTotal)<1 AND (invoiceStatus <> '无需开票' OR repaymentStatus <> '无需回款') ORDER BY snapshotNo");
      await db.rollback();
      fs.mkdirSync(directory, { recursive: true });
      save("before.json", { identity, schema, rows });
      const plan = { identity, createdAt: new Date().toISOString(), scope: "仅更新含税服务费绝对值小于1的开票/回款状态，不改变金额、日期、票号、流水及关联记录", rows: rows.map(r => ({ snapshotNo: r.snapshotNo, serviceFeeTotal: r.serviceFeeTotal, beforeInvoiceStatus: r.invoiceStatus, beforeRepaymentStatus: r.repaymentStatus, invoiceStatus: "无需开票", repaymentStatus: "无需回款" })) };
      save("plan.json", plan);console.log(JSON.stringify({ mode, directory, identity, count: rows.length, rows: plan.rows }, null, 2));return;
    }
    const before = JSON.parse(fs.readFileSync(path.join(directory, "before.json"), "utf8"));
    const plan = JSON.parse(fs.readFileSync(path.join(directory, "plan.json"), "utf8"));
    assert.deepEqual(identity, before.identity, "Database identity changed");assert.deepEqual(identity, plan.identity);
    const ids = plan.rows.map((r: RowDataPacket) => r.snapshotNo);
    assert.deepEqual(ids, before.rows.map((r: RowDataPacket) => r.snapshotNo));
    assert(ids.length > 0, "No updates required");
    const readRows = async (lock = false) => (await db.query<RowDataPacket[]>(`SELECT * FROM merge_power_servicefeesnapshots WHERE snapshotNo IN (?) ORDER BY snapshotNo${lock ? " FOR UPDATE" : ""}`, [ids]))[0];
    const verify = (rows: RowDataPacket[]) => {
      assert.equal(rows.length, before.rows.length);
      for (let i = 0; i < rows.length; i++) {
        const { updatedAt: _old, ...original } = before.rows[i];
        const { updatedAt: _new, ...current } = rows[i];
        assert.deepEqual(current, { ...original, invoiceStatus: "无需开票", repaymentStatus: "无需回款" });
      }
    };
    if (mode === "--verify") {
      const rows = await readRows();verify(rows);await db.rollback();save("verified.json", { identity, verifiedAt: new Date().toISOString(), rows });console.log(JSON.stringify({ verified: true, count: rows.length, directory }));return;
    }
    assert(!fs.existsSync(path.join(directory, "applied.json")), "Already applied; use --verify");
    const rows = await readRows(true);assert.deepEqual(rows, before.rows, "Records changed since plan; regenerate plan");
    save("transaction-before.json", { identity, capturedAt: new Date().toISOString(), rows, plan });
    for (const row of rows) {
      const [result] = await db.execute<mysql.ResultSetHeader>("UPDATE merge_power_servicefeesnapshots SET invoiceStatus='无需开票', repaymentStatus='无需回款', updatedAt=CURRENT_TIMESTAMP WHERE snapshotNo=? AND ABS(serviceFeeTotal)<1 AND invoiceStatus <=> ? AND repaymentStatus <=> ?", [row.snapshotNo, row.invoiceStatus, row.repaymentStatus]);
      assert.equal(result.affectedRows, 1);
    }
    const after = await readRows();verify(after);await db.commit();committed = true;
    save("applied.json", { identity, committedAt: new Date().toISOString(), rows: after });console.log(JSON.stringify({ committed: true, count: after.length, directory }));
  } catch (error) {
    if (!committed) await db.rollback();else console.error("Committed; verify before retrying.");throw error;
  } finally { await db.end(); }
}
main().catch(error => { console.error(error.message);process.exitCode = 1; });
