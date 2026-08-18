import { queryRows, type Row } from "./db";
import { DEFAULT_PAGE_SIZE, normalizePageSize } from "./pagination";

type OrderListResult = {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  statusCounts: { draft: number; confirmed: number };
};

export async function listOrderRows(searchParams: URLSearchParams): Promise<OrderListResult> {
  const mode = searchParams.get("mode") === "purchase" ? "purchase" : "requests";
  const keyword = searchParams.get("keyword")?.trim();
  const statusTab = searchParams.get("statusTab") === "confirmed" ? "confirmed" : "draft";
  const exportAll = searchParams.get("export") === "1";
  const requestedPage = Math.max(1, Math.floor(Number(searchParams.get("page") ?? 1) || 1));
  const pageSize = normalizePageSize(Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE));
  return mode === "purchase"
    ? listPurchaseOrders({ keyword, statusTab, exportAll, requestedPage, pageSize })
    : listRequests({ keyword, statusTab, exportAll, requestedPage, pageSize });
}

async function listRequests(options: {
  keyword?: string;
  statusTab: "draft" | "confirmed";
  exportAll: boolean;
  requestedPage: number;
  pageSize: number;
}): Promise<OrderListResult> {
  const params: Row = {};
  const keywordWhere = buildRequestKeywordWhere(options.keyword, params);
  const confirmedCondition = "req.status IN ('待下单', '已下单')";
  const statusCondition = options.statusTab === "confirmed" ? confirmedCondition : `NOT (${confirmedCondition})`;
  const baseWhere = [keywordWhere, statusCondition].filter(Boolean).join(" AND ");
  const allWhere = keywordWhere ? `WHERE ${keywordWhere}` : "";
  const [{ total }] = await queryRows<{ total: number }>(
    `SELECT COUNT(*) AS total FROM requests AS req ${baseWhere ? `WHERE ${baseWhere}` : ""}`,
    params,
  );
  const [counts] = await queryRows<{ draft: number; confirmed: number }>(
    `
      SELECT
        SUM(CASE WHEN ${confirmedCondition} THEN 1 ELSE 0 END) AS confirmed,
        SUM(CASE WHEN ${confirmedCondition} THEN 0 ELSE 1 END) AS draft
      FROM requests AS req
      ${allWhere}
    `,
    params,
  );

  const normalizedTotal = Number(total ?? 0);
  const totalPages = Math.max(1, Math.ceil(normalizedTotal / options.pageSize));
  const page = options.exportAll ? 1 : Math.min(options.requestedPage, totalPages);
  if (!options.exportAll) {
    params.limit = options.pageSize;
    params.offset = (page - 1) * options.pageSize;
  }

  const rows = await queryRows<Row>(
    `
      SELECT
        req.requestNo,
        req.countryCode,
        req.contractNo,
        req.batchName,
        req.requestType,
        req.status,
        COALESCE(SUM(ri.quantity), 0) AS totalQuantity,
        DATE_FORMAT(req.plannedDeliveryDate, '%Y-%m-%d') AS plannedDeliveryDate,
        DATE_FORMAT(req.createdAt, '%Y-%m-%d %H:%i:%s') AS createdAt,
        DATE_FORMAT(req.updatedAt, '%Y-%m-%d %H:%i:%s') AS updatedAt
      FROM requests AS req
      LEFT JOIN requestitems AS ri ON ri.requestNo = req.requestNo
      ${baseWhere ? `WHERE ${baseWhere}` : ""}
      GROUP BY req.requestNo, req.countryCode, req.contractNo, req.batchName, req.requestType, req.status,
        req.plannedDeliveryDate, req.createdAt, req.updatedAt
      ORDER BY req.createdAt DESC
      ${options.exportAll ? "" : "LIMIT :limit OFFSET :offset"}
    `,
    params,
  );

  return {
    rows,
    total: normalizedTotal,
    page,
    pageSize: options.pageSize,
    totalPages,
    statusCounts: { draft: Number(counts?.draft ?? 0), confirmed: Number(counts?.confirmed ?? 0) },
  };
}

async function listPurchaseOrders(options: {
  keyword?: string;
  statusTab: "draft" | "confirmed";
  exportAll: boolean;
  requestedPage: number;
  pageSize: number;
}): Promise<OrderListResult> {
  const params: Row = {};
  const keywordWhere = buildPurchaseKeywordWhere(options.keyword, params);
  const confirmedCondition = "purchase.status LIKE '%确认%'";
  const statusCondition = options.statusTab === "confirmed" ? confirmedCondition : `NOT (${confirmedCondition})`;
  const baseWhere = [keywordWhere, statusCondition].filter(Boolean).join(" AND ");
  const allWhere = keywordWhere ? `WHERE ${keywordWhere}` : "";
  const [{ total }] = await queryRows<{ total: number }>(
    `SELECT COUNT(*) AS total FROM purchaseorders AS purchase ${baseWhere ? `WHERE ${baseWhere}` : ""}`,
    params,
  );
  const [counts] = await queryRows<{ draft: number; confirmed: number }>(
    `
      SELECT
        SUM(CASE WHEN ${confirmedCondition} THEN 1 ELSE 0 END) AS confirmed,
        SUM(CASE WHEN ${confirmedCondition} THEN 0 ELSE 1 END) AS draft
      FROM purchaseorders AS purchase
      ${allWhere}
    `,
    params,
  );

  const normalizedTotal = Number(total ?? 0);
  const totalPages = Math.max(1, Math.ceil(normalizedTotal / options.pageSize));
  const page = options.exportAll ? 1 : Math.min(options.requestedPage, totalPages);
  if (!options.exportAll) {
    params.limit = options.pageSize;
    params.offset = (page - 1) * options.pageSize;
  }

  const rows = await queryRows<Row>(
    `
      SELECT
        purchase.purchaseOrderId,
        purchase.poNo,
        COALESCE(NULLIF(purchase.requestNo, ''), GROUP_CONCAT(DISTINCT requestItem.requestNo ORDER BY requestItem.requestNo SEPARATOR ',')) AS requestNo,
        GROUP_CONCAT(DISTINCT requestMaster.batchName ORDER BY requestMaster.batchName SEPARATOR ',') AS batchName,
        purchase.status,
        purchase.currency,
        COALESCE(SUM(requestItem.quantity), 0) AS totalQuantity,
        ROUND(COALESCE(SUM(requestItem.quantity * COALESCE(item.unitPrice, COALESCE(item.taxExcludedUnitPrice, 0) + COALESCE(item.taxSurcharge, 0))), 0), 4) AS purchaseTotalAmount,
        DATE_FORMAT(purchase.createdAt, '%Y-%m-%d %H:%i:%s') AS createdAt,
        DATE_FORMAT(purchase.updatedAt, '%Y-%m-%d %H:%i:%s') AS updatedAt
      FROM purchaseorders AS purchase
      LEFT JOIN purchaseorderitems AS item
        ON item.poNo = purchase.poNo
      LEFT JOIN requestitems AS requestItem ON requestItem.id = item.requestItemId
      LEFT JOIN requests AS requestMaster
        ON requestMaster.requestNo = COALESCE(NULLIF(item.requestNo, ''), requestItem.requestNo)
      ${baseWhere ? `WHERE ${baseWhere}` : ""}
      GROUP BY purchase.purchaseOrderId, purchase.poNo, purchase.requestNo, purchase.status, purchase.currency,
        purchase.createdAt, purchase.updatedAt
      ORDER BY purchase.createdAt DESC
      ${options.exportAll ? "" : "LIMIT :limit OFFSET :offset"}
    `,
    params,
  );

  return {
    rows,
    total: normalizedTotal,
    page,
    pageSize: options.pageSize,
    totalPages,
    statusCounts: { draft: Number(counts?.draft ?? 0), confirmed: Number(counts?.confirmed ?? 0) },
  };
}

function buildRequestKeywordWhere(keyword: string | undefined, params: Row) {
  if (!keyword) return "";
  params.keyword = `%${keyword}%`;
  return "(req.requestNo LIKE :keyword OR req.contractNo LIKE :keyword OR req.batchName LIKE :keyword OR req.status LIKE :keyword OR req.countryCode LIKE :keyword)";
}

function buildPurchaseKeywordWhere(keyword: string | undefined, params: Row) {
  if (!keyword) return "";
  params.keyword = `%${keyword}%`;
  return `(
    purchase.poNo LIKE :keyword OR purchase.requestNo LIKE :keyword OR purchase.sourceRequestNos LIKE :keyword
    OR purchase.status LIKE :keyword OR purchase.currency LIKE :keyword
    OR EXISTS (
      SELECT 1
      FROM purchaseorderitems AS searchItem
      LEFT JOIN requestitems AS searchRequestItem ON searchRequestItem.id = searchItem.requestItemId
      LEFT JOIN requests AS searchRequest ON searchRequest.requestNo = COALESCE(NULLIF(searchItem.requestNo, ''), searchRequestItem.requestNo)
      WHERE searchItem.poNo = purchase.poNo
        AND (searchRequestItem.requestNo LIKE :keyword OR searchRequestItem.deviceCode LIKE :keyword OR searchRequest.batchName LIKE :keyword)
    )
  )`;
}
