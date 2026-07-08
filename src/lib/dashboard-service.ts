import { queryRows, type Row } from "./db";
import {
  aggregateNewInstancesByCountryMonth,
  aggregateServiceFeesByCountryMonthCurrency,
  type DashboardNewInstanceSource,
  type DashboardServiceFeeSource,
} from "./dashboard-workflow";
import { isConfirmedOrderStatus } from "./order-status";

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
      INNER JOIN purchaseorders po ON po.poNo = poi.poNo
      LEFT JOIN requestitems ri ON ri.id = poi.requestItemId
      LEFT JOIN requests req ON req.requestNo = COALESCE(po.requestNo, ri.requestNo)
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
        INNER JOIN purchaseorders po ON po.poNo = poi.poNo
        LEFT JOIN requestitems ri ON ri.id = poi.requestItemId
        LEFT JOIN requests req ON req.requestNo = COALESCE(po.requestNo, ri.requestNo)
        WHERE req.countryCode IS NOT NULL AND req.countryCode <> ''
      ) countries
      ORDER BY countryCode
    `,
  );

  return rows.map((row) => row.countryCode);
}
