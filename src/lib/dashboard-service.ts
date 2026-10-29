import { queryRows, type Row } from "./db";
import {
  aggregateNewInstancesByCountryMonth,
  aggregateServiceFeesByCountryMonthCurrency,
  aggregateCloudFinancials,
  normalizeDashboardMonth,
  type DashboardCloudSource,
  type DashboardNewInstanceSource,
  type DashboardServiceFeeSource,
} from "./dashboard-workflow";
import { isConfirmedOrderStatus } from "./order-status";
import { buildExchangeRateMap, lookupExchangeRate } from "./exchange-rate-service";

/** 项目结算的五个阶段，与 `settlement-project-service` 里的状态码保持一致。 */
const PO_SETTLEMENT_STATUSES = ["purchasing", "procurement_completed", "accepting", "acceptance_completed", "closed"] as const;

/**
 * 首页分域指标。
 *
 * 首页原来只统计算力系统（服务费 + 新增实例）。这里补上集采与华为云两个域的核心指标，
 * 口径优先复用各模块已有的表与汇总方式，保证首页与模块列表数字一致。
 * 华为云的应收/应付直接按对账表求和（与对账页"按币种合计"的 USD 段同源）。
 */
async function loadDomainPortfolio() {
  const [poRows, cloudRows, poStatusRows, poCustomerRows, cloudFinancialRows, pipelineRows] = await Promise.all([
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
    queryRows<Row>(
      `SELECT status, COUNT(*) AS rowCount,
              COALESCE(SUM(COALESCE(quotedSalesRevenueUsd, 0)), 0) AS quotedUsd
         FROM merge_po_settlement_projects
        GROUP BY status`,
    ),
    // 客户项目金额：本地可能只有一两个客户，生产会逐步变多，结构按金额降序。
    queryRows<Row>(
      `SELECT COALESCE(NULLIF(customerName, ''), '（未填客户）') AS customer,
              COUNT(*) AS projectCount,
              COALESCE(SUM(COALESCE(quotedSalesRevenueUsd, 0)), 0) AS quotedUsd,
              COALESCE(SUM(COALESCE(receivedRevenueUsd, 0)), 0) AS receivedUsd
         FROM merge_po_settlement_projects
        GROUP BY customer
        ORDER BY quotedUsd DESC`,
    ),
    // 名称与对账列表一致；在纯函数中统一账期、合并同一客户的多个账号。
    queryRows<DashboardCloudSource>(
      `SELECT r.period, r.customerId,
              COALESCE(
                (SELECT COALESCE(NULLIF(c.shortName, ''), NULLIF(c.nameCn, ''), NULLIF(c.name, ''), NULLIF(c.customerCode, ''))
                   FROM merge_common_customers c
                  WHERE c.customerId = r.customerId OR c.customerCode = r.customerId LIMIT 1),
                NULLIF(r.customer, ''), NULLIF(r.customerId, '')) AS customer,
              r.customerReceivableNetAmount, r.customerReceivable,
              r.settlementGrossProfit, r.grossProfit
         FROM merge_cloud_rows r
        ORDER BY r.period, r.customer`,
    ),
    /**
     * 集采售前两个环节的「当前数量」：
     *   - 客户询价中 = 客户PO 草稿（还没确认）；
     *   - 报价中 = 报价单草稿；
     *   - 报价确认（待立项）= 已确认、但还没生成项目结算的报价单。
     * 改版后确认报价单不再自动建项目，所以「待立项」是一个真实的停留阶段。
     */
    queryRows<Row>(
      `SELECT
         (SELECT COUNT(*) FROM merge_po_customer_pos WHERE COALESCE(status, 'draft') <> 'confirmed') AS customerPoDraft,
         (SELECT COUNT(*) FROM merge_po_quotations WHERE status = 'draft') AS quotationDraft,
         (SELECT COALESCE(SUM(COALESCE(totalAmount, 0)), 0) FROM merge_po_quotations WHERE status = 'draft') AS quotationDraftAmount,
         (SELECT COUNT(*) FROM merge_po_quotations q WHERE q.status = 'confirmed'
            AND NOT EXISTS (SELECT 1 FROM merge_po_settlement_projects sp WHERE sp.quotationId = q.id)) AS quotationPendingProject,
         (SELECT COALESCE(SUM(COALESCE(totalAmount, 0)), 0) FROM merge_po_quotations q WHERE q.status = 'confirmed'
            AND NOT EXISTS (SELECT 1 FROM merge_po_settlement_projects sp WHERE sp.quotationId = q.id)) AS quotationPendingProjectAmount,
         (SELECT COUNT(*) FROM merge_po_quotations WHERE status = 'confirmed') AS quotationConfirmed`,
    ),
  ]);
  const po = poRows[0] ?? {};
  const pipeline = pipelineRows[0] ?? {};
  const cloud = cloudRows[0] ?? {};
  // 五个状态固定给出，缺的补 0，前端按流程顺序展示。
  const statusCounts: Record<(typeof PO_SETTLEMENT_STATUSES)[number], number> = {
    purchasing: 0,
    procurement_completed: 0,
    accepting: 0,
    acceptance_completed: 0,
    closed: 0,
  };
  for (const row of poStatusRows) {
    const status = String(row.status ?? "") as (typeof PO_SETTLEMENT_STATUSES)[number];
    if (status in statusCounts) statusCounts[status] = Number(row.rowCount ?? 0);
  }
  const statusAmounts: Record<string, number> = {};
  for (const row of poStatusRows) {
    statusAmounts[String(row.status ?? "")] = Number(row.quotedUsd ?? 0);
  }
  const poByCustomer = poCustomerRows.map((row) => ({
    customer: String(row.customer ?? ""),
    projectCount: Number(row.projectCount ?? 0),
    quotedUsd: Number(row.quotedUsd ?? 0),
    receivedUsd: Number(row.receivedUsd ?? 0),
  }));
  return {
    po: {
      customerPoCount: Number(po.customerPoCount ?? 0),
      quotationCount: Number(po.quotationCount ?? 0),
      settlementProjectCount: Number(po.settlementProjectCount ?? 0),
      statusCounts,
      statusAmounts,
      /** 售前三个环节的当前数量与金额（首页 8 格卡片用）。 */
      pipeline: {
        customerPoDraft: Number(pipeline.customerPoDraft ?? 0),
        quotationDraft: Number(pipeline.quotationDraft ?? 0),
        quotationDraftAmount: Number(pipeline.quotationDraftAmount ?? 0),
        quotationPendingProject: Number(pipeline.quotationPendingProject ?? 0),
        quotationPendingProjectAmount: Number(pipeline.quotationPendingProjectAmount ?? 0),
        quotationConfirmed: Number(pipeline.quotationConfirmed ?? 0),
      },
      byCustomer: poByCustomer,
      quotedUsdTotal: poByCustomer.reduce((sum, row) => sum + row.quotedUsd, 0),
      receivedUsdTotal: poByCustomer.reduce((sum, row) => sum + row.receivedUsd, 0),
    },
    cloud: {
      cloudRowCount: Number(cloud.cloudRowCount ?? 0),
      receivableUsd: Number(cloud.receivableUsd ?? 0),
      payableUsd: Number(cloud.payableUsd ?? 0),
      financials: aggregateCloudFinancials(cloudFinancialRows),
    },
  };
}

export async function getDashboardOverview(searchParams: URLSearchParams) {
  const countryCode = searchParams.get("countryCode")?.trim() || "";
  const [serviceFeeRows, newInstanceRows, countries, instanceReceiptRows] = await Promise.all([
    listServiceFeeRows(countryCode),
    listNewInstanceRows(countryCode),
    listDashboardCountries(),
    listInstanceReceiptRows(countryCode),
  ]);

  const rates = await buildExchangeRateMap(serviceFeeRows
    .filter((row) => String(row.countryCode ?? "").trim().toUpperCase() === "BR")
    .map((row) => normalizeDashboardMonth(row.writeOffMonth)));
  return {
    countries,
    serviceFees: aggregateServiceFeesByCountryMonthCurrency(serviceFeeRows, (month, source, target) => lookupExchangeRate(rates, month, source, target)),
    newInstances: aggregateNewInstancesByCountryMonth(newInstanceRows),
    instanceReceipt: instanceReceiptRows,
    portfolio: await loadDomainPortfolio(),
  };
}

/**
 * 首页「设备签收情况」两个饼图的数据源。
 *
 * 口径（按业务确认）：
 *   - 范围：**全部历史、已生成物流**的已确认需求明细，草稿及尚未生成物流的不计；
 *   - 类型：只统计**设备（Equipment）**的实例型号，配件/组件不计；
 *   - 单位：**设备台数**，取需求明细的数量（一个实例 16 台即算 16 台）；
 *   - 签收：该明细关联的物流派送时间有值算已签收，已有物流但派送时间为空算未签收
 *     （与物流列表「是否签收」同一口径）；
 *   - 分组：按需求单国家 × 签收状态。
 */
async function listInstanceReceiptRows(countryCode: string) {
  const params: Row = {};
  const countryWhere = countryCode ? "AND req.countryCode = :countryCode" : "";
  if (countryCode) params.countryCode = countryCode;
  // 物流表没有国家字段：经采购明细回查来源需求单取国家（与采购订单/物流列表同一口径）。
  // 签收判定用 EXISTS 子查询：同一需求明细对应多条物流时不会把台数放大。
  const rows = await queryRows<{
    countryCode: string | null;
    requestStatus: string | null;
    quantity: number | null;
    receivedFlag: number | null;
  }>(
    `
      SELECT UPPER(TRIM(SUBSTRING_INDEX(req.countryCode, '-', 1))) AS countryCode,
             req.status AS requestStatus,
             ri.quantity AS quantity,
             CASE WHEN EXISTS (
                    SELECT 1
                      FROM purchaseorderitems poi
                      JOIN shipments s ON s.purchaseOrderItemId = poi.id
                     WHERE poi.requestItemId = ri.id
                       AND s.deliveredAt IS NOT NULL
                  ) THEN 1 ELSE 0 END AS receivedFlag
        FROM requestitems ri
        JOIN requests req ON req.requestNo = ri.requestNo
        LEFT JOIN instancemodels im ON im.deviceCode = ri.deviceCode
       WHERE COALESCE(NULLIF(im.instanceType, ''), 'Equipment') = 'Equipment'
         AND EXISTS (
               SELECT 1
                 FROM purchaseorderitems poi
                 JOIN shipments s ON s.purchaseOrderItemId = poi.id
                WHERE poi.requestItemId = ri.id
             )
         ${countryWhere}
    `,
    params,
  );

  // 已确认（待下单/已下单）的需求单才算真实业务，草稿单不计入。
  const buckets = new Map<string, { received: number; unreceived: number }>();
  for (const row of rows) {
    if (!isConfirmedOrderStatus("requests", row.requestStatus)) continue;
    const key = String(row.countryCode ?? "").trim();
    const bucket = buckets.get(key) ?? { received: 0, unreceived: 0 };
    const quantity = Number(row.quantity ?? 0);
    if (Number(row.receivedFlag ?? 0) > 0) bucket.received += quantity;
    else bucket.unreceived += quantity;
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .flatMap(([key, bucket]) => [
      { countryCode: key, receiptStatus: "received" as const, devices: bucket.received },
      { countryCode: key, receiptStatus: "unreceived" as const, devices: bucket.unreceived },
    ]);
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
        serviceFeeCurrency,
        serviceFeeAmount,
        fxStatus
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
