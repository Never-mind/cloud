import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PoolConnection } from "mysql2/promise";
import {
  execute,
  executeInTransaction,
  queryRows,
  queryRowsInTransaction,
  withTransaction,
  type Row,
} from "./db";
import { attachPartyCodes } from "./party-display";
import { ensureMonthlyBillingRows } from "./billing-service";
import { firstDayOfMonth } from "./billing-workflow";
import { DEFAULT_PAGE_SIZE, normalizePageSize } from "./pagination";
import { appendTableInFilter, formatTableDateExpression, getTableFilterOptionsOrderBy, getTableSort } from "./table-query";
import { sanitizeDocumentFileName } from "./document-utils";
import {
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
  currency?: string;
  lineType?: string;
  requestType?: string;
};

export type ServiceFeeStatementFilters = {
  keyword?: string;
  writeOffMonth?: string;
  countryCode?: string;
  status?: string;
  invoiceStatus?: string;
  repaymentStatus?: string;
};

const invoiceUploadRoot = path.join(process.cwd(), "uploads", "service-fee-invoices");
const allowedInvoiceExtensions = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png"]);
const maxInvoiceFileSize = 25 * 1024 * 1024;
const SERVICE_FEE_READY_CACHE_MS = 10_000;
const FAST_SERVICE_FEE_ROWS_CACHE_MS = 10_000;
const SERVICE_FEE_DATASET_CACHE_MS = 15_000;
const SERVICE_FEE_DATASET_CACHE_MAX_ENTRIES = 24;
const SERVICE_FEE_OPTION_ROWS_CACHE_MS = 30_000;
let serviceFeeRowsReadyAt = 0;
let serviceFeeRowsReadyPromise: Promise<unknown> | null = null;
let fastServiceFeeRowsCache: { rows: ServiceFeeRow[]; expiresAt: number } | null = null;
let fastServiceFeeRowsPromise: Promise<ServiceFeeRow[]> | null = null;
let serviceFeeOptionRowsCache: { rows: Array<ServiceFeeRow & Row>; expiresAt: number } | null = null;
let serviceFeeOptionRowsPromise: Promise<Array<ServiceFeeRow & Row>> | null = null;
const serviceFeeDatasetCache = new Map<string, { rows: ServiceFeeRow[]; expiresAt: number }>();
const serviceFeeDatasetPromises = new Map<string, Promise<ServiceFeeRow[]>>();

export async function calculateServiceFees(searchParams: URLSearchParams) {
  const filters = getFilters(searchParams);
  const exportAll = searchParams.get("export") === "1";
  const includeSummary = searchParams.get("includeSummary") !== "0";
  // Snapshot confirmation omits `page`, so it deliberately persists every
  // filtered row instead of silently saving only the first result page.
  const shouldPaginate = !exportAll && searchParams.has("page");
  // The first page prepares any missing monthly rows. Subsequent pagination
  // requests carry includeSummary=0 and only read the already prepared data.
  if (!(shouldPaginate && !includeSummary)) await ensureServiceFeeRowsReady();
  const requestedPage = Math.max(1, Math.floor(Number(searchParams.get("page") ?? 1) || 1));
  const pageSize = normalizePageSize(Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE));
  const useFastPageQuery = shouldUseFastServiceFeePage(searchParams, filters);
  const fastPageQuery = useFastPageQuery ? buildFastServiceFeePageQuery() : null;
  const allRows = fastPageQuery
    ? await loadFastServiceFeeRows(fastPageQuery.sql, fastPageQuery.params)
    : await loadServiceFeeDataset(searchParams);
  const total = allRows.length;
  const rows = shouldPaginate
    ? allRows.slice((requestedPage - 1) * pageSize, requestedPage * pageSize)
    : allRows;
  const summarizedRows = allRows;
  const summary = summarizeServiceFeeRows(summarizedRows);
  const currencySummaries = summarizeServiceFeeRowsByCurrency(summarizedRows);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = shouldPaginate ? Math.min(requestedPage, totalPages) : 1;
  if (shouldPaginate && !rows.length && requestedPage > 1 && page !== requestedPage) {
    const correctedParams = new URLSearchParams(searchParams);
    correctedParams.set("page", String(page));
    return calculateServiceFees(correctedParams);
  }

  return {
    rows: await attachPartyCodes(rows),
    summary,
    currencySummaries,
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function listServiceFeeFilterOptions(searchParams: URLSearchParams) {
  await ensureServiceFeeRowsReady();
  const field = searchParams.get("field")?.trim() ?? "";
  const optionExpressions = Object.fromEntries(Object.entries(getServiceFeeSortExpressions()).map(([key, value]) => [key, value.replace(/^combined\./, "")])) as Record<string, string>;
  const expression = optionExpressions[field];
  if (!expression) return { options: [] as Array<{ value: string; count: number }> };
  // `keyword` here belongs to the column candidate search. Do not feed it
  // into the global service-fee keyword query, otherwise codes that are only
  // present in the displayed party-code columns can never be returned.
  const baseFilters: ServiceFeeFilters = {
    startMonth: searchParams.get("startMonth")?.trim() || "",
    endMonth: searchParams.get("endMonth")?.trim() || "",
    countryCode: searchParams.get("countryCode")?.trim() || "",
    batchName: searchParams.get("batchName")?.trim() || "",
    currency: searchParams.get("currency")?.trim() || "",
    lineType: searchParams.get("lineType")?.trim() || "",
    requestType: searchParams.get("requestType")?.trim() || "",
  };
  const keyword = searchParams.get("keyword")?.trim() ?? "";
  // Candidate values use the same filtered dataset as the table. This avoids
  // rebuilding the complete billing/prepayment CTE for every keypress in the
  // column menu; the dataset itself is cached by loadServiceFeeDataset.
  const optionParams = new URLSearchParams(searchParams);
  optionParams.delete("field");
  optionParams.delete("keyword");
  optionParams.delete("sortField");
  optionParams.delete("sortOrder");
  optionParams.delete(`filter.${field}`);
  const hasOtherFilters = Array.from(optionParams.keys()).some((key) => key.startsWith("filter."));
  const hasDatasetFilters = Object.values(baseFilters).some(Boolean);
  const rows = !hasOtherFilters && !hasDatasetFilters
    ? await loadServiceFeeOptionRows()
    : await loadServiceFeeDataset(optionParams);
  const normalizedKeyword = keyword.toLocaleLowerCase();
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = String((row as unknown as Row)[field] ?? "").trim();
    if (!value || (normalizedKeyword && !value.toLocaleLowerCase().includes(normalizedKeyword))) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const options = Array.from(counts, ([value, count]) => ({ value, count }))
    .sort((left, right) => collator.compare(left.value, right.value));
  return { options };
}

type ServiceFeeSummaryRow = {
  currency?: string | null;
  total?: number | string | null;
  billingTotal?: number | string | null;
  prepaymentTotal?: number | string | null;
  serviceFeeTotal?: number | string | null;
  serviceFeeTotalExcludingTax?: number | string | null;
  instanceServiceFeeTotal?: number | string | null;
  feeServiceFeeTotal?: number | string | null;
};

type ServiceFeeCurrencySummary = {
  currency: string;
  billingTotal: number;
  prepaymentTotal: number;
  serviceFeeTotal: number;
  serviceFeeTotalExcludingTax: number;
  instanceServiceFeeTotal: number;
  feeServiceFeeTotal: number;
};

function emptyServiceFeeSummary() {
  return {
    billingTotal: 0,
    prepaymentTotal: 0,
    serviceFeeTotal: 0,
    serviceFeeTotalExcludingTax: 0,
    instanceServiceFeeTotal: 0,
    feeServiceFeeTotal: 0,
  };
}

async function ensureServiceFeeRowsReady() {
  if (Date.now() - serviceFeeRowsReadyAt < SERVICE_FEE_READY_CACHE_MS) return;
  if (!serviceFeeRowsReadyPromise) {
    serviceFeeRowsReadyPromise = ensureMonthlyBillingRows()
      .then((result) => {
        serviceFeeRowsReadyAt = Date.now();
        serviceFeeDatasetCache.clear();
        serviceFeeOptionRowsCache = null;
        return result;
      })
      .finally(() => {
        serviceFeeRowsReadyPromise = null;
      });
  }
  await serviceFeeRowsReadyPromise;
}

async function loadServiceFeeDataset(searchParams: URLSearchParams) {
  const filters = getFilters(searchParams);
  const { sql, params } = buildServiceFeeQuery(filters, searchParams);
  const sortExpressions = Object.fromEntries(
    Object.entries(getServiceFeeSortExpressions()).map(([key, expression]) => [
      key,
      expression.replace("combined.", "serviceFeeRows."),
    ]),
  );
  const orderedSql = `
    SELECT serviceFeeRows.*
    FROM (${sql}) serviceFeeRows
    ${getTableSort(searchParams, sortExpressions) || "ORDER BY writeOffMonth, countryCode, batchName, requestNo, poNo, deviceCode, nameEn"}
  `;
  const cacheKey = JSON.stringify([
    orderedSql,
    Object.entries(params)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, Array.isArray(value) ? [...value].map(String).sort() : value]),
  ]);
  const now = Date.now();
  const cached = serviceFeeDatasetCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.rows;
  if (cached) serviceFeeDatasetCache.delete(cacheKey);

  const pending = serviceFeeDatasetPromises.get(cacheKey);
  if (pending) return pending;

  const queryPromise = queryRows<ServiceFeeRow>(orderedSql, params)
    .then((rows) => {
      if (serviceFeeDatasetCache.size >= SERVICE_FEE_DATASET_CACHE_MAX_ENTRIES) {
        const oldestKey = serviceFeeDatasetCache.keys().next().value;
        if (oldestKey) serviceFeeDatasetCache.delete(oldestKey);
      }
      serviceFeeDatasetCache.set(cacheKey, {
        rows,
        expiresAt: Date.now() + SERVICE_FEE_DATASET_CACHE_MS,
      });
      return rows;
    })
    .finally(() => {
      serviceFeeDatasetPromises.delete(cacheKey);
    });
  serviceFeeDatasetPromises.set(cacheKey, queryPromise);
  return queryPromise;
}

async function loadServiceFeeOptionRows() {
  const now = Date.now();
  if (serviceFeeOptionRowsCache && serviceFeeOptionRowsCache.expiresAt > now) return serviceFeeOptionRowsCache.rows;
  if (serviceFeeOptionRowsPromise) return serviceFeeOptionRowsPromise;

  const query = buildFastServiceFeePageQuery();
  serviceFeeOptionRowsPromise = loadFastServiceFeeRows(query.sql, query.params)
    .then((rows) => attachPartyCodes(rows as unknown as Row[]))
    .then((rows) => {
      const optionRows = rows as unknown as Array<ServiceFeeRow & Row>;
      serviceFeeOptionRowsCache = { rows: optionRows, expiresAt: Date.now() + SERVICE_FEE_OPTION_ROWS_CACHE_MS };
      return optionRows;
    })
    .finally(() => {
      serviceFeeOptionRowsPromise = null;
    });
  return serviceFeeOptionRowsPromise;
}

function normalizeServiceFeeSummary(row: ServiceFeeSummaryRow) {
  return {
    billingTotal: Number(row.billingTotal ?? 0),
    prepaymentTotal: Number(row.prepaymentTotal ?? 0),
    serviceFeeTotal: Number(row.serviceFeeTotal ?? 0),
    serviceFeeTotalExcludingTax: Number(row.serviceFeeTotalExcludingTax ?? 0),
    instanceServiceFeeTotal: Number(row.instanceServiceFeeTotal ?? 0),
    feeServiceFeeTotal: Number(row.feeServiceFeeTotal ?? 0),
  };
}

function normalizeServiceFeeSummaryRows(rows: ServiceFeeSummaryRow[]) {
  const currencySummaries = rows
    .map((row) => ({
      currency: firstNonBlank(row.currency) || "未指定币种",
      ...normalizeServiceFeeSummary(row),
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
  const summary = currencySummaries.reduce((current, row) => ({
    billingTotal: current.billingTotal + row.billingTotal,
    prepaymentTotal: current.prepaymentTotal + row.prepaymentTotal,
    serviceFeeTotal: current.serviceFeeTotal + row.serviceFeeTotal,
    serviceFeeTotalExcludingTax: current.serviceFeeTotalExcludingTax + row.serviceFeeTotalExcludingTax,
    instanceServiceFeeTotal: current.instanceServiceFeeTotal + row.instanceServiceFeeTotal,
    feeServiceFeeTotal: current.feeServiceFeeTotal + row.feeServiceFeeTotal,
  }), emptyServiceFeeSummary());
  return {
    total: rows.reduce((total, row) => total + Number(row.total ?? 0), 0),
    summary,
    currencySummaries,
  };
}

function summarizeServiceFeeRows(rows: ServiceFeeRow[]) {
  return rows.reduce((summary, row) => {
    const billingAmount = Number(row.billingAmount ?? 0);
    const prepaymentAmount = Number(row.prepaymentAmount ?? 0);
    const serviceFeeAmount = Number(row.serviceFeeAmount ?? 0);
    const serviceFeeAmountExcludingTax = Number(row.serviceFeeAmountExcludingTax ?? 0);
    summary.billingTotal += billingAmount;
    summary.prepaymentTotal += prepaymentAmount;
    summary.serviceFeeTotal += serviceFeeAmount;
    summary.serviceFeeTotalExcludingTax += serviceFeeAmountExcludingTax;
    if (row.lineType === "fee") summary.feeServiceFeeTotal += serviceFeeAmount;
    else summary.instanceServiceFeeTotal += serviceFeeAmount;
    return summary;
  }, emptyServiceFeeSummary());
}

function summarizeServiceFeeRowsByCurrency(rows: ServiceFeeRow[]): ServiceFeeCurrencySummary[] {
  const grouped = new Map<string, ServiceFeeRow[]>();
  for (const row of rows) {
    const currency = firstNonBlank(row.billingCurrency, row.prepaymentCurrency, row.currency) || "未指定币种";
    const current = grouped.get(currency) ?? [];
    current.push(row);
    grouped.set(currency, current);
  }
  return Array.from(grouped.entries())
    .map(([currency, currencyRows]) => ({ currency, ...summarizeServiceFeeRows(currencyRows) }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

function canUseLightweightServiceFeeSummary(filters: ServiceFeeFilters) {
  // 类型筛选需要沿着月账单/预付款关联链路回填历史空值，使用完整查询保证汇总和明细一致。
  return !filters.keyword && !filters.requestType;
}

function shouldUseFastServiceFeePage(searchParams: URLSearchParams, filters: ServiceFeeFilters) {
  return searchParams.has("page")
    && !searchParams.has("sortField")
    && !Array.from(searchParams.keys()).some((key) => key.startsWith("filter."))
    && !filters.keyword
    && !filters.startMonth
    && !filters.endMonth
    && !filters.countryCode
    && !filters.batchName
    && !filters.currency
    && !filters.lineType
    && !filters.requestType;
}

async function loadFastServiceFeePage(sql: string, params: Row, page: number, pageSize: number) {
  const rows = await loadFastServiceFeeRows(sql, params);
  return rows.slice((page - 1) * pageSize, page * pageSize);
}

async function loadFastServiceFeeRows(sql: string, params: Row) {
  if (fastServiceFeeRowsCache && fastServiceFeeRowsCache.expiresAt > Date.now()) {
    return fastServiceFeeRowsCache.rows;
  }
  if (!fastServiceFeeRowsPromise) {
    fastServiceFeeRowsPromise = queryRows<ServiceFeeRow>(
      `
        SELECT serviceFeeRows.*
        FROM (${sql}) serviceFeeRows
        ORDER BY writeOffMonth, countryCode, batchName, requestNo, poNo, deviceCode, nameEn
      `,
      params,
    )
      .then((rows) => {
        fastServiceFeeRowsCache = { rows, expiresAt: Date.now() + FAST_SERVICE_FEE_ROWS_CACHE_MS };
        return rows;
      })
      .finally(() => {
        fastServiceFeeRowsPromise = null;
      });
  }
  return fastServiceFeeRowsPromise;
}

function serviceFeeBillingRequestTypeExpression() {
  return "COALESCE(NULLIF(purchaseItem.requestType, ''), NULLIF(ledger.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(req.requestType, ''), NULLIF(fallback.requestType, ''), '整机')";
}

function serviceFeeBillingDetailRequestTypeExpression() {
  return "COALESCE(NULLIF(purchaseItem.requestType, ''), NULLIF(ledger.linkedRequestType, ''), NULLIF(ri.linkedRequestType, ''), NULLIF(req.requestType, ''), NULLIF(riByBusinessKey.fallbackRequestType, ''), '整机')";
}

function buildLightweightServiceFeeSummaryQuery(filters: ServiceFeeFilters) {
  const params: Row = {};
  const billingWhere: string[] = [];
  const prepaymentWhere: string[] = [];
  for (const [column, value] of [["startMonth", filters.startMonth], ["endMonth", filters.endMonth]] as const) {
    if (!value) continue;
    const paramName = column;
    params[paramName] = firstDayOfMonth(value);
    const operator = column === "startMonth" ? ">=" : "<=";
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
  if (filters.currency) {
    params.currency = filters.currency;
    billingWhere.push("m.currency = :currency");
    prepaymentWhere.push("p.currency = :currency");
  }
  if (filters.lineType) params.lineType = filters.lineType;
  if (filters.requestType) params.requestType = filters.requestType;
  const billingFilter = billingWhere.length ? `WHERE ${billingWhere.join(" AND ")}` : "";
  const prepaymentFilter = prepaymentWhere.length ? `WHERE ${prepaymentWhere.join(" AND ")}` : "";
  const finalFilters = [filters.currency ? "combined.currency = :currency" : "", filters.lineType ? "combined.lineType = :lineType" : "", filters.requestType ? "combined.requestType = :requestType" : ""].filter(Boolean);
  const lineFilter = finalFilters.length ? `WHERE ${finalFilters.join(" AND ")}` : "";
  return {
    sql: `
      WITH billing AS (
        SELECT CONCAT_WS('::', DATE_FORMAT(m.writeOffMonth, '%Y-%m-%d'), m.countryCode, m.batchName, m.requestNo, m.poNo, m.deviceCode, 'instance') AS rowKey,
               MAX(COALESCE(NULLIF(ri.requestType, ''), NULLIF(req.requestType, ''), NULLIF(fallback.requestType, ''), '整机')) AS requestType,
               MAX(m.currency) AS currency,
               SUM(COALESCE(m.monthlyTotalAmount, m.quantity * m.monthlyAmount, 0)) AS billingAmount,
                MAX(COALESCE(country.vatRate, 0)) AS vatRate
        FROM monthlybillingwriteoffs m
        LEFT JOIN billinginstanceledgers ledger ON ledger.ledgerId = m.ledgerId
        LEFT JOIN purchaseorderitems purchaseItem ON purchaseItem.id = ledger.purchaseOrderItemId
        LEFT JOIN requestitems ri ON ri.id = purchaseItem.requestItemId
        LEFT JOIN requests req ON req.requestNo = COALESCE(NULLIF(purchaseItem.requestNo, ''), NULLIF(ri.requestNo, ''), m.requestNo)
        LEFT JOIN requestitems fallback ON fallback.requestNo = m.requestNo AND fallback.deviceCode = m.deviceCode
        LEFT JOIN countries country ON country.code = m.countryCode
        ${billingFilter}
        GROUP BY rowKey
      ), prepayment AS (
        SELECT CASE WHEN p.lineType = 'fee'
                 THEN CONCAT_WS('::', DATE_FORMAT(p.writeOffMonth, '%Y-%m-%d'), p.countryCode, p.batchName, p.requestNo, p.poNo, p.contractNo, COALESCE(p.contractLineId, p.id), 'fee')
                 ELSE CONCAT_WS('::', DATE_FORMAT(p.writeOffMonth, '%Y-%m-%d'), p.countryCode, p.batchName, p.requestNo, p.poNo, p.deviceCode, 'instance') END AS rowKey,
               CASE WHEN p.lineType = 'fee' THEN 'fee' ELSE 'instance' END AS lineType,
               SUM(COALESCE(p.monthlyAmount, 0)) AS prepaymentAmount,
               MAX(COALESCE(p.requestType, CASE WHEN p.lineType = 'fee' THEN '费用' ELSE '整机' END)) AS requestType,
               MAX(p.currency) AS currency,
               MAX(COALESCE(country.vatRate, 0)) AS vatRate
        FROM monthlyprepaymentwriteoffs p
        LEFT JOIN countries country ON country.code = p.countryCode
        ${prepaymentFilter}
        GROUP BY rowKey, lineType
      ), rowKeys AS (
        SELECT rowKey FROM billing UNION SELECT rowKey FROM prepayment
      ), combined AS (
        SELECT rk.rowKey, COALESCE(b.billingAmount, 0) AS billingAmount,
               COALESCE(p.prepaymentAmount, 0) AS prepaymentAmount,
               COALESCE(b.vatRate, p.vatRate, 0) AS vatRate,
               COALESCE(p.lineType, 'instance') AS lineType,
               COALESCE(b.requestType, p.requestType, '整机') AS requestType,
               COALESCE(NULLIF(b.currency, ''), NULLIF(p.currency, ''), '未指定币种') AS currency
        FROM rowKeys rk
        LEFT JOIN billing b ON b.rowKey = rk.rowKey
        LEFT JOIN prepayment p ON p.rowKey = rk.rowKey
      )
      SELECT combined.currency,
             COUNT(*) AS total,
             COALESCE(SUM(combined.billingAmount), 0) AS billingTotal,
             COALESCE(SUM(combined.prepaymentAmount), 0) AS prepaymentTotal,
             COALESCE(SUM(combined.billingAmount - combined.prepaymentAmount), 0) AS serviceFeeTotal,
             COALESCE(SUM((combined.billingAmount - combined.prepaymentAmount) / (1 + combined.vatRate)), 0) AS serviceFeeTotalExcludingTax,
             COALESCE(SUM(CASE WHEN combined.lineType = 'instance' THEN combined.billingAmount - combined.prepaymentAmount ELSE 0 END), 0) AS instanceServiceFeeTotal,
             COALESCE(SUM(CASE WHEN combined.lineType = 'fee' THEN combined.billingAmount - combined.prepaymentAmount ELSE 0 END), 0) AS feeServiceFeeTotal
      FROM combined
      ${lineFilter}
      GROUP BY combined.currency
    `,
    params,
  };
}

function buildFastServiceFeePageQuery() {
  return {
    sql: `
      WITH billing AS (
        SELECT
          CONCAT_WS('::', DATE_FORMAT(m.writeOffMonth, '%Y-%m-%d'), m.countryCode, m.batchName, m.requestNo, m.poNo, m.deviceCode, 'instance') AS rowKey,
          DATE_FORMAT(m.writeOffMonth, '%Y-%m-%d') AS writeOffMonth,
          m.countryCode, m.batchName, m.requestNo, m.poNo, m.deviceCode,
          MAX(m.modelCode) AS modelCode,
          MAX(m.nameEn) AS nameEn,
          MIN(DATE_FORMAT(m.createdAt, '%Y-%m-%d')) AS createdAt,
          MAX(DATE_FORMAT(m.updatedAt, '%Y-%m-%d')) AS updatedAt,
          MAX(COALESCE(NULLIF(m.supplierId, ''), ri.supplierId, fallback.supplierId)) AS supplierId,
          MAX(COALESCE(NULLIF(m.undertakingUnitId, ''), ri.undertakingUnitId, fallback.undertakingUnitId)) AS undertakingUnitId,
          MAX(COALESCE(NULLIF(m.customerId, ''), ri.customerId, fallback.customerId)) AS customerId,
          MAX(m.quantity) AS quantity,
          MAX(m.currency) AS currency,
          MAX(${serviceFeeBillingRequestTypeExpression()}) AS requestType,
          MAX(COALESCE(country.vatRate, 0)) AS vatRate,
          SUM(COALESCE(m.monthlyTotalAmount, m.quantity * m.monthlyAmount, 0)) AS billingAmount,
          GROUP_CONCAT(m.id ORDER BY m.id SEPARATOR ',') AS billingSourceIds
        FROM monthlybillingwriteoffs m
        LEFT JOIN billinginstanceledgers ledger ON ledger.ledgerId = m.ledgerId
        LEFT JOIN purchaseorderitems purchaseItem ON purchaseItem.id = ledger.purchaseOrderItemId
        LEFT JOIN requestitems ri ON ri.id = purchaseItem.requestItemId
        LEFT JOIN requests req ON req.requestNo = COALESCE(NULLIF(purchaseItem.requestNo, ''), NULLIF(ri.requestNo, ''), m.requestNo)
        LEFT JOIN requestitems fallback ON fallback.requestNo = m.requestNo AND fallback.deviceCode = m.deviceCode
        LEFT JOIN countries country ON country.code = m.countryCode
        GROUP BY rowKey, DATE_FORMAT(m.writeOffMonth, '%Y-%m-%d'), m.countryCode, m.batchName, m.requestNo, m.poNo, m.deviceCode
      ), prepayment AS (
        SELECT
          CASE WHEN p.lineType = 'fee'
            THEN CONCAT_WS('::', DATE_FORMAT(p.writeOffMonth, '%Y-%m-%d'), p.countryCode, p.batchName, p.requestNo, p.poNo, p.contractNo, COALESCE(p.contractLineId, p.id), 'fee')
            ELSE CONCAT_WS('::', DATE_FORMAT(p.writeOffMonth, '%Y-%m-%d'), p.countryCode, p.batchName, p.requestNo, p.poNo, p.deviceCode, 'instance') END AS rowKey,
          DATE_FORMAT(p.writeOffMonth, '%Y-%m-%d') AS writeOffMonth,
          p.countryCode, p.batchName, p.requestNo, p.poNo, p.deviceCode,
          MAX(p.modelCode) AS modelCode,
          MAX(p.nameEn) AS nameEn,
          MIN(DATE_FORMAT(p.createdAt, '%Y-%m-%d')) AS createdAt,
          MAX(DATE_FORMAT(p.updatedAt, '%Y-%m-%d')) AS updatedAt,
          MAX(COALESCE(NULLIF(p.supplierId, ''), ri.supplierId, fallback.supplierId)) AS supplierId,
          MAX(COALESCE(NULLIF(p.undertakingUnitId, ''), ri.undertakingUnitId, fallback.undertakingUnitId)) AS undertakingUnitId,
          MAX(COALESCE(NULLIF(p.customerId, ''), ri.customerId, fallback.customerId)) AS customerId,
          MAX(p.quantity) AS quantity,
          MAX(p.currency) AS currency,
          MAX(COALESCE(NULLIF(p.requestType, ''), NULLIF(contractItem.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(fallback.requestType, ''), CASE WHEN p.lineType = 'fee' THEN '费用' ELSE '整机' END)) AS requestType,
          MAX(COALESCE(country.vatRate, 0)) AS vatRate,
          MAX(CASE WHEN p.lineType = 'fee' THEN 'fee' ELSE 'instance' END) AS lineType,
          SUM(COALESCE(p.monthlyAmount, 0)) AS prepaymentAmount,
          GROUP_CONCAT(p.id ORDER BY p.id SEPARATOR ',') AS prepaymentSourceIds,
          GROUP_CONCAT(DISTINCT p.contractNo ORDER BY p.contractNo SEPARATOR ',') AS prepaymentContractNos
        FROM monthlyprepaymentwriteoffs p
        LEFT JOIN prepaymentcontractitems contractItem ON contractItem.id = p.contractLineId
        LEFT JOIN requestitems ri ON ri.id = contractItem.requestItemId
        LEFT JOIN requestitems fallback ON fallback.requestNo = p.requestNo AND fallback.deviceCode = p.deviceCode
        LEFT JOIN countries country ON country.code = p.countryCode
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
          COALESCE(b.requestType, p.requestType, CASE WHEN p.lineType = 'fee' THEN '费用' ELSE '整机' END) AS requestType,
          COALESCE(b.modelCode, p.modelCode) AS modelCode,
          COALESCE(b.nameEn, p.nameEn) AS nameEn,
          COALESCE(b.supplierId, p.supplierId) AS supplierId,
          COALESCE(b.undertakingUnitId, p.undertakingUnitId) AS undertakingUnitId,
          COALESCE(b.customerId, p.customerId) AS customerId,
          CASE WHEN COALESCE(b.createdAt, '9999-12-31') <= COALESCE(p.createdAt, '9999-12-31') THEN b.createdAt ELSE p.createdAt END AS createdAt,
          CASE WHEN COALESCE(b.updatedAt, '') >= COALESCE(p.updatedAt, '') THEN b.updatedAt ELSE p.updatedAt END AS updatedAt,
          COALESCE(b.quantity, p.quantity, 0) AS quantity,
          COALESCE(b.currency, p.currency) AS currency,
          COALESCE(b.vatRate, p.vatRate, 0) AS vatRate,
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
      )
      SELECT * FROM combined
    `,
    params: {},
  };
}

function buildServiceFeeQuery(filters: ServiceFeeFilters, searchParams = new URLSearchParams()) {
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
  if (filters.currency) {
    params.currency = filters.currency;
    billingWhere.push("m.currency = :currency");
    prepaymentWhere.push("p.currency = :currency");
  }
  if (filters.requestType) {
    billingWhere.push(`${serviceFeeBillingRequestTypeExpression()} = :requestType`);
    prepaymentWhere.push("COALESCE(NULLIF(p.requestType, ''), NULLIF(contractItem.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(fallback.requestType, ''), CASE WHEN p.lineType = 'fee' THEN '费用' ELSE '整机' END) = :requestType");
    params.requestType = filters.requestType;
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
  if (filters.currency) {
    finalWhere.push("currency = :currency");
  }
  const filterExpressions = getServiceFeeSortExpressions();
  for (const [field, expression] of Object.entries(filterExpressions)) appendTableInFilter(finalWhere, params, expression, field, searchParams, "serviceFeeColumn");
  const whereBilling = billingWhere.length ? `WHERE ${billingWhere.join(" AND ")}` : "";
  const wherePrepayment = prepaymentWhere.length ? `WHERE ${prepaymentWhere.join(" AND ")}` : "";
  const whereFinal = finalWhere.length ? `WHERE ${finalWhere.join(" AND ")}` : "";
  const sql = `
    WITH billing AS (
      SELECT
        CONCAT_WS('::', DATE_FORMAT(m.writeOffMonth, '%Y-%m-%d'), m.countryCode, m.batchName, m.requestNo, m.poNo, m.deviceCode, 'instance') AS rowKey,
        DATE_FORMAT(m.writeOffMonth, '%Y-%m-%d') AS writeOffMonth, m.countryCode, m.batchName, m.requestNo, m.poNo, m.deviceCode,
        MAX(m.modelCode) AS modelCode, MAX(m.nameEn) AS nameEn,
        MIN(DATE_FORMAT(m.createdAt, '%Y-%m-%d')) AS createdAt,
        MAX(DATE_FORMAT(m.updatedAt, '%Y-%m-%d')) AS updatedAt,
        MAX(COALESCE(NULLIF(m.supplierId, ''), ri.supplierId, fallback.supplierId)) AS supplierId,
        MAX(COALESCE(NULLIF(m.undertakingUnitId, ''), ri.undertakingUnitId, fallback.undertakingUnitId)) AS undertakingUnitId,
        MAX(COALESCE(NULLIF(m.customerId, ''), ri.customerId, fallback.customerId)) AS customerId,
        MAX(supplier.supplierCode) AS supplierCode,
        MAX(undertaking.undertakingUnitCode) AS undertakingUnitCode,
        MAX(customer.customerCode) AS customerCode,
        MAX(COALESCE(NULLIF(supplier.shortName, ''), NULLIF(supplier.nameCn, ''), supplier.supplierCode)) AS supplierName,
        MAX(COALESCE(NULLIF(undertaking.shortName, ''), NULLIF(undertaking.entityName, ''), NULLIF(undertaking.name, ''), undertaking.undertakingUnitCode)) AS undertakingUnitName,
        MAX(COALESCE(NULLIF(customer.shortName, ''), NULLIF(customer.nameCn, ''), NULLIF(customer.name, ''), customer.customerCode)) AS customerName,
        MAX(m.quantity) AS quantity, MAX(m.currency) AS currency,
        MAX(${serviceFeeBillingRequestTypeExpression()}) AS requestType,
        MAX(COALESCE(country.vatRate, 0)) AS vatRate,
        SUM(COALESCE(m.monthlyTotalAmount, m.quantity * m.monthlyAmount, 0)) AS billingAmount,
        GROUP_CONCAT(m.id ORDER BY m.id SEPARATOR ',') AS billingSourceIds
      FROM monthlybillingwriteoffs m
      LEFT JOIN billinginstanceledgers ledger ON ledger.ledgerId = m.ledgerId
      LEFT JOIN purchaseorderitems purchaseItem ON purchaseItem.id = ledger.purchaseOrderItemId
      LEFT JOIN requestitems ri ON ri.id = purchaseItem.requestItemId
      LEFT JOIN requests req ON req.requestNo = COALESCE(NULLIF(purchaseItem.requestNo, ''), NULLIF(ri.requestNo, ''), m.requestNo)
      LEFT JOIN requestitems fallback ON fallback.requestNo = m.requestNo AND fallback.deviceCode = m.deviceCode
      LEFT JOIN common_suppliers supplier ON supplier.supplierId = COALESCE(NULLIF(m.supplierId, ''), ri.supplierId, fallback.supplierId) OR supplier.supplierCode = COALESCE(NULLIF(m.supplierId, ''), ri.supplierId, fallback.supplierId)
      LEFT JOIN common_undertaking_units undertaking ON undertaking.undertakingUnitId = COALESCE(NULLIF(m.undertakingUnitId, ''), ri.undertakingUnitId, fallback.undertakingUnitId) OR undertaking.undertakingUnitCode = COALESCE(NULLIF(m.undertakingUnitId, ''), ri.undertakingUnitId, fallback.undertakingUnitId) OR undertaking.entityCode = COALESCE(NULLIF(m.undertakingUnitId, ''), ri.undertakingUnitId, fallback.undertakingUnitId)
      LEFT JOIN common_customers customer ON customer.customerId = COALESCE(NULLIF(m.customerId, ''), ri.customerId, fallback.customerId) OR customer.customerCode = COALESCE(NULLIF(m.customerId, ''), ri.customerId, fallback.customerId)
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
        MIN(DATE_FORMAT(p.createdAt, '%Y-%m-%d')) AS createdAt,
        MAX(DATE_FORMAT(p.updatedAt, '%Y-%m-%d')) AS updatedAt,
        MAX(COALESCE(NULLIF(p.supplierId, ''), ri.supplierId, fallback.supplierId)) AS supplierId,
        MAX(COALESCE(NULLIF(p.undertakingUnitId, ''), ri.undertakingUnitId, fallback.undertakingUnitId)) AS undertakingUnitId,
        MAX(COALESCE(NULLIF(p.customerId, ''), ri.customerId, fallback.customerId)) AS customerId,
        MAX(supplier.supplierCode) AS supplierCode,
        MAX(undertaking.undertakingUnitCode) AS undertakingUnitCode,
        MAX(customer.customerCode) AS customerCode,
        MAX(COALESCE(NULLIF(supplier.shortName, ''), NULLIF(supplier.nameCn, ''), supplier.supplierCode)) AS supplierName,
        MAX(COALESCE(NULLIF(undertaking.shortName, ''), NULLIF(undertaking.entityName, ''), NULLIF(undertaking.name, ''), undertaking.undertakingUnitCode)) AS undertakingUnitName,
        MAX(COALESCE(NULLIF(customer.shortName, ''), NULLIF(customer.nameCn, ''), NULLIF(customer.name, ''), customer.customerCode)) AS customerName,
        MAX(p.quantity) AS quantity, MAX(p.currency) AS currency,
        MAX(COALESCE(NULLIF(p.requestType, ''), NULLIF(contractItem.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(fallback.requestType, ''), CASE WHEN p.lineType = 'fee' THEN '费用' ELSE '整机' END)) AS requestType,
        MAX(COALESCE(country.vatRate, 0)) AS vatRate,
        MAX(CASE WHEN p.lineType = 'fee' THEN 'fee' ELSE 'instance' END) AS lineType,
        SUM(COALESCE(p.monthlyAmount, 0)) AS prepaymentAmount,
        GROUP_CONCAT(p.id ORDER BY p.id SEPARATOR ',') AS prepaymentSourceIds,
        GROUP_CONCAT(DISTINCT p.contractNo ORDER BY p.contractNo SEPARATOR ',') AS prepaymentContractNos
      FROM monthlyprepaymentwriteoffs p
      LEFT JOIN prepaymentcontractitems contractItem ON contractItem.id = p.contractLineId
      LEFT JOIN requestitems ri ON ri.id = contractItem.requestItemId
      LEFT JOIN requestitems fallback ON fallback.requestNo = p.requestNo AND fallback.deviceCode = p.deviceCode
      LEFT JOIN common_suppliers supplier ON supplier.supplierId = COALESCE(NULLIF(p.supplierId, ''), ri.supplierId, fallback.supplierId) OR supplier.supplierCode = COALESCE(NULLIF(p.supplierId, ''), ri.supplierId, fallback.supplierId)
      LEFT JOIN common_undertaking_units undertaking ON undertaking.undertakingUnitId = COALESCE(NULLIF(p.undertakingUnitId, ''), ri.undertakingUnitId, fallback.undertakingUnitId) OR undertaking.undertakingUnitCode = COALESCE(NULLIF(p.undertakingUnitId, ''), ri.undertakingUnitId, fallback.undertakingUnitId) OR undertaking.entityCode = COALESCE(NULLIF(p.undertakingUnitId, ''), ri.undertakingUnitId, fallback.undertakingUnitId)
      LEFT JOIN common_customers customer ON customer.customerId = COALESCE(NULLIF(p.customerId, ''), ri.customerId, fallback.customerId) OR customer.customerCode = COALESCE(NULLIF(p.customerId, ''), ri.customerId, fallback.customerId)
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
         COALESCE(b.requestType, p.requestType, CASE WHEN p.lineType = 'fee' THEN '费用' ELSE '整机' END) AS requestType,
        COALESCE(b.modelCode, p.modelCode) AS modelCode,
        COALESCE(b.nameEn, p.nameEn) AS nameEn,
        COALESCE(b.supplierId, p.supplierId) AS supplierId,
        COALESCE(b.undertakingUnitId, p.undertakingUnitId) AS undertakingUnitId,
        COALESCE(b.customerId, p.customerId) AS customerId,
        COALESCE(b.supplierCode, p.supplierCode) AS supplierCode,
        COALESCE(b.undertakingUnitCode, p.undertakingUnitCode) AS undertakingUnitCode,
        COALESCE(b.customerCode, p.customerCode) AS customerCode,
        COALESCE(b.supplierName, p.supplierName) AS supplierName,
        COALESCE(b.undertakingUnitName, p.undertakingUnitName) AS undertakingUnitName,
        COALESCE(b.customerName, p.customerName) AS customerName,
        CASE WHEN COALESCE(b.createdAt, '9999-12-31') <= COALESCE(p.createdAt, '9999-12-31')
          THEN b.createdAt ELSE p.createdAt END AS createdAt,
        CASE WHEN COALESCE(b.updatedAt, '') >= COALESCE(p.updatedAt, '')
          THEN b.updatedAt ELSE p.updatedAt END AS updatedAt,
        COALESCE(b.quantity, p.quantity, 0) AS quantity,
        COALESCE(b.currency, p.currency) AS currency,
        COALESCE(b.vatRate, p.vatRate, 0) AS vatRate,
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

function getServiceFeeSortExpressions() {
  return {
    writeOffMonth: "combined.writeOffMonth", countryCode: "combined.countryCode", vatRate: "combined.vatRate", batchName: "combined.batchName", requestNo: "combined.requestNo",
    poNo: "combined.poNo", deviceCode: "combined.deviceCode", requestType: "combined.requestType", modelCode: "combined.modelCode", nameEn: "combined.nameEn",
    undertakingUnitName: "combined.undertakingUnitName", supplierName: "combined.supplierName", customerName: "combined.customerName", quantity: "combined.quantity",
    lineType: "combined.lineType", billingCurrency: "combined.billingCurrency", billingAmount: "combined.billingAmount", prepaymentCurrency: "combined.prepaymentCurrency",
    prepaymentAmount: "combined.prepaymentAmount", serviceFeeAmount: "combined.serviceFeeAmount", serviceFeeAmountExcludingTax: "combined.serviceFeeAmountExcludingTax",
    prepaymentContractNos: "combined.prepaymentContractNos", sourceNote: "combined.sourceNote", createdAt: "combined.createdAt", updatedAt: "combined.updatedAt",
  };
}

export async function createServiceFeeStatementDraft({
  snapshotNo,
  filters,
}: {
  snapshotNo?: string;
  filters: ServiceFeeFilters;
}) {
  const statementFilters = normalizeServiceFeeStatementFilters(filters);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(statementFilters)) {
    if (value) params.set(key, value);
  }
  const calculated = await calculateServiceFees(params);
  if (!calculated.rows.length) throw new Error("该国家和核销月份没有可生成的服务费明细");
  if (calculated.rows.some((row) => row.countryCode !== statementFilters.countryCode)) {
    throw new Error("服务费对账单只能包含一个国家的数据");
  }
  if (calculated.rows.some((row) => firstDayOfMonth(row.writeOffMonth) !== statementFilters.startMonth)) {
    throw new Error("服务费对账单只能包含一个核销月份的数据");
  }

  const finalSnapshotNo = snapshotNo?.trim() || buildSnapshotNo(statementFilters.countryCode, statementFilters.startMonth, statementFilters.currency);

  await withTransaction(async (connection) => {
    const existingRows = await queryRowsInTransaction<{ snapshotNo: string; status: string }>(
      connection,
      "SELECT snapshotNo, status FROM servicefeesnapshots WHERE snapshotNo = :snapshotNo LIMIT 1 FOR UPDATE",
      { snapshotNo: finalSnapshotNo },
    );
    if (existingRows[0]?.status === "已确认") throw new Error("已确认的服务费对账单不能重新生成");

    const duplicateRows = await queryRowsInTransaction<{ snapshotNo: string }>(
      connection,
      `
        SELECT snapshotNo
        FROM servicefeesnapshots
        WHERE countryCode = :countryCode
          AND COALESCE(writeOffMonth, startMonth, endMonth) = :writeOffMonth
          AND snapshotNo <> :snapshotNo
          AND EXISTS (
            SELECT 1
            FROM servicefeesnapshotitems AS matchingItem
            WHERE matchingItem.snapshotNo = servicefeesnapshots.snapshotNo
              AND COALESCE(NULLIF(matchingItem.billingCurrency, ''), NULLIF(matchingItem.currency, ''), NULLIF(matchingItem.prepaymentCurrency, '')) = :currency
          )
          AND NOT EXISTS (
            SELECT 1
            FROM servicefeesnapshotitems AS differentItem
            WHERE differentItem.snapshotNo = servicefeesnapshots.snapshotNo
              AND COALESCE(NULLIF(differentItem.billingCurrency, ''), NULLIF(differentItem.currency, ''), NULLIF(differentItem.prepaymentCurrency, '')) <> :currency
          )
        LIMIT 1
        FOR UPDATE
      `,
      {
        countryCode: statementFilters.countryCode,
        writeOffMonth: statementFilters.startMonth,
        snapshotNo: finalSnapshotNo,
        currency: statementFilters.currency,
      },
    );
    if (duplicateRows[0]) {
      throw new Error(`该国家和核销月份已存在服务费对账单 ${duplicateRows[0].snapshotNo}`);
    }

    await executeInTransaction(connection, "DELETE FROM servicefeesnapshotitems WHERE snapshotNo = :snapshotNo", {
      snapshotNo: finalSnapshotNo,
    });
    await executeInTransaction(
      connection,
      `
        INSERT INTO servicefeesnapshots
          (snapshotNo, status, writeOffMonth, startMonth, endMonth, countryCode, batchName, keyword,
           billingTotal, prepaymentTotal, serviceFeeTotal, serviceFeeTotalExcludingTax, vatRate,
           instanceServiceFeeTotal, feeServiceFeeTotal, confirmedAt)
        VALUES
          (:snapshotNo, '未确认', :writeOffMonth, :writeOffMonth, :writeOffMonth, :countryCode, NULL, NULL,
           :billingTotal, :prepaymentTotal, :serviceFeeTotal, :serviceFeeTotalExcludingTax, :vatRate,
           :instanceServiceFeeTotal, :feeServiceFeeTotal, NULL)
        ON DUPLICATE KEY UPDATE
          status = '未确认',
          writeOffMonth = VALUES(writeOffMonth),
          startMonth = VALUES(startMonth),
          endMonth = VALUES(endMonth),
          countryCode = VALUES(countryCode),
          batchName = NULL,
          keyword = NULL,
           billingTotal = VALUES(billingTotal),
           prepaymentTotal = VALUES(prepaymentTotal),
           serviceFeeTotal = VALUES(serviceFeeTotal),
           serviceFeeTotalExcludingTax = VALUES(serviceFeeTotalExcludingTax),
           vatRate = VALUES(vatRate),
           instanceServiceFeeTotal = VALUES(instanceServiceFeeTotal),
          feeServiceFeeTotal = VALUES(feeServiceFeeTotal),
          confirmedAt = NULL
      `,
      {
        snapshotNo: finalSnapshotNo,
        writeOffMonth: statementFilters.startMonth,
        countryCode: statementFilters.countryCode,
        vatRate: Number(calculated.rows[0]?.vatRate ?? 0),
        ...calculated.summary,
      },
    );

    for (const [index, row] of calculated.rows.entries()) {
      await insertSnapshotItem(connection, finalSnapshotNo, index + 1, row);
    }
  });

  return { snapshotNo: finalSnapshotNo, ...calculated };
}

export async function listServiceFeeStatements(searchParams: URLSearchParams) {
  const filters: ServiceFeeStatementFilters = {
    keyword: searchParams.get("keyword")?.trim() || "",
    writeOffMonth: searchParams.get("writeOffMonth")?.trim() || "",
    countryCode: searchParams.get("countryCode")?.trim() || "",
    status: searchParams.get("status")?.trim() || "",
    invoiceStatus: searchParams.get("invoiceStatus")?.trim() || "",
    repaymentStatus: searchParams.get("repaymentStatus")?.trim() || "",
  };
  const exportAll = searchParams.get("export") === "1";
  const requestedPage = Math.max(1, Math.floor(Number(searchParams.get("page") ?? 1) || 1));
  const pageSize = normalizePageSize(Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE));
  const whereParts: string[] = [];
  const params: Row = {};
  const filterExpressions: Record<string, string> = {
    snapshotNo: "snapshotNo", writeOffMonth: formatTableDateExpression("COALESCE(writeOffMonth, startMonth, endMonth)"), countryCode: "countryCode", status: "status",
    billingTotal: "billingTotal", prepaymentTotal: "prepaymentTotal", serviceFeeTotal: "serviceFeeTotal", serviceFeeTotalExcludingTax: "serviceFeeTotalExcludingTax",
    customerReceivable: "serviceFeeTotal", customerReceived: "repaymentAmount", customerInvoice: "invoiceAmountIncludingTax",
    repaymentStatus: "repaymentStatus", repaymentCurrency: "repaymentCurrency", repaymentAmount: "repaymentAmount", repaymentAmountExcludingTax: "repaymentAmountExcludingTax", repaymentVatRate: "repaymentVatRate",
    invoiceNo: "invoiceNo", invoiceCurrency: "invoiceCurrency", invoiceAmountExcludingTax: "invoiceAmountExcludingTax", invoiceVatRate: "invoiceVatRate", invoiceAmountIncludingTax: "invoiceAmountIncludingTax",
    invoiceStatus: "invoiceStatus", invoiceOriginalName: "invoiceOriginalName",
  };
  for (const [field, expression] of Object.entries(filterExpressions)) appendTableInFilter(whereParts, params, expression, field, searchParams, "serviceStatement");
  if (filters.keyword) {
    whereParts.push("CONCAT_WS(' ', snapshotNo, countryCode, status, invoiceStatus, repaymentStatus, invoiceOriginalName) LIKE :keyword");
    params.keyword = `%${filters.keyword}%`;
  }
  if (filters.writeOffMonth) {
    whereParts.push("COALESCE(writeOffMonth, startMonth, endMonth) = :writeOffMonth");
    params.writeOffMonth = firstDayOfMonth(filters.writeOffMonth);
  }
  for (const key of ["countryCode", "status", "invoiceStatus", "repaymentStatus"] as const) {
    if (!filters[key]) continue;
    whereParts.push(`${key} = :${key}`);
    params[key] = filters[key];
  }
  const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  const [{ total: totalValue }] = await queryRows<{ total: number }>(
    `SELECT COUNT(*) AS total FROM servicefeesnapshots ${where}`,
    params,
  );
  const total = Number(totalValue ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = exportAll ? 1 : Math.min(requestedPage, totalPages);
  const rows = await queryRows<Row>(
    `
      SELECT snapshotNo,
             status,
             DATE_FORMAT(COALESCE(writeOffMonth, startMonth, endMonth), '%Y-%m-%d') AS writeOffMonth,
             countryCode,
             billingTotal,
             prepaymentTotal,
             serviceFeeTotal,
             serviceFeeTotalExcludingTax,
             vatRate,
             instanceServiceFeeTotal,
             feeServiceFeeTotal,
             repaymentStatus,
             receivingUnitId,
             payerCustomerId,
             repaymentCurrency,
             repaymentAmount,
             repaymentAmountExcludingTax,
             repaymentVatRate,
             DATE_FORMAT(repaymentDate, '%Y-%m-%d') AS repaymentDate,
             DATE_FORMAT(repaymentUpdatedAt, '%Y-%m-%d') AS repaymentUpdatedAt,
             invoiceNo,
             invoiceCurrency,
             invoiceReceivingUnitId,
             invoicePayerCustomerId,
             invoiceAmountExcludingTax,
             invoiceVatRate,
             invoiceAmountIncludingTax,
             invoiceStatus,
             invoiceOriginalName,
             invoiceMimeType,
             invoiceFileSize,
             invoiceUploadedBy,
             DATE_FORMAT(invoiceUploadedAt, '%Y-%m-%d') AS invoiceUploadedAt,
             DATE_FORMAT(confirmedAt, '%Y-%m-%d') AS confirmedAt,
             DATE_FORMAT(createdAt, '%Y-%m-%d') AS createdAt,
             DATE_FORMAT(updatedAt, '%Y-%m-%d') AS updatedAt
      FROM servicefeesnapshots
      ${where}
      ${getTableSort(searchParams, filterExpressions) || "ORDER BY COALESCE(writeOffMonth, startMonth, endMonth) DESC, createdAt DESC"}
      ${exportAll ? "" : "LIMIT :limit OFFSET :offset"}
    `,
    exportAll ? params : { ...params, limit: pageSize, offset: (page - 1) * pageSize },
  );
  const defaultsBySnapshot = new Map<string, Row>();
  if (rows.length) {
    const snapshotNos = rows.map((row) => String(row.snapshotNo));
      const defaults = await queryRows<Row>(
        `
          SELECT snapshotNo,
            CASE WHEN COUNT(DISTINCT NULLIF(COALESCE(unit.undertakingUnitId, items.undertakingUnitId), '')) = 1
              THEN MAX(NULLIF(COALESCE(unit.undertakingUnitId, items.undertakingUnitId), '')) ELSE NULL END AS defaultReceivingUnitId,
            CASE WHEN COUNT(DISTINCT NULLIF(COALESCE(customer.customerId, items.customerId), '')) = 1
              THEN MAX(NULLIF(COALESCE(customer.customerId, items.customerId), '')) ELSE NULL END AS defaultPayerCustomerId,
            CASE WHEN COUNT(DISTINCT NULLIF(COALESCE(NULLIF(items.billingCurrency, ''), NULLIF(items.currency, ''), NULLIF(items.prepaymentCurrency, '')), '')) = 1
              THEN MAX(NULLIF(COALESCE(NULLIF(items.billingCurrency, ''), NULLIF(items.currency, ''), NULLIF(items.prepaymentCurrency, '')), '')) ELSE NULL END AS defaultBillingCurrency,
            CASE WHEN COUNT(DISTINCT NULLIF(COALESCE(NULLIF(items.billingCurrency, ''), NULLIF(items.prepaymentCurrency, ''), NULLIF(items.currency, '')), '')) = 1
              THEN MAX(NULLIF(COALESCE(NULLIF(items.billingCurrency, ''), NULLIF(items.prepaymentCurrency, ''), NULLIF(items.currency, '')), '')) ELSE NULL END AS defaultRepaymentCurrency,
            GROUP_CONCAT(DISTINCT NULLIF(COALESCE(NULLIF(unit.shortName, ''), NULLIF(unit.entityName, ''), NULLIF(unit.name, ''), NULLIF(unit.undertakingUnitCode, ''), NULLIF(items.undertakingUnitId, '')), '') ORDER BY unit.shortName SEPARATOR ', ') AS undertakingUnitName,
            GROUP_CONCAT(DISTINCT NULLIF(COALESCE(NULLIF(customer.shortName, ''), NULLIF(customer.nameCn, ''), NULLIF(customer.name, ''), NULLIF(customer.customerCode, ''), NULLIF(items.customerId, '')), '') ORDER BY customer.shortName SEPARATOR ', ') AS customerName
          FROM servicefeesnapshotitems AS items
          LEFT JOIN common_undertaking_units AS unit ON unit.undertakingUnitId = items.undertakingUnitId OR unit.undertakingUnitCode = items.undertakingUnitId OR unit.entityCode = items.undertakingUnitId
          LEFT JOIN common_customers AS customer ON customer.customerId = items.customerId OR customer.customerCode = items.customerId
          WHERE items.snapshotNo IN (:snapshotNos)
          GROUP BY items.snapshotNo
        `,
      { snapshotNos },
    );
    defaults.forEach((row) => defaultsBySnapshot.set(String(row.snapshotNo), row));
  }
  const rowsWithDefaults = rows.map((row) => ({
    ...defaultsBySnapshot.get(String(row.snapshotNo)),
    ...row,
    defaultRepaymentAmount: Number(row.serviceFeeTotal ?? 0),
  }));
  return { rows: await attachRepaymentPartyCodes(rowsWithDefaults), total, page, pageSize, totalPages };
}

export async function listServiceFeeStatementFilterOptions(searchParams: URLSearchParams) {
  const expressions: Record<string, string> = {
    snapshotNo: "snapshotNo", writeOffMonth: formatTableDateExpression("COALESCE(writeOffMonth, startMonth, endMonth)"), countryCode: "countryCode", status: "status",
    billingTotal: "billingTotal", prepaymentTotal: "prepaymentTotal", serviceFeeTotal: "serviceFeeTotal", serviceFeeTotalExcludingTax: "serviceFeeTotalExcludingTax",
    customerReceivable: "serviceFeeTotal", customerReceived: "repaymentAmount", customerInvoice: "invoiceAmountIncludingTax",
    repaymentStatus: "repaymentStatus", repaymentCurrency: "repaymentCurrency", repaymentAmount: "repaymentAmount", repaymentAmountExcludingTax: "repaymentAmountExcludingTax", repaymentVatRate: "repaymentVatRate",
    invoiceNo: "invoiceNo", invoiceCurrency: "invoiceCurrency", invoiceAmountExcludingTax: "invoiceAmountExcludingTax", invoiceVatRate: "invoiceVatRate", invoiceAmountIncludingTax: "invoiceAmountIncludingTax",
    invoiceStatus: "invoiceStatus", invoiceOriginalName: "invoiceOriginalName",
  };
  const field = searchParams.get("field")?.trim() ?? "";
  const expression = expressions[field];
  if (!expression) return { options: [] as Array<{ value: string; count: number }> };
  const params: Row = {};
  const where = [`${expression} IS NOT NULL`, `TRIM(CAST(${expression} AS CHAR)) <> ''`];
  const keyword = searchParams.get("keyword")?.trim() ?? "";
  if (keyword) { where.push(`${expression} LIKE :optionKeyword`); params.optionKeyword = `%${keyword}%`; }
  for (const [candidateField, candidateExpression] of Object.entries(expressions)) {
    if (candidateField === field) continue;
    const values = searchParams.getAll(`filter.${candidateField}`).map((value) => value.trim()).filter(Boolean);
    if (!values.length) continue;
    const name = `serviceStatementOption_${candidateField}`;
    where.push(`${candidateExpression} IN (:${name})`);
    params[name] = Array.from(new Set(values));
  }
  const rows = await queryRows<{ value: string; count: number }>(`SELECT ${expression} AS value, COUNT(*) AS count FROM servicefeesnapshots WHERE ${where.join(" AND ")} GROUP BY ${expression} ORDER BY ${getTableFilterOptionsOrderBy(field, expression)} LIMIT 500`, params);
  return { options: rows.map((row) => ({ value: String(row.value ?? ""), count: Number(row.count ?? 0) })) };
}

async function attachRepaymentPartyCodes(rows: Row[]) {
  const receivingIds = Array.from(new Set(rows.flatMap((row) => [
    firstNonBlank(row.receivingUnitId, row.defaultReceivingUnitId),
    firstNonBlank(row.invoiceReceivingUnitId, row.defaultReceivingUnitId),
  ]).filter(Boolean)));
  const payerIds = Array.from(new Set(rows.flatMap((row) => [
    firstNonBlank(row.payerCustomerId, row.defaultPayerCustomerId),
    firstNonBlank(row.invoicePayerCustomerId, row.defaultPayerCustomerId),
  ]).filter(Boolean)));
  const [units, customers] = await Promise.all([
    receivingIds.length ? queryRows<Row>("SELECT undertakingUnitId, undertakingUnitCode, entityCode, shortName, entityName, name FROM common_undertaking_units WHERE undertakingUnitId IN (:receivingIds) OR undertakingUnitCode IN (:receivingIds) OR entityCode IN (:receivingIds)", { receivingIds }) : [],
    payerIds.length ? queryRows<Row>("SELECT customerId, customerCode, shortName, nameCn, name FROM common_customers WHERE customerId IN (:payerIds) OR customerCode IN (:payerIds)", { payerIds }) : [],
  ]);
  const unitIds = new Map<string, string>();
  const unitNames = new Map<string, string>();
  for (const row of units) {
    const id = String(row.undertakingUnitId ?? "");
    const code = String(row.undertakingUnitCode ?? id);
    const name = String(row.shortName ?? row.entityName ?? row.name ?? code);
    for (const reference of [row.undertakingUnitId, row.undertakingUnitCode, row.entityCode]) {
      if (reference !== null && reference !== undefined && String(reference).trim()) unitIds.set(String(reference), id);
    }
    if (id) unitNames.set(id, name);
  }
  const customerIds = new Map<string, string>();
  const customerNames = new Map<string, string>();
  for (const row of customers) {
    const id = String(row.customerId ?? "");
    const code = String(row.customerCode ?? id);
    const name = String(row.shortName ?? row.nameCn ?? row.name ?? code);
    for (const reference of [row.customerId, row.customerCode]) {
      if (reference !== null && reference !== undefined && String(reference).trim()) customerIds.set(String(reference), id);
    }
    if (id) customerNames.set(id, name);
  }
  return rows.map((row) => {
    const receivingId = firstNonBlank(row.receivingUnitId, row.defaultReceivingUnitId);
    const payerId = firstNonBlank(row.payerCustomerId, row.defaultPayerCustomerId);
    const invoiceReceivingId = firstNonBlank(row.invoiceReceivingUnitId, row.defaultReceivingUnitId);
    const invoicePayerId = firstNonBlank(row.invoicePayerCustomerId, row.defaultPayerCustomerId);
    const normalizedReceivingId = unitIds.get(receivingId) ?? receivingId;
    const normalizedPayerId = customerIds.get(payerId) ?? payerId;
    const normalizedInvoiceReceivingId = unitIds.get(invoiceReceivingId) ?? invoiceReceivingId;
    const normalizedInvoicePayerId = customerIds.get(invoicePayerId) ?? invoicePayerId;
    return {
      ...row,
      receivingUnitId: row.receivingUnitId ? normalizedReceivingId : row.receivingUnitId,
      defaultReceivingUnitId: row.defaultReceivingUnitId ? unitIds.get(String(row.defaultReceivingUnitId)) ?? row.defaultReceivingUnitId : row.defaultReceivingUnitId,
      payerCustomerId: row.payerCustomerId ? normalizedPayerId : row.payerCustomerId,
      defaultPayerCustomerId: row.defaultPayerCustomerId ? customerIds.get(String(row.defaultPayerCustomerId)) ?? row.defaultPayerCustomerId : row.defaultPayerCustomerId,
      receivingUnitCode: unitNames.get(normalizedReceivingId) ?? receivingId,
      payerCustomerCode: customerNames.get(normalizedPayerId) ?? payerId,
      invoiceReceivingUnitId: row.invoiceReceivingUnitId ? normalizedInvoiceReceivingId : row.invoiceReceivingUnitId,
      invoicePayerCustomerId: row.invoicePayerCustomerId ? normalizedInvoicePayerId : row.invoicePayerCustomerId,
      invoiceReceivingUnitCode: row.invoiceReceivingUnitId ? unitNames.get(normalizedInvoiceReceivingId) ?? invoiceReceivingId : null,
      invoicePayerCustomerCode: row.invoicePayerCustomerId ? customerNames.get(normalizedInvoicePayerId) ?? invoicePayerId : null,
    };
  });
}

export async function updateServiceFeeRepayment(snapshotNo: string, input: Row) {
  const repaymentStatus = String(input.repaymentStatus ?? "").trim();
  if (!new Set(["未回款", "已回款"]).has(repaymentStatus)) throw new Error("回款状态无效");
  const receivingUnitId = String(input.receivingUnitId ?? "").trim();
  const payerCustomerId = String(input.payerCustomerId ?? "").trim();
  const repaymentCurrency = String(input.repaymentCurrency ?? "").trim();
  let repaymentAmount = nullableNumber(input.repaymentAmount);
  let repaymentAmountExcludingTax = nullableNumber(input.repaymentAmountExcludingTax);
  const repaymentVatRate = nullableRate(input.repaymentVatRate);
  const repaymentDate = String(input.repaymentDate ?? "").slice(0, 10);
  if (repaymentAmount === null && repaymentAmountExcludingTax !== null && repaymentVatRate !== null) {
    repaymentAmount = repaymentAmountExcludingTax * (1 + repaymentVatRate);
  }
  if (repaymentAmountExcludingTax === null && repaymentAmount !== null && repaymentVatRate !== null) {
    repaymentAmountExcludingTax = repaymentAmount / (1 + repaymentVatRate);
  }
  if (repaymentStatus === "已回款") {
    if (!receivingUnitId) throw new Error("请选择收款单位");
    if (!payerCustomerId) throw new Error("请选择付款单位");
    if (!repaymentCurrency) throw new Error("请选择回款币种");
    if (repaymentAmount === null && repaymentAmountExcludingTax === null) throw new Error("请填写回款含税金额或未税金额");
    if (repaymentVatRate !== null && repaymentVatRate < 0) throw new Error("回款税率不能小于 0");
    if (!repaymentDate) throw new Error("请选择回款日期");
  }
  const existing = await queryRows<Row>("SELECT snapshotNo FROM servicefeesnapshots WHERE snapshotNo = :snapshotNo LIMIT 1", { snapshotNo });
  if (!existing[0]) throw new Error("服务费对账单不存在");
  await execute(
    `UPDATE servicefeesnapshots
     SET repaymentStatus = :repaymentStatus, receivingUnitId = :receivingUnitId, payerCustomerId = :payerCustomerId,
         repaymentCurrency = :repaymentCurrency, repaymentAmount = :repaymentAmount,
         repaymentAmountExcludingTax = :repaymentAmountExcludingTax, repaymentVatRate = :repaymentVatRate,
         repaymentDate = :repaymentDate,
         repaymentUpdatedAt = CURRENT_TIMESTAMP
     WHERE snapshotNo = :snapshotNo`,
    {
      snapshotNo,
      repaymentStatus,
      receivingUnitId: receivingUnitId || null,
      payerCustomerId: payerCustomerId || null,
      repaymentCurrency: repaymentCurrency || null,
      repaymentAmount,
      repaymentAmountExcludingTax,
      repaymentVatRate,
      repaymentDate: repaymentDate || null,
    },
  );
  return { snapshotNo, repaymentStatus, receivingUnitId, payerCustomerId, repaymentCurrency, repaymentAmount, repaymentAmountExcludingTax, repaymentVatRate, repaymentDate };
}

export async function updateServiceFeeInvoiceInfo(snapshotNo: string, input: Row) {
  const invoiceNo = String(input.invoiceNo ?? "").trim();
  const invoiceCurrency = String(input.invoiceCurrency ?? "").trim();
  const invoiceReceivingUnitId = String(input.invoiceReceivingUnitId ?? "").trim();
  const invoicePayerCustomerId = String(input.invoicePayerCustomerId ?? "").trim();
  let invoiceAmountExcludingTax = nullableNumber(input.invoiceAmountExcludingTax);
  const invoiceVatRate = nullableRate(input.invoiceVatRate);
  let invoiceAmountIncludingTax = nullableNumber(input.invoiceAmountIncludingTax);
  if (invoiceAmountIncludingTax === null && invoiceAmountExcludingTax !== null && invoiceVatRate !== null) {
    invoiceAmountIncludingTax = invoiceAmountExcludingTax * (1 + invoiceVatRate);
  }
  if (invoiceAmountExcludingTax === null && invoiceAmountIncludingTax !== null && invoiceVatRate !== null) {
    invoiceAmountExcludingTax = invoiceAmountIncludingTax / (1 + invoiceVatRate);
  }
  if (invoiceVatRate !== null && invoiceVatRate < 0) throw new Error("发票税率不能小于 0");
  const existing = await queryRows<Row>("SELECT snapshotNo FROM servicefeesnapshots WHERE snapshotNo = :snapshotNo LIMIT 1", { snapshotNo });
  if (!existing[0]) throw new Error("服务费对账单不存在");
  await execute(
    `UPDATE servicefeesnapshots
     SET invoiceNo = :invoiceNo, invoiceCurrency = :invoiceCurrency,
         invoiceReceivingUnitId = :invoiceReceivingUnitId, invoicePayerCustomerId = :invoicePayerCustomerId,
         invoiceAmountExcludingTax = :invoiceAmountExcludingTax, invoiceVatRate = :invoiceVatRate,
         invoiceAmountIncludingTax = :invoiceAmountIncludingTax
     WHERE snapshotNo = :snapshotNo`,
    {
      snapshotNo,
      invoiceNo: invoiceNo || null,
      invoiceCurrency: invoiceCurrency || null,
      invoiceReceivingUnitId: invoiceReceivingUnitId || null,
      invoicePayerCustomerId: invoicePayerCustomerId || null,
      invoiceAmountExcludingTax,
      invoiceVatRate,
      invoiceAmountIncludingTax,
    },
  );
  return { snapshotNo, invoiceNo, invoiceCurrency, invoiceReceivingUnitId, invoicePayerCustomerId, invoiceAmountExcludingTax, invoiceVatRate, invoiceAmountIncludingTax };
}

export async function confirmServiceFeeStatement(snapshotNo: string) {
  return withTransaction(async (connection) => {
    const rows = await queryRowsInTransaction<{ status: string; countryCode: string | null; writeOffMonth: string | null }>(
      connection,
      "SELECT status, countryCode, COALESCE(writeOffMonth, startMonth, endMonth) AS writeOffMonth FROM servicefeesnapshots WHERE snapshotNo = :snapshotNo LIMIT 1 FOR UPDATE",
      { snapshotNo },
    );
    const statement = rows[0];
    if (!statement) throw new Error("服务费对账单不存在");
    if (statement.status === "已确认") return { snapshotNo, status: "已确认" };
    if (!statement.countryCode || !statement.writeOffMonth) throw new Error("对账单缺少国家或核销月份，不能确认");
    const [{ total }] = await queryRowsInTransaction<{ total: number }>(
      connection,
      "SELECT COUNT(*) AS total FROM servicefeesnapshotitems WHERE snapshotNo = :snapshotNo",
      { snapshotNo },
    );
    if (Number(total ?? 0) === 0) throw new Error("对账单没有明细，不能确认");
    await executeInTransaction(
      connection,
      "UPDATE servicefeesnapshots SET status = '已确认', confirmedAt = CURRENT_TIMESTAMP WHERE snapshotNo = :snapshotNo",
      { snapshotNo },
    );
    return { snapshotNo, status: "已确认" };
  });
}

export async function deleteServiceFeeStatementDraft(snapshotNo: string) {
  const invoiceFilePath = await withTransaction(async (connection) => {
    const rows = await queryRowsInTransaction<{ status: string; invoiceFilePath: string | null }>(
      connection,
      "SELECT status, invoiceFilePath FROM servicefeesnapshots WHERE snapshotNo = :snapshotNo LIMIT 1 FOR UPDATE",
      { snapshotNo },
    );
    if (!rows[0]) throw new Error("服务费对账单不存在");
    if (rows[0].status === "已确认") throw new Error("已确认的服务费对账单不能删除或退回");
    await executeInTransaction(connection, "DELETE FROM servicefeesnapshotitems WHERE snapshotNo = :snapshotNo", { snapshotNo });
    await executeInTransaction(connection, "DELETE FROM servicefeesnapshots WHERE snapshotNo = :snapshotNo", { snapshotNo });
    return rows[0].invoiceFilePath;
  });
  if (invoiceFilePath) await unlink(invoiceFilePath).catch(() => undefined);
  return { snapshotNo };
}

export async function updateServiceFeeInvoiceStatus(snapshotNo: string, invoiceStatus: string) {
  if (!new Set(["未开票", "已开票"]).has(invoiceStatus)) throw new Error("开票状态无效");
  const rows = await queryRows<{ snapshotNo: string }>(
    "SELECT snapshotNo FROM servicefeesnapshots WHERE snapshotNo = :snapshotNo LIMIT 1",
    { snapshotNo },
  );
  if (!rows[0]) throw new Error("服务费对账单不存在");
  await execute(
    "UPDATE servicefeesnapshots SET invoiceStatus = :invoiceStatus WHERE snapshotNo = :snapshotNo",
    { snapshotNo, invoiceStatus },
  );
  return { snapshotNo, invoiceStatus };
}

export async function saveServiceFeeInvoice({
  snapshotNo,
  originalName,
  mimeType,
  bytes,
  uploadedBy,
}: {
  snapshotNo: string;
  originalName: string;
  mimeType: string;
  bytes: Buffer;
  uploadedBy?: string | null;
}) {
  const extension = path.extname(originalName).toLowerCase();
  if (!allowedInvoiceExtensions.has(extension)) throw new Error("仅支持 PDF、Word、Excel 和常见图片格式");
  if (!bytes.length) throw new Error("上传文件不能为空");
  if (bytes.length > maxInvoiceFileSize) throw new Error("发票附件不能超过 25MB");
  const existingRows = await queryRows<{ invoiceFilePath: string | null }>(
    "SELECT invoiceFilePath FROM servicefeesnapshots WHERE snapshotNo = :snapshotNo LIMIT 1",
    { snapshotNo },
  );
  if (!existingRows[0]) throw new Error("服务费对账单不存在");

  await mkdir(invoiceUploadRoot, { recursive: true });
  const safeName = sanitizeDocumentFileName(originalName);
  const storedName = `${randomUUID()}-${safeName}`;
  const filePath = path.join(invoiceUploadRoot, storedName);
  await writeFile(filePath, bytes);
  try {
    await execute(
      `
        UPDATE servicefeesnapshots
        SET invoiceOriginalName = :invoiceOriginalName,
            invoiceStoredName = :invoiceStoredName,
            invoiceFilePath = :invoiceFilePath,
            invoiceMimeType = :invoiceMimeType,
            invoiceFileSize = :invoiceFileSize,
            invoiceUploadedBy = :invoiceUploadedBy,
            invoiceUploadedAt = CURRENT_TIMESTAMP
        WHERE snapshotNo = :snapshotNo
      `,
      {
        snapshotNo,
        invoiceOriginalName: safeName,
        invoiceStoredName: storedName,
        invoiceFilePath: filePath,
        invoiceMimeType: mimeType || "application/octet-stream",
        invoiceFileSize: bytes.length,
        invoiceUploadedBy: uploadedBy || null,
      },
    );
  } catch (error) {
    await unlink(filePath).catch(() => undefined);
    throw error;
  }
  const previousFilePath = existingRows[0].invoiceFilePath;
  if (previousFilePath && previousFilePath !== filePath) await unlink(previousFilePath).catch(() => undefined);
  return { snapshotNo, invoiceOriginalName: safeName, invoiceMimeType: mimeType, invoiceFileSize: bytes.length };
}

export async function getServiceFeeInvoice(snapshotNo: string) {
  const rows = await queryRows<{
    invoiceOriginalName: string | null;
    invoiceFilePath: string | null;
    invoiceMimeType: string | null;
  }>(
    "SELECT invoiceOriginalName, invoiceFilePath, invoiceMimeType FROM servicefeesnapshots WHERE snapshotNo = :snapshotNo LIMIT 1",
    { snapshotNo },
  );
  const invoice = rows[0];
  if (!invoice?.invoiceFilePath || !invoice.invoiceOriginalName) throw new Error("该对账单没有发票附件");
  return {
    bytes: await readFile(invoice.invoiceFilePath),
    fileName: invoice.invoiceOriginalName,
    mimeType: invoice.invoiceMimeType || "application/octet-stream",
  };
}

export async function deleteServiceFeeInvoice(snapshotNo: string) {
  const rows = await queryRows<{ invoiceFilePath: string | null }>(
    "SELECT invoiceFilePath FROM servicefeesnapshots WHERE snapshotNo = :snapshotNo LIMIT 1",
    { snapshotNo },
  );
  if (!rows[0]) throw new Error("服务费对账单不存在");
  await execute(
    `
      UPDATE servicefeesnapshots
      SET invoiceOriginalName = NULL,
          invoiceStoredName = NULL,
          invoiceFilePath = NULL,
          invoiceMimeType = NULL,
          invoiceFileSize = NULL,
          invoiceUploadedBy = NULL,
          invoiceUploadedAt = NULL
      WHERE snapshotNo = :snapshotNo
    `,
    { snapshotNo },
  );
  if (rows[0].invoiceFilePath) await unlink(rows[0].invoiceFilePath).catch(() => undefined);
  return { snapshotNo };
}

function normalizeServiceFeeStatementFilters(filters: ServiceFeeFilters) {
  const countryCode = String(filters.countryCode ?? "").trim().split(/\s*-\s*/, 1)[0].toUpperCase();
  const currency = String(filters.currency ?? "").trim().toUpperCase();
  const startMonth = filters.startMonth ? firstDayOfMonth(filters.startMonth) : "";
  const endMonth = filters.endMonth ? firstDayOfMonth(filters.endMonth) : startMonth;
  if (!countryCode) throw new Error("请选择国家");
  if (!startMonth) throw new Error("请选择核销月份");
  if (!currency) throw new Error("请输入币种");
  if (startMonth !== endMonth) throw new Error("服务费对账单必须按单一核销月份生成");
  return { countryCode, currency, startMonth, endMonth: startMonth };
}

function getFilters(searchParams: URLSearchParams): ServiceFeeFilters {
  return {
    keyword: searchParams.get("keyword")?.trim() || "",
    startMonth: searchParams.get("startMonth")?.trim() || "",
    endMonth: searchParams.get("endMonth")?.trim() || "",
    countryCode: searchParams.get("countryCode")?.trim() || "",
    batchName: searchParams.get("batchName")?.trim() || "",
    currency: searchParams.get("currency")?.trim() || "",
    lineType: searchParams.get("lineType")?.trim() || "",
    requestType: searchParams.get("requestType")?.trim() || "",
  };
}

async function listBillingRows(filters: ServiceFeeFilters) {
  const whereParts: string[] = [];
  const params: Row = {};
  const requestTypeExpression = serviceFeeBillingDetailRequestTypeExpression();
  applyCommonWhere(whereParts, params, filters, "monthlybillingwriteoffs", requestTypeExpression);

  const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  return queryRows<ServiceFeeBillingRow>(
    `
      SELECT
        monthlybillingwriteoffs.id,
        monthlybillingwriteoffs.ledgerId,
        DATE_FORMAT(monthlybillingwriteoffs.writeOffMonth, '%Y-%m-%d') AS writeOffMonth,
        monthlybillingwriteoffs.countryCode,
        monthlybillingwriteoffs.batchName,
        monthlybillingwriteoffs.requestNo,
        monthlybillingwriteoffs.poNo,
        monthlybillingwriteoffs.deviceCode,
        ${requestTypeExpression} AS requestType,
        monthlybillingwriteoffs.modelCode,
        monthlybillingwriteoffs.nameEn AS nameEn,
        COALESCE(NULLIF(monthlybillingwriteoffs.supplierId, ''), ri.linkedSupplierId, riByBusinessKey.fallbackSupplierId) AS supplierId,
        COALESCE(NULLIF(monthlybillingwriteoffs.undertakingUnitId, ''), ri.linkedUndertakingUnitId, riByBusinessKey.fallbackUndertakingUnitId) AS undertakingUnitId,
        COALESCE(NULLIF(monthlybillingwriteoffs.customerId, ''), ri.linkedCustomerId, riByBusinessKey.fallbackCustomerId) AS customerId,
        monthlybillingwriteoffs.quantity,
        currency,
        COALESCE(country.vatRate, 0) AS vatRate,
        monthlyTotalAmount,
        monthlyAmount,
        DATE_FORMAT(monthlybillingwriteoffs.createdAt, '%Y-%m-%d') AS createdAt,
        DATE_FORMAT(monthlybillingwriteoffs.updatedAt, '%Y-%m-%d') AS updatedAt
      FROM monthlybillingwriteoffs
      LEFT JOIN (SELECT ledgerId AS linkedLedgerId, purchaseOrderItemId AS linkedPurchaseOrderItemId, requestType AS linkedRequestType FROM billinginstanceledgers) AS ledger ON ledger.linkedLedgerId = monthlybillingwriteoffs.ledgerId
      LEFT JOIN purchaseorderitems AS purchaseItem ON purchaseItem.id = ledger.linkedPurchaseOrderItemId
      LEFT JOIN (SELECT id AS linkedRequestItemId, requestNo AS linkedRequestNo, requestType AS linkedRequestType, supplierId AS linkedSupplierId, undertakingUnitId AS linkedUndertakingUnitId, customerId AS linkedCustomerId FROM requestitems) AS ri ON ri.linkedRequestItemId = purchaseItem.requestItemId
      LEFT JOIN requests AS req ON req.requestNo = COALESCE(NULLIF(purchaseItem.requestNo, ''), NULLIF(ri.linkedRequestNo, ''), monthlybillingwriteoffs.requestNo)
      LEFT JOIN (SELECT requestNo AS keyRequestNo, deviceCode AS keyDeviceCode, requestType AS fallbackRequestType, supplierId AS fallbackSupplierId, undertakingUnitId AS fallbackUndertakingUnitId, customerId AS fallbackCustomerId FROM requestitems) AS riByBusinessKey ON riByBusinessKey.keyRequestNo = monthlybillingwriteoffs.requestNo AND riByBusinessKey.keyDeviceCode = monthlybillingwriteoffs.deviceCode
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
  applyCommonWhere(whereParts, params, filters, "monthlyprepaymentwriteoffs");

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
        requestType,
        modelCode,
        monthlyprepaymentwriteoffs.nameEn AS nameEn,
        COALESCE(NULLIF(monthlyprepaymentwriteoffs.supplierId, ''), ri.linkedSupplierId, riByBusinessKey.fallbackSupplierId) AS supplierId,
        COALESCE(NULLIF(monthlyprepaymentwriteoffs.undertakingUnitId, ''), ri.linkedUndertakingUnitId, riByBusinessKey.fallbackUndertakingUnitId) AS undertakingUnitId,
        COALESCE(NULLIF(monthlyprepaymentwriteoffs.customerId, ''), ri.linkedCustomerId, riByBusinessKey.fallbackCustomerId) AS customerId,
        quantity,
        currency,
        COALESCE(country.vatRate, 0) AS vatRate,
        monthlyAmount,
        lineType,
        DATE_FORMAT(monthlyprepaymentwriteoffs.createdAt, '%Y-%m-%d') AS createdAt,
        DATE_FORMAT(monthlyprepaymentwriteoffs.updatedAt, '%Y-%m-%d') AS updatedAt
      FROM monthlyprepaymentwriteoffs
      LEFT JOIN (SELECT id AS linkedContractLineId, requestItemId AS linkedRequestItemId FROM prepaymentcontractitems) AS contractItem ON contractItem.linkedContractLineId = monthlyprepaymentwriteoffs.contractLineId
      LEFT JOIN (SELECT id AS linkedRequestItemId, supplierId AS linkedSupplierId, undertakingUnitId AS linkedUndertakingUnitId, customerId AS linkedCustomerId FROM requestitems) AS ri ON ri.linkedRequestItemId = contractItem.linkedRequestItemId
      LEFT JOIN (SELECT requestNo AS keyRequestNo, deviceCode AS keyDeviceCode, supplierId AS fallbackSupplierId, undertakingUnitId AS fallbackUndertakingUnitId, customerId AS fallbackCustomerId FROM requestitems) AS riByBusinessKey ON riByBusinessKey.keyRequestNo = monthlyprepaymentwriteoffs.requestNo AND riByBusinessKey.keyDeviceCode = monthlyprepaymentwriteoffs.deviceCode
      LEFT JOIN countries AS country ON country.code = monthlyprepaymentwriteoffs.countryCode
      ${where}
      ORDER BY writeOffMonth, countryCode, batchName, requestNo, poNo, deviceCode, contractLineId
    `,
    params,
  );
}

function applyCommonWhere(whereParts: string[], params: Row, filters: ServiceFeeFilters, tableAlias = "", requestTypeExpression?: string) {
  const column = (name: string) => tableAlias ? `${tableAlias}.${name}` : name;
  if (filters.startMonth) {
    whereParts.push(`${column("writeOffMonth")} >= :startMonth`);
    params.startMonth = firstDayOfMonth(filters.startMonth);
  }
  if (filters.endMonth) {
    whereParts.push(`${column("writeOffMonth")} <= :endMonth`);
    params.endMonth = firstDayOfMonth(filters.endMonth);
  }
  if (filters.countryCode) {
    whereParts.push(`${column("countryCode")} = :countryCode`);
    params.countryCode = filters.countryCode;
  }
  if (filters.batchName) {
    whereParts.push(`${column("batchName")} = :batchName`);
    params.batchName = filters.batchName;
  }
  if (filters.requestType) {
    whereParts.push(`${requestTypeExpression ?? column("requestType")} = :requestType`);
    params.requestType = filters.requestType;
  }
}

function filterCalculatedRows(rows: ServiceFeeRow[], filters: ServiceFeeFilters) {
  const keyword = filters.keyword?.toLowerCase();
  return rows.filter((row) => {
    if (filters.lineType && row.lineType !== filters.lineType) return false;
    if (filters.requestType && row.requestType !== filters.requestType) return false;
    if (!keyword) return true;
    return [
      row.writeOffMonth,
      row.countryCode,
      row.batchName,
      row.requestNo,
      row.poNo,
      row.deviceCode,
      row.requestType,
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

async function insertSnapshotItem(connection: PoolConnection, snapshotNo: string, index: number, row: ServiceFeeRow) {
  await executeInTransaction(
    connection,
      `
        INSERT INTO servicefeesnapshotitems
          (id, snapshotNo, writeOffMonth, countryCode, vatRate, batchName, requestNo, poNo, deviceCode,
          modelCode, nameEn, supplierId, undertakingUnitId, customerId, quantity, currency, billingCurrency, prepaymentCurrency, lineType, billingAmount, prepaymentAmount,
          serviceFeeAmount, serviceFeeAmountExcludingTax, billingSourceIds, prepaymentSourceIds, prepaymentContractNos, sourceNote)
        VALUES
          (:id, :snapshotNo, :writeOffMonth, :countryCode, :vatRate, :batchName, :requestNo, :poNo, :deviceCode,
          :modelCode, :nameEn, :supplierId, :undertakingUnitId, :customerId, :quantity, :currency, :billingCurrency, :prepaymentCurrency, :lineType, :billingAmount, :prepaymentAmount,
          :serviceFeeAmount, :serviceFeeAmountExcludingTax, :billingSourceIds, :prepaymentSourceIds, :prepaymentContractNos, :sourceNote)
    `,
    {
      ...row,
      id: `${snapshotNo}-${String(index).padStart(5, "0")}`,
      snapshotNo,
    },
  );
}

function buildSnapshotNo(countryCode: string, writeOffMonth: string, currency: string) {
  const normalizedCountryCode = countryCode.trim().split(/\s*-\s*/, 1)[0].toUpperCase();
  const normalizedCurrency = currency.trim().toUpperCase();
  const normalizedMonth = firstDayOfMonth(writeOffMonth).slice(0, 7).replace("-", "");
  return `FWF-${normalizedCountryCode}-${normalizedCurrency}${normalizedMonth}`;
}

function firstNonBlank(...values: unknown[]) {
  return String(values.find((value) => value !== null && value !== undefined && String(value).trim() !== "") ?? "").trim();
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableRate(value: unknown) {
  const rate = nullableNumber(value);
  return rate === null ? null : rate;
}
