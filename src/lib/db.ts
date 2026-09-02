import mysql from "mysql2/promise";
import type { QueryResult } from "mysql2";

type DbGlobal = typeof globalThis & {
  __suanliDbPool?: mysql.Pool | null;
  __suanliDbSchemaColumnCache?: Map<string, boolean>;
};

const dbGlobal = globalThis as DbGlobal;
const DB_COUNT_CACHE_MS = 5_000;
const countQueryCache = new Map<string, { expiresAt: number; rows: QueryResult }>();
const schemaColumnCache = dbGlobal.__suanliDbSchemaColumnCache ?? new Map<string, boolean>();
dbGlobal.__suanliDbSchemaColumnCache = schemaColumnCache;

export const DB_TABLE_PREFIX = "merge_power_";
// internalId is the physical InnoDB primary key introduced by the controlled
// migration. Public UUIDs and business numbers remain the API identity.
export const INTERNAL_ID_COLUMN = "internalId";
export const DB_TABLE_PREFIXES = ["merge_power_", "merge_po_", "merge_cloud_", "merge_common_"] as const;
const LEGACY_DB_TABLE_PREFIXES = ["power_", "po_", "cloud_", "common_"] as const;

export const LOGICAL_TABLE_NAMES = [
  "countries",
  "deliverylocations",
  "deliverycontacts",
  "datacenters",
  "instancemodels",
  "suppliers",
  "undertakingunits",
  "customers",
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
  "internalserviceledgers",
  "monthlyinternalservicefees",
  "internalservicefeeadjustments",
  "internalservicefeesnapshots",
  "internalservicefeesnapshotitems",
  "capexpricingversions",
  "capexpricingitems",
  "balancesettlements",
  "balancesettlementitems",
  "balancesettlementfinals",
  "balancesettlementfinalsources",
  "writeoffitems",
  "shipments",
  "documentfolders",
  "documentfiles",
  "importjobs",
  "appusers",
  "userpreferences",
  "modulefeatures",
  "b6typeconfigs",
  "po_product_masters",
  "po_product_models",
  "po_product_specifications",
] as const;

const LOGICAL_TABLE_SET = new Set<string>(LOGICAL_TABLE_NAMES);
const LEGACY_TABLE_PATTERN = new RegExp(
  `(?<![\\w])(${LEGACY_DB_TABLE_PREFIXES.join("|")})[A-Za-z0-9_]+(?![\\w])`,
  "gi",
);
const tablePattern = new RegExp(
  `(?<!${DB_TABLE_PREFIX})(?<![\\w])(${LOGICAL_TABLE_NAMES.join("|")})(?![\\w])`,
  "gi",
);

export function physicalTableName(tableName: string) {
  const normalizedTableName = tableName.toLowerCase();
  if (DB_TABLE_PREFIXES.some((prefix) => normalizedTableName.startsWith(prefix))) {
    return tableName;
  }
  const legacyPrefix = LEGACY_DB_TABLE_PREFIXES.find((prefix) => normalizedTableName.startsWith(prefix));
  if (legacyPrefix) return `merge_${normalizedTableName}`;
  if (!LOGICAL_TABLE_SET.has(normalizedTableName)) return tableName;
  return `${DB_TABLE_PREFIX}${normalizedTableName}`;
}

export function legacyPhysicalTableName(tableName: string) {
  const normalizedTableName = tableName.toLowerCase();
  if (LEGACY_DB_TABLE_PREFIXES.some((prefix) => normalizedTableName.startsWith(prefix))) {
    return tableName;
  }
  if (!LOGICAL_TABLE_SET.has(normalizedTableName)) return tableName;
  return `power_${normalizedTableName}`;
}

export function rewriteSqlTables(sql: string) {
  return sql
    .replace(LEGACY_TABLE_PATTERN, (tableName) => physicalTableName(tableName))
    .replace(tablePattern, (tableName) => physicalTableName(tableName));
}

export function buildDbConfig(env: Partial<NodeJS.ProcessEnv>) {
  return {
    host: env.DB_HOST ?? "localhost",
    port: Number(env.DB_PORT ?? 3306),
    user: env.DB_USER ?? "root",
    password: env.DB_PASSWORD ?? "root",
    database: env.DB_NAME ?? "merge",
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

export async function hasTableColumn(tableName: string, columnName: string) {
  const physicalName = physicalTableName(tableName);
  const cacheKey = `${buildDbConfig(process.env).database}:${physicalName}:${columnName}`;
  const cached = schemaColumnCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const [rows] = await getDb().query<QueryResult>(
    `SELECT 1 AS present
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :tableName
        AND COLUMN_NAME = :columnName
      LIMIT 1`,
    { tableName: physicalName, columnName } as any,
  );
  const present = Array.isArray(rows) && rows.length > 0;
  schemaColumnCache.set(cacheKey, present);
  return present;
}

export function clearDbMetadataCache() {
  schemaColumnCache.clear();
}

export async function queryRows<T extends Row>(sql: string, params: Row = {}): Promise<T[]> {
  return queryRowsRaw<T>(rewriteSqlTables(sql), params);
}

export async function queryRowsRaw<T extends Row>(sql: string, params: Row = {}): Promise<T[]> {
  const rewrittenSql = rewriteSqlTables(sql);
  const cacheKey = getCountQueryCacheKey(rewrittenSql, params);
  if (cacheKey) {
    const cached = countQueryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.rows as T[];
    if (cached) countQueryCache.delete(cacheKey);
  }
  const [rows] = await getDb().query<QueryResult>(rewrittenSql, params as any);
  if (cacheKey) countQueryCache.set(cacheKey, { expiresAt: Date.now() + DB_COUNT_CACHE_MS, rows });
  return rows as T[];
}

export async function execute(sql: string, params: Row = {}) {
  return executeRaw(rewriteSqlTables(sql), params);
}

export async function executeRaw(sql: string, params: Row = {}) {
  const [result] = await getDb().execute(rewriteSqlTables(sql), params as any);
  countQueryCache.clear();
  return result;
}

export async function withTransaction<T>(callback: (connection: mysql.PoolConnection) => Promise<T>) {
  const connection = await getDb().getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function queryRowsInTransaction<T extends Row>(connection: mysql.PoolConnection, sql: string, params: Row = {}): Promise<T[]> {
  const [rows] = await connection.query<QueryResult>(rewriteSqlTables(sql), params as any);
  return rows as T[];
}

export async function executeInTransaction(connection: mysql.PoolConnection, sql: string, params: Row = {}) {
  const [result] = await connection.execute(rewriteSqlTables(sql), params as any);
  countQueryCache.clear();
  return result;
}

function getCountQueryCacheKey(sql: string, params: Row) {
  if (!/^\s*SELECT\s+COUNT\(\*\)/i.test(sql) || /\bFOR\s+UPDATE\b/i.test(sql)) return null;
  const normalizedParams = Object.keys(params)
    .sort()
    .map((key) => [key, params[key]]);
  return `${sql}\n${JSON.stringify(normalizedParams)}`;
}
