import mysql from "mysql2/promise";
import type { QueryResult } from "mysql2";

type DbGlobal = typeof globalThis & {
  __suanliDbPool?: mysql.Pool | null;
};

const dbGlobal = globalThis as DbGlobal;

export function buildDbConfig(env: NodeJS.ProcessEnv) {
  return {
    host: env.DB_HOST ?? "localhost",
    port: Number(env.DB_PORT ?? 3306),
    user: env.DB_USER ?? "root",
    password: env.DB_PASSWORD ?? "root",
    database: env.DB_NAME ?? "suanli",
    connectionLimit: Number(env.DB_CONNECTION_LIMIT ?? 5),
    maxIdle: Number(env.DB_CONNECTION_LIMIT ?? 5),
    idleTimeout: 60_000,
    namedPlaceholders: true,
  };
}

export function getDb() {
  if (!dbGlobal.__suanliDbPool) {
    dbGlobal.__suanliDbPool = mysql.createPool(buildDbConfig(process.env));
  }

  return dbGlobal.__suanliDbPool;
}

export type Row = Record<string, unknown>;

export async function closeDb() {
  if (dbGlobal.__suanliDbPool) {
    await dbGlobal.__suanliDbPool.end();
    dbGlobal.__suanliDbPool = null;
  }
}

export async function queryRows<T extends Row>(sql: string, params: Row = {}): Promise<T[]> {
  const [rows] = await getDb().query<QueryResult>(sql, params as any);
  return rows as T[];
}

export async function execute(sql: string, params: Row = {}) {
  const [result] = await getDb().execute(sql, params as any);
  return result;
}
