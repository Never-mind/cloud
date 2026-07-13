import { execute, queryRows, type Row } from "./db";
import { getOrderDeleteBlockReason, type OrderDeleteUsageCounts } from "./order-delete-policy";
import { normalizeRequestNos } from "./procurement-workflow";

type IdRow = { id: string };
type PoRow = {
  purchaseOrderId?: string | null;
  poNo: string;
  requestNo?: string | null;
  sourceRequestNos?: string | null;
};

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
  await execute("DELETE FROM shipments WHERE poNo = :poNo", { poNo });
  if (purchaseOrderId) {
    await execute("DELETE FROM purchaseorderitems WHERE purchaseOrderId = :purchaseOrderId", { purchaseOrderId });
    await execute("DELETE FROM purchaseorders WHERE purchaseOrderId = :purchaseOrderId", { purchaseOrderId });
  } else {
    await execute("DELETE FROM purchaseorderitems WHERE poNo = :poNo", { poNo });
    await execute("DELETE FROM purchaseorders WHERE poNo = :poNo", { poNo });
  }
}

async function listPurchaseOrderItemIdsByPoNos(poNos: string[]) {
  if (!poNos.length) return [];
  const { where, params } = buildInClause("poNo", poNos);
  const rows = await queryRows<IdRow>(
    `SELECT id FROM purchaseorderitems WHERE poNo IN (${where})`,
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
}): Promise<OrderDeleteUsageCounts> {
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
      ),
      countRows(
        `SELECT COUNT(*) AS count FROM monthlybillingwriteoffs WHERE ${orParts([
          poWhere.sql,
          requestNo ? "requestNo = :requestNo" : "",
        ])}`,
        { ...poWhere.params, requestNo },
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
      ),
      countRows(
        `SELECT COUNT(*) AS count FROM monthlyprepaymentwriteoffs WHERE ${orParts([
          poWhere.sql,
          requestNo ? "requestNo = :requestNo" : "",
        ])}`,
        { ...poWhere.params, requestNo },
      ),
    ]);

  return {
    billingLedgerCount,
    monthlyBillingCount,
    prepaymentContractItemCount,
    monthlyPrepaymentCount,
  };
}

async function countRows(sql: string, params: Row) {
  const rows = await queryRows<{ count: number }>(sql, params);
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
