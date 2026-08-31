import * as XLSX from "xlsx";
import { queryRows, type Row } from "./db";
import {
  getTableSort,
  getTableFilterOptionsOrderBy,
} from "./table-query";

export type PoInvoiceSummaryRow = {
  id: string;
  projectId: string;
  projectNo: string;
  quotationNo: string;
  projectName: string;
  contractingUnitShortName: string;
  customerShortName: string;
  projectStatus: string;
  type: "income" | "cost";
  accountPeriod: string | null;
  accountingDate: string | null;
  companyEntity: string | null;
  invoiceEntity: string | null;
  invoiceDate: string | null;
  invoiceNo: string | null;
  invoiceTotal: number;
  invoiceTaxExcludedTotal: number;
  taxRate: number;
  invoiceTaxAmount: number;
  currency: string;
  exchangeRate: number;
  usdAmount: number;
  isPaid: boolean;
  isInvoiced: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PoInvoiceSummaryResult = {
  items: PoInvoiceSummaryRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  totals: {
    incomeUsd: number;
    costUsd: number;
    netUsd: number;
  };
};

const invoiceFrom = `
  merge_po_settlement_invoices i
  LEFT JOIN merge_po_settlement_projects p ON p.id = i.projectId
  LEFT JOIN merge_common_customers customer
    ON customer.customerId = p.customerId OR customer.customerCode = p.customerId
  LEFT JOIN merge_common_undertaking_units undertaking
    ON undertaking.undertakingUnitId = p.contractingUnitId
    OR undertaking.undertakingUnitCode = p.contractingUnitId
    OR undertaking.entityCode = p.contractingUnitId
`;

const contractingUnitDisplay = "COALESCE(NULLIF(undertaking.shortName, ''), NULLIF(undertaking.entityName, ''), NULLIF(undertaking.name, ''), NULLIF(p.contractingUnitName, ''), p.contractingUnitId, '')";
const customerDisplay = "COALESCE(NULLIF(customer.shortName, ''), NULLIF(customer.nameCn, ''), NULLIF(customer.name, ''), NULLIF(p.customerName, ''), p.customerId, '')";
const projectDisplay = "COALESCE(NULLIF(p.projectName, ''), NULLIF(p.remark, ''), '')";

const filterExpressions: Record<string, string> = {
  projectNo: "p.projectNo",
  quotationNo: "p.quotationNo",
  projectName: projectDisplay,
  contractingUnitShortName: contractingUnitDisplay,
  customerShortName: customerDisplay,
  projectStatus: "COALESCE(p.status, 'purchasing')",
  type: "i.type",
  accountPeriod: "i.accountPeriod",
  accountingDate: "i.accountingDate",
  companyEntity: "i.companyEntity",
  invoiceEntity: "i.invoiceEntity",
  invoiceDate: "i.invoiceDate",
  invoiceNo: "i.invoiceNo",
  invoiceTotal: "i.invoiceTotal",
  invoiceTaxExcludedTotal: "i.invoiceTaxExcludedTotal",
  taxRate: "i.taxRate",
  invoiceTaxAmount: "i.invoiceTaxAmount",
  currency: "i.currency",
  exchangeRate: "i.exchangeRate",
  usdAmount: "i.usdAmount",
  isPaid: "i.isPaid",
  isInvoiced: "i.isInvoiced",
  createdAt: "i.createdAt",
  updatedAt: "i.updatedAt",
};

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function dateText(value: unknown, withTime = false) {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.replace("T", " ").slice(0, withTime ? 16 : 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  const date = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  if (!withTime) return date;
  return `${date} ${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
}

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pageParams(params: URLSearchParams, includeAll = false) {
  const requestedPage = Math.max(1, Math.floor(numeric(params.get("page"), 1)));
  const requestedPageSize = Math.max(1, Math.floor(numeric(params.get("pageSize"), 20)));
  return {
    requestedPage,
    pageSize: includeAll ? 100_000 : Math.min(100, requestedPageSize),
  };
}

function addBaseConditions(params: URLSearchParams, conditions: string[], values: Row) {
  const keyword = text(params.get("keyword"));
  const type = text(params.get("type"));
  const accountPeriodStart = text(params.get("accountPeriodStart"));
  const accountPeriodEnd = text(params.get("accountPeriodEnd"));

  if (type === "income" || type === "cost") {
    conditions.push("i.type = :summaryType");
    values.summaryType = type;
  }
  if (accountPeriodStart) {
    conditions.push("LEFT(COALESCE(i.accountPeriod, ''), 10) >= :accountPeriodStart");
    values.accountPeriodStart = accountPeriodStart;
  }
  if (accountPeriodEnd) {
    conditions.push("LEFT(COALESCE(i.accountPeriod, ''), 10) <= :accountPeriodEnd");
    values.accountPeriodEnd = accountPeriodEnd;
  }
  if (keyword) {
    conditions.push(`(
      p.projectNo LIKE :summaryKeyword
      OR p.quotationNo LIKE :summaryKeyword
      OR ${projectDisplay} LIKE :summaryKeyword
      OR ${contractingUnitDisplay} LIKE :summaryKeyword
      OR ${customerDisplay} LIKE :summaryKeyword
      OR i.companyEntity LIKE :summaryKeyword
      OR i.invoiceEntity LIKE :summaryKeyword
      OR i.invoiceNo LIKE :summaryKeyword
      OR i.accountPeriod LIKE :summaryKeyword
    )`);
    values.summaryKeyword = `%${keyword}%`;
  }

  for (const [field, expression] of Object.entries(filterExpressions)) {
    const valuesForField = Array.from(new Set(params.getAll(`filter.${field}`).map((value) => value.trim()).filter(Boolean)));
    if (!valuesForField.length) continue;
    const parameterName = `summaryFilter_${field.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    conditions.push(`${expression} IN (:${parameterName})`);
    values[parameterName] = valuesForField;
  }
}

function selectSql(conditions: string[]) {
  return `
    SELECT i.*,
           p.projectNo,
           p.quotationNo,
           ${projectDisplay} AS projectName,
           ${contractingUnitDisplay} AS contractingUnitShortName,
           ${customerDisplay} AS customerShortName,
           COALESCE(p.status, 'purchasing') AS projectStatus
      FROM ${invoiceFrom}
     WHERE ${conditions.join(" AND ")}
  `;
}

function normalizeRow(row: Row): PoInvoiceSummaryRow {
  return {
    ...(row as unknown as PoInvoiceSummaryRow),
    projectNo: text(row.projectNo),
    quotationNo: text(row.quotationNo),
    projectName: text(row.projectName),
    contractingUnitShortName: text(row.contractingUnitShortName),
    customerShortName: text(row.customerShortName),
    projectStatus: text(row.projectStatus) || "purchasing",
    accountPeriod: dateText(row.accountPeriod),
    accountingDate: dateText(row.accountingDate),
    companyEntity: text(row.companyEntity) || null,
    invoiceEntity: text(row.invoiceEntity) || null,
    invoiceDate: dateText(row.invoiceDate),
    invoiceNo: text(row.invoiceNo) || null,
    invoiceTotal: numeric(row.invoiceTotal),
    invoiceTaxExcludedTotal: numeric(row.invoiceTaxExcludedTotal),
    taxRate: numeric(row.taxRate),
    invoiceTaxAmount: numeric(row.invoiceTaxAmount),
    currency: text(row.currency) || "USD",
    exchangeRate: numeric(row.exchangeRate, 1),
    usdAmount: numeric(row.usdAmount),
    isPaid: numeric(row.isPaid) !== 0,
    isInvoiced: numeric(row.isInvoiced) !== 0,
    createdAt: dateText(row.createdAt, true) || "",
    updatedAt: dateText(row.updatedAt, true) || "",
  };
}

export async function listPoInvoiceSummary(params: URLSearchParams, options: { includeAll?: boolean } = {}): Promise<PoInvoiceSummaryResult> {
  const { requestedPage, pageSize } = pageParams(params, options.includeAll);
  const conditions = ["1 = 1"];
  const values: Row = {};
  addBaseConditions(params, conditions, values);
  const sql = selectSql(conditions);
  const [{ total }] = await queryRows<{ total: number }>(`SELECT COUNT(*) AS total FROM (${sql}) invoice_rows`, values);
  const normalizedTotal = numeric(total);
  const totalPages = Math.max(1, Math.ceil(normalizedTotal / pageSize));
  const page = options.includeAll ? 1 : Math.min(requestedPage, totalPages);
  const sort = getTableSort(params, filterExpressions) || "ORDER BY i.createdAt DESC, i.id DESC";
  const rows = await queryRows<Row>(`${sql} ${sort} LIMIT :summaryLimit OFFSET :summaryOffset`, {
    ...values,
    summaryLimit: pageSize,
    summaryOffset: options.includeAll ? 0 : (page - 1) * pageSize,
  });
  const [totals] = await queryRows<{ incomeUsd: number; costUsd: number; netUsd: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN i.type = 'income' THEN i.usdAmount ELSE 0 END), 0) AS incomeUsd,
       COALESCE(SUM(CASE WHEN i.type = 'cost' THEN i.usdAmount ELSE 0 END), 0) AS costUsd,
       COALESCE(SUM(i.usdAmount), 0) AS netUsd
       FROM ${invoiceFrom}
      WHERE ${conditions.join(" AND ")}`,
    values,
  );
  return {
    items: rows.map(normalizeRow),
    total: normalizedTotal,
    page,
    pageSize,
    totalPages,
    totals: {
      incomeUsd: numeric(totals?.incomeUsd),
      costUsd: numeric(totals?.costUsd),
      netUsd: numeric(totals?.netUsd),
    },
  };
}

export async function listPoInvoiceSummaryFilterOptions(params: URLSearchParams) {
  const selectedField = text(params.get("field"));
  const expression = filterExpressions[selectedField];
  if (!expression) return { options: [] };
  const optionConditions = ["1 = 1", `${expression} IS NOT NULL`, `TRIM(CAST(${expression} AS CHAR)) <> ''`];
  const optionValues: Row = {};
  addBaseConditionsWithoutField(params, optionConditions, optionValues, selectedField);
  const optionKeyword = text(params.get("optionKeyword"));
  if (optionKeyword) {
    optionConditions.push(`CAST(${expression} AS CHAR) LIKE :summaryOptionKeyword`);
    optionValues.summaryOptionKeyword = `%${optionKeyword}%`;
  }
  const rows = await queryRows<{ value: string; count: number }>(
    `SELECT ${expression} AS value, COUNT(*) AS count
       FROM ${invoiceFrom}
      WHERE ${optionConditions.join(" AND ")}
      GROUP BY ${expression}
      ORDER BY ${getTableFilterOptionsOrderBy(selectedField, expression)}
      LIMIT 500`,
    optionValues,
  );
  return {
    options: rows.map((row) => ({
      value: String(row.value ?? ""),
      label: formatFilterOptionLabel(selectedField, row.value),
      count: numeric(row.count),
    })),
  };
}

function addBaseConditionsWithoutField(params: URLSearchParams, conditions: string[], values: Row, excludedField: string) {
  const cloned = new URLSearchParams(params);
  for (const key of Array.from(cloned.keys())) {
    if (key === `filter.${excludedField}`) cloned.delete(key);
  }
  addBaseConditions(cloned, conditions, values);
}

function formatFilterOptionLabel(field: string, value: unknown) {
  const raw = text(value);
  if (field === "type") return raw === "income" ? "收入" : raw === "cost" ? "成本" : raw;
  if (field === "projectStatus") {
    return ({ purchasing: "采购中", procurement_completed: "采购完成", accepting: "验收中", closed: "已完结" } as Record<string, string>)[raw] ?? raw;
  }
  if (field === "isPaid" || field === "isInvoiced") return numeric(value) === 0 ? "否" : "是";
  return raw;
}

function money(value: number) {
  return Number(value || 0).toFixed(2);
}

function exportRow(row: PoInvoiceSummaryRow) {
  return {
    项目单号: row.projectNo,
    报价单号: row.quotationNo,
    项目名称: row.projectName,
    承接单位: row.contractingUnitShortName,
    客户: row.customerShortName,
    项目状态: row.projectStatus,
    类型: row.type === "income" ? "收入" : "成本",
    账期: row.accountPeriod || "",
    财务记账日期: row.accountingDate || "",
    公司主体: row.companyEntity || "",
    发票主体: row.invoiceEntity || "",
    发票日期: row.invoiceDate || "",
    发票号: row.invoiceNo || "",
    发票总额: money(row.invoiceTotal),
    发票不含税总额: money(row.invoiceTaxExcludedTotal),
    "税率(%)": money(row.taxRate),
    发票税金: money(row.invoiceTaxAmount),
    发票币种: row.currency,
    发票汇率: money(row.exchangeRate),
    美金金额: money(row.usdAmount),
    是否支付: row.isPaid ? "是" : "否",
    是否开票: row.isInvoiced ? "是" : "否",
    创建时间: row.createdAt,
    更新时间: row.updatedAt,
  };
}

export async function exportPoInvoiceSummary(params: URLSearchParams) {
  const result = await listPoInvoiceSummary(params, { includeAll: true });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(result.items.map(exportRow)), "发票汇总");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
