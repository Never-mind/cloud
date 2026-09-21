import { queryRows, type Row } from "./db";
import {
  aggregateNewInstancesByCountryMonth,
  aggregateServiceFeesByCountryMonthCurrency,
  type DashboardNewInstanceSource,
  type DashboardServiceFeeSource,
} from "./dashboard-workflow";
import { isConfirmedOrderStatus } from "./order-status";

/**
 * 首页分域指标。
 *
 * 首页原来只统计算力系统（服务费 + 新增实例）。这里补上集采与华为云两个域的核心指标，
 * 口径优先复用各模块已有的表与汇总方式，保证首页与模块列表数字一致。
 * 华为云的应收/应付直接按对账表求和（与对账页"按币种合计"的 USD 段同源）。
 */
async function loadDomainPortfolio() {
  const [poRows, cloudRows] = await Promise.all([
    queryRows<Row>(
      `SELECT
         (SELECT COUNT(*) FROM merge_po_customer_pos) AS customerPoCount,
         (SELECT COUNT(*) FROM merge_po_quotations) AS quotationCount,
         (SELECT COUNT(*) FROM merge_po_settlement_projects) AS settlementProjectCount`,
    ),
    queryRows<Row>(
      `SELECT COUNT(*) AS cloudRowCount,
              COALESCE(SUM(COALESCE(customerReceivableTotalAmount, customerReceivable, 0)), 0) AS receivableUsd,
              COALESCE(SUM(COALESCE(supplierPayableTotalAmount, 0)), 0) AS payableUsd
         FROM merge_cloud_rows`,
    ),
  ]);
  const po = poRows[0] ?? {};
  const cloud = cloudRows[0] ?? {};
  return {
    po: {
      customerPoCount: Number(po.customerPoCount ?? 0),
      quotationCount: Number(po.quotationCount ?? 0),
      settlementProjectCount: Number(po.settlementProjectCount ?? 0),
    },
    cloud: {
      cloudRowCount: Number(cloud.cloudRowCount ?? 0),
      receivableUsd: Number(cloud.receivableUsd ?? 0),
      payableUsd: Number(cloud.payableUsd ?? 0),
    },
  };
}

export async function getDashboardOverview(searchParams: URLSearchParams) {
  const countryCode = searchParams.get("countryCode")?.trim() || "";
  const [serviceFeeRows, newInstanceRows, countries] = await Promise.all([
    listServiceFeeRows(countryCode),
    listNewInstanceRows(countryCode),
    listDashboardCountries(),
  ]);

  return {
    countries,
    serviceFees: aggregateServiceFeesByCountryMonthCurrency(serviceFeeRows),
    newInstances: aggregateNewInstancesByCountryMonth(newInstanceRows),
    portfolio: await loadDomainPortfolio(),
  };
}

async function listServiceFeeRows(countryCode: string) {
  const params: Row = {};
  const where = countryCode ? "WHERE countryCode = :countryCode" : "";
  if (countryCode) params.countryCode = countryCode;

  return queryRows<DashboardServiceFeeSource>(
    `
      SELECT
        DATE_FORMAT(writeOffMonth, '%Y-%m-%d') AS writeOffMonth,
        countryCode,
        currency,
        billingCurrency,
        prepaymentCurrency,
        serviceFeeAmount
      FROM servicefeesnapshotitems
      ${where}
      ORDER BY writeOffMonth DESC, countryCode, currency
    `,
    params,
  );
}

async function listNewInstanceRows(countryCode: string) {
  const params: Row = {
    confirmedStatus: "已确认",
    legacyConfirmedStatus: "宸茬‘璁?",
    orderedStatus: "已下单",
    legacyOrderedStatus: "宸蹭笅鍗?",
  };
  const countryWhere = countryCode ? "AND req.countryCode = :countryCode" : "";
  if (countryCode) params.countryCode = countryCode;

  const rows = await queryRows<DashboardNewInstanceSource & { purchaseStatus?: string | null; requestStatus?: string | null }>(
    `
      SELECT
        DATE_FORMAT(COALESCE(po.releasedAt, po.updatedAt, po.createdAt), '%Y-%m-%d') AS monthSource,
        req.countryCode,
        ri.quantity,
        po.status AS purchaseStatus,
        req.status AS requestStatus
      FROM purchaseorderitems poi
      INNER JOIN purchaseorders po ON po.purchaseOrderId = poi.purchaseOrderId OR (poi.purchaseOrderId IS NULL AND po.poNo = poi.poNo)
      LEFT JOIN requestitems ri ON ri.id = poi.requestItemId
      LEFT JOIN requests req ON req.requestNo = COALESCE(poi.requestNo, po.requestNo, ri.requestNo)
      WHERE po.status IN (:confirmedStatus, :legacyConfirmedStatus)
        AND req.status IN (:orderedStatus, :legacyOrderedStatus)
        ${countryWhere}
      ORDER BY monthSource DESC, req.countryCode
    `,
    params,
  );

  return rows.filter(
    (row) =>
      isConfirmedOrderStatus("purchase", row.purchaseStatus) &&
      isConfirmedOrderStatus("requests", row.requestStatus),
  );
}

async function listDashboardCountries() {
  const rows = await queryRows<{ countryCode: string }>(
    `
      SELECT countryCode
      FROM (
        SELECT countryCode FROM servicefeesnapshotitems WHERE countryCode IS NOT NULL AND countryCode <> ''
        UNION
        SELECT req.countryCode
        FROM purchaseorderitems poi
        INNER JOIN purchaseorders po ON po.purchaseOrderId = poi.purchaseOrderId OR (poi.purchaseOrderId IS NULL AND po.poNo = poi.poNo)
        LEFT JOIN requestitems ri ON ri.id = poi.requestItemId
        LEFT JOIN requests req ON req.requestNo = COALESCE(poi.requestNo, po.requestNo, ri.requestNo)
        WHERE req.countryCode IS NOT NULL AND req.countryCode <> ''
      ) countries
      ORDER BY countryCode
    `,
  );

  return rows.map((row) => row.countryCode);
}
