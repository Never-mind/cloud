import { execute, executeInTransaction, queryRows, queryRowsInTransaction, type Row, withTransaction } from "./db";
import { getOrderDeleteBlockReason, type OrderDeleteUsageCounts } from "./order-delete-policy";
import { isConfirmedOrderStatus } from "./order-status";
import { normalizeRequestNos } from "./procurement-workflow";

type IdRow = { id: string };
type PoRow = {
  purchaseOrderId?: string | null;
  poNo: string;
  requestNo?: string | null;
  sourceRequestNos?: string | null;
};
type RequestRow = { requestNo: string; status?: string | null };
type QueryRows = <T extends Row>(sql: string, params?: Row) => Promise<T[]>;
type ExecuteQuery = (sql: string, params?: Row) => Promise<unknown>;

export type BatchOrderDeleteBlockedItem = {
  requestNo: string;
  reason: string;
};

export class BatchOrderDeleteValidationError extends Error {
  constructor(public readonly blocked: BatchOrderDeleteBlockedItem[]) {
    super("批量删除校验失败");
    this.name = "BatchOrderDeleteValidationError";
  }
}

export async function deleteRequestOrder(requestNo: string) {
  const requestItems = await queryRows<IdRow>(
    "SELECT id FROM requestitems WHERE requestNo = :requestNo",
    { requestNo },
  );
  const purchaseOrders = await queryRows<PoRow>(
    "SELECT purchaseOrderId, poNo, requestNo, sourceRequestNos FROM purchaseorders WHERE requestNo = :requestNo OR sourceRequestNos LIKE :requestNoLike",
    { requestNo, requestNoLike: `%${requestNo}%` },
  );
  const requestItemIds = requestItems.map((row) => String(row.id));
  const poNos = purchaseOrders.map((row) => String(row.poNo));
  const purchaseOrderItemIds = await listPurchaseOrderItemIdsByPoNos(poNos);
  const counts = await getUsageCounts({ requestNo, requestItemIds, poNos, purchaseOrderItemIds });
  const blockReason = getOrderDeleteBlockReason(counts);
  if (blockReason) throw new Error(blockReason);

  for (const order of purchaseOrders) {
    await deletePurchaseOrderRows(String(order.poNo), String(order.purchaseOrderId ?? ""));
  }
  await execute("DELETE FROM requestitems WHERE requestNo = :requestNo", { requestNo });
  await execute("DELETE FROM requests WHERE requestNo = :requestNo", { requestNo });

  return { ok: true };
}

export async function deleteRequestOrders(requestNos: string[]) {
  const normalizedRequestNos = [...new Set(requestNos.map((value) => String(value ?? "").trim()).filter(Boolean))];
  if (!normalizedRequestNos.length) throw new Error("请选择至少一条需求单");
  if (normalizedRequestNos.length > 100) throw new Error("单次最多批量删除 100 条需求单");

  return withTransaction(async (connection) => {
    const requestClause = buildInClause("requestNo", normalizedRequestNos);
    const requests = await queryRowsInTransaction<RequestRow>(
      connection,
      `SELECT requestNo, status FROM requests WHERE requestNo IN (${requestClause.where}) FOR UPDATE`,
      requestClause.params,
    );
    const requestByNo = new Map(requests.map((row) => [String(row.requestNo), row]));
    const blocked: BatchOrderDeleteBlockedItem[] = [];

    for (const requestNo of normalizedRequestNos) {
      const request = requestByNo.get(requestNo);
      if (!request) {
        blocked.push({ requestNo, reason: "需求单不存在或已被删除" });
      } else if (isConfirmedOrderStatus("requests", request.status)) {
        blocked.push({ requestNo, reason: "已确认需求单不能批量删除" });
      }
    }
    if (blocked.length) throw new BatchOrderDeleteValidationError(blocked);

    const plans: Array<{ requestNo: string; purchaseOrders: PoRow[] }> = [];
    for (const requestNo of normalizedRequestNos) {
      const requestItems = await queryRowsInTransaction<IdRow>(
        connection,
        "SELECT id FROM requestitems WHERE requestNo = :requestNo FOR UPDATE",
        { requestNo },
      );
      const purchaseOrders = await queryRowsInTransaction<PoRow>(
        connection,
        "SELECT purchaseOrderId, poNo, requestNo, sourceRequestNos FROM purchaseorders WHERE requestNo = :requestNo OR sourceRequestNos LIKE :requestNoLike FOR UPDATE",
        { requestNo, requestNoLike: `%${requestNo}%` },
      );
      const requestItemIds = requestItems.map((row) => String(row.id));
      const poNos = purchaseOrders.map((row) => String(row.poNo));
      const purchaseOrderItemIds = await listPurchaseOrderItemIdsByPoNos(poNos, (sql, params) =>
        queryRowsInTransaction(connection, sql, params),
      );
      const counts = await getUsageCounts(
        { requestNo, requestItemIds, poNos, purchaseOrderItemIds },
        (sql, params) => queryRowsInTransaction(connection, sql, params),
      );
      const blockReason = getOrderDeleteBlockReason(counts);
      if (blockReason) blocked.push({ requestNo, reason: blockReason });
      plans.push({ requestNo, purchaseOrders });
    }
    if (blocked.length) throw new BatchOrderDeleteValidationError(blocked);

    const deletedPurchaseOrders = new Set<string>();
    for (const plan of plans) {
      for (const order of plan.purchaseOrders) {
        const poNo = String(order.poNo);
        const purchaseOrderId = String(order.purchaseOrderId ?? "");
        const key = `${purchaseOrderId}\u0000${poNo}`;
        if (deletedPurchaseOrders.has(key)) continue;
        deletedPurchaseOrders.add(key);
        await deletePurchaseOrderRowsWith(poNo, purchaseOrderId, (sql, params) =>
          executeInTransaction(connection, sql, params),
        );
      }
    }
    for (const requestNo of normalizedRequestNos) {
      await executeInTransaction(connection, "DELETE FROM requestitems WHERE requestNo = :requestNo", { requestNo });
      await executeInTransaction(connection, "DELETE FROM requests WHERE requestNo = :requestNo", { requestNo });
    }

    return { ok: true, deletedCount: normalizedRequestNos.length };
  });
}

export async function deletePurchaseOrder(purchaseOrderIdOrPoNo: string) {
  const rows = await queryRows<PoRow>(
    "SELECT purchaseOrderId, poNo, requestNo, sourceRequestNos FROM purchaseorders WHERE purchaseOrderId = :id OR poNo = :id LIMIT 1",
    { id: purchaseOrderIdOrPoNo },
  );
  const order = rows[0];
  if (!order) return { ok: true };

  const poNo = String(order.poNo);
  const purchaseOrderId = String(order.purchaseOrderId ?? "");
  const purchaseOrderItemIds = await listPurchaseOrderItemIdsByPoNos([poNo]);
  const counts = await getUsageCounts({
    requestNo: "",
    requestItemIds: [],
    poNos: [poNo],
    purchaseOrderItemIds,
  });
  const blockReason = getOrderDeleteBlockReason(counts);
  if (blockReason) throw new Error(blockReason);

  await deletePurchaseOrderRows(poNo, purchaseOrderId);
  const requestNos = normalizeRequestNos([String(order.sourceRequestNos ?? order.requestNo ?? "")])
    .split(",")
    .filter(Boolean);
  for (const requestNo of requestNos) {
    await execute("UPDATE requests SET status = :status WHERE requestNo = :requestNo", {
      requestNo,
      status: "待下单",
    });
  }

  return { ok: true };
}

async function deletePurchaseOrderRows(poNo: string, purchaseOrderId?: string) {
  return deletePurchaseOrderRowsWith(poNo, purchaseOrderId, execute);
}

async function deletePurchaseOrderRowsWith(poNo: string, purchaseOrderId: string | undefined, runExecute: ExecuteQuery) {
  await runExecute("DELETE FROM shipments WHERE poNo = :poNo", { poNo });
  if (purchaseOrderId) {
    await runExecute("DELETE FROM purchaseorderitems WHERE purchaseOrderId = :purchaseOrderId", { purchaseOrderId });
    await runExecute("DELETE FROM purchaseorders WHERE purchaseOrderId = :purchaseOrderId", { purchaseOrderId });
  } else {
    await runExecute("DELETE FROM purchaseorderitems WHERE poNo = :poNo", { poNo });
    await runExecute("DELETE FROM purchaseorders WHERE poNo = :poNo", { poNo });
  }
}

async function listPurchaseOrderItemIdsByPoNos(poNos: string[], runQuery: QueryRows = queryRows) {
  if (!poNos.length) return [];
  const { where, params } = buildInClause("poNo", poNos);
  const rows = await runQuery<IdRow>(
    `SELECT id FROM purchaseorderitems WHERE poNo IN (${where}) FOR UPDATE`,
    params,
  );
  return rows.map((row) => String(row.id));
}

async function getUsageCounts({
  poNos,
  purchaseOrderItemIds,
  requestItemIds,
  requestNo,
}: {
  requestNo: string;
  requestItemIds: string[];
  poNos: string[];
  purchaseOrderItemIds: string[];
}, runQuery: QueryRows = queryRows): Promise<OrderDeleteUsageCounts> {
  const purchaseOrderItemWhere = buildOptionalInClause("purchaseOrderItemId", purchaseOrderItemIds);
  const prepaymentPurchaseItemWhere = buildOptionalInClause("purchaseOrderItemId", purchaseOrderItemIds, "ppoi");
  const requestItemWhere = buildOptionalInClause("requestItemId", requestItemIds);
  const poWhere = buildOptionalInClause("poNo", poNos);

  const [billingLedgerCount, monthlyBillingCount, prepaymentContractItemCount, monthlyPrepaymentCount] =
    await Promise.all([
      countRows(
        `SELECT COUNT(*) AS count FROM billinginstanceledgers WHERE ${orParts([
          purchaseOrderItemWhere.sql,
          poWhere.sql,
          requestNo ? "requestNo = :requestNo" : "",
        ])}`,
        { ...purchaseOrderItemWhere.params, ...poWhere.params, requestNo },
        runQuery,
      ),
      countRows(
        `SELECT COUNT(*) AS count FROM monthlybillingwriteoffs WHERE ${orParts([
          poWhere.sql,
          requestNo ? "requestNo = :requestNo" : "",
        ])}`,
        { ...poWhere.params, requestNo },
        runQuery,
      ),
      countRows(
        `SELECT COUNT(*) AS count FROM prepaymentcontractitems WHERE ${orParts([
          prepaymentPurchaseItemWhere.sql,
          requestItemWhere.sql,
          poWhere.sql,
          requestNo ? "requestNo = :requestNo" : "",
        ])}`,
        {
          ...prepaymentPurchaseItemWhere.params,
          ...requestItemWhere.params,
          ...poWhere.params,
          requestNo,
        },
        runQuery,
      ),
      countRows(
        `SELECT COUNT(*) AS count FROM monthlyprepaymentwriteoffs WHERE ${orParts([
          poWhere.sql,
          requestNo ? "requestNo = :requestNo" : "",
        ])}`,
        { ...poWhere.params, requestNo },
        runQuery,
      ),
    ]);

  return {
    billingLedgerCount,
    monthlyBillingCount,
    prepaymentContractItemCount,
    monthlyPrepaymentCount,
  };
}

async function countRows(sql: string, params: Row, runQuery: QueryRows = queryRows) {
  const rows = await runQuery<{ count: number }>(sql, params);
  return Number(rows[0]?.count ?? 0);
}

function buildInClause(prefix: string, values: string[]) {
  const params = Object.fromEntries(values.map((value, index) => [`${prefix}${index}`, value]));
  const where = values.map((_, index) => `:${prefix}${index}`).join(", ");
  return { where, params };
}

function buildOptionalInClause(column: string, values: string[], prefix = column) {
  if (!values.length) return { sql: "", params: {} };
  const { where, params } = buildInClause(prefix, values);
  return { sql: `${column} IN (${where})`, params };
}

function orParts(parts: string[]) {
  const activeParts = parts.filter(Boolean);
  return activeParts.length ? activeParts.join(" OR ") : "1 = 0";
}
