import { execute, queryRows, type Row } from "./db";
import { attachPartyCodes } from "./party-display";
import { firstDayOfMonth } from "./billing-workflow";
import { DEFAULT_PAGE_SIZE, normalizePageSize } from "./pagination";
import {
  buildServiceFeeRows,
  summarizeServiceFeeRows,
  type ServiceFeeBillingRow,
  type ServiceFeePrepaymentRow,
  type ServiceFeeRow,
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
  const [billingRows, prepaymentRows] = await Promise.all([
    listBillingRows(filters),
    listPrepaymentRows(filters),
  ]);
  const allRows = filterCalculatedRows(buildServiceFeeRows({ billingRows, prepaymentRows }), filters);
  const exportAll = searchParams.get("export") === "1";
  const shouldPaginate = !exportAll && searchParams.has("page");
  const requestedPage = Math.max(1, Math.floor(Number(searchParams.get("page") ?? 1) || 1));
  const pageSize = normalizePageSize(Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE));
  const total = allRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = shouldPaginate ? Math.min(requestedPage, totalPages) : 1;
  const rows = shouldPaginate
    ? allRows.slice((page - 1) * pageSize, page * pageSize)
    : allRows;

  return {
    rows: await attachPartyCodes(rows),
    summary: summarizeServiceFeeRows(allRows),
    total,
    page,
    pageSize,
    totalPages,
  };
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
