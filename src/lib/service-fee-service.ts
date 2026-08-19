import { execute, queryRows, type Row } from "./db";
import { attachPartyCodes } from "./party-display";
import { firstDayOfMonth } from "./billing-workflow";
import { DEFAULT_PAGE_SIZE, normalizePageSize } from "./pagination";
import {
  type ServiceFeeBillingRow,
  type ServiceFeePrepaymentRow,
  type ServiceFeeRow,
  type ServiceFeeSummary,
} from "./service-fee-workflow";

export type ServiceFeeFilters = {
  keyword?: string;
  startMonth?: string;
  endMonth?: string;
  countryCode?: string;
  batchName?: string;
  lineType?: string;
};

export async function calculateServiceFees(searchParams: URLSearchParams) {
  const filters = getFilters(searchParams);
  const exportAll = searchParams.get("export") === "1";
  // Snapshot confirmation omits `page`, so it deliberately persists every
  // filtered row instead of silently saving only the first result page.
  const shouldPaginate = !exportAll && searchParams.has("page");
  const requestedPage = Math.max(1, Math.floor(Number(searchParams.get("page") ?? 1) || 1));
  const pageSize = normalizePageSize(Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE));
  const { sql, params } = buildServiceFeeQuery(filters);
  const [{ total: totalValue }] = await queryRows<{ total: number }>(`SELECT COUNT(*) AS total FROM (${sql}) serviceFeeRows`, params);
  const total = Number(totalValue ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = shouldPaginate ? Math.min(requestedPage, totalPages) : 1;
  const rows = await queryRows<ServiceFeeRow>(
    `${sql} ORDER BY writeOffMonth, countryCode, batchName, requestNo, poNo, deviceCode, nameEn ${shouldPaginate ? "LIMIT :limit OFFSET :offset" : ""}`,
    shouldPaginate ? { ...params, limit: pageSize, offset: (page - 1) * pageSize } : params,
  );
  const [summary] = await queryRows<ServiceFeeSummary>(
    `SELECT
       COALESCE(SUM(billingAmount), 0) AS billingTotal,
       COALESCE(SUM(prepaymentAmount), 0) AS prepaymentTotal,
       COALESCE(SUM(serviceFeeAmount), 0) AS serviceFeeTotal,
       COALESCE(SUM(CASE WHEN lineType = 'instance' THEN serviceFeeAmount ELSE 0 END), 0) AS instanceServiceFeeTotal,
       COALESCE(SUM(CASE WHEN lineType = 'fee' THEN serviceFeeAmount ELSE 0 END), 0) AS feeServiceFeeTotal
     FROM (${sql}) serviceFeeRows`,
    params,
  );

  return {
    rows: await attachPartyCodes(rows),
    summary: {
      billingTotal: Number(summary?.billingTotal ?? 0),
      prepaymentTotal: Number(summary?.prepaymentTotal ?? 0),
      serviceFeeTotal: Number(summary?.serviceFeeTotal ?? 0),
      instanceServiceFeeTotal: Number(summary?.instanceServiceFeeTotal ?? 0),
      feeServiceFeeTotal: Number(summary?.feeServiceFeeTotal ?? 0),
    },
    total,
    page,
    pageSize,
    totalPages,
  };
}

function buildServiceFeeQuery(filters: ServiceFeeFilters) {
  const params: Row = {};
  const billingWhere: string[] = [];
  const prepaymentWhere: string[] = [];
  for (const [column, value] of [["startMonth", filters.startMonth], ["endMonth", filters.endMonth]] as const) {
    if (!value) continue;
    const operator = column === "startMonth" ? ">=" : "<=";
    const paramName = column;
    params[paramName] = firstDayOfMonth(value);
    billingWhere.push(`m.writeOffMonth ${operator} :${paramName}`);
    prepaymentWhere.push(`p.writeOffMonth ${operator} :${paramName}`);
  }
  if (filters.countryCode) {
    params.countryCode = filters.countryCode;
    billingWhere.push("m.countryCode = :countryCode");
    prepaymentWhere.push("p.countryCode = :countryCode");
  }
  if (filters.batchName) {
    params.batchName = filters.batchName;
    billingWhere.push("m.batchName = :batchName");
    prepaymentWhere.push("p.batchName = :batchName");
  }

  const finalWhere: string[] = [];
  if (filters.lineType) {
    finalWhere.push("lineType = :lineType");
    params.lineType = filters.lineType;
  }
  if (filters.keyword) {
    finalWhere.push(`CONCAT_WS(' ', writeOffMonth, countryCode, batchName, requestNo, poNo, deviceCode, modelCode, nameEn, currency, billingCurrency, prepaymentCurrency, prepaymentContractNos, sourceNote) LIKE :keyword`);
    params.keyword = `%${filters.keyword}%`;
  }
  const whereBilling = billingWhere.length ? `WHERE ${billingWhere.join(" AND ")}` : "";
  const wherePrepayment = prepaymentWhere.length ? `WHERE ${prepaymentWhere.join(" AND ")}` : "";
  const whereFinal = finalWhere.length ? `WHERE ${finalWhere.join(" AND ")}` : "";
  const sql = `
    WITH billing AS (
      SELECT
        CONCAT_WS('::', DATE_FORMAT(m.writeOffMonth, '%Y-%m-%d'), m.countryCode, m.batchName, m.requestNo, m.poNo, m.deviceCode, 'instance') AS rowKey,
        DATE_FORMAT(m.writeOffMonth, '%Y-%m-%d') AS writeOffMonth, m.countryCode, m.batchName, m.requestNo, m.poNo, m.deviceCode,
        MAX(m.modelCode) AS modelCode, MAX(m.nameEn) AS nameEn,
        MAX(COALESCE(NULLIF(m.supplierId, ''), ri.supplierId, fallback.supplierId)) AS supplierId,
        MAX(COALESCE(NULLIF(m.undertakingUnitId, ''), ri.undertakingUnitId, fallback.undertakingUnitId)) AS undertakingUnitId,
        MAX(m.quantity) AS quantity, MAX(m.currency) AS currency, MAX(COALESCE(country.vatRate, 0)) AS vatRate,
        SUM(COALESCE(m.monthlyTotalAmount, m.quantity * m.monthlyAmount, 0)) AS billingAmount,
        GROUP_CONCAT(m.id ORDER BY m.id SEPARATOR ',') AS billingSourceIds
      FROM monthlybillingwriteoffs m
      LEFT JOIN billinginstanceledgers ledger ON ledger.ledgerId = m.ledgerId
      LEFT JOIN requestitems ri ON ri.id = ledger.purchaseOrderItemId
      LEFT JOIN requestitems fallback ON fallback.requestNo = m.requestNo AND fallback.deviceCode = m.deviceCode
      LEFT JOIN countries country ON country.code = m.countryCode
      ${whereBilling}
      GROUP BY rowKey, DATE_FORMAT(m.writeOffMonth, '%Y-%m-%d'), m.countryCode, m.batchName, m.requestNo, m.poNo, m.deviceCode
    ), prepayment AS (
      SELECT
        CASE WHEN p.lineType = 'fee'
          THEN CONCAT_WS('::', DATE_FORMAT(p.writeOffMonth, '%Y-%m-%d'), p.countryCode, p.batchName, p.requestNo, p.poNo, p.contractNo, COALESCE(p.contractLineId, p.id), 'fee')
          ELSE CONCAT_WS('::', DATE_FORMAT(p.writeOffMonth, '%Y-%m-%d'), p.countryCode, p.batchName, p.requestNo, p.poNo, p.deviceCode, 'instance') END AS rowKey,
        DATE_FORMAT(p.writeOffMonth, '%Y-%m-%d') AS writeOffMonth, p.countryCode, p.batchName, p.requestNo, p.poNo, p.deviceCode,
        MAX(p.modelCode) AS modelCode, MAX(p.nameEn) AS nameEn,
        MAX(COALESCE(NULLIF(p.supplierId, ''), ri.supplierId, fallback.supplierId)) AS supplierId,
        MAX(COALESCE(NULLIF(p.undertakingUnitId, ''), ri.undertakingUnitId, fallback.undertakingUnitId)) AS undertakingUnitId,
        MAX(p.quantity) AS quantity, MAX(p.currency) AS currency, MAX(COALESCE(country.vatRate, 0)) AS vatRate,
        MAX(CASE WHEN p.lineType = 'fee' THEN 'fee' ELSE 'instance' END) AS lineType,
        SUM(COALESCE(p.monthlyAmount, 0)) AS prepaymentAmount,
        GROUP_CONCAT(p.id ORDER BY p.id SEPARATOR ',') AS prepaymentSourceIds,
        GROUP_CONCAT(DISTINCT p.contractNo ORDER BY p.contractNo SEPARATOR ',') AS prepaymentContractNos
      FROM monthlyprepaymentwriteoffs p
      LEFT JOIN prepaymentcontractitems contractItem ON contractItem.id = p.contractLineId
      LEFT JOIN requestitems ri ON ri.id = contractItem.requestItemId
      LEFT JOIN requestitems fallback ON fallback.requestNo = p.requestNo AND fallback.deviceCode = p.deviceCode
      LEFT JOIN countries country ON country.code = p.countryCode
      ${wherePrepayment}
      GROUP BY rowKey, DATE_FORMAT(p.writeOffMonth, '%Y-%m-%d'), p.countryCode, p.batchName, p.requestNo, p.poNo, p.deviceCode
    ), rowKeys AS (
      SELECT rowKey FROM billing UNION SELECT rowKey FROM prepayment
    ), combined AS (
      SELECT
        CONCAT('SFC-', rk.rowKey) AS id,
        COALESCE(b.writeOffMonth, p.writeOffMonth) AS writeOffMonth,
        COALESCE(b.countryCode, p.countryCode) AS countryCode,
        COALESCE(b.batchName, p.batchName) AS batchName,
        COALESCE(b.requestNo, p.requestNo) AS requestNo,
        COALESCE(b.poNo, p.poNo) AS poNo,
        COALESCE(b.deviceCode, p.deviceCode) AS deviceCode,
        COALESCE(b.modelCode, p.modelCode) AS modelCode,
        COALESCE(b.nameEn, p.nameEn) AS nameEn,
        COALESCE(b.supplierId, p.supplierId) AS supplierId,
        COALESCE(b.undertakingUnitId, p.undertakingUnitId) AS undertakingUnitId,
        COALESCE(b.quantity, p.quantity, 0) AS quantity,
        COALESCE(b.currency, p.currency) AS currency,
        b.currency AS billingCurrency,
        p.currency AS prepaymentCurrency,
        COALESCE(p.lineType, 'instance') AS lineType,
        COALESCE(b.billingAmount, 0) AS billingAmount,
        COALESCE(p.prepaymentAmount, 0) AS prepaymentAmount,
        COALESCE(b.billingAmount, 0) - COALESCE(p.prepaymentAmount, 0) AS serviceFeeAmount,
        (COALESCE(b.billingAmount, 0) - COALESCE(p.prepaymentAmount, 0)) / (1 + COALESCE(b.vatRate, p.vatRate, 0)) AS serviceFeeAmountExcludingTax,
        COALESCE(b.billingSourceIds, '') AS billingSourceIds,
        COALESCE(p.prepaymentSourceIds, '') AS prepaymentSourceIds,
        COALESCE(p.prepaymentContractNos, '') AS prepaymentContractNos,
        CASE WHEN b.rowKey IS NOT NULL AND p.rowKey IS NOT NULL THEN '月账单与预付款均存在'
             WHEN b.rowKey IS NOT NULL THEN '仅月账单存在'
             ELSE '仅预付款存在，月账单金额按0显示' END AS sourceNote
      FROM rowKeys rk
      LEFT JOIN billing b ON b.rowKey = rk.rowKey
      LEFT JOIN prepayment p ON p.rowKey = rk.rowKey
    ) SELECT * FROM combined ${whereFinal}
  `;
  return { sql, params };
}

export async function confirmServiceFeeSnapshot({
  snapshotNo,
  filters,
}: {
  snapshotNo?: string;
  filters: ServiceFeeFilters;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const calculated = await calculateServiceFees(params);
  const finalSnapshotNo = snapshotNo?.trim() || buildSnapshotNo();

  await execute("DELETE FROM servicefeesnapshotitems WHERE snapshotNo = :snapshotNo", {
    snapshotNo: finalSnapshotNo,
  });
  await execute(
    `
      INSERT INTO servicefeesnapshots
        (snapshotNo, status, startMonth, endMonth, countryCode, batchName, keyword,
         billingTotal, prepaymentTotal, serviceFeeTotal, instanceServiceFeeTotal, feeServiceFeeTotal, confirmedAt)
      VALUES
        (:snapshotNo, '已确认', :startMonth, :endMonth, :countryCode, :batchName, :keyword,
         :billingTotal, :prepaymentTotal, :serviceFeeTotal, :instanceServiceFeeTotal, :feeServiceFeeTotal, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        status = '已确认',
        startMonth = VALUES(startMonth),
        endMonth = VALUES(endMonth),
        countryCode = VALUES(countryCode),
        batchName = VALUES(batchName),
        keyword = VALUES(keyword),
        billingTotal = VALUES(billingTotal),
        prepaymentTotal = VALUES(prepaymentTotal),
        serviceFeeTotal = VALUES(serviceFeeTotal),
        instanceServiceFeeTotal = VALUES(instanceServiceFeeTotal),
        feeServiceFeeTotal = VALUES(feeServiceFeeTotal),
        confirmedAt = CURRENT_TIMESTAMP
    `,
    {
      snapshotNo: finalSnapshotNo,
      startMonth: filters.startMonth ? firstDayOfMonth(filters.startMonth) : null,
      endMonth: filters.endMonth ? firstDayOfMonth(filters.endMonth) : null,
      countryCode: filters.countryCode || null,
      batchName: filters.batchName || null,
      keyword: filters.keyword || null,
      ...calculated.summary,
    },
  );

  for (const [index, row] of calculated.rows.entries()) {
    await insertSnapshotItem(finalSnapshotNo, index + 1, row);
  }

  return { snapshotNo: finalSnapshotNo, ...calculated };
}

function getFilters(searchParams: URLSearchParams): ServiceFeeFilters {
  return {
    keyword: searchParams.get("keyword")?.trim() || "",
    startMonth: searchParams.get("startMonth")?.trim() || "",
    endMonth: searchParams.get("endMonth")?.trim() || "",
    countryCode: searchParams.get("countryCode")?.trim() || "",
    batchName: searchParams.get("batchName")?.trim() || "",
    lineType: searchParams.get("lineType")?.trim() || "",
  };
}

async function listBillingRows(filters: ServiceFeeFilters) {
  const whereParts: string[] = [];
  const params: Row = {};
  applyCommonWhere(whereParts, params, filters);

  const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  return queryRows<ServiceFeeBillingRow>(
    `
      SELECT
        id,
        ledgerId,
        DATE_FORMAT(writeOffMonth, '%Y-%m-%d') AS writeOffMonth,
        countryCode,
        batchName,
        requestNo,
        poNo,
        deviceCode,
        modelCode,
        monthlybillingwriteoffs.nameEn AS nameEn,
        COALESCE(NULLIF(monthlybillingwriteoffs.supplierId, ''), ri.linkedSupplierId, riByBusinessKey.fallbackSupplierId) AS supplierId,
        COALESCE(NULLIF(monthlybillingwriteoffs.undertakingUnitId, ''), ri.linkedUndertakingUnitId, riByBusinessKey.fallbackUndertakingUnitId) AS undertakingUnitId,
        quantity,
        currency,
        COALESCE(country.vatRate, 0) AS vatRate,
        monthlyTotalAmount,
        monthlyAmount
      FROM monthlybillingwriteoffs
      LEFT JOIN (SELECT ledgerId AS linkedLedgerId, purchaseOrderItemId AS linkedPurchaseOrderItemId FROM billinginstanceledgers) AS ledger ON ledger.linkedLedgerId = monthlybillingwriteoffs.ledgerId
      LEFT JOIN (SELECT id AS linkedRequestItemId, supplierId AS linkedSupplierId, undertakingUnitId AS linkedUndertakingUnitId FROM requestitems) AS ri ON ri.linkedRequestItemId = ledger.linkedPurchaseOrderItemId
      LEFT JOIN (SELECT requestNo AS keyRequestNo, deviceCode AS keyDeviceCode, supplierId AS fallbackSupplierId, undertakingUnitId AS fallbackUndertakingUnitId FROM requestitems) AS riByBusinessKey ON riByBusinessKey.keyRequestNo = monthlybillingwriteoffs.requestNo AND riByBusinessKey.keyDeviceCode = monthlybillingwriteoffs.deviceCode
      LEFT JOIN countries AS country ON country.code = monthlybillingwriteoffs.countryCode
      ${where}
      ORDER BY writeOffMonth, countryCode, batchName, requestNo, poNo, deviceCode
    `,
    params,
  );
}

async function listPrepaymentRows(filters: ServiceFeeFilters) {
  const whereParts: string[] = [];
  const params: Row = {};
  applyCommonWhere(whereParts, params, filters);

  const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  return queryRows<ServiceFeePrepaymentRow>(
    `
      SELECT
        id,
        contractNo,
        contractLineId,
        DATE_FORMAT(writeOffMonth, '%Y-%m-%d') AS writeOffMonth,
        countryCode,
        batchName,
        requestNo,
        poNo,
        deviceCode,
        modelCode,
        monthlyprepaymentwriteoffs.nameEn AS nameEn,
        COALESCE(NULLIF(monthlyprepaymentwriteoffs.supplierId, ''), ri.linkedSupplierId, riByBusinessKey.fallbackSupplierId) AS supplierId,
        COALESCE(NULLIF(monthlyprepaymentwriteoffs.undertakingUnitId, ''), ri.linkedUndertakingUnitId, riByBusinessKey.fallbackUndertakingUnitId) AS undertakingUnitId,
        quantity,
        currency,
        COALESCE(country.vatRate, 0) AS vatRate,
        monthlyAmount,
        lineType
      FROM monthlyprepaymentwriteoffs
      LEFT JOIN (SELECT id AS linkedContractLineId, requestItemId AS linkedRequestItemId FROM prepaymentcontractitems) AS contractItem ON contractItem.linkedContractLineId = monthlyprepaymentwriteoffs.contractLineId
      LEFT JOIN (SELECT id AS linkedRequestItemId, supplierId AS linkedSupplierId, undertakingUnitId AS linkedUndertakingUnitId FROM requestitems) AS ri ON ri.linkedRequestItemId = contractItem.linkedRequestItemId
      LEFT JOIN (SELECT requestNo AS keyRequestNo, deviceCode AS keyDeviceCode, supplierId AS fallbackSupplierId, undertakingUnitId AS fallbackUndertakingUnitId FROM requestitems) AS riByBusinessKey ON riByBusinessKey.keyRequestNo = monthlyprepaymentwriteoffs.requestNo AND riByBusinessKey.keyDeviceCode = monthlyprepaymentwriteoffs.deviceCode
      LEFT JOIN countries AS country ON country.code = monthlyprepaymentwriteoffs.countryCode
      ${where}
      ORDER BY writeOffMonth, countryCode, batchName, requestNo, poNo, deviceCode, contractLineId
    `,
    params,
  );
}

function applyCommonWhere(whereParts: string[], params: Row, filters: ServiceFeeFilters) {
  if (filters.startMonth) {
    whereParts.push("writeOffMonth >= :startMonth");
    params.startMonth = firstDayOfMonth(filters.startMonth);
  }
  if (filters.endMonth) {
    whereParts.push("writeOffMonth <= :endMonth");
    params.endMonth = firstDayOfMonth(filters.endMonth);
  }
  if (filters.countryCode) {
    whereParts.push("countryCode = :countryCode");
    params.countryCode = filters.countryCode;
  }
  if (filters.batchName) {
    whereParts.push("batchName = :batchName");
    params.batchName = filters.batchName;
  }
}

function filterCalculatedRows(rows: ServiceFeeRow[], filters: ServiceFeeFilters) {
  const keyword = filters.keyword?.toLowerCase();
  return rows.filter((row) => {
    if (filters.lineType && row.lineType !== filters.lineType) return false;
    if (!keyword) return true;
    return [
      row.writeOffMonth,
      row.countryCode,
      row.batchName,
      row.requestNo,
      row.poNo,
      row.deviceCode,
      row.modelCode,
      row.nameEn,
      row.currency,
      row.billingCurrency,
      row.prepaymentCurrency,
      row.prepaymentContractNos,
      row.sourceNote,
    ]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });
}

async function insertSnapshotItem(snapshotNo: string, index: number, row: ServiceFeeRow) {
  await execute(
    `
      INSERT INTO servicefeesnapshotitems
        (id, snapshotNo, writeOffMonth, countryCode, batchName, requestNo, poNo, deviceCode,
         modelCode, nameEn, supplierId, undertakingUnitId, quantity, currency, billingCurrency, prepaymentCurrency, lineType, billingAmount, prepaymentAmount,
         serviceFeeAmount, serviceFeeAmountExcludingTax, billingSourceIds, prepaymentSourceIds, prepaymentContractNos, sourceNote)
      VALUES
        (:id, :snapshotNo, :writeOffMonth, :countryCode, :batchName, :requestNo, :poNo, :deviceCode,
         :modelCode, :nameEn, :supplierId, :undertakingUnitId, :quantity, :currency, :billingCurrency, :prepaymentCurrency, :lineType, :billingAmount, :prepaymentAmount,
         :serviceFeeAmount, :serviceFeeAmountExcludingTax, :billingSourceIds, :prepaymentSourceIds, :prepaymentContractNos, :sourceNote)
    `,
    {
      ...row,
      id: `${snapshotNo}-${String(index).padStart(5, "0")}`,
      snapshotNo,
    },
  );
}

function buildSnapshotNo() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  return `SFS-${stamp}`;
}
