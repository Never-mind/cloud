import { queryRows, type Row } from "./db";
import { DEFAULT_PAGE_SIZE, normalizePageSize } from "./pagination";
import { formatTableDateExpression, getNaturalBatchSort } from "./table-query";
import { buildPurchaseSourceRequestFilter, getPurchaseSourceRequestNos } from "./purchase-order-sources";

type OrderListResult = {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  statusCounts: { draft: number; confirmed: number };
};

/** 需求单列表按主单字段分组（明细侧用聚合列）。 */
const REQUEST_GROUP_BY = `GROUP BY req.requestNo, req.countryCode, req.contractNo, req.batchName, req.requestType, req.status, req.remoteStatus,
  req.createdByName, req.updatedByName, req.confirmedByName,
  req.plannedDeliveryDate, req.createdAt, req.updatedAt`;

/** 采购进度筛选的固定候选值（与 SQL 里 CASE 的输出保持一致）。 */
export const REQUEST_ORDER_PROGRESS_OPTIONS = ["未下单", "部分下单", "全部下单"] as const;

/**
 * 批次号口径：取**明细批次**（去重聚合），明细没填才回落主单的默认批次。
 *
 * 两个坑：
 *   1. 不能用裸别名 `batchName` 排序 —— 明细表也有同名列，MySQL 报 `ambiguous`；
 *   2. 也不能写 `ri.batchName` —— 需求单列表是 GROUP BY 查询，非聚合列会被
 *      `only_full_group_by` 拦下。所以这里用与 SELECT 一致的**独立子查询**。
 */
const REQUEST_BATCH_SORT = `COALESCE(
  (SELECT GROUP_CONCAT(DISTINCT sortBatch.batchName ORDER BY sortBatch.batchName SEPARATOR ', ')
     FROM requestitems AS sortBatch
    WHERE sortBatch.requestNo = req.requestNo
      AND sortBatch.batchName IS NOT NULL AND sortBatch.batchName <> ''),
  req.batchName, '')`;

/** 采购进度口径：需求单明细里已进入采购订单的比例。 */
const REQUEST_ORDER_PROGRESS_CASE = "CASE WHEN COUNT(DISTINCT poItem.id) = 0 THEN '未下单' WHEN COUNT(DISTINCT poItem.id) < COUNT(DISTINCT ri.id) THEN '部分下单' ELSE '全部下单' END";

export async function listOrderRows(searchParams: URLSearchParams): Promise<OrderListResult> {
  const mode = searchParams.get("mode") === "purchase" ? "purchase" : "requests";
  const keyword = searchParams.get("keyword")?.trim();
  const countryCode = normalizeCountryCode(searchParams.get("countryCode"));
  const statusTab = searchParams.get("statusTab") === "confirmed" ? "confirmed" : "draft";
  const exportAll = searchParams.get("export") === "1";
  const sortField = searchParams.get("sortField")?.trim() ?? "";
  const sortOrder = searchParams.get("sortOrder") === "asc" ? "ASC" : "DESC";
  const requestedPage = Math.max(1, Math.floor(Number(searchParams.get("page") ?? 1) || 1));
  const pageSize = normalizePageSize(Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE));
  return mode === "purchase"
    ? listPurchaseOrders({ keyword, countryCode, statusTab, exportAll, requestedPage, pageSize, sortField, sortOrder, searchParams })
    : listRequests({ keyword, countryCode, statusTab, exportAll, requestedPage, pageSize, sortField, sortOrder, searchParams });
}

async function listRequests(options: {
  keyword?: string;
  countryCode?: string;
  statusTab: "draft" | "confirmed";
  exportAll: boolean;
  requestedPage: number;
  pageSize: number;
  sortField: string;
  sortOrder: "ASC" | "DESC";
  searchParams: URLSearchParams;
}): Promise<OrderListResult> {
  const params: Row = {};
  const keywordWhere = buildRequestKeywordWhere(options.keyword, params);
  const countryWhere = buildCountryWhere("req", options.countryCode, params);
  const columnFilters = buildRequestColumnFilters(options.searchParams, params);
  const confirmedCondition = "req.status IN ('待下单', '已下单')";
  const statusCondition = options.statusTab === "confirmed" ? confirmedCondition : `NOT (${confirmedCondition})`;
  const baseWhere = [keywordWhere, countryWhere, statusCondition, ...columnFilters].filter(Boolean).join(" AND ");
  const allWhereParts = [keywordWhere, countryWhere, ...columnFilters].filter(Boolean);
  const allWhere = allWhereParts.length ? `WHERE ${allWhereParts.join(" AND ")}` : "";
  // 采购进度：该需求单的明细里，已经进了采购订单的有几条（未下单 / 部分下单 / 全部下单）。
  const progressValues = getFilterValues(options.searchParams, "orderProgress");
  const progressHaving = progressValues.length ? `HAVING ${REQUEST_ORDER_PROGRESS_CASE} IN (:having_orderProgress)` : "";
  if (progressValues.length) params.having_orderProgress = progressValues;
  const [{ total }] = await queryRows<{ total: number }>(
    progressValues.length
      ? `SELECT COUNT(*) AS total FROM (
           SELECT req.requestNo
           FROM requests AS req
           LEFT JOIN requestitems AS ri ON ri.requestNo = req.requestNo
           LEFT JOIN purchaseorderitems AS poItem ON poItem.requestItemId = ri.id
           ${baseWhere ? `WHERE ${baseWhere}` : ""}
           ${REQUEST_GROUP_BY}
           ${progressHaving}
         ) AS groupedProgress`
      : `SELECT COUNT(*) AS total FROM requests AS req ${baseWhere ? `WHERE ${baseWhere}` : ""}`,
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
        UPPER(TRIM(SUBSTRING_INDEX(req.countryCode, '-', 1))) AS countryCode,
        req.contractNo,
        /**
         * 批次号取**明细批次**：一个需求单的多条明细可能分属不同批次。
         * 明细都有批次时按明细去重聚合（多批次显示成 "CL-1, CL-2"），
         * 明细没填才回落到主单的默认批次。
         */
        COALESCE(
          (SELECT GROUP_CONCAT(DISTINCT itemBatch.batchName ORDER BY itemBatch.batchName SEPARATOR ', ')
             FROM requestitems AS itemBatch
            WHERE itemBatch.requestNo = req.requestNo
              AND itemBatch.batchName IS NOT NULL AND itemBatch.batchName <> ''),
          req.batchName
        ) AS batchName,
        req.requestType,
        req.status,
        req.remoteStatus,
        req.remoteCancelledItemCount,
        req.createdByName,
        req.updatedByName,
        req.confirmedByName,
        COALESCE(SUM(ri.quantity), 0) AS totalQuantity,
        COUNT(DISTINCT ri.id) AS totalItemCount,
        COUNT(DISTINCT poItem.id) AS orderedItemCount,
        CONCAT(COUNT(DISTINCT poItem.id), '/', COUNT(DISTINCT ri.id)) AS orderProgress,
        DATE_FORMAT(req.plannedDeliveryDate, '%Y-%m-%d') AS plannedDeliveryDate,
        DATE_FORMAT(req.createdAt, '%Y-%m-%d %H:%i:%s') AS createdAt,
        DATE_FORMAT(req.updatedAt, '%Y-%m-%d %H:%i:%s') AS updatedAt
      FROM requests AS req
      LEFT JOIN requestitems AS ri ON ri.requestNo = req.requestNo
      LEFT JOIN purchaseorderitems AS poItem ON poItem.requestItemId = ri.id
      ${baseWhere ? `WHERE ${baseWhere}` : ""}
      ${REQUEST_GROUP_BY}
      ${progressHaving}
      ORDER BY ${getRequestOrderBy(options.sortField, options.sortOrder)}
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
  countryCode?: string;
  statusTab: "draft" | "confirmed";
  exportAll: boolean;
  requestedPage: number;
  pageSize: number;
  sortField: string;
  sortOrder: "ASC" | "DESC";
  searchParams: URLSearchParams;
}): Promise<OrderListResult> {
  const params: Row = {};
  const keywordWhere = buildPurchaseKeywordWhere(options.keyword, params);
  const countryWhere = buildPurchaseCountryWhere(options.countryCode, params);
  const columnFilters = buildPurchaseColumnFilters(options.searchParams, params);
  const confirmedCondition = "purchase.status LIKE '%确认%'";
  const statusCondition = options.statusTab === "confirmed" ? confirmedCondition : `NOT (${confirmedCondition})`;
  const baseWhere = [keywordWhere, countryWhere, statusCondition, ...columnFilters].filter(Boolean).join(" AND ");
  const allWhereParts = [keywordWhere, countryWhere, ...columnFilters].filter(Boolean);
  const allWhere = allWhereParts.length ? `WHERE ${allWhereParts.join(" AND ")}` : "";
  const [{ total }] = await queryRows<{ total: number }>(
    `
      SELECT COUNT(DISTINCT purchase.purchaseOrderId) AS total
      FROM purchaseorders AS purchase
      LEFT JOIN purchaseorderitems AS item ON item.poNo = purchase.poNo
      LEFT JOIN requestitems AS requestItem ON requestItem.id = item.requestItemId
      LEFT JOIN requests AS requestMaster ON requestMaster.requestNo = COALESCE(NULLIF(item.requestNo, ''), requestItem.requestNo, purchase.requestNo)
      LEFT JOIN merge_common_feishu_approvals paymentApproval ON paymentApproval.id = purchase.paymentApprovalId
      ${baseWhere ? `WHERE ${baseWhere}` : ""}
    `,
    params,
  );
  const [counts] = await queryRows<{ draft: number; confirmed: number }>(
    `
      SELECT
        COUNT(DISTINCT CASE WHEN ${confirmedCondition} THEN purchase.purchaseOrderId END) AS confirmed,
        COUNT(DISTINCT CASE WHEN ${confirmedCondition} THEN NULL ELSE purchase.purchaseOrderId END) AS draft
      FROM purchaseorders AS purchase
      LEFT JOIN purchaseorderitems AS item ON item.poNo = purchase.poNo
      LEFT JOIN requestitems AS requestItem ON requestItem.id = item.requestItemId
      LEFT JOIN requests AS requestMaster ON requestMaster.requestNo = COALESCE(NULLIF(item.requestNo, ''), requestItem.requestNo, purchase.requestNo)
      LEFT JOIN merge_common_feishu_approvals paymentApproval ON paymentApproval.id = purchase.paymentApprovalId
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
        purchase.requestNo,
        purchase.sourceRequestNos,
        GROUP_CONCAT(DISTINCT UPPER(TRIM(SUBSTRING_INDEX(requestMaster.countryCode, '-', 1))) ORDER BY UPPER(TRIM(SUBSTRING_INDEX(requestMaster.countryCode, '-', 1))) SEPARATOR ',') AS countryCode,
        GROUP_CONCAT(DISTINCT requestMaster.batchName ORDER BY
          CAST(SUBSTRING_INDEX(TRIM(COALESCE(requestMaster.batchName, '')), '-', -1) AS UNSIGNED) DESC,
          UPPER(SUBSTRING_INDEX(TRIM(COALESCE(requestMaster.batchName, '')), '-', 1)) ASC
          SEPARATOR ',') AS batchName,
        purchase.status,
        purchase.currency,
        purchase.invoiceNo,
        DATE_FORMAT(purchase.invoiceDate, '%Y-%m-%d') AS invoiceDate,
        purchase.invoiceStatus,
        DATE_FORMAT(purchase.paymentDate, '%Y-%m-%d') AS paymentDate,
        purchase.paymentStatus,
        paymentApproval.status AS paymentApprovalStatus,
        paymentApproval.serialNumber AS paymentApprovalNo,
        DATE_FORMAT(paymentApproval.paymentConfirmedAt, '%Y-%m-%d %H:%i') AS paymentConfirmedAt,
        DATE_FORMAT(purchase.paidAt, '%Y-%m-%d') AS paidAt,
        purchase.createdByName,
        purchase.updatedByName,
        purchase.confirmedByName,
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
      LEFT JOIN merge_common_feishu_approvals paymentApproval
        ON paymentApproval.id = purchase.paymentApprovalId
      ${baseWhere ? `WHERE ${baseWhere}` : ""}
      GROUP BY purchase.purchaseOrderId, purchase.poNo, purchase.requestNo, purchase.sourceRequestNos, purchase.status, purchase.currency,
        purchase.invoiceNo, purchase.invoiceDate, purchase.invoiceStatus, purchase.paymentDate, purchase.paymentStatus,
        purchase.paymentApprovalId, paymentApproval.status, paymentApproval.serialNumber, paymentApproval.paymentConfirmedAt, purchase.paidAt,
        purchase.createdByName, purchase.updatedByName, purchase.confirmedByName,
        purchase.createdAt, purchase.updatedAt
      ORDER BY ${getPurchaseOrderBy(options.sortField, options.sortOrder)}
      ${options.exportAll ? "" : "LIMIT :limit OFFSET :offset"}
    `,
    params,
  );

  // Load all sources for the page in one query. Do not use GROUP_CONCAT here:
  // its length limit or filters on joined lines can silently omit source numbers.
  const sourceItems = rows.length ? await queryRows<Row>(
    `SELECT sourceItem.poNo,
       COALESCE(NULLIF(sourceItem.requestNo, ''), sourceRequestItem.requestNo) AS requestNo
     FROM purchaseorderitems sourceItem
     LEFT JOIN requestitems sourceRequestItem ON sourceRequestItem.id = sourceItem.requestItemId
     WHERE sourceItem.poNo IN (:poNos)
     ORDER BY sourceItem.poNo, requestNo`,
    { poNos: rows.map((row) => row.poNo) },
  ) : [];
  const sourcesByPoNo = new Map<string, unknown[]>();
  for (const item of sourceItems) {
    const key = String(item.poNo);
    const sources = sourcesByPoNo.get(key) ?? [];
    sources.push(item.requestNo);
    sourcesByPoNo.set(key, sources);
  }

  return {
    rows: rows.map((row) => {
      const sourceRequestNos = getPurchaseSourceRequestNos(row, sourcesByPoNo.get(String(row.poNo)));
      return { ...row, requestNo: sourceRequestNos, sourceRequestNos };
    }),
    total: normalizedTotal,
    page,
    pageSize: options.pageSize,
    totalPages,
    statusCounts: { draft: Number(counts?.draft ?? 0), confirmed: Number(counts?.confirmed ?? 0) },
  };
}

export async function listOrderFilterOptions(searchParams: URLSearchParams) {
  const mode = searchParams.get("mode") === "purchase" ? "purchase" : "requests";
  const field = searchParams.get("field")?.trim() ?? "";
  const keyword = searchParams.get("keyword")?.trim() ?? "";
  const expressions: Record<string, string> = mode === "purchase"
    ? {
        poNo: "purchase.poNo",
        requestNo: "COALESCE(NULLIF(item.requestNo, ''), NULLIF(requestItem.requestNo, ''), NULLIF(purchase.sourceRequestNos, ''), purchase.requestNo, '')",
        countryCode: "UPPER(TRIM(SUBSTRING_INDEX(requestMaster.countryCode, '-', 1)))",
        batchName: "COALESCE(requestMaster.batchName, '')",
        status: "purchase.status",
        currency: "purchase.currency",
        invoiceNo: "purchase.invoiceNo",
        invoiceDate: formatTableDateExpression("purchase.invoiceDate"),
        invoiceStatus: "purchase.invoiceStatus",
        paymentDate: formatTableDateExpression("purchase.paymentDate"),
        paymentStatus: "purchase.paymentStatus",
        paymentApprovalStatus: "paymentApproval.status",
        paidAt: formatTableDateExpression("purchase.paidAt"),
        totalQuantity: "COALESCE((SELECT SUM(quantity) FROM requestitems quantityItem INNER JOIN purchaseorderitems quantityPurchaseItem ON quantityPurchaseItem.requestItemId = quantityItem.id WHERE quantityPurchaseItem.poNo = purchase.poNo), 0)",
        purchaseTotalAmount: "COALESCE((SELECT SUM(quantityAmountItem.quantity * COALESCE(amountPurchaseItem.unitPrice, COALESCE(amountPurchaseItem.taxExcludedUnitPrice, 0) + COALESCE(amountPurchaseItem.taxSurcharge, 0))) FROM purchaseorderitems amountPurchaseItem LEFT JOIN requestitems quantityAmountItem ON quantityAmountItem.id = amountPurchaseItem.requestItemId WHERE amountPurchaseItem.poNo = purchase.poNo), 0)",
        createdAt: formatTableDateExpression("purchase.createdAt"),
        updatedAt: formatTableDateExpression("purchase.updatedAt"),
      }
    : {
        requestNo: "req.requestNo",
        countryCode: "UPPER(TRIM(SUBSTRING_INDEX(req.countryCode, '-', 1)))",
        batchName: "req.batchName",
        status: "req.status",
        remoteStatus: "req.remoteStatus",
        requestType: "COALESCE(NULLIF(req.requestType, ''), '整机')",
        totalQuantity: "COALESCE((SELECT SUM(quantity) FROM requestitems quantityItem WHERE quantityItem.requestNo = req.requestNo), 0)",
        plannedDeliveryDate: formatTableDateExpression("req.plannedDeliveryDate"),
        createdAt: formatTableDateExpression("req.createdAt"),
        updatedAt: formatTableDateExpression("req.updatedAt"),
      };

  // 采购进度不在 expressions 里（它是聚合列），单独算候选值与数量。
  if (mode === "requests" && field === "orderProgress") {
    const progressParams: Row = {};
    const whereParts: string[] = [];
    const statusTabForProgress = searchParams.get("statusTab") === "confirmed" ? "confirmed" : "draft";
    const confirmedCondition = "req.status IN ('待下单', '已下单')";
    whereParts.push(statusTabForProgress === "confirmed" ? confirmedCondition : `NOT (${confirmedCondition})`);
    const countryCode = normalizeCountryCode(searchParams.get("countryCode"));
    if (countryCode) whereParts.push(buildCountryWhere("req", countryCode, progressParams));
    for (const [candidateField, candidateExpression] of Object.entries(expressions)) {
      const values = getFilterValues(searchParams, candidateField);
      if (!values.length) continue;
      progressParams[`option_${candidateField}`] = values;
      whereParts.push(`${candidateExpression} IN (:option_${candidateField})`);
    }
    const keywordValue = searchParams.get("keyword")?.trim() ?? "";
    if (keywordValue) progressParams.optionKeyword = `%${keywordValue}%`;
    const progressRows = await queryRows<{ value: string; count: number }>(
      `SELECT progressList.value AS value, COUNT(*) AS count FROM (
         SELECT ${REQUEST_ORDER_PROGRESS_CASE} AS value
         FROM requests AS req
         LEFT JOIN requestitems AS ri ON ri.requestNo = req.requestNo
         LEFT JOIN purchaseorderitems AS poItem ON poItem.requestItemId = ri.id
         WHERE ${whereParts.join(" AND ")}
         GROUP BY req.requestNo
       ) AS progressList
       WHERE 1 = 1 ${keywordValue ? "AND progressList.value LIKE :optionKeyword" : ""}
       GROUP BY progressList.value
       ORDER BY FIELD(progressList.value, '未下单', '部分下单', '全部下单')`,
      progressParams,
    );
    return { options: progressRows.map((row) => ({ value: String(row.value ?? ""), count: Number(row.count ?? 0) })) };
  }

  /**
   * 批次号候选值：明细批次 ∪ 主单默认批次。
   * 一个需求单可能有多条明细分属不同批次，只列主单值会漏掉明细上的其它批次。
   */
  if (mode === "requests" && field === "batchName") {
    const batchParams: Row = {};
    const batchWhere: string[] = [];
    const statusTabForBatch = searchParams.get("statusTab") === "confirmed" ? "confirmed" : "draft";
    const batchConfirmed = "req.status IN ('待下单', '已下单')";
    batchWhere.push(statusTabForBatch === "confirmed" ? batchConfirmed : `NOT (${batchConfirmed})`);
    const batchCountry = normalizeCountryCode(searchParams.get("countryCode"));
    if (batchCountry) batchWhere.push(buildCountryWhere("req", batchCountry, batchParams));
    const batchKeyword = searchParams.get("keyword")?.trim() ?? "";
    if (batchKeyword) batchParams.optionKeyword = `%${batchKeyword}%`;
    const rows = await queryRows<{ value: string; count: number }>(
      `SELECT batchList.value AS value, COUNT(*) AS count FROM (
         SELECT itemBatch.batchName AS value
           FROM requestitems AS itemBatch
           INNER JOIN requests AS req ON req.requestNo = itemBatch.requestNo
          WHERE itemBatch.batchName IS NOT NULL AND itemBatch.batchName <> ''
            AND ${batchWhere.join(" AND ")}
         UNION
         SELECT req.batchName AS value
           FROM requests AS req
          WHERE req.batchName IS NOT NULL AND req.batchName <> ''
            AND ${batchWhere.join(" AND ")}
       ) AS batchList
       WHERE 1 = 1 ${batchKeyword ? "AND batchList.value LIKE :optionKeyword" : ""}
       GROUP BY batchList.value
       ORDER BY CASE WHEN TRIM(batchList.value) REGEXP '^[A-Za-z]+[[:space:]]*-[[:space:]]*[0-9]+$' THEN 0 ELSE 1 END ASC,
                UPPER(TRIM(SUBSTRING_INDEX(TRIM(batchList.value), '-', 1))) ASC,
                CAST(SUBSTRING_INDEX(TRIM(batchList.value), '-', -1) AS UNSIGNED) ASC,
                batchList.value ASC
       LIMIT 500`,
      batchParams,
    );
    return { options: rows.map((row) => ({ value: String(row.value ?? ""), count: Number(row.count ?? 0) })) };
  }

  const expression = expressions[field];
  if (!expression) return { options: [] as Array<{ value: string; count: number }> };

  const params: Row = {};
  const innerWhere: string[] = [];
  const statusTab = searchParams.get("statusTab") === "confirmed" ? "confirmed" : "draft";
  if (mode === "purchase") {
    const confirmed = "purchase.status LIKE '%确认%'";
    innerWhere.push(statusTab === "confirmed" ? confirmed : `NOT (${confirmed})`);
    const countryCode = normalizeCountryCode(searchParams.get("countryCode"));
    if (countryCode && field !== "countryCode") {
      innerWhere.push(buildPurchaseCountryWhere(countryCode, params));
    }
  } else {
    const confirmed = "req.status IN ('待下单', '已下单')";
    innerWhere.push(statusTab === "confirmed" ? confirmed : `NOT (${confirmed})`);
    const countryCode = normalizeCountryCode(searchParams.get("countryCode"));
    if (countryCode && field !== "countryCode") innerWhere.push(buildCountryWhere("req", countryCode, params));
  }

  const columnConditions: string[] = [];
  for (const [candidateField, candidateExpression] of Object.entries(expressions)) {
    if (candidateField === field) continue;
    const values = getFilterValues(searchParams, candidateField);
    if (!values.length) continue;
    const name = `option_${candidateField}`;
    if (mode === "purchase" && candidateField === "requestNo") {
      innerWhere.push(buildPurchaseSourceRequestFilter(values, params, name));
      continue;
    }
    params[name] = values;
    columnConditions.push(`valuesList.\`${candidateField}\` IN (:${name})`);
  }
  const selectColumns = Object.entries(expressions).map(([candidateField, candidateExpression]) => `${candidateExpression} AS \`${candidateField}\``).join(", ");
  if (keyword) params.optionKeyword = `%${keyword}%`;
  const currentValue = `valuesList.\`${field}\``;
  const outerWhere = [`${currentValue} IS NOT NULL`, `TRIM(CAST(${currentValue} AS CHAR)) <> ''`, keyword ? `${currentValue} LIKE :optionKeyword` : "", ...columnConditions].filter(Boolean).join(" AND ");
  const from = mode === "purchase"
    ? `FROM purchaseorders purchase
       LEFT JOIN purchaseorderitems item ON item.poNo = purchase.poNo
       LEFT JOIN requestitems requestItem ON requestItem.id = item.requestItemId
       LEFT JOIN requests requestMaster ON requestMaster.requestNo = COALESCE(NULLIF(item.requestNo, ''), requestItem.requestNo, NULLIF(purchase.requestNo, ''))
       LEFT JOIN merge_common_feishu_approvals paymentApproval ON paymentApproval.id = purchase.paymentApprovalId`
    : `FROM requests req`;
  const identity = mode === "purchase" ? "purchase.purchaseOrderId" : "req.requestNo";
  const rows = await queryRows<{ value: string; count: number }>(
    `SELECT valuesList.\`${field}\` AS value, COUNT(DISTINCT identityKey) AS count FROM (
       SELECT ${identity} AS identityKey, ${selectColumns}
       ${from}
       ${innerWhere.length ? `WHERE ${innerWhere.join(" AND ")}` : ""}
       GROUP BY identityKey, ${Object.keys(expressions).map((key) => `\`${key}\``).join(", ")}
     ) valuesList
     WHERE ${outerWhere}
     GROUP BY valuesList.\`${field}\`
     ORDER BY ${field === "batchName" ? `CASE WHEN TRIM(COALESCE(value, '')) REGEXP '^[A-Za-z]+[[:space:]]*-[[:space:]]*[0-9]+$' THEN 0 ELSE 1 END ASC, UPPER(TRIM(SUBSTRING_INDEX(TRIM(COALESCE(value, '')), '-', 1))) ASC, CAST(SUBSTRING_INDEX(TRIM(COALESCE(value, '')), '-', -1) AS UNSIGNED) ASC, value ASC` : "value ASC"}
     LIMIT 500`,
    params,
  );
  return { options: rows.map((row) => ({ value: String(row.value ?? ""), count: Number(row.count ?? 0) })) };
}

function normalizeCountryCode(value: string | null) {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  return text.split(/\s*-\s*/, 1)[0].trim() || undefined;
}

function buildCountryWhere(alias: string, countryCode: string | undefined, params: Row) {
  if (!countryCode) return "";
  params.countryCode = countryCode;
  return `UPPER(TRIM(SUBSTRING_INDEX(${alias}.countryCode, '-', 1))) = UPPER(:countryCode)`;
}

function buildPurchaseCountryWhere(countryCode: string | string[] | undefined, params: Row, parameterName = "countryCode") {
  if (!countryCode || (Array.isArray(countryCode) && !countryCode.length)) return "";
  const values = (Array.isArray(countryCode) ? countryCode : [countryCode])
    .map((value) => normalizeCountryCode(String(value)))
    .filter(Boolean);
  if (!values.length) return "";
  params[parameterName] = values;
  return `EXISTS (
    SELECT 1
    FROM purchaseorderitems AS countryItem
    LEFT JOIN requestitems AS countryRequestItem ON countryRequestItem.id = countryItem.requestItemId
    LEFT JOIN requests AS countryRequest
      ON countryRequest.requestNo = COALESCE(NULLIF(countryItem.requestNo, ''), countryRequestItem.requestNo, NULLIF(purchase.requestNo, ''))
    WHERE countryItem.poNo = purchase.poNo
      AND UPPER(TRIM(SUBSTRING_INDEX(countryRequest.countryCode, '-', 1))) IN (:${parameterName})
  )`;
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
        AND (searchItem.requestNo LIKE :keyword OR searchRequestItem.requestNo LIKE :keyword OR searchRequestItem.deviceCode LIKE :keyword OR searchRequest.batchName LIKE :keyword)
    )
  )`;
}

function getRequestOrderBy(sortField: string, sortOrder: "ASC" | "DESC") {
  const direction = sortOrder === "ASC" ? "ASC" : "DESC";
  const expressions: Record<string, string> = {
    requestNo: "req.requestNo",
    countryCode: "UPPER(TRIM(SUBSTRING_INDEX(req.countryCode, '-', 1)))",
    /**
     * 批次排序按明细批次（与 SELECT 口径一致）。
     * 注意必须写完整表达式：列别名也叫 batchName，而明细表里也有同名列，写裸别名 MySQL 会报 ambiguous。
     */
    batchName: REQUEST_BATCH_SORT,
    requestType: "req.requestType",
    status: "req.status",
    remoteStatus: "req.remoteStatus",
    orderProgress: "CASE WHEN COUNT(DISTINCT poItem.id) = 0 THEN 0 WHEN COUNT(DISTINCT poItem.id) < COUNT(DISTINCT ri.id) THEN 1 ELSE 2 END",
    plannedDeliveryDate: "req.plannedDeliveryDate",
    totalQuantity: "totalQuantity",
    createdAt: "req.createdAt",
    updatedAt: "req.updatedAt",
  };
  if (sortField === "batchName") return getNaturalBatchSort(expressions.batchName, direction, "req.createdAt DESC");
  return expressions[sortField] ? `${expressions[sortField]} ${direction}, req.createdAt DESC` : `CASE WHEN TRIM(${REQUEST_BATCH_SORT}) REGEXP '^[A-Za-z]+-[0-9]+$' THEN 0 ELSE 1 END ASC, CAST(SUBSTRING_INDEX(TRIM(${REQUEST_BATCH_SORT}), '-', -1) AS UNSIGNED) DESC, UPPER(SUBSTRING_INDEX(TRIM(${REQUEST_BATCH_SORT}), '-', 1)) ASC, req.createdAt DESC`;
}

function getPurchaseOrderBy(sortField: string, sortOrder: "ASC" | "DESC") {
  const direction = sortOrder === "ASC" ? "ASC" : "DESC";
  const expressions: Record<string, string> = {
    poNo: "purchase.poNo",
    requestNo: "COALESCE(NULLIF(purchase.sourceRequestNos, ''), purchase.requestNo)",
    countryCode: "countryCode",
    batchName: "batchName",
    status: "purchase.status",
    currency: "purchase.currency",
    invoiceNo: "purchase.invoiceNo",
    invoiceDate: formatTableDateExpression("purchase.invoiceDate"),
    invoiceStatus: "purchase.invoiceStatus",
    paymentDate: formatTableDateExpression("purchase.paymentDate"),
    paymentStatus: "purchase.paymentStatus",
    paidAt: formatTableDateExpression("purchase.paidAt"),
    totalQuantity: "totalQuantity",
    purchaseTotalAmount: "purchaseTotalAmount",
    createdAt: "purchase.createdAt",
    updatedAt: "purchase.updatedAt",
  };
  if (sortField === "batchName") {
    const batchNameExpression = `SUBSTRING_INDEX(GROUP_CONCAT(DISTINCT requestMaster.batchName ORDER BY
      CAST(SUBSTRING_INDEX(TRIM(COALESCE(requestMaster.batchName, '')), '-', -1) AS UNSIGNED) DESC,
      UPPER(TRIM(SUBSTRING_INDEX(TRIM(COALESCE(requestMaster.batchName, '')), '-', 1))) ASC
      SEPARATOR ','), ',', 1)`;
    return getNaturalBatchSort(batchNameExpression, direction, "purchase.createdAt DESC");
  }
  return expressions[sortField] ? `${expressions[sortField]} ${direction}, purchase.createdAt DESC` : `MAX(CASE WHEN TRIM(COALESCE(requestMaster.batchName, '')) REGEXP '^[A-Za-z]+-[0-9]+$' THEN 0 ELSE 1 END) ASC, MAX(CASE WHEN TRIM(COALESCE(requestMaster.batchName, '')) REGEXP '^[A-Za-z]+-[0-9]+$' THEN CAST(SUBSTRING_INDEX(TRIM(requestMaster.batchName), '-', -1) AS UNSIGNED) ELSE -1 END) DESC, MIN(UPPER(SUBSTRING_INDEX(TRIM(COALESCE(requestMaster.batchName, '')), '-', 1))) ASC, purchase.createdAt DESC`;
}

function getFilterValues(searchParams: URLSearchParams, field: string) {
  return Array.from(new Set(searchParams.getAll(`filter.${field}`).map((value) => value.trim()).filter(Boolean)));
}

function buildInFilter(field: string, values: string[], params: Row, name: string) {
  if (!values.length) return "";
  params[name] = values;
  return `${field} IN (:${name})`;
}

function buildRequestColumnFilters(searchParams: URLSearchParams, params: Row) {
  const mappings: Record<string, string> = {
    requestNo: "req.requestNo",
    countryCode: "req.countryCode",
    status: "req.status",
    remoteStatus: "req.remoteStatus",
    requestType: "COALESCE(NULLIF(req.requestType, ''), '整机')",
    totalQuantity: "COALESCE((SELECT SUM(quantity) FROM requestitems quantityItem WHERE quantityItem.requestNo = req.requestNo), 0)",
    plannedDeliveryDate: formatTableDateExpression("req.plannedDeliveryDate"),
    createdAt: formatTableDateExpression("req.createdAt"),
    updatedAt: formatTableDateExpression("req.updatedAt"),
  };
  const filters = Object.entries(mappings)
    .map(([field, expression]) => buildInFilter(expression, getFilterValues(searchParams, field), params, `column_${field}`))
    .filter(Boolean);
  /**
   * 批次号筛选：主单默认批次命中，**或该需求单任意一条明细的批次命中**。
   * 一个需求单可能有多个批次，只按主单值筛会漏掉明细上的其它批次。
   */
  const batchNames = getFilterValues(searchParams, "batchName");
  if (batchNames.length) {
    params.column_batchName = batchNames;
    filters.push(`(req.batchName IN (:column_batchName) OR EXISTS (
      SELECT 1 FROM requestitems AS batchFilter
       WHERE batchFilter.requestNo = req.requestNo AND batchFilter.batchName IN (:column_batchName)))`);
  }
  return filters;
}

function buildPurchaseColumnFilters(searchParams: URLSearchParams, params: Row) {
  const filters: string[] = [];
  const countryCodes = getFilterValues(searchParams, "countryCode");
  if (countryCodes.length) filters.push(buildPurchaseCountryWhere(countryCodes, params, "column_countryCode"));
  for (const [field, expression] of [
    ["poNo", "purchase.poNo"], ["status", "purchase.status"], ["currency", "purchase.currency"],
    ["invoiceNo", "purchase.invoiceNo"], ["invoiceDate", formatTableDateExpression("purchase.invoiceDate")],
    ["invoiceStatus", "purchase.invoiceStatus"], ["paymentDate", formatTableDateExpression("purchase.paymentDate")],
    ["paymentStatus", "purchase.paymentStatus"], ["paymentApprovalStatus", "paymentApproval.status"], ["paidAt", formatTableDateExpression("purchase.paidAt")],
    ["totalQuantity", "COALESCE((SELECT SUM(quantity) FROM requestitems quantityItem INNER JOIN purchaseorderitems quantityPurchaseItem ON quantityPurchaseItem.requestItemId = quantityItem.id WHERE quantityPurchaseItem.poNo = purchase.poNo), 0)"],
    ["purchaseTotalAmount", "COALESCE((SELECT SUM(quantityAmountItem.quantity * COALESCE(amountPurchaseItem.unitPrice, COALESCE(amountPurchaseItem.taxExcludedUnitPrice, 0) + COALESCE(amountPurchaseItem.taxSurcharge, 0))) FROM purchaseorderitems amountPurchaseItem LEFT JOIN requestitems quantityAmountItem ON quantityAmountItem.id = amountPurchaseItem.requestItemId WHERE amountPurchaseItem.poNo = purchase.poNo), 0)"],
    ["createdAt", formatTableDateExpression("purchase.createdAt")], ["updatedAt", formatTableDateExpression("purchase.updatedAt")],
  ] as const) {
    const filter = buildInFilter(expression, getFilterValues(searchParams, field), params, `column_${field}`);
    if (filter) filters.push(filter);
  }
  const requestNos = getFilterValues(searchParams, "requestNo");
  if (requestNos.length) {
    filters.push(buildPurchaseSourceRequestFilter(requestNos, params, "column_requestNo"));
  }
  const batchNames = getFilterValues(searchParams, "batchName");
  if (batchNames.length) {
    params.column_batchName = batchNames;
    filters.push("requestMaster.batchName IN (:column_batchName)");
  }
  return filters;
}
