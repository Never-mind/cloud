import { createHash } from "node:crypto";
import { createConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { buildDbConfig } from "./db";
import { syncPendingInvoiceApprovals } from "./feishu-approval-service";

/** Separate lock connection leaves the application pool available, even with pool size 1. */
export async function syncInvoiceApprovalBatch(limit = 20) {
  const config = buildDbConfig(process.env);
  const key = "invoice-return-sync:" + createHash("sha256").update(String(config.database)).digest("hex").slice(0, 32);
  const connection = await createConnection({ host: config.host, port: config.port, user: config.user,
    password: config.password, database: config.database, charset: config.charset, connectTimeout: 10_000 });
  let acquired = false;
  try {
    const [rows] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK(?, 0) AS acquired", [key]);
    acquired = Number(rows[0]?.acquired) === 1;
    if (!acquired) return { checked: 0, updated: 0, errors: [], skipped: true };
    // Query under the shared lock: two app servers connected to one DB do not repeat the batch.
    return { ...await syncPendingInvoiceApprovals(limit, true), skipped: false };
  } finally {
    try { if (acquired) await connection.query("SELECT RELEASE_LOCK(?)", [key]); }
    finally { await connection.end(); }
  }
}
