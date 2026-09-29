import { execute, executeInTransaction, queryRows, queryRowsInTransaction, type Row, withTransaction } from "./db";
import { getOrderDeleteBlockReason, getPurchaseOrderCascadeBlockReason, type OrderDeleteUsageCounts } from "./order-delete-policy";
import { isConfirmedOrderStatus } from "./order-status";
import { normalizeRequestNos } from "./procurement-workflow";

type IdRow = { id: string };
type PoRow = {
  purchaseOrderId?: string | null;
  poNo: string;
  requestNo?: string | null;
  sourceRequestNos?: string | null;
  status?: string | null;
};
type RequestRow = { requestNo: string; status?: string | null };
type QueryRows = <T extends Row>(sql: string, params?: Row) => Promise<T[]>;
type ExecuteQuery = (sql: string, params?: Row) => Promise<unknown>;

type BatchOrderDeleteBlockedItem = {
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
    "SELECT purchaseOrderId, poNo, requestNo, sourceRequestNos, status FROM purchaseorders WHERE requestNo = :requestNo OR sourceRequestNos LIKE :requestNoLike",
    { requestNo, requestNoLike: `%${requestNo}%` },
  );
  // 采购订单上人录进去的价格/物流一旦被连带删除就找不回来，先挡一道。
  const cascadeBlockReason = await getPurchaseOrderCascadeBlockReasonForOrders(purchaseOrders);
  if (cascadeBlockReason) throw new Error(cascadeBlockReason);
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

/**
 * 删除单条需求明细。
 *
 * 守卫：已经被采购订单明细引用的需求明细不允许删除 —— 单据已经进入采购流程，
 * 直接删掉会让采购订单、物流、月账单挂到一条不存在的需求明细上，
 * 需要改的话先把采购订单那一侧退回或删除。
 */
export async function deleteRequestItem(itemId: string) {
  const id = String(itemId ?? "").trim();
  if (!id) throw new Error("请指定要删除的需求明细");
  const rows = await queryRows<IdRow & { requestNo?: string | null }>(
    "SELECT id, requestNo FROM requestitems WHERE id = :id",
    { id },
  );
  const item = rows[0];
  if (!item) throw new Error("需求明细不存在或已被删除");

  const [purchaseItemCount, prepaymentCount] = await Promise.all([
    countRows("SELECT COUNT(*) AS count FROM purchaseorderitems WHERE requestItemId = :id", { id }),
    countRows("SELECT COUNT(*) AS count FROM prepaymentcontractitems WHERE requestItemId = :id", { id }),
  ]);
  if (purchaseItemCount > 0) {
    throw new Error(`明细 ${id} 已生成采购订单，不能直接删除；请先在采购订单里退回或删除对应明细`);
  }
  if (prepaymentCount > 0) {
    throw new Error(`明细 ${id} 已生成预付款，不能删除`);
  }

  await execute("DELETE FROM requestitems WHERE id = :id", { id });
  return { ok: true, requestNo: String(item.requestNo ?? "") };
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
        "SELECT purchaseOrderId, poNo, requestNo, sourceRequestNos, status FROM purchaseorders WHERE requestNo = :requestNo OR sourceRequestNos LIKE :requestNoLike FOR UPDATE",
        { requestNo, requestNoLike: `%${requestNo}%` },
      );
      const cascadeBlockReason = await getPurchaseOrderCascadeBlockReasonForOrders(
        purchaseOrders,
        (sql, params) => queryRowsInTransaction(connection, sql, params),
      );
      if (cascadeBlockReason) {
        blocked.push({ requestNo, reason: cascadeBlockReason });
        continue;
      }
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

/**
 * 采购订单的"人录数据"检查。
 *
 * 删除需求单会连带删除它的采购订单，而采购订单上的价格、物流快照、确认状态
 * 一旦跟着删掉就找不回来了（历史上出现过删需求单再重新拉取、价格全丢的情况）。
 * 所以这里规定：只有"未确认、没录价格、没有物流单"的采购草稿才允许被连带删除。
 */
async function getPurchaseOrderCascadeBlockReasonForOrders(
  purchaseOrders: readonly PoRow[],
  runQuery: QueryRows = queryRows,
): Promise<string | null> {
  for (const order of purchaseOrders) {
    const poNo = String(order.poNo ?? "").trim();
    const purchaseOrderId = String(order.purchaseOrderId ?? "").trim();
    if (!poNo && !purchaseOrderId) continue;
    const params = { poNo, purchaseOrderId };
    const [pricedItemCount, shipmentCount] = await Promise.all([
      countRows(
        `SELECT COUNT(*) AS count FROM purchaseorderitems
          WHERE (purchaseOrderId = :purchaseOrderId OR poNo = :poNo)
            AND (COALESCE(unitPrice, 0) <> 0 OR taxExcludedUnitPrice IS NOT NULL OR capexUnitPrice IS NOT NULL
              OR opexUnitPrice IS NOT NULL OR powerFirst24VatIncluded IS NOT NULL
              OR powerNext36VatIncluded IS NOT NULL OR powerPricingJson IS NOT NULL)`,
        params,
        runQuery,
      ),
      countRows(
        `SELECT COUNT(*) AS count FROM shipments
          WHERE poNo = :poNo
             OR purchaseOrderItemId IN (
               SELECT id FROM purchaseorderitems WHERE purchaseOrderId = :purchaseOrderId OR poNo = :poNo)`,
        params,
        runQuery,
      ),
    ]);
    const reason = getPurchaseOrderCascadeBlockReason({
      poNo: poNo || purchaseOrderId,
      confirmed: isConfirmedOrderStatus("purchase", order.status),
      pricedItemCount,
      shipmentCount,
    });
    if (reason) return reason;
  }
  return null;
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
