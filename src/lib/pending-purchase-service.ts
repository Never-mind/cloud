/**
 * 待采购明细（方案 B）。
 *
 * 需求单确认后**不再自动生成采购订单**，明细进入"待采购"池；
 * 由用户在采购订单页的「待采购明细」标签里勾选若干行（以实例行数为准）组成采购订单。
 * 一条需求明细只能属于一张采购订单（`purchaseorderitems.requestItemId` 上有唯一索引）。
 */
import { execute, executeInTransaction, queryRows, queryRowsInTransaction, withTransaction, type Row } from "./db";
import {
  buildAutoPurchaseOrderId,
  buildAutoPurchaseOrderNo,
  buildPurchaseDraft,
  normalizeRequestNos,
} from "./procurement-workflow";
import { attachPartyCodes } from "./party-display";
import { partyNameExpressions } from "./party-name-expression";
import { DEFAULT_PAGE_SIZE, normalizePageSize } from "./pagination";
import {
  appendTableInFilter,
  formatTableDateExpression,
  getTableFilterOptionsOrderBy,
  getTableSort,
  listSqlFilterOptions,
} from "./table-query";
import type { OperationActor } from "./operation-actor";

/** 待采购 = 已确认需求单（待下单/已下单）里、还没有任何采购订单的明细。 */
const PENDING_CONDITIONS = [
  "req.status IN ('待下单', '已下单')",
  "COALESCE(req.remoteStatus, '') <> 'Cancelled'",
  "poi.id IS NULL",
];

const PENDING_FROM = `
  FROM requestitems ri
  INNER JOIN requests req ON req.requestNo = ri.requestNo
  LEFT JOIN purchaseorderitems poi ON poi.requestItemId = ri.id
  LEFT JOIN instancemodels im ON im.deviceCode = ri.deviceCode
`;

const PENDING_PARTY_IDS = {
  supplierId: "ri.supplierId",
  undertakingUnitId: "ri.undertakingUnitId",
  customerId: "ri.customerId",
};

const PENDING_EXPRESSIONS: Record<string, string> = {
  requestItemId: "ri.id",
  requestNo: "ri.requestNo",
  countryCode: "req.countryCode",
  batchName: "req.batchName",
  contractNo: "req.contractNo",
  deviceCode: "ri.deviceCode",
  nameEn: "COALESCE(im.nameEn, ri.deviceCode)",
  quantity: "ri.quantity",
  requestType: "ri.requestType",
  requestedAt: formatTableDateExpression("ri.requestedAt"),
  createdAt: formatTableDateExpression("ri.createdAt"),
  ...partyNameExpressions(PENDING_PARTY_IDS),
};

export async function countPendingPurchaseItems() {
  const rows = await queryRows<{ total: number }>(
    `SELECT COUNT(*) AS total ${PENDING_FROM} WHERE ${PENDING_CONDITIONS.join(" AND ")}`,
  );
  return Number(rows[0]?.total ?? 0);
}

/** 待采购明细分页列表（含三横杠排序/筛选与筛选候选值）。 */
export async function listPendingPurchaseItems(searchParams: URLSearchParams) {
  if (searchParams.get("field")) return listPendingPurchaseItemFilterOptions(searchParams);

  const requestedPage = Math.max(1, Math.floor(Number(searchParams.get("page") ?? 1) || 1));
  const pageSize = normalizePageSize(Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE));
  const exportAll = searchParams.get("export") === "1";
  const conditions = [...PENDING_CONDITIONS];
  const params: Row = {};

  const keyword = searchParams.get("keyword")?.trim();
  if (keyword) {
    conditions.push("(ri.requestNo LIKE :keyword OR ri.deviceCode LIKE :keyword OR req.batchName LIKE :keyword OR req.contractNo LIKE :keyword)");
    params.keyword = `%${keyword}%`;
  }
  const requestNo = searchParams.get("requestNo")?.trim();
  if (requestNo) {
    conditions.push("ri.requestNo = :requestNo");
    params.requestNo = requestNo;
  }
  for (const [field, expression] of Object.entries(PENDING_EXPRESSIONS)) {
    appendTableInFilter(conditions, params, expression, field, searchParams, "pendingItem");
  }
  const where = `WHERE ${conditions.join(" AND ")}`;

  const [{ total: totalValue }] = await queryRows<{ total: number }>(`SELECT COUNT(*) AS total ${PENDING_FROM} ${where}`, params);
  const total = Number(totalValue ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = exportAll ? 1 : Math.min(requestedPage, totalPages);

  const rows = await queryRows<Row>(
    `
      SELECT ri.id AS requestItemId, ri.requestNo, ri.requestType, ri.deviceCode, ri.quantity,
        COALESCE(im.nameEn, ri.deviceCode) AS nameEn,
        req.countryCode, req.batchName, req.contractNo, req.status AS requestStatus,
        DATE_FORMAT(ri.requestedAt, '%Y-%m-%d') AS requestedAt,
        ri.supplierId, ri.undertakingUnitId, ri.customerId
      ${PENDING_FROM}
      ${where}
      ${getTableSort(searchParams, PENDING_EXPRESSIONS) || "ORDER BY ri.requestedAt DESC, ri.requestNo, ri.id"}
      ${exportAll ? "" : "LIMIT :limit OFFSET :offset"}
    `,
    exportAll ? params : { ...params, limit: pageSize, offset: (page - 1) * pageSize },
  );

  return { rows: await attachPartyCodes(rows), total, page, pageSize, totalPages };
}

export async function listPendingPurchaseItemFilterOptions(searchParams: URLSearchParams) {
  return listSqlFilterOptions({
    from: PENDING_FROM,
    expressions: PENDING_EXPRESSIONS,
    searchParams,
    conditions: PENDING_CONDITIONS,
  });
}

/** 某张需求单的采购进度：明细数 / 已进采购订单的明细数。 */
export async function loadRequestOrderProgress(requestNos: string[]) {
  const nos = Array.from(new Set(requestNos.map((value) => String(value ?? "").trim()).filter(Boolean)));
  const map = new Map<string, { total: number; ordered: number }>();
  if (!nos.length) return map;
  const rows = await queryRows<{ requestNo: string; total: number; ordered: number }>(
    `
      SELECT ri.requestNo,
        COUNT(*) AS total,
        SUM(CASE WHEN poi.id IS NULL THEN 0 ELSE 1 END) AS ordered
      FROM requestitems ri
      LEFT JOIN purchaseorderitems poi ON poi.requestItemId = ri.id
      WHERE ri.requestNo IN (:nos)
      GROUP BY ri.requestNo
    `,
    { nos },
  );
  for (const row of rows) map.set(String(row.requestNo), { total: Number(row.total ?? 0), ordered: Number(row.ordered ?? 0) });
  return map;
}

export type CreatePurchaseOrdersFromItemsInput = {
  requestItemIds: string[];
  /** 新建时的 PO 号，留空按需求单自动编号 */
  poNo?: string;
  /** 追加到已有的**草稿**采购订单（传 poNo 或 purchaseOrderId） */
  targetPoNo?: string;
  currency?: string;
  usdRate?: string | number | null;
  releasedAt?: string | null;
  actor?: OperationActor | null;
};

/**
 * 按勾选的待采购明细生成/追加采购订单（事务内完成，重复勾选会被拦下）。
 */
export async function createPurchaseOrdersFromItems(input: CreatePurchaseOrdersFromItemsInput) {
  const ids = Array.from(new Set(input.requestItemIds.map((value) => String(value ?? "").trim()).filter(Boolean)));
  if (!ids.length) throw new Error("请至少勾选一条待采购明细");

  return withTransaction(async (connection) => {
    const items = await queryRowsInTransaction<Row>(
      connection,
      `
        SELECT ri.id, ri.requestNo, ri.requestType, poi.id AS orderedId
        FROM requestitems ri
        LEFT JOIN purchaseorderitems poi ON poi.requestItemId = ri.id
        WHERE ri.id IN (:ids)
        FOR UPDATE
      `,
      { ids },
    );
    if (items.length !== ids.length) throw new Error("部分明细已不存在，请刷新后重试");
    const taken = items.filter((item) => item.orderedId);
    if (taken.length) {
      throw new Error(`这些明细已经生成过采购订单，不能重复下单：${taken.map((item) => `${String(item.requestNo)} / ${String(item.id)}`).join("、")}`);
    }

    // normalizeRequestNos 返回逗号拼接的字符串，这里按数组用
    const requestNos = normalizeRequestNos(items.map((item) => String(item.requestNo ?? ""))).split(",").filter(Boolean);
    const details = items.map((item) => ({ id: String(item.id), requestNo: String(item.requestNo ?? ""), requestType: String(item.requestType ?? "整机") }));
    const sourceRequestNos = requestNos.join(",");

    // 追加到已有草稿采购订单
    if (input.targetPoNo?.trim()) {
      const [target] = await queryRowsInTransaction<Row>(
        connection,
        "SELECT purchaseOrderId, poNo, status, sourceRequestNos FROM purchaseorders WHERE poNo = :key OR purchaseOrderId = :key LIMIT 1 FOR UPDATE",
        { key: input.targetPoNo.trim() },
      );
      if (!target) throw new Error(`目标采购订单不存在：${input.targetPoNo.trim()}`);
      if (String(target.status ?? "") !== "草稿") {
        throw new Error(`采购订单 ${String(target.poNo)} 当前是「${String(target.status)}」，不能追加明细；请先退回草稿`);
      }
      const existing = await queryRowsInTransaction<Row>(
        connection,
        "SELECT id FROM purchaseorderitems WHERE purchaseOrderId = :purchaseOrderId ORDER BY id",
        { purchaseOrderId: String(target.purchaseOrderId) },
      );
      let index = existing.length;
      for (const detail of details) {
        index += 1;
        await executeInTransaction(
          connection,
          `
            INSERT INTO purchaseorderitems
              (id, purchaseOrderId, poNo, requestNo, requestItemId, requestType, currency, unitPrice,
               hardwareCoefficient, softwareCoefficient, totalCoefficient)
            VALUES
              (:id, :purchaseOrderId, :poNo, :requestNo, :requestItemId, :requestType, :currency, 0, 1, 0, 1)
          `,
          {
            id: `POI-${String(target.purchaseOrderId)}-${String(index).padStart(3, "0")}`,
            purchaseOrderId: String(target.purchaseOrderId),
            poNo: String(target.poNo),
            requestNo: detail.requestNo,
            requestItemId: detail.id,
            requestType: detail.requestType,
            currency: input.currency?.trim() || "USD",
          },
        );
      }
      const mergedRequestNos = normalizeRequestNos([...String(target.sourceRequestNos ?? "").split(","), ...requestNos]);
      await executeInTransaction(
        connection,
        "UPDATE purchaseorders SET sourceRequestNos = :sourceRequestNos, updatedAt = NOW() WHERE purchaseOrderId = :purchaseOrderId",
        { sourceRequestNos: mergedRequestNos, purchaseOrderId: String(target.purchaseOrderId) },
      );
      await refreshRequestStatusAfterItemsChange(connection, requestNos);
      return { poNo: String(target.poNo), purchaseOrderId: String(target.purchaseOrderId), itemCount: details.length, appended: true as const };
    }

    // 新建采购订单
    const purchaseOrderId = buildAutoPurchaseOrderId();
    const poNo = input.poNo?.trim() || buildAutoPurchaseOrderNo(requestNos[0] ?? "");
    const draft = buildPurchaseDraft({
      purchaseOrderId,
      poNo,
      requestNo: requestNos[0] ?? "",
      requestNos,
      details,
    });
    await executeInTransaction(
      connection,
      `
        INSERT INTO purchaseorders
          (purchaseOrderId, poNo, requestNo, sourceRequestNos, status, currency, usdRate, paymentDate, releasedAt,
           createdByUserId, createdByName, updatedByUserId, updatedByName)
        VALUES
          (:purchaseOrderId, :poNo, :requestNo, :sourceRequestNos, '草稿', :currency, :usdRate, NULL, :releasedAt,
           :createdByUserId, :createdByName, :updatedByUserId, :updatedByName)
      `,
      {
        purchaseOrderId,
        poNo,
        requestNo: draft.order.requestNo,
        sourceRequestNos,
        currency: input.currency?.trim() || "USD",
        usdRate: input.usdRate === null || input.usdRate === undefined || input.usdRate === "" ? null : Number(input.usdRate),
        releasedAt: input.releasedAt?.trim() || null,
        createdByUserId: input.actor?.userId ?? null,
        createdByName: input.actor?.displayName ?? null,
        updatedByUserId: input.actor?.userId ?? null,
        updatedByName: input.actor?.displayName ?? null,
      },
    );
    for (const item of draft.items) {
      await executeInTransaction(
        connection,
        `
          INSERT INTO purchaseorderitems
            (id, purchaseOrderId, poNo, requestNo, requestItemId, requestType, currency, unitPrice,
             hardwareCoefficient, softwareCoefficient, totalCoefficient)
          VALUES
            (:id, :purchaseOrderId, :poNo, :requestNo, :requestItemId, :requestType, :currency, :unitPrice,
             :hardwareCoefficient, :softwareCoefficient, :totalCoefficient)
        `,
        { ...item, currency: input.currency?.trim() || item.currency },
      );
    }
    await refreshRequestStatusAfterItemsChange(connection, requestNos);
    return { poNo, purchaseOrderId, itemCount: draft.items.length, appended: false as const };
  });
}

/**
 * 明细归属变化后同步需求单状态：还有未下单明细的需求单，从「已下单」退回「待下单」。
 * 只降不升 —— 升到「已下单」仍然发生在采购订单确认时（且要求该需求单明细全部已确认采购）。
 */
async function refreshRequestStatusAfterItemsChange(connection: Parameters<Parameters<typeof withTransaction>[0]>[0], requestNos: string[]) {
  const nos = normalizeRequestNos(requestNos).split(",").filter(Boolean);
  if (!nos.length) return;
  await executeInTransaction(
    connection,
    `
      UPDATE requests req
        SET req.status = '待下单'
      WHERE req.requestNo IN (:nos) AND req.status = '已下单'
        AND EXISTS (
          SELECT 1 FROM requestitems ri
          LEFT JOIN purchaseorderitems poi ON poi.requestItemId = ri.id
          WHERE ri.requestNo = req.requestNo AND poi.id IS NULL
        )
    `,
    { nos },
  );
}

/** 需求单确认：只把状态置为待下单，不再生成采购订单（明细进入待采购明细）。 */
export async function markRequestAsPendingPurchase(requestNo: string, actor: OperationActor | null = null) {
  const assignment = actor ? ", updatedByUserId = :updatedByUserId, updatedByName = :updatedByName" : "";
  await execute(`UPDATE requests SET status = '待下单'${assignment} WHERE requestNo = :requestNo`, {
    requestNo,
    ...(actor ? { updatedByUserId: actor.userId, updatedByName: actor.displayName } : {}),
  });
}
