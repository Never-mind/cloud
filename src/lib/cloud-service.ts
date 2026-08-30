import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import { executeRaw, queryRows, queryRowsRaw, type Row } from "./db";
import type { OperationActor } from "./operation-actor";
import { appendTableInFilter, getTableSort, listSqlFilterOptions } from "./table-query";

const CLOUD_ROW_COLUMNS = [
  "period", "batchCode", "customer", "account", "owner", "cloudReconciler", "collectionEntity", "catalogAmount", "partnerAmount",
  "voucherCustomerAmount", "voucherSupplierAmount", "supplierPayablePayer", "supplierPayablePayee", "supplierPayableNetAmount",
  "supplierTaxRate", "supplierTaxAmount", "supplierPayableTotalAmount", "supplierPayable", "customerReceivablePayer", "customerReceivablePayee",
  "customerReceivableNetAmount", "customerTaxRate", "customerReceivableTaxAmount", "customerReceivableTotalAmount", "customerReceivable",
  "theoreticalGrossProfit", "settlementGrossProfit", "grossProfit", "calculationLogic", "customerDiscount", "remark", "collectionInvoice",
  "collected", "confirmed", "paymentDate", "collectionPayer", "collectionPayee", "collectionCurrency", "collectionExchangeRate",
  "collectionPayerCustomerId", "collectionPayeeUndertakingUnitId",
  "collectionNetAmount", "collectionTaxRate", "collectionTaxAmount", "collectionTotalAmount", "collectionDate", "invoiceNo", "invoiceCurrency",
  "invoicePayer", "invoicePayee", "invoicePayerCustomerId", "invoicePayeeUndertakingUnitId",
  "invoiceNetAmount", "invoiceTaxRate", "invoiceTaxAmount", "invoiceTotalAmount", "invoiceExchangeRate", "invoiceDate",
] as const;

const CLOUD_ROW_FILTER_EXPRESSIONS: Record<string, string> = {
  period: "period",
  batchCode: "batchCode",
  customer: "customer",
  account: "account",
  owner: "owner",
  cloudReconciler: "cloudReconciler",
  collectionEntity: "collectionEntity",
  supplierName: "supplierName",
  catalogAmount: "catalogAmount",
  partnerAmount: "partnerAmount",
  voucherCustomerAmount: "voucherCustomerAmount",
  voucherSupplierAmount: "voucherSupplierAmount",
  supplierPayablePayer: "supplierPayablePayer",
  supplierPayablePayee: "supplierPayablePayee",
  supplierPayableNetAmount: "supplierPayableNetAmount",
  supplierTaxRate: "supplierTaxRate",
  supplierTaxAmount: "supplierTaxAmount",
  supplierPayableTotalAmount: "supplierPayableTotalAmount",
  customerReceivablePayer: "customerReceivablePayer",
  customerReceivablePayee: "customerReceivablePayee",
  customerReceivableNetAmount: "customerReceivableNetAmount",
  customerTaxRate: "customerTaxRate",
  customerReceivableTaxAmount: "customerReceivableTaxAmount",
  customerReceivableTotalAmount: "customerReceivableTotalAmount",
  theoreticalGrossProfit: "theoreticalGrossProfit",
  settlementGrossProfit: "settlementGrossProfit",
  calculationLogic: "calculationLogic",
  customerDiscount: "customerDiscount",
  remark: "remark",
  collectionPayer: "collectionPayer",
  collectionPayee: "collectionPayee",
  collectionCurrency: "collectionCurrency",
  collectionNetAmount: "collectionNetAmount",
  collectionTaxRate: "collectionTaxRate",
  collectionTaxAmount: "collectionTaxAmount",
  collectionTotalAmount: "collectionTotalAmount",
  collectionDate: "collectionDate",
  collectionInvoice: "collectionInvoice",
  collected: "CASE WHEN collected = 1 THEN '是' ELSE '否' END",
  confirmed: "CASE WHEN confirmed = 1 THEN '是' ELSE '否' END",
  invoiceNo: "invoiceNo",
  invoiceCurrency: "invoiceCurrency",
  invoicePayer: "invoicePayer",
  invoicePayee: "invoicePayee",
  invoiceNetAmount: "invoiceNetAmount",
  invoiceTaxRate: "invoiceTaxRate",
  invoiceTaxAmount: "invoiceTaxAmount",
  invoiceTotalAmount: "invoiceTotalAmount",
  invoiceExchangeRate: "invoiceExchangeRate",
  invoiceDate: "invoiceDate",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  confirmedAt: "confirmedAt",
};

const CLOUD_MAPPING_FROM = `(SELECT m.*, GROUP_CONCAT(a.account ORDER BY a.account SEPARATOR ', ') AS accounts
  FROM cloud_mappings m LEFT JOIN cloud_mapping_accounts a ON a.mappingId = m.id GROUP BY m.id) AS cloudMappingRows`;

const CLOUD_MAPPING_FILTER_EXPRESSIONS: Record<string, string> = {
  supplierName: "supplierName",
  undertakingUnitName: "undertakingUnitName",
  customerName: "customerName",
  accounts: "accounts",
  reconciler: "reconciler",
  calculationLogic: "calculationLogic",
  userDiscount: "userDiscount",
};

const CLOUD_PAYMENT_FILTER_EXPRESSIONS: Record<string, string> = {
  period: "period",
  supplierName: "supplierName",
  accountCount: "accountCount",
  supplierPayableCurrency: "supplierPayableCurrency",
  supplierPayableNetAmount: "supplierPayableNetAmount",
  supplierPayableExchangeRate: "supplierPayableExchangeRate",
  supplierTaxRate: "supplierTaxRate",
  supplierTaxAmount: "supplierTaxAmount",
  supplierPayableTotalAmount: "supplierPayableTotalAmount",
  payerUnitName: "payerUnitName",
  currency: "currency",
  paymentExchangeRate: "paymentExchangeRate",
  paymentNetAmount: "paymentNetAmount",
  paymentTaxRate: "paymentTaxRate",
  paymentTaxAmount: "paymentTaxAmount",
  paymentTotalAmount: "paymentTotalAmount",
  invoiceNo: "invoiceNo",
  invoiceCurrency: "invoiceCurrency",
  invoiceExchangeRate: "invoiceExchangeRate",
  invoiceNetAmount: "invoiceNetAmount",
  invoiceTaxRate: "invoiceTaxRate",
  invoiceTaxAmount: "invoiceTaxAmount",
  invoiceTotalAmount: "invoiceTotalAmount",
  invoiceStatus: "invoiceStatus",
  paid: "CASE WHEN paid = 1 THEN '是' ELSE '否' END",
  paymentDate: "paymentDate",
  invoiceDate: "invoiceDate",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
};

const CLOUD_SUPPLIER_PAYMENT_FROM = `(SELECT
    CONCAT(r.period, '::', COALESCE(NULLIF(r.supplierId, ''), CONCAT('name:', COALESCE(r.supplierName, '未匹配供应商')))) AS groupKey,
    CONCAT('supplier-payment:', r.period, ':', COALESCE(NULLIF(r.supplierId, ''), CONCAT('name:', COALESCE(r.supplierName, '未匹配供应商')))) AS id,
    MAX(p.id) AS paymentRecordId,
    r.period AS period,
    COALESCE(MAX(NULLIF(p.supplierId, '')), MAX(NULLIF(r.supplierId, ''))) AS supplierId,
    COALESCE(MAX(NULLIF(p.supplierName, '')), MAX(NULLIF(r.supplierName, '')), '未匹配供应商') AS supplierName,
    COUNT(*) AS accountCount,
    COALESCE(SUM(COALESCE(r.supplierPayableNetAmount, r.supplierPayable, 0)), 0) AS supplierPayableNetAmount,
    'USD' AS supplierPayableCurrency,
    NULL AS supplierPayableExchangeRate,
    MAX(COALESCE(r.supplierTaxRate, 0.16)) AS supplierTaxRate,
    COALESCE(SUM(COALESCE(r.supplierTaxAmount, COALESCE(r.supplierPayableNetAmount, r.supplierPayable, 0) * COALESCE(r.supplierTaxRate, 0.16))), 0) AS supplierTaxAmount,
    COALESCE(SUM(COALESCE(r.supplierPayableTotalAmount, COALESCE(r.supplierPayableNetAmount, r.supplierPayable, 0) + COALESCE(r.supplierTaxAmount, COALESCE(r.supplierPayableNetAmount, r.supplierPayable, 0) * COALESCE(r.supplierTaxRate, 0.16)))), 0) AS supplierPayableTotalAmount,
    MAX(p.payerUnitId) AS payerUnitId,
    MAX(p.payerUnitName) AS payerUnitName,
    MAX(p.currency) AS currency,
    MAX(p.paymentExchangeRate) AS paymentExchangeRate,
    MAX(p.paymentNetAmount) AS paymentNetAmount,
    MAX(p.paymentTaxRate) AS paymentTaxRate,
    MAX(p.paymentTaxAmount) AS paymentTaxAmount,
    MAX(p.paymentTotalAmount) AS paymentTotalAmount,
    MAX(p.paymentDate) AS paymentDate,
    MAX(p.invoiceNo) AS invoiceNo,
    MAX(p.invoiceCurrency) AS invoiceCurrency,
    MAX(p.invoiceExchangeRate) AS invoiceExchangeRate,
    MAX(p.invoiceNetAmount) AS invoiceNetAmount,
    MAX(p.invoiceTaxRate) AS invoiceTaxRate,
    MAX(p.invoiceTaxAmount) AS invoiceTaxAmount,
    MAX(p.invoiceTotalAmount) AS invoiceTotalAmount,
    MAX(p.invoiceDate) AS invoiceDate,
    COALESCE(MAX(p.invoiceStatus), 'not_issued') AS invoiceStatus,
    COALESCE(MAX(p.paid), 0) AS paid,
    MIN(r.createdAt) AS createdAt,
    GREATEST(MAX(r.updatedAt), COALESCE(MAX(p.updatedAt), MAX(r.updatedAt))) AS updatedAt,
    GROUP_CONCAT(DISTINCT CONCAT(COALESCE(r.customer, ''), ' ', COALESCE(r.account, '')) SEPARATOR ' ') AS searchText
  FROM cloud_rows r
  LEFT JOIN cloud_supplier_payments p ON p.period = r.period
    AND ((NULLIF(r.supplierId, '') IS NOT NULL AND p.supplierId = r.supplierId)
      OR (NULLIF(r.supplierId, '') IS NULL AND p.supplierId IS NULL AND p.supplierName = r.supplierName))
  GROUP BY r.period, COALESCE(NULLIF(r.supplierId, ''), CONCAT('name:', COALESCE(r.supplierName, '未匹配供应商')))) AS cloudSupplierPaymentRows`;

const CLOUD_SUPPLIER_KEY_SQL = `COALESCE(NULLIF(m.supplierId, ''), NULLIF(r.supplierId, ''), CONCAT('name:', COALESCE(NULLIF(m.supplierName, ''), NULLIF(r.supplierName, ''), '未匹配供应商')))`;
const CLOUD_SUPPLIER_NAME_SQL = `COALESCE(NULLIF(s.shortName, ''), NULLIF(s.nameCn, ''), NULLIF(m.supplierName, ''), NULLIF(r.supplierName, ''), '未匹配供应商')`;
const CLOUD_ACCOUNT_MAPPING_ID_SQL = `(SELECT a.mappingId FROM cloud_mapping_accounts a
  WHERE FIND_IN_SET(REPLACE(r.account, ' ', ''), REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(a.account, ' ', ''), '，', ','), ';', ','), '；', ','), '\\r', ''), '\\n', ',')) > 0
  ORDER BY a.updatedAt DESC LIMIT 1)`;
const CLOUD_SUPPLIER_PAYMENT_GROUPS = `(SELECT
    ${CLOUD_SUPPLIER_KEY_SQL} AS groupKey,
    r.period AS period,
    MAX(CASE WHEN ${CLOUD_SUPPLIER_KEY_SQL} LIKE 'name:%' THEN NULL ELSE ${CLOUD_SUPPLIER_KEY_SQL} END) AS supplierId,
    ${CLOUD_SUPPLIER_NAME_SQL} AS supplierName,
    COUNT(DISTINCT r.account) AS accountCount,
    'USD' AS supplierPayableCurrency,
    COALESCE(SUM(COALESCE(r.supplierPayableNetAmount, r.supplierPayable, 0)), 0) AS supplierPayableNetAmount,
    NULL AS supplierPayableExchangeRate,
    MAX(COALESCE(r.supplierTaxRate, 0.16)) AS supplierTaxRate,
    COALESCE(SUM(COALESCE(r.supplierTaxAmount, COALESCE(r.supplierPayableNetAmount, r.supplierPayable, 0) * COALESCE(r.supplierTaxRate, 0.16))), 0) AS supplierTaxAmount,
    COALESCE(SUM(COALESCE(r.supplierPayableTotalAmount, COALESCE(r.supplierPayableNetAmount, r.supplierPayable, 0) + COALESCE(r.supplierTaxAmount, COALESCE(r.supplierPayableNetAmount, r.supplierPayable, 0) * COALESCE(r.supplierTaxRate, 0.16)))), 0) AS supplierPayableTotalAmount,
    MIN(r.createdAt) AS createdAt,
    MAX(r.updatedAt) AS updatedAt,
    GROUP_CONCAT(DISTINCT CONCAT(COALESCE(r.customer, ''), ' ', COALESCE(r.account, '')) SEPARATOR ' ') AS searchText
  FROM cloud_rows r
  LEFT JOIN cloud_mappings m ON m.id = COALESCE(NULLIF(r.mappingId, ''), ${CLOUD_ACCOUNT_MAPPING_ID_SQL})
  LEFT JOIN common_suppliers s ON s.supplierId = COALESCE(NULLIF(m.supplierId, ''), NULLIF(r.supplierId, ''))
  GROUP BY r.period, ${CLOUD_SUPPLIER_KEY_SQL}, ${CLOUD_SUPPLIER_NAME_SQL})`;
const CLOUD_SUPPLIER_PAYMENT_FROM_V2 = `(SELECT
    CONCAT(g.period, '::', g.groupKey) AS id,
    g.*,
    p.id AS paymentRecordId, p.payerUnitId, p.payerUnitName, p.currency, p.paymentExchangeRate,
    p.paymentNetAmount, p.paymentTaxRate, p.paymentTaxAmount, p.paymentTotalAmount, p.paymentDate,
    p.invoiceNo, p.invoiceCurrency, p.invoiceExchangeRate, p.invoiceNetAmount, p.invoiceTaxRate,
    p.invoiceTaxAmount, p.invoiceTotalAmount, p.invoiceDate, COALESCE(p.invoiceStatus, 'not_issued') AS invoiceStatus,
    COALESCE(p.paid, 0) AS paid,
    p.updatedAt AS paymentUpdatedAt
  FROM ${CLOUD_SUPPLIER_PAYMENT_GROUPS} g
  LEFT JOIN cloud_supplier_payments p ON p.period = g.period
    AND ((g.supplierId IS NOT NULL AND p.supplierId = g.supplierId)
      OR (g.supplierId IS NULL AND p.supplierId IS NULL AND p.supplierName = g.supplierName))) AS cloudSupplierPaymentRows`;

const CLOUD_IMPORT_HEADERS: Record<string, string> = {
  "期间": "period", "账期": "period", period: "period",
  "批次号": "batchCode", "批次": "batchCode", batch: "batchCode", batchcode: "batchCode",
  "客户": "customer", customer: "customer", "客户名称": "customer",
  "账号": "account", account: "account", "华为云账号": "account", "华为ID": "account", huaweid: "account",
  "所有者": "owner", owner: "owner", "归属人": "owner",
  "华为对账人": "cloudReconciler", cloudreconciler: "cloudReconciler",
  "收款主体": "collectionEntity", "收款实体": "collectionEntity", collectionentity: "collectionEntity",
  "目录价": "catalogAmount", catalogamount: "catalogAmount", "目录金额": "catalogAmount", "目录价（USD）": "catalogAmount",
  "伙伴金额": "partnerAmount", partneramount: "partnerAmount", "伙伴结算金额（USD）": "partnerAmount",
  "代金券-客户（USD）": "voucherCustomerAmount", voucherCustomeramount: "voucherCustomerAmount", vouchercustomeramount: "voucherCustomerAmount",
  "代金券-供应商（USD）": "voucherSupplierAmount", voucherSupplieramount: "voucherSupplierAmount", vouchersupplieramount: "voucherSupplierAmount",
  "承接单位→供应商": "supplierPayablePayer", "供应商应付单位": "supplierPayablePayee",
  "供应商应付": "supplierPayableNetAmount", supplierpayable: "supplierPayableNetAmount", "供应商应付（不含税）": "supplierPayableNetAmount",
  "供应商税率": "supplierTaxRate", suppliertaxrate: "supplierTaxRate",
  "供应商税金": "supplierTaxAmount", suppliertaxamount: "supplierTaxAmount",
  "供应商应付（含税）": "supplierPayableTotalAmount", supplierpayabletotalamount: "supplierPayableTotalAmount",
  "客户→承接单位": "customerReceivablePayee", "客户应收单位": "customerReceivablePayer",
  "客户应收": "customerReceivableNetAmount", customerreceivable: "customerReceivableNetAmount", "客户应收（不含税）": "customerReceivableNetAmount",
  "客户税率": "customerTaxRate", customertaxrate: "customerTaxRate",
  "客户承担税率": "customerTaxRate",
  "客户税金": "customerReceivableTaxAmount", customerreceivabletaxamount: "customerReceivableTaxAmount",
  "客户应收（含税）": "customerReceivableTotalAmount", customerreceivabletotalamount: "customerReceivableTotalAmount",
  "万众理论毛利（USD）": "theoreticalGrossProfit", theoreticalgrossprofit: "theoreticalGrossProfit",
  "万众结算毛利（USD）": "settlementGrossProfit", settlementgrossprofit: "settlementGrossProfit",
  "毛利": "settlementGrossProfit", grossprofit: "settlementGrossProfit",
  "计算逻辑": "calculationLogic", calculationlogic: "calculationLogic",
  "客户折扣": "customerDiscount", customerdiscount: "customerDiscount",
  "客户实收-付款单位": "collectionPayer", "客户实收-收款单位": "collectionPayee",
  "客户实收币种": "collectionCurrency", "客户实收未税金额": "collectionNetAmount", "客户实收税率": "collectionTaxRate",
  "客户实收汇率": "collectionExchangeRate",
  "客户实收税金": "collectionTaxAmount", "客户实收含税金额": "collectionTotalAmount", "客户实收日期": "collectionDate",
  "客户开票号": "invoiceNo", "客户开票币种": "invoiceCurrency", "客户开票-付款单位": "invoicePayer", "客户开票-收款单位": "invoicePayee",
  "客户开票未税金额": "invoiceNetAmount", "客户开票税率": "invoiceTaxRate", "客户开票税金": "invoiceTaxAmount",
  "客户开票含税金额": "invoiceTotalAmount", "客户开票汇率": "invoiceExchangeRate", "客户开票日期": "invoiceDate",
  "备注": "remark", remark: "remark",
};

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function number(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown) {
  const raw = text(value).replace(/,/g, "");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function rate(value: unknown, fallback: number | null = null) {
  const raw = text(value).replace(/,/g, "");
  if (!raw) return fallback;
  const percent = raw.endsWith("%");
  const parsed = Number(percent ? raw.slice(0, -1) : raw);
  if (!Number.isFinite(parsed)) return fallback;
  if (percent) return parsed / 100;
  return parsed > 1 ? parsed / 100 : parsed;
}

function taxAmount(net: number | null, taxRate: number | null, value: unknown) {
  const entered = nullableNumber(value);
  return entered ?? (net !== null && taxRate !== null ? net * taxRate : null);
}

function totalAmount(net: number | null, tax: number | null, value: unknown) {
  const entered = nullableNumber(value);
  return entered ?? (net !== null && tax !== null ? net + tax : null);
}

const CLOUD_NUMERIC_COLUMNS = new Set([
  "catalogAmount", "partnerAmount", "voucherCustomerAmount", "voucherSupplierAmount", "supplierPayableNetAmount", "supplierTaxAmount",
  "supplierPayableTotalAmount", "supplierPayable", "customerReceivableNetAmount", "customerReceivableTaxAmount", "customerReceivableTotalAmount",
  "customerReceivable", "theoreticalGrossProfit", "settlementGrossProfit", "grossProfit", "customerDiscount", "collectionExchangeRate",
  "collectionNetAmount", "collectionTaxAmount", "collectionTotalAmount", "invoiceNetAmount", "invoiceTaxAmount", "invoiceTotalAmount", "invoiceExchangeRate",
]);

function pageParams(params: URLSearchParams) {
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? 20) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function cloudWhere(params: URLSearchParams) {
  const { conditions, values } = cloudBaseWhere(params);
  for (const [field, expression] of Object.entries(CLOUD_ROW_FILTER_EXPRESSIONS)) {
    appendTableInFilter(conditions, values, expression, field, params, "cloudFilter");
  }
  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", values };
}

function cloudBaseWhere(params: URLSearchParams) {
  const conditions: string[] = [];
  const values: Record<string, unknown> = {};
  const keyword = text(params.get("keyword"));
  if (keyword) {
    conditions.push("(customer LIKE :keyword OR account LIKE :keyword OR batchCode LIKE :keyword OR supplierName LIKE :keyword)");
    values.keyword = `%${keyword}%`;
  }
  for (const key of ["period", "confirmed", "collected", "collectionInvoice"] as const) {
    const value = text(params.get(key));
    if (value && value !== "all") {
      conditions.push(`${key} = :${key}`);
      values[key] = key === "confirmed" || key === "collected" ? (value === "true" || value === "1" ? 1 : 0) : value;
    }
  }
  return { conditions, values };
}

type CloudAccountMapping = {
  mappingId: string;
  account: string;
  supplierId: string | null;
  supplierName: string;
  undertakingUnitId: string | null;
  undertakingUnitName: string;
  customerId: string | null;
  customerName: string;
  reconciler: string;
};

function splitCloudAccounts(value: unknown) {
  return text(value).split(/[,，;；\r\n]+/).map((account) => account.trim()).filter(Boolean);
}

async function findCloudAccountMappings(accounts: string[]) {
  const normalizedAccounts = new Set(accounts.map(text).filter(Boolean));
  if (!normalizedAccounts.size) return new Map<string, CloudAccountMapping>();
  const rows = await queryRowsRaw<CloudAccountMapping>(
    `SELECT a.account, m.id AS mappingId,
       COALESCE(NULLIF(s.supplierId, ''), NULLIF(m.supplierId, '')) AS supplierId,
       COALESCE(NULLIF(s.shortName, ''), NULLIF(s.nameCn, ''), NULLIF(m.supplierName, ''), '未匹配供应商') AS supplierName,
       COALESCE(NULLIF(u.undertakingUnitId, ''), NULLIF(m.undertakingUnitId, '')) AS undertakingUnitId,
       COALESCE(NULLIF(u.shortName, ''), NULLIF(u.entityName, ''), NULLIF(u.nameCn, ''), NULLIF(u.name, ''), NULLIF(m.undertakingUnitName, ''), '未匹配承接单位') AS undertakingUnitName,
       COALESCE(NULLIF(c.customerId, ''), NULLIF(m.customerId, '')) AS customerId,
       COALESCE(NULLIF(c.shortName, ''), NULLIF(c.nameCn, ''), NULLIF(c.name, ''), NULLIF(m.customerName, ''), '未匹配客户') AS customerName,
       m.reconciler
     FROM cloud_mapping_accounts a
     INNER JOIN cloud_mappings m ON m.id = a.mappingId
     LEFT JOIN common_suppliers s ON s.supplierId = m.supplierId
     LEFT JOIN common_undertaking_units u ON u.undertakingUnitId = m.undertakingUnitId
     LEFT JOIN common_customers c ON c.customerId = m.customerId
     WHERE a.account IS NOT NULL AND TRIM(a.account) <> ''
     ORDER BY m.updatedAt DESC, a.account`,
  );
  const result = new Map<string, CloudAccountMapping>();
  for (const row of rows) {
    for (const account of splitCloudAccounts(row.account)) {
      if (normalizedAccounts.has(account) && !result.has(account)) result.set(account, { ...row, account });
    }
  }
  return result;
}

function applyCloudAccountMapping(row: Row, mapping: CloudAccountMapping | undefined) {
  if (!mapping) return row;
  return {
    ...row,
    mappingId: mapping.mappingId,
    supplierId: mapping.supplierId,
    supplierName: mapping.supplierName,
    undertakingUnitId: mapping.undertakingUnitId,
    customerId: mapping.customerId,
    customer: mapping.customerName,
    cloudReconciler: mapping.reconciler || row.cloudReconciler || row.owner || null,
    supplierPayablePayer: mapping.undertakingUnitName,
    supplierPayablePayee: mapping.supplierName,
    customerReceivablePayer: mapping.customerName,
    customerReceivablePayee: mapping.undertakingUnitName,
    collectionPayer: text(row.collectionPayer) || mapping.customerName,
    collectionPayee: text(row.collectionPayee) || mapping.undertakingUnitName,
    invoicePayer: text(row.invoicePayer) || mapping.customerName,
    invoicePayee: text(row.invoicePayee) || mapping.undertakingUnitName,
  };
}

async function applyCloudAccountMappings(rows: Row[]) {
  const mappings = await findCloudAccountMappings(rows.map((row) => text(row.account)));
  return rows.map((row) => applyCloudAccountMapping(row, mappings.get(text(row.account))));
}

export async function listCloudRows(params: URLSearchParams) {
  if (params.get("field")) return listCloudRowFilterOptions(params);
  const { page, pageSize, offset } = pageParams(params);
  const { where, values } = cloudWhere(params);
  const requestedSort = getTableSort(params, CLOUD_ROW_FILTER_EXPRESSIONS);
  const [count, rows, periodRows] = await Promise.all([
    queryRowsRaw<{ total: number }>(`SELECT COUNT(*) AS total FROM cloud_rows ${where}`, values),
    queryRowsRaw<Row>(`SELECT * FROM cloud_rows ${where} ${requestedSort || "ORDER BY period DESC, updatedAt DESC"} LIMIT :limit OFFSET :offset`, { ...values, limit: pageSize, offset }),
      queryRowsRaw<{ period: string; rowCount: number; receivable: number; collected: number }>(
      `SELECT period, COUNT(*) AS rowCount, COALESCE(SUM(COALESCE(customerReceivableTotalAmount, customerReceivable)), 0) AS receivable,
              COALESCE(SUM(CASE WHEN collected = 1 THEN COALESCE(customerReceivableTotalAmount, customerReceivable) ELSE 0 END), 0) AS collected
         FROM cloud_rows GROUP BY period ORDER BY period DESC LIMIT 24`,
    ),
  ]);
  const summaryRows = await queryRowsRaw<{ receivable: number; collected: number; outstanding: number; overdueCount: number }>(
    `SELECT COALESCE(SUM(COALESCE(customerReceivableTotalAmount, customerReceivable)), 0) AS receivable,
            COALESCE(SUM(CASE WHEN collected = 1 THEN COALESCE(customerReceivableTotalAmount, customerReceivable) ELSE 0 END), 0) AS collected,
            COALESCE(SUM(CASE WHEN collected = 0 THEN COALESCE(customerReceivableTotalAmount, customerReceivable) ELSE 0 END), 0) AS outstanding,
            SUM(CASE WHEN collected = 0 AND paymentDate IS NOT NULL AND paymentDate < CURRENT_DATE THEN 1 ELSE 0 END) AS overdueCount
       FROM cloud_rows ${where}`,
    values,
  );
  return {
    items: await applyCloudAccountMappings(rows),
    total: Number(count[0]?.total ?? 0),
    page,
    pageSize,
    summary: summaryRows[0] ?? { receivable: 0, collected: 0, outstanding: 0, overdueCount: 0 },
    periods: periodRows,
  };
}

export async function listCloudRowFilterOptions(params: URLSearchParams) {
  const base = cloudBaseWhere(params);
  return listSqlFilterOptions({
    from: "cloud_rows",
    expressions: CLOUD_ROW_FILTER_EXPRESSIONS,
    searchParams: params,
    conditions: base.conditions,
    params: base.values,
  });
}

export async function createCloudRow(body: Row, actor: OperationActor | null) {
  const period = text(body.period) || new Date().toISOString().slice(0, 7);
  const account = text(body.account);
  const accountMapping = (await findCloudAccountMappings([account])).get(account);
  const customer = accountMapping?.customerName || text(body.customer);
  if (!customer || !account) throw new Error("客户和华为云账号不能为空，且华为ID必须已配置或手动填写客户");
  const source = applyCloudAccountMapping({ ...body, customer }, accountMapping);

  const batchCode = text(body.batchCode) || `HC-${period.replace(/[^0-9]/g, "") || "MANUAL"}-M-${Date.now().toString().slice(-6)}`;
  const supplierNet = nullableNumber(body.supplierPayableNetAmount) ?? nullableNumber(body.supplierPayable) ?? 0;
  const supplierTaxRate = rate(body.supplierTaxRate, 0.16);
  const customerNet = nullableNumber(body.customerReceivableNetAmount) ?? nullableNumber(body.customerReceivable) ?? 0;
  const customerTaxRate = rate(body.customerTaxRate);
  const collectionNet = nullableNumber(body.collectionNetAmount);
  const collectionTaxRate = rate(body.collectionTaxRate);
  const invoiceNet = nullableNumber(body.invoiceNetAmount);
  const invoiceTaxRate = rate(body.invoiceTaxRate);
  const supplierTax = taxAmount(supplierNet, supplierTaxRate, body.supplierTaxAmount);
  const customerTax = taxAmount(customerNet, customerTaxRate, body.customerReceivableTaxAmount);
  const collectionTax = taxAmount(collectionNet, collectionTaxRate, body.collectionTaxAmount);
  const invoiceTax = taxAmount(invoiceNet, invoiceTaxRate, body.invoiceTaxAmount);
  const settlementGrossProfit = nullableNumber(body.settlementGrossProfit) ?? nullableNumber(body.grossProfit) ?? 0;
  const row: Row = {
    id: randomUUID(),
    importBatchId: null,
    period,
    batchCode,
    mappingId: text(source.mappingId) || null,
    supplierId: text(source.supplierId) || null,
    supplierName: text(source.supplierName) || null,
    undertakingUnitId: text(source.undertakingUnitId) || null,
    customerId: text(source.customerId) || null,
    customer,
    account,
    owner: text(body.owner) || null,
    cloudReconciler: text(source.cloudReconciler) || text(source.owner) || null,
    collectionEntity: text(body.collectionEntity) || null,
    catalogAmount: nullableNumber(body.catalogAmount) ?? 0,
    partnerAmount: nullableNumber(body.partnerAmount),
    voucherCustomerAmount: nullableNumber(body.voucherCustomerAmount),
    voucherSupplierAmount: nullableNumber(body.voucherSupplierAmount),
    supplierPayablePayer: text(source.supplierPayablePayer) || "承接单位",
    supplierPayablePayee: text(source.supplierPayablePayee) || text(source.supplierName) || "供应商",
    supplierPayableNetAmount: supplierNet,
    supplierTaxRate,
    supplierTaxAmount: supplierTax,
    supplierPayableTotalAmount: totalAmount(supplierNet, supplierTax, body.supplierPayableTotalAmount),
    supplierPayable: supplierNet,
    customerReceivablePayer: text(source.customerReceivablePayer) || customer,
    customerReceivablePayee: text(source.customerReceivablePayee) || "承接单位",
    customerReceivableNetAmount: customerNet,
    customerTaxRate,
    customerReceivableTaxAmount: customerTax,
    customerReceivableTotalAmount: totalAmount(customerNet, customerTax, body.customerReceivableTotalAmount),
    customerReceivable: customerNet,
    theoreticalGrossProfit: nullableNumber(body.theoreticalGrossProfit),
    settlementGrossProfit,
    grossProfit: settlementGrossProfit,
    calculationLogic: text(body.calculationLogic) || null,
    customerDiscount: nullableNumber(body.customerDiscount),
    remark: text(body.remark) || null,
    collectionInvoice: text(body.collectionInvoice) || "not_issued",
    collected: body.collected ? 1 : 0,
    collectionPayer: text(source.collectionPayer) || null,
    collectionPayee: text(source.collectionPayee) || null,
    collectionPayerCustomerId: text(body.collectionPayerCustomerId) || null,
    collectionPayeeUndertakingUnitId: text(body.collectionPayeeUndertakingUnitId) || null,
    collectionCurrency: text(body.collectionCurrency) || null,
    collectionExchangeRate: nullableNumber(body.collectionExchangeRate),
    collectionNetAmount: collectionNet,
    collectionTaxRate,
    collectionTaxAmount: collectionTax,
    collectionTotalAmount: totalAmount(collectionNet, collectionTax, body.collectionTotalAmount),
    collectionDate: text(body.collectionDate) || null,
    invoiceNo: text(body.invoiceNo) || null,
    invoiceCurrency: text(body.invoiceCurrency) || null,
    invoicePayer: text(source.invoicePayer) || null,
    invoicePayee: text(source.invoicePayee) || null,
    invoicePayerCustomerId: text(body.invoicePayerCustomerId) || null,
    invoicePayeeUndertakingUnitId: text(body.invoicePayeeUndertakingUnitId) || null,
    invoiceNetAmount: invoiceNet,
    invoiceTaxRate,
    invoiceTaxAmount: invoiceTax,
    invoiceTotalAmount: totalAmount(invoiceNet, invoiceTax, body.invoiceTotalAmount),
    invoiceExchangeRate: nullableNumber(body.invoiceExchangeRate),
    invoiceDate: text(body.invoiceDate) || null,
    createdByUserId: actor?.userId ?? null,
    createdByName: actor?.displayName ?? null,
    updatedByUserId: actor?.userId ?? null,
    updatedByName: actor?.displayName ?? null,
  };
  await executeRaw(`INSERT INTO cloud_rows
    (id,importBatchId,period,batchCode,mappingId,supplierId,supplierName,undertakingUnitId,customerId,customer,account,owner,collectionEntity,
     cloudReconciler,catalogAmount,partnerAmount,voucherCustomerAmount,voucherSupplierAmount,supplierPayablePayer,supplierPayablePayee,supplierPayableNetAmount,
     supplierTaxRate,supplierTaxAmount,supplierPayableTotalAmount,supplierPayable,customerReceivablePayer,customerReceivablePayee,customerReceivableNetAmount,
     customerTaxRate,customerReceivableTaxAmount,customerReceivableTotalAmount,customerReceivable,theoreticalGrossProfit,settlementGrossProfit,grossProfit,
     calculationLogic,customerDiscount,remark,collectionInvoice,collected,collectionPayer,collectionPayee,collectionPayerCustomerId,collectionPayeeUndertakingUnitId,collectionCurrency,collectionExchangeRate,
     collectionNetAmount,collectionTaxRate,collectionTaxAmount,collectionTotalAmount,collectionDate,invoiceNo,invoiceCurrency,invoicePayer,invoicePayee,
     invoiceNetAmount,invoiceTaxRate,invoiceTaxAmount,invoiceTotalAmount,invoiceExchangeRate,invoiceDate,createdByUserId,createdByName,updatedByUserId,updatedByName)
    VALUES (:id,:importBatchId,:period,:batchCode,:mappingId,:supplierId,:supplierName,:undertakingUnitId,:customerId,:customer,:account,:owner,:collectionEntity,
     :cloudReconciler,:catalogAmount,:partnerAmount,:voucherCustomerAmount,:voucherSupplierAmount,:supplierPayablePayer,:supplierPayablePayee,:supplierPayableNetAmount,
     :supplierTaxRate,:supplierTaxAmount,:supplierPayableTotalAmount,:supplierPayable,:customerReceivablePayer,:customerReceivablePayee,:customerReceivableNetAmount,
     :customerTaxRate,:customerReceivableTaxAmount,:customerReceivableTotalAmount,:customerReceivable,:theoreticalGrossProfit,:settlementGrossProfit,:grossProfit,
     :calculationLogic,:customerDiscount,:remark,:collectionInvoice,:collected,:collectionPayer,:collectionPayee,:collectionPayerCustomerId,:collectionPayeeUndertakingUnitId,:collectionCurrency,:collectionExchangeRate,
     :collectionNetAmount,:collectionTaxRate,:collectionTaxAmount,:collectionTotalAmount,:collectionDate,:invoiceNo,:invoiceCurrency,:invoicePayer,:invoicePayee,
     :invoiceNetAmount,:invoiceTaxRate,:invoiceTaxAmount,:invoiceTotalAmount,:invoiceExchangeRate,:invoiceDate,:createdByUserId,:createdByName,:updatedByUserId,:updatedByName)`, row);
  return (await queryRowsRaw<Row>("SELECT * FROM cloud_rows WHERE id = :id", { id: row.id }))[0] ?? null;
}

export async function updateCloudRow(id: string, body: Row, actor: OperationActor | null) {
  const existing = (await queryRowsRaw<Row>("SELECT * FROM cloud_rows WHERE id = :id", { id }))[0];
  if (!existing) throw new Error("对账单不存在");
  if (existing.confirmed) throw new Error("对账单已确认，不能修改");
  const accountMapping = Object.prototype.hasOwnProperty.call(body, "account")
    ? (await findCloudAccountMappings([text(body.account)])).get(text(body.account))
    : undefined;
  const mappedBody = accountMapping ? applyCloudAccountMapping(body, accountMapping) : body;
  const fields: string[] = CLOUD_ROW_COLUMNS.filter((key) => Object.prototype.hasOwnProperty.call(mappedBody, key));
  if (accountMapping) {
    for (const key of ["mappingId", "supplierId", "supplierName", "undertakingUnitId", "customerId", "customer", "cloudReconciler", "supplierPayablePayer", "supplierPayablePayee", "customerReceivablePayer", "customerReceivablePayee"] as const) {
      if (!fields.includes(key)) fields.push(key);
    }
  }
  if (!fields.length) throw new Error("没有可保存的字段");
  const merged = { ...existing, ...mappedBody };
  const assignments = fields.map((key) => `${key} = :${key}`);
  const values: Row = { id };
  for (const key of fields) {
    values[key] = key.endsWith("TaxRate") ? rate(mappedBody[key]) : CLOUD_NUMERIC_COLUMNS.has(key) ? nullableNumber(mappedBody[key]) : mappedBody[key];
  }
  for (const prefix of ["collection", "invoice"] as const) {
    const netKey = `${prefix}NetAmount`;
    const taxKey = `${prefix}TaxAmount`;
    const rateKey = `${prefix}TaxRate`;
    const totalKey = `${prefix}TotalAmount`;
    if (fields.some((field) => field === netKey || field === taxKey || field === rateKey || field === totalKey)) {
      const net = nullableNumber(merged[netKey]);
      const taxRate = rate(merged[rateKey]);
      const tax = taxAmount(net, taxRate, merged[taxKey]);
      const total = totalAmount(net, tax, merged[totalKey]);
      for (const [key, value] of [[taxKey, tax], [totalKey, total]] as const) {
        if (!fields.includes(key)) { fields.push(key); assignments.push(`${key} = :${key}`); }
        values[key] = value;
      }
    }
  }
  if (actor) {
    assignments.push("updatedByUserId = :updatedByUserId", "updatedByName = :updatedByName");
    values.updatedByUserId = actor.userId;
    values.updatedByName = actor.displayName;
  }
  await executeRaw(`UPDATE cloud_rows SET ${assignments.join(", ")} WHERE id = :id`, values);
  return (await queryRowsRaw<Row>("SELECT * FROM cloud_rows WHERE id = :id", { id }))[0] ?? null;
}

export async function confirmCloudRow(id: string, confirmed: boolean, actor: OperationActor | null) {
  await executeRaw(
    `UPDATE cloud_rows SET confirmed = :confirmed, confirmedAt = CASE WHEN :confirmed = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
       confirmedByUserId = CASE WHEN :confirmed = 1 THEN :userId ELSE NULL END,
       confirmedByName = CASE WHEN :confirmed = 1 THEN :userName ELSE NULL END WHERE id = :id`,
    { id, confirmed: confirmed ? 1 : 0, userId: actor?.userId ?? null, userName: actor?.displayName ?? null },
  );
  return (await queryRowsRaw<Row>("SELECT * FROM cloud_rows WHERE id = :id", { id }))[0] ?? null;
}

export async function listCloudMappings(params: URLSearchParams) {
  if (params.get("field")) return listCloudMappingFilterOptions(params);
  const { page, pageSize, offset } = pageParams(params);
  const keyword = text(params.get("keyword"));
  const conditions: string[] = [];
  const values: Row = {};
  if (keyword) { conditions.push("(supplierName LIKE :keyword OR undertakingUnitName LIKE :keyword OR customerName LIKE :keyword OR reconciler LIKE :keyword OR accounts LIKE :keyword)"); values.keyword = `%${keyword}%`; }
  for (const [field, expression] of Object.entries(CLOUD_MAPPING_FILTER_EXPRESSIONS)) appendTableInFilter(conditions, values, expression, field, params, "mappingFilter");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const requestedSort = getTableSort(params, CLOUD_MAPPING_FILTER_EXPRESSIONS);
  const [count, rows] = await Promise.all([
    queryRows<Row>(`SELECT COUNT(*) AS total FROM ${CLOUD_MAPPING_FROM} ${where}`, values),
    queryRows<Row>(`SELECT * FROM ${CLOUD_MAPPING_FROM} ${where} ${requestedSort || "ORDER BY updatedAt DESC"} LIMIT :limit OFFSET :offset`, { ...values, limit: pageSize, offset }),
  ]);
  return { items: rows, total: Number(count[0]?.total ?? 0), page, pageSize };
}

export async function listCloudMappingFilterOptions(params: URLSearchParams) {
  return listSqlFilterOptions({ from: CLOUD_MAPPING_FROM, expressions: CLOUD_MAPPING_FILTER_EXPRESSIONS, searchParams: params });
}

export async function saveCloudMapping(body: Row, id: string | null, actor: OperationActor | null) {
  const mappingId = id || randomUUID();
  const values = {
    id: mappingId,
    supplierId: text(body.supplierId), supplierName: text(body.supplierName), undertakingUnitId: text(body.undertakingUnitId),
    undertakingUnitName: text(body.undertakingUnitName), customerId: text(body.customerId), customerName: text(body.customerName),
    reconciler: text(body.reconciler), calculationLogic: text(body.calculationLogic) || "catalog",
    customCalculationLogic: text(body.customCalculationLogic) || null, userDiscount: body.userDiscount ?? null, remark: text(body.remark) || null,
    createdByUserId: actor?.userId ?? null, createdByName: actor?.displayName ?? null,
    updatedByUserId: actor?.userId ?? null, updatedByName: actor?.displayName ?? null,
  };
  if (id) {
    await executeRaw(`UPDATE cloud_mappings SET supplierId=:supplierId, supplierName=:supplierName, undertakingUnitId=:undertakingUnitId,
      undertakingUnitName=:undertakingUnitName, customerId=:customerId, customerName=:customerName, reconciler=:reconciler,
      calculationLogic=:calculationLogic, customCalculationLogic=:customCalculationLogic, userDiscount=:userDiscount, remark=:remark,
      updatedByUserId=:updatedByUserId, updatedByName=:updatedByName WHERE id=:id`, values);
  } else {
    await executeRaw(`INSERT INTO cloud_mappings
      (id,supplierId,supplierName,undertakingUnitId,undertakingUnitName,customerId,customerName,reconciler,calculationLogic,customCalculationLogic,userDiscount,remark,createdByUserId,createdByName,updatedByUserId,updatedByName)
      VALUES (:id,:supplierId,:supplierName,:undertakingUnitId,:undertakingUnitName,:customerId,:customerName,:reconciler,:calculationLogic,:customCalculationLogic,:userDiscount,:remark,:createdByUserId,:createdByName,:updatedByUserId,:updatedByName)`, values);
  }
  await executeRaw("DELETE FROM cloud_mapping_accounts WHERE mappingId = :mappingId", { mappingId });
  const accounts = Array.isArray(body.accounts) ? body.accounts.flatMap(splitCloudAccounts) : splitCloudAccounts(body.accounts);
  for (const account of accounts) await executeRaw("INSERT IGNORE INTO cloud_mapping_accounts (id,mappingId,account) VALUES (:id,:mappingId,:account)", { id: randomUUID(), mappingId, account });
  return (await queryRowsRaw<Row>("SELECT * FROM cloud_mappings WHERE id = :id", { id: mappingId }))[0] ?? null;
}

export async function deleteCloudMapping(id: string) {
  await executeRaw("DELETE FROM cloud_mapping_accounts WHERE mappingId = :id", { id });
  await executeRaw("DELETE FROM cloud_mappings WHERE id = :id", { id });
}

export async function cloudMasterData(keyword = "") {
  const like = `%${keyword}%`;
  const [suppliers, undertakingUnits, customers] = await Promise.all([
    queryRowsRaw<Row>("SELECT supplierId AS id, supplierCode AS code, nameCn AS name, shortName FROM common_suppliers WHERE status='active' AND (supplierCode LIKE :like OR nameCn LIKE :like OR shortName LIKE :like) ORDER BY COALESCE(NULLIF(shortName, ''), nameCn) LIMIT 100", { like }),
    queryRowsRaw<Row>("SELECT undertakingUnitId AS id, undertakingUnitCode AS code, COALESCE(NULLIF(shortName, ''), NULLIF(entityName, ''), name) AS name, shortName FROM common_undertaking_units WHERE status='active' AND (undertakingUnitCode LIKE :like OR name LIKE :like OR shortName LIKE :like OR entityName LIKE :like) ORDER BY COALESCE(NULLIF(shortName, ''), NULLIF(entityName, ''), name) LIMIT 100", { like }),
    queryRowsRaw<Row>("SELECT customerId AS id, customerCode AS code, COALESCE(NULLIF(shortName, ''), NULLIF(nameCn, ''), name) AS name, shortName FROM common_customers WHERE status='active' AND (customerCode LIKE :like OR name LIKE :like OR nameCn LIKE :like OR shortName LIKE :like) ORDER BY COALESCE(NULLIF(shortName, ''), NULLIF(nameCn, ''), name) LIMIT 100", { like }),
  ]);
  return { suppliers, undertakingUnits, customers };
}

export async function listCloudSupplierPayments(params: URLSearchParams) {
  if (params.get("field")) return listCloudSupplierPaymentFilterOptions(params);
  const { page, pageSize, offset } = pageParams(params);
  const keyword = text(params.get("keyword"));
  const period = text(params.get("period"));
  const conditions = ["1=1"];
  const values: Row = { limit: pageSize, offset };
  if (keyword) { conditions.push("(supplierName LIKE :keyword OR searchText LIKE :keyword)"); values.keyword = `%${keyword}%`; }
  if (period) { conditions.push("period = :period"); values.period = period; }
  for (const [field, expression] of Object.entries(CLOUD_PAYMENT_FILTER_EXPRESSIONS)) appendTableInFilter(conditions, values, expression, field, params, "paymentFilter");
  const where = `WHERE ${conditions.join(" AND ")}`;
  const requestedSort = getTableSort(params, CLOUD_PAYMENT_FILTER_EXPRESSIONS);
  const [count, rows] = await Promise.all([
    queryRowsRaw<{ total: number }>(`SELECT COUNT(*) AS total FROM ${CLOUD_SUPPLIER_PAYMENT_FROM_V2} ${where}`, values),
    queryRowsRaw<Row>(`SELECT * FROM ${CLOUD_SUPPLIER_PAYMENT_FROM_V2} ${where} ${requestedSort || "ORDER BY period DESC, supplierName ASC"} LIMIT :limit OFFSET :offset`, values),
  ]);
  const items = await Promise.all(rows.map(async (row) => {
    const children = await queryRowsRaw<Row>(
      `SELECT r.id, r.period, r.customer, r.account, 'USD' AS supplierPayableCurrency,
         COALESCE(r.supplierPayableNetAmount, r.supplierPayable, 0) AS supplierPayableNetAmount,
         NULL AS supplierPayableExchangeRate,
         COALESCE(r.supplierTaxRate, 0.16) AS supplierTaxRate,
         COALESCE(r.supplierTaxAmount, COALESCE(r.supplierPayableNetAmount, r.supplierPayable, 0) * COALESCE(r.supplierTaxRate, 0.16)) AS supplierTaxAmount,
         COALESCE(r.supplierPayableTotalAmount, COALESCE(r.supplierPayableNetAmount, r.supplierPayable, 0) + COALESCE(r.supplierTaxAmount, COALESCE(r.supplierPayableNetAmount, r.supplierPayable, 0) * COALESCE(r.supplierTaxRate, 0.16))) AS supplierPayableTotalAmount,
         r.createdAt, r.updatedAt
       FROM cloud_rows r
       LEFT JOIN cloud_mappings m ON m.id = COALESCE(NULLIF(r.mappingId, ''), ${CLOUD_ACCOUNT_MAPPING_ID_SQL})
       WHERE r.period = :detailPeriod AND ${CLOUD_SUPPLIER_KEY_SQL} = :detailGroupKey
       ORDER BY r.customer ASC, r.account ASC`,
      { detailPeriod: row.period, detailGroupKey: row.groupKey },
    );
    return { ...row, children };
  }));
  return { items, total: Number(count[0]?.total ?? 0), page, pageSize };
}

export async function listCloudSupplierPaymentFilterOptions(params: URLSearchParams) {
  const conditions: string[] = ["1=1"];
  const values: Row = {};
  const keyword = text(params.get("keyword"));
  const period = text(params.get("period"));
  if (keyword) { conditions.push("(supplierName LIKE :keyword OR searchText LIKE :keyword)"); values.keyword = `%${keyword}%`; }
  if (period) { conditions.push("period = :period"); values.period = period; }
  return listSqlFilterOptions({ from: CLOUD_SUPPLIER_PAYMENT_FROM_V2, expressions: CLOUD_PAYMENT_FILTER_EXPRESSIONS, searchParams: params, conditions, params: values });
}

export async function updateCloudSupplierPayment(id: string, body: Row, actor: OperationActor | null) {
  const allowed = ["payerUnitId", "payerUnitName", "currency", "paymentExchangeRate", "paymentNetAmount", "paymentTaxRate", "paymentTaxAmount", "paymentTotalAmount", "paymentDate", "invoiceNo", "invoiceCurrency", "invoiceExchangeRate", "invoiceNetAmount", "invoiceTaxRate", "invoiceTaxAmount", "invoiceTotalAmount", "invoiceDate", "invoiceStatus", "paid"];
  const fields = allowed.filter((key) => Object.prototype.hasOwnProperty.call(body, key));
  if (!fields.length) throw new Error("没有可保存的付款字段");
  const target = (await queryRowsRaw<Row>("SELECT * FROM cloud_supplier_payments WHERE id = :id", { id }))[0]
    ?? (text(body.period) ? (await queryRowsRaw<Row>(
      `SELECT * FROM cloud_supplier_payments WHERE period = :period
         AND ((:supplierId <> '' AND supplierId = :supplierId) OR (:supplierId = '' AND supplierId IS NULL AND supplierName = :supplierName)) LIMIT 1`,
      { period: text(body.period), supplierId: text(body.supplierId), supplierName: text(body.supplierName) },
    ))[0] : undefined);
  const values: Row = { id: target?.id ?? randomUUID() };
  const merged = { ...(target ?? {}), ...body };
  const assignments = fields.map((key) => `${key} = :${key}`);
  for (const key of fields) values[key] = key.endsWith("TaxRate") ? rate(merged[key]) : ["paymentDate", "invoiceDate"].includes(key) ? text(merged[key]) || null : ["paymentExchangeRate", "invoiceExchangeRate", "paymentNetAmount", "paymentTaxAmount", "paymentTotalAmount", "invoiceNetAmount", "invoiceTaxAmount", "invoiceTotalAmount"].includes(key) ? nullableNumber(merged[key]) : ["payerUnitId", "payerUnitName", "currency", "invoiceNo", "invoiceCurrency", "invoiceStatus"].includes(key) ? text(merged[key]) || null : key === "paid" ? (merged[key] ? 1 : 0) : merged[key];
  for (const prefix of ["payment", "invoice"] as const) {
    const netKey = `${prefix}NetAmount`;
    const taxKey = `${prefix}TaxAmount`;
    const rateKey = `${prefix}TaxRate`;
    const totalKey = `${prefix}TotalAmount`;
    if (fields.some((field) => field === netKey || field === taxKey || field === rateKey || field === totalKey)) {
      const net = nullableNumber(merged[netKey]);
      const taxRate = rate(merged[rateKey]);
      const tax = taxAmount(net, taxRate, merged[taxKey]);
      const total = totalAmount(net, tax, merged[totalKey]);
      for (const [key, value] of [[taxKey, tax], [totalKey, total]] as const) {
        if (!fields.includes(key)) { fields.push(key); assignments.push(`${key} = :${key}`); }
        values[key] = value;
      }
    }
  }
  if (actor) { assignments.push("updatedByUserId = :userId", "updatedByName = :userName"); values.userId = actor.userId; values.userName = actor.displayName; }
  if (target) {
    await executeRaw(`UPDATE cloud_supplier_payments SET ${assignments.join(", ")} WHERE id = :id`, values);
  } else {
    await executeRaw(`INSERT INTO cloud_supplier_payments
      (id,period,supplierId,supplierName,payerUnitId,payerUnitName,currency,paymentExchangeRate,paymentNetAmount,paymentTaxRate,paymentTaxAmount,paymentTotalAmount,paymentDate,
       invoiceNo,invoiceCurrency,invoiceExchangeRate,invoiceNetAmount,invoiceTaxRate,invoiceTaxAmount,invoiceTotalAmount,invoiceDate,invoiceStatus,paid,createdByUserId,createdByName,updatedByUserId,updatedByName)
      VALUES (:id,:period,:supplierId,:supplierName,:payerUnitId,:payerUnitName,:currency,:paymentExchangeRate,:paymentNetAmount,:paymentTaxRate,:paymentTaxAmount,:paymentTotalAmount,:paymentDate,
       :invoiceNo,:invoiceCurrency,:invoiceExchangeRate,:invoiceNetAmount,:invoiceTaxRate,:invoiceTaxAmount,:invoiceTotalAmount,:invoiceDate,:invoiceStatus,:paid,:createdByUserId,:createdByName,:updatedByUserId,:updatedByName)`, {
      ...values,
      period: text(body.period), supplierId: text(body.supplierId) || null, supplierName: text(body.supplierName) || "未匹配供应商",
      payerUnitId: text(merged.payerUnitId) || null, payerUnitName: text(merged.payerUnitName) || null, currency: text(merged.currency) || null,
      paymentExchangeRate: nullableNumber(merged.paymentExchangeRate), paymentNetAmount: nullableNumber(merged.paymentNetAmount), paymentTaxRate: rate(merged.paymentTaxRate),
      paymentTaxAmount: taxAmount(nullableNumber(merged.paymentNetAmount), rate(merged.paymentTaxRate), merged.paymentTaxAmount), paymentTotalAmount: totalAmount(nullableNumber(merged.paymentNetAmount), taxAmount(nullableNumber(merged.paymentNetAmount), rate(merged.paymentTaxRate), merged.paymentTaxAmount), merged.paymentTotalAmount), paymentDate: text(merged.paymentDate) || null,
      invoiceNo: text(merged.invoiceNo) || null, invoiceCurrency: text(merged.invoiceCurrency) || null, invoiceExchangeRate: nullableNumber(merged.invoiceExchangeRate), invoiceNetAmount: nullableNumber(merged.invoiceNetAmount), invoiceTaxRate: rate(merged.invoiceTaxRate),
      invoiceTaxAmount: taxAmount(nullableNumber(merged.invoiceNetAmount), rate(merged.invoiceTaxRate), merged.invoiceTaxAmount), invoiceTotalAmount: totalAmount(nullableNumber(merged.invoiceNetAmount), taxAmount(nullableNumber(merged.invoiceNetAmount), rate(merged.invoiceTaxRate), merged.invoiceTaxAmount), merged.invoiceTotalAmount), invoiceDate: text(merged.invoiceDate) || null,
      invoiceStatus: text(merged.invoiceStatus) || "not_issued", paid: merged.paid ? 1 : 0,
      createdByUserId: actor?.userId ?? null, createdByName: actor?.displayName ?? null, updatedByUserId: actor?.userId ?? null, updatedByName: actor?.displayName ?? null,
    });
  }
  return (await queryRowsRaw<Row>("SELECT * FROM cloud_supplier_payments WHERE id = :id", { id: values.id }))[0] ?? null;
}

async function resolveCloudPartner(kind: "customers" | "undertakingUnits", value: unknown) {
  const raw = text(value);
  if (!raw) return { id: null, name: "" };
  const candidates = Array.from(new Set([raw, raw.split(/\s+-\s+/)[0]?.trim() ?? raw]));
  const config = kind === "customers"
    ? { table: "common_customers", id: "customerId", code: "customerCode", names: ["name", "nameCn", "shortName"] }
    : { table: "common_undertaking_units", id: "undertakingUnitId", code: "undertakingUnitCode", names: ["name", "nameCn", "entityName", "shortName"] };
  const conditions = candidates.flatMap((_, index) => [`${config.code} = :value${index}`, ...config.names.map((field) => `${field} = :value${index}`)]);
  const values = Object.fromEntries(candidates.map((candidate, index) => [`value${index}`, candidate]));
  const rows = await queryRowsRaw<Row>(
    `SELECT ${config.id} AS id, ${config.code} AS code, ${config.names.map((field) => `${field} AS ${field}`).join(", ")}
       FROM ${config.table} WHERE status = 'active' AND (${conditions.join(" OR ")}) LIMIT 1`,
    values,
  );
  const match = rows[0];
  if (!match) return { id: null, name: "" };
  return { id: String(match.id), name: text(match.shortName) || text(match.nameCn) || text(match.entityName) || text(match.name) || text(match.code) };
}

export async function importCloudWorkbook(buffer: Buffer, fileName: string, period: string, actor: OperationActor | null) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("工作簿没有可导入的工作表");
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (!raw.length) throw new Error("工作表没有数据");
  const normalized = raw
    .map((source) => Object.fromEntries(Object.entries(source).map(([key, value]) => [CLOUD_IMPORT_HEADERS[key.toLowerCase().replace(/\s+/g, "")] ?? CLOUD_IMPORT_HEADERS[key] ?? key, value])))
    .filter((source) => !isCloudImportNoteRow(source));
  if (!normalized.length) throw new Error("工作表没有可导入的账单数据");
  const accountMappings = await findCloudAccountMappings(normalized.map((source) => text(source.account)));
  const invalidRow = normalized.findIndex((source) => !text(source.account) || (!text(source.customer) && !accountMappings.has(text(source.account))));
  if (invalidRow >= 0) {
    throw new Error(`第 ${invalidRow + 2} 行客户和华为ID不能为空，或该华为ID未配置服务映射`);
  }
  const resolvedPeriod = period || text(normalized[0]?.period) || new Date().toISOString().slice(0, 7);
  const batchId = randomUUID();
  const batchCode = `HC-${resolvedPeriod.replace(/[^0-9]/g, "")}-${Date.now().toString().slice(-6)}`;
  await executeRaw(`INSERT INTO cloud_import_batches (id,batchCode,period,fileName,rowCount,importedByUserId,importedByName) VALUES (:id,:batchCode,:period,:fileName,:rowCount,:userId,:userName)`, { id: batchId, batchCode, period: resolvedPeriod, fileName, rowCount: normalized.length, userId: actor?.userId ?? null, userName: actor?.displayName ?? null });
  for (const source of normalized) {
    const account = text(source.account);
    const accountMapping = accountMappings.get(account);
    const mappedSource = applyCloudAccountMapping(source, accountMapping);
    const supplierNet = nullableNumber(source.supplierPayableNetAmount) ?? 0;
    const supplierTaxRate = rate(source.supplierTaxRate, 0.16);
    const customerNet = nullableNumber(source.customerReceivableNetAmount) ?? 0;
    const customerTaxRate = rate(source.customerTaxRate);
    const collectionNet = nullableNumber(source.collectionNetAmount);
    const collectionTaxRate = rate(source.collectionTaxRate);
    const invoiceNet = nullableNumber(source.invoiceNetAmount);
    const invoiceTaxRate = rate(source.invoiceTaxRate);
    const supplierTax = taxAmount(supplierNet, supplierTaxRate, source.supplierTaxAmount);
    const customerTax = taxAmount(customerNet, customerTaxRate, source.customerReceivableTaxAmount);
    const collectionTax = taxAmount(collectionNet, collectionTaxRate, source.collectionTaxAmount);
    const invoiceTax = taxAmount(invoiceNet, invoiceTaxRate, source.invoiceTaxAmount);
    const settlementGrossProfit = nullableNumber(source.settlementGrossProfit) ?? 0;
    const supplierFlow = accountMapping ? [accountMapping.undertakingUnitName, accountMapping.supplierName] : text(source.supplierPayablePayer).split(/\s*(?:→|->)\s*/).filter(Boolean);
    const customerFlow = accountMapping ? [accountMapping.customerName, accountMapping.undertakingUnitName] : text(source.customerReceivablePayee).split(/\s*(?:→|->)\s*/).filter(Boolean);
    const collectionPayer = await resolveCloudPartner("customers", mappedSource.collectionPayer);
    const collectionPayee = await resolveCloudPartner("undertakingUnits", mappedSource.collectionPayee);
    const invoicePayer = await resolveCloudPartner("customers", mappedSource.invoicePayer);
    const invoicePayee = await resolveCloudPartner("undertakingUnits", mappedSource.invoicePayee);
    const row: Row = {
      id: randomUUID(), importBatchId: batchId, period: text(source.period) || resolvedPeriod, batchCode,
      mappingId: accountMapping?.mappingId ?? null, supplierId: accountMapping?.supplierId ?? null, supplierName: accountMapping?.supplierName ?? null,
      undertakingUnitId: accountMapping?.undertakingUnitId ?? null, customerId: accountMapping?.customerId ?? null,
      customer: text(mappedSource.customer), account, owner: text(source.owner), cloudReconciler: text(mappedSource.cloudReconciler) || text(source.owner),
      collectionEntity: text(source.collectionEntity), catalogAmount: nullableNumber(source.catalogAmount) ?? 0, partnerAmount: nullableNumber(source.partnerAmount),
      voucherCustomerAmount: nullableNumber(source.voucherCustomerAmount), voucherSupplierAmount: nullableNumber(source.voucherSupplierAmount),
      supplierPayablePayer: supplierFlow[0] || text(source.supplierPayablePayer) || "承接单位", supplierPayablePayee: supplierFlow[1] || text(source.supplierPayablePayee) || "供应商", supplierPayableNetAmount: supplierNet,
      supplierTaxRate, supplierTaxAmount: supplierTax, supplierPayableTotalAmount: totalAmount(supplierNet, supplierTax, source.supplierPayableTotalAmount), supplierPayable: supplierNet,
      customerReceivablePayer: text(mappedSource.customerReceivablePayer) || customerFlow[0] || text(source.customer), customerReceivablePayee: text(mappedSource.customerReceivablePayee) || customerFlow[1] || text(source.customerReceivablePayee) || "承接单位", customerReceivableNetAmount: customerNet,
      customerTaxRate, customerReceivableTaxAmount: customerTax, customerReceivableTotalAmount: totalAmount(customerNet, customerTax, source.customerReceivableTotalAmount), customerReceivable: customerNet,
      theoreticalGrossProfit: nullableNumber(source.theoreticalGrossProfit), settlementGrossProfit, grossProfit: settlementGrossProfit,
      calculationLogic: text(source.calculationLogic), customerDiscount: nullableNumber(source.customerDiscount), remark: text(source.remark),
      collectionInvoice: text(source.collectionInvoice) || "not_issued", collected: text(source.collected) === "是" || text(source.collected) === "1" ? 1 : 0,
       collectionPayer: collectionPayer.name || text(mappedSource.collectionPayer), collectionPayee: collectionPayee.name || text(mappedSource.collectionPayee), collectionPayerCustomerId: collectionPayer.id, collectionPayeeUndertakingUnitId: collectionPayee.id, collectionCurrency: text(source.collectionCurrency),
      collectionExchangeRate: nullableNumber(source.collectionExchangeRate),
      collectionNetAmount: collectionNet, collectionTaxRate, collectionTaxAmount: collectionTax, collectionTotalAmount: totalAmount(collectionNet, collectionTax, source.collectionTotalAmount), collectionDate: text(source.collectionDate) || null,
       invoiceNo: text(source.invoiceNo), invoiceCurrency: text(source.invoiceCurrency), invoicePayer: invoicePayer.name || text(mappedSource.invoicePayer), invoicePayee: invoicePayee.name || text(mappedSource.invoicePayee), invoicePayerCustomerId: invoicePayer.id, invoicePayeeUndertakingUnitId: invoicePayee.id,
      invoiceNetAmount: invoiceNet, invoiceTaxRate, invoiceTaxAmount: invoiceTax, invoiceTotalAmount: totalAmount(invoiceNet, invoiceTax, source.invoiceTotalAmount), invoiceDate: text(source.invoiceDate) || null,
      invoiceExchangeRate: nullableNumber(source.invoiceExchangeRate),
      createdByUserId: actor?.userId ?? null, createdByName: actor?.displayName ?? null, updatedByUserId: actor?.userId ?? null, updatedByName: actor?.displayName ?? null,
    };
    await executeRaw(`INSERT INTO cloud_rows
      (id,importBatchId,period,batchCode,mappingId,supplierId,supplierName,undertakingUnitId,customerId,customer,account,owner,cloudReconciler,collectionEntity,catalogAmount,partnerAmount,voucherCustomerAmount,voucherSupplierAmount,
       supplierPayablePayer,supplierPayablePayee,supplierPayableNetAmount,supplierTaxRate,supplierTaxAmount,supplierPayableTotalAmount,supplierPayable,
       customerReceivablePayer,customerReceivablePayee,customerReceivableNetAmount,customerTaxRate,customerReceivableTaxAmount,customerReceivableTotalAmount,customerReceivable,
       theoreticalGrossProfit,settlementGrossProfit,grossProfit,calculationLogic,customerDiscount,remark,collectionInvoice,collected,collectionPayer,collectionPayee,collectionPayerCustomerId,collectionPayeeUndertakingUnitId,collectionCurrency,collectionExchangeRate,
       collectionNetAmount,collectionTaxRate,collectionTaxAmount,collectionTotalAmount,collectionDate,invoiceNo,invoiceCurrency,invoicePayer,invoicePayee,invoicePayerCustomerId,invoicePayeeUndertakingUnitId,invoiceNetAmount,invoiceTaxRate,
       invoiceTaxAmount,invoiceTotalAmount,invoiceExchangeRate,invoiceDate,createdByUserId,createdByName,updatedByUserId,updatedByName)
      VALUES (:id,:importBatchId,:period,:batchCode,:mappingId,:supplierId,:supplierName,:undertakingUnitId,:customerId,:customer,:account,:owner,:cloudReconciler,:collectionEntity,:catalogAmount,:partnerAmount,:voucherCustomerAmount,:voucherSupplierAmount,
       :supplierPayablePayer,:supplierPayablePayee,:supplierPayableNetAmount,:supplierTaxRate,:supplierTaxAmount,:supplierPayableTotalAmount,:supplierPayable,
       :customerReceivablePayer,:customerReceivablePayee,:customerReceivableNetAmount,:customerTaxRate,:customerReceivableTaxAmount,:customerReceivableTotalAmount,:customerReceivable,
        :theoreticalGrossProfit,:settlementGrossProfit,:grossProfit,:calculationLogic,:customerDiscount,:remark,:collectionInvoice,:collected,:collectionPayer,:collectionPayee,:collectionPayerCustomerId,:collectionPayeeUndertakingUnitId,:collectionCurrency,:collectionExchangeRate,
        :collectionNetAmount,:collectionTaxRate,:collectionTaxAmount,:collectionTotalAmount,:collectionDate,:invoiceNo,:invoiceCurrency,:invoicePayer,:invoicePayee,:invoicePayerCustomerId,:invoicePayeeUndertakingUnitId,:invoiceNetAmount,:invoiceTaxRate,
       :invoiceTaxAmount,:invoiceTotalAmount,:invoiceExchangeRate,:invoiceDate,:createdByUserId,:createdByName,:updatedByUserId,:updatedByName)`, row);
  }
  return { batchId, batchCode, period: resolvedPeriod, rowCount: normalized.length };
}

function isCloudImportNoteRow(row: Record<string, unknown>) {
  const values = Object.values(row).map(text).filter(Boolean);
  if (!values.length) return true;
  return values.every((value) => value === "必填" || value === "可选" || value.startsWith("必填：") || value.startsWith("可选："));
}

export async function listCloudAttachments(ownerType: string, ownerId: string) {
  return queryRowsRaw<Row>("SELECT id,ownerType,ownerId,fileName,fileType,fileSize,uploadedByName,uploadedAt FROM cloud_attachments WHERE ownerType = :ownerType AND ownerId = :ownerId ORDER BY uploadedAt DESC", { ownerType, ownerId });
}

export async function addCloudAttachment(ownerType: string, ownerId: string, file: { fileName: string; fileType: string; fileSize: number; dataUrl: string }, actor: OperationActor | null) {
  const id = randomUUID();
  await executeRaw(`INSERT INTO cloud_attachments (id,ownerType,ownerId,fileName,fileType,fileSize,dataUrl,uploadedByUserId,uploadedByName)
    VALUES (:id,:ownerType,:ownerId,:fileName,:fileType,:fileSize,:dataUrl,:userId,:userName)`, { id, ownerType, ownerId, ...file, userId: actor?.userId ?? null, userName: actor?.displayName ?? null });
  return (await queryRowsRaw<Row>("SELECT id,ownerType,ownerId,fileName,fileType,fileSize,uploadedByName,uploadedAt FROM cloud_attachments WHERE id = :id", { id }))[0] ?? null;
}

export async function findCloudAttachment(id: string) {
  return (await queryRowsRaw<Row>("SELECT * FROM cloud_attachments WHERE id = :id", { id }))[0] ?? null;
}

export async function deleteCloudAttachment(id: string) {
  await executeRaw("DELETE FROM cloud_attachments WHERE id = :id", { id });
}
