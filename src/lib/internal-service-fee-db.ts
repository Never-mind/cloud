import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { getDb, queryRows, execute, queryRowsInTransaction, executeInTransaction, type Row } from './db';

const scope = new AsyncLocalStorage<PoolConnection>();
export function feeQuery<T extends Row>(sql: string, params: Row = {}) {
  const connection = scope.getStore();
  return connection ? queryRowsInTransaction<T>(connection, sql, params) : queryRows<T>(sql, params);
}
export function feeExecute(sql: string, params: Row = {}) {
  const connection = scope.getStore();
  return connection ? executeInTransaction(connection, sql, params) : execute(sql, params);
}

// All management fee writes, archiving and linked contract mutations share one
// database-scoped mutex. Nested regeneration uses the same transaction.
export async function withInternalFeeTransaction<T>(work: () => Promise<T>): Promise<T> {
  if (scope.getStore()) return work();
  const connection = await getDb().getConnection();
  let lockKey = '';
  let acquired = false;
  try {
    const [identity] = await queryRowsInTransaction<Row>(connection, 'SELECT DATABASE() AS db');
    lockKey = `internal-fee:${createHash('sha256').update(String(identity.db)).digest('hex').slice(0, 40)}`;
    const [lock] = await queryRowsInTransaction<Row>(connection, 'SELECT GET_LOCK(:key, 10) AS acquired', {key: lockKey});
    acquired = Number(lock.acquired) === 1;
    if (!acquired) throw new Error('管理费正在更新，请稍后重试');
    await connection.beginTransaction();
    try {
      const result = await scope.run(connection, work);
      await connection.commit();
      return result;
    } catch (error) { await connection.rollback(); throw error; }
  } finally {
    try { if (acquired) await queryRowsInTransaction(connection, 'SELECT RELEASE_LOCK(:key)', {key: lockKey}); }
    finally { connection.release(); }
  }
}
