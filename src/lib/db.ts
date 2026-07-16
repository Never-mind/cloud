import mysql from "mysql2/promise";
import type { QueryResult } from "mysql2";

type DbGlobal = typeof globalThis & {
  __suanliDbPool?: mysql.Pool | null;
};

const dbGlobal = globalThis as DbGlobal;

export const DB_TABLE_PREFIX = "power_";

export const LOGICAL_TABLE_NAMES = [
  "countries",
  "deliverylocations",
  "deliverycontacts",
  "datacenters",
  "instancemodels",
  "suppliers",
  "undertakingunits",
  "instancecontracts",
  "contractitems",
  "requests",
  "requestitems",
  "purchaseorders",
  "purchaseorderitems",
  "purchaseordersnitems",
  "purchaseorderplanitems",
  "prepaymentcontracts",
  "prepaymentcontractitems",
  "monthlyprepaymentwriteoffs",
  "prepaymentwriteoffadjustments",
  "prepaymentwriteoffadjustmentitems",
  "billinginstanceledgers",
  "monthlybillingwriteoffs",
  "billingadjustments",
  "billingadjustmentitems",
  "billingstatementsnapshots",
  "billingstatementsnapshotitems",
  "servicefeesnapshots",
  "servicefeesnapshotitems",
  "writeoffitems",
  "shipments",
  "documentfolders",
  "documentfiles",
  "importjobs",
  "appusers",
] as const;

const LOGICAL_TABLE_SET = new Set<string>(LOGICAL_TABLE_NAMES);
const tablePattern = new RegExp(
  `(?<!${DB_TABLE_PREFIX})(?<![\\w])(${LOGICAL_TABLE_NAMES.join("|")})(?![\\w])`,
  "gi",
);

export function physicalTableName(tableName: string) {
  const normalizedTableName = tableName.toLowerCase();
  if (normalizedTableName.startsWith(DB_TABLE_PREFIX) || !LOGICAL_TABLE_SET.has(normalizedTableName)) {
    return tableName;
  }
  return `${DB_TABLE_PREFIX}${normalizedTableName}`;
}

export function rewriteSqlTables(sql: string) {
  return sql.replace(tablePattern, (tableName) => physicalTableName(tableName));
}

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
  return queryRowsRaw<T>(rewriteSqlTables(sql), params);
}

export async function queryRowsRaw<T extends Row>(sql: string, params: Row = {}): Promise<T[]> {
  const [rows] = await getDb().query<QueryResult>(sql, params as any);
  return rows as T[];
}

export async function execute(sql: string, params: Row = {}) {
  return executeRaw(rewriteSqlTables(sql), params);
}

export async function executeRaw(sql: string, params: Row = {}) {
  const [result] = await getDb().execute(sql, params as any);
  return result;
}
