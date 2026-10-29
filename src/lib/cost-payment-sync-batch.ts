import { createHash } from "node:crypto";
import { createConnection, type RowDataPacket } from "mysql2/promise";
import { buildDbConfig } from "./db";
import { syncCostPaymentApprovals } from "./cost-payment-approval-service";

/** Page refresh and background polling share a lock without occupying the application pool. */
export async function syncCostPaymentBatch(limit = 30) {
  const config = buildDbConfig(process.env);
  const key = "cost-payment-sync:" + createHash("sha256").update(String(config.database)).digest("hex").slice(0, 32);
  const connection = await createConnection({ host: config.host, port: config.port, user: config.user,
    password: config.password, database: config.database, charset: config.charset, connectTimeout: 10_000 });
  let acquired = false;
  try {
    const [rows] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK(?, 0) AS acquired", [key]);
    acquired = Number(rows[0]?.acquired) === 1;
    if (!acquired) return { total: 0, results: [], errors: [], skipped: true };
    // Select due work only after acquiring the shared lock, including across app servers.
    return { ...await syncCostPaymentApprovals(limit, true), skipped: false };
  } finally {
    try { if (acquired) await connection.query("SELECT RELEASE_LOCK(?)", [key]); }
    finally { await connection.end(); }
  }
}
