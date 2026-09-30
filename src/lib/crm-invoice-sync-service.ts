import { randomUUID } from "node:crypto";
import { executeRaw, queryRowsRaw, type Row } from "./db";
import { addCloudAttachment, findCloudAttachment } from "./cloud-service";
import {
  resolveCrmBusinessLineId,
  resolveCrmEndpoint,
  resolveCrmSyncMonths,
  resolveCrmTimeoutMs,
} from "./crm-config";
import type { OperationActor } from "./operation-actor";
import { normalizeDateOnlyValue } from "./date-only";

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function pageParams(params: URLSearchParams) {
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(params.get("pageSize") ?? 20) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/**
 * CRM（发票 / 回款）同步。
 *
 * 口径（2026-09-30 与业务确认）：
 * - 只同步业务线 2（Cloud / 华为云）；
 * - CRM 客户与本地对账客户不是同一套名称，按「主体名称优先、简称兜底」解析，
 *   解析结果落到 `merge_cloud_crm_customer_mappings`，之后每次同步自动套用；
 * - 发票信息回填到本地对账行的「客户开票」字段：本地为空才写，已有值不一致只提示不覆盖；
 * - 一个客户在某账期有多行时，按金额就近匹配到一行，匹配不上标「未匹配」；
 * - 已作废（invoiceStatus=2）的发票不参与回填，只保留在列表里供追溯；
 * - 附件 PDF 拉回本地附件表（不依赖 OBS 链接有效期）；
 * - 回款按到账月份回填本地「客户实收」，与发票同步可分开开关。
 */

export type CrmSyncTrigger = "manual" | "scheduled" | "script";

export type CrmSyncSummary = {
  runId: string;
  status: "success" | "failed";
  triggerType: CrmSyncTrigger;
  businessLineId: number;
  months: string[];
  dryRun: boolean;
  invoiceFetched: number;
  invoiceCreated: number;
  invoiceUpdated: number;
  invoiceVoided: number;
  receiptFetched: number;
  receiptCreated: number;
  receiptUpdated: number;
  backfilled: number;
  mismatch: number;
  unmatched: number;
  attachmentDownloaded: number;
  attachmentFailed: number;
  attachmentLinked: number;
  /** 本次同步给出"建议分摊"的发票数（一张发票覆盖多个月/多行）。 */
  allocationSuggested: number;
  /** 本次同步给出"建议分摊"的回款数（一笔到账结多个月/多张票）。 */
  receiptSuggested: number;
  errors: Array<{ scope: string; message: string }>;
  startedAt: string;
  finishedAt: string;
};

const INVOICE_STATUS_VOID = 2;
const MONEY_EPSILON = 0.005;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const RECEIPT_STATUS_MATCHED = 3;

type CrmInvoice = {
  id: number;
  customerShortName: string;
  customerSubjectName: string;
  belongMonth: string;
  currency: string;
  amountTaxExcluded: number | null;
  taxAmount: number | null;
  amountTaxIncluded: number | null;
  invoiceNo: string;
  invoiceDate: string | null;
  paymentTermDays: number | null;
  dueDate: string | null;
  invoiceType: number | null;
  invoiceStatus: number | null;
  productServiceName: string;
  attachmentUrl: string;
};

type CrmReceipt = {
  id: number;
  customerShortName: string;
  currency: string;
  receiptStatus: number | null;
  receiptAmount: number | null;
  receivingBank: string;
  receivingAccountName: string;
  receivingAccountNo: string;
  bankSerialNo: string;
  bankSerialSummary: string;
  payerName: string;
  ourSubjectName: string;
  currencyConvertedFlag: number | null;
  convertedCurrency: string;
  convertedExchangeRate: number | null;
  convertedAmount: number | null;
  invoiceNos: string;
};

type CrmIdentity = {
  subjectName: string;
  shortName: string;
  subjectKey: string;
  shortKey: string;
};

/** 归一化月份：接受 2026-06 / 202606，统一成 YYYY-MM。 */
export function normalizeCrmMonth(value: unknown) {
  const raw = text(value).replace(/[^0-9]/g, "");
  if (raw.length !== 6) return "";
  const month = Number(raw.slice(4, 6));
  if (!Number.isFinite(month) || month < 1 || month > 12) return "";
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}`;
}

/** 月份 → 本地账期（YYYYMM）。 */
export function crmMonthToPeriod(month: string) {
  return normalizeCrmMonth(month).replace("-", "");
}

/** 名称归一化：忽略大小写、空格与全角括号，便于 CRM 名称与本地档案对齐。 */
export function normalizeCrmPartyName(value: unknown) {
  return text(value)
    .toLowerCase()
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/，/g, ",")
    .replace(/\s+/g, "");
}

/** 最近 N 个月（含当月），按时间升序返回 YYYY-MM。 */
export function recentCrmMonths(count: number, now = new Date()) {
  const months: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOnly(value: unknown) {
  const raw = text(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function isBlank(value: unknown) {
  return value === null || value === undefined || String(value).trim() === "";
}

function moneyEquals(left: unknown, right: unknown) {
  const a = numberOrNull(left);
  const b = numberOrNull(right);
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < MONEY_EPSILON;
}

const CRM_DATE_FIELDS = new Set(["invoiceDate", "dueDate", "collectionDate"]);

/**
 * 统一把 CRM 值转成 YYYY-MM-DD：CRM 接口给的是字符串，
 * 而本地表里 DATE 取回来的已经是 Date 对象，直接写库会变成 NULL。
 */
export function crmDateValue(value: unknown) {
  return normalizeDateOnlyValue(value) ?? null;
}

/**
 * 判断本地已有值与 CRM 值是否一致。
 *
 * 金额比数值（容忍分位误差）、日期先归一化成 YYYY-MM-DD 再比
 * （MySQL DATE 经驱动取回是 Date 对象，直接 toString 会变成
 * "Thu Jul 16 2026 ..."，永远判成不一致）、其余按去空白忽略大小写比。
 */
export function crmValuesEqual(field: string, remote: unknown, current: unknown) {
  if (CRM_DATE_FIELDS.has(field)) return normalizeDateOnlyValue(current) === normalizeDateOnlyValue(remote);
  if (typeof remote === "number") return moneyEquals(current, remote);
  return text(current).toLowerCase() === text(remote).toLowerCase();
}

/** CRM 直链里带空格和中文，先按原样试，失败再把路径段编码后重试。 */
function encodeAttachmentUrlCandidates(url: string) {
  const candidates = [url];
  try {
    const parsed = new URL(url);
    const encodedPath = parsed.pathname.split("/").map((segment) => encodeURIComponent(decodeURIComponent(segment))).join("/");
    candidates.push(`${parsed.origin}${encodedPath}${parsed.search}`);
  } catch { /* 非法 URL 只用原样 */ }
  return [...new Set(candidates)];
}

async function fetchCrmJson<T>(path: string, params: Record<string, string>) {
  const { baseUrl, token } = resolveCrmEndpoint("CRM 数据");
  const search = new URLSearchParams(params);
  const url = `${baseUrl}${path}?${search.toString()}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(resolveCrmTimeoutMs()),
  });
  const payload = (await response.json().catch(() => null)) as { code?: number; message?: string; data?: T } | null;
  if (!response.ok) throw new Error(`CRM 接口返回 ${response.status}：${payload?.message ?? response.statusText}`);
  if (payload?.code !== undefined && payload.code !== 200) throw new Error(`CRM 接口返回业务错误 ${payload.code}：${payload.message ?? ""}`);
  if (!payload?.data) throw new Error("CRM 接口未返回数据");
  return payload.data;
}

export async function fetchCrmInvoices(month: string, businessLineId = resolveCrmBusinessLineId()) {
  const data = await fetchCrmJson<{ items?: Row[] }>("/openapi/v1/invoices", {
    belongMonth: normalizeCrmMonth(month),
    businessLineId: String(businessLineId),
  });
  return (data.items ?? []).map<CrmInvoice>((row) => ({
    id: Number(row.id),
    customerShortName: text(row.customerShortName),
    customerSubjectName: text(row.customerSubjectName),
    belongMonth: normalizeCrmMonth(row.belongMonth) || normalizeCrmMonth(month),
    currency: text(row.currency).toUpperCase(),
    amountTaxExcluded: numberOrNull(row.invoiceAmountTaxExcluded),
    taxAmount: numberOrNull(row.taxAmount),
    amountTaxIncluded: numberOrNull(row.invoiceAmountTaxIncluded),
    invoiceNo: text(row.invoiceNo),
    invoiceDate: dateOnly(row.invoiceDate),
    paymentTermDays: numberOrNull(row.paymentTermDays),
    dueDate: dateOnly(row.dueDate),
    invoiceType: numberOrNull(row.invoiceType),
    invoiceStatus: numberOrNull(row.invoiceStatus),
    productServiceName: text(row.productServiceName),
    attachmentUrl: text(row.attachmentUrl),
  }));
}

export async function fetchCrmReceipts(month: string, businessLineId = resolveCrmBusinessLineId()) {
  const data = await fetchCrmJson<{ items?: Row[] }>("/openapi/v1/receipts", {
    arrivalMonth: normalizeCrmMonth(month),
    businessLineId: String(businessLineId),
  });
  return (data.items ?? []).map<CrmReceipt>((row) => ({
    id: Number(row.id),
    customerShortName: text(row.customerShortName),
    currency: text(row.currency).toUpperCase(),
    receiptStatus: numberOrNull(row.receiptStatus),
    receiptAmount: numberOrNull(row.receiptAmount),
    receivingBank: text(row.receivingBank),
    receivingAccountName: text(row.receivingAccountName),
    receivingAccountNo: text(row.receivingAccountNo),
    bankSerialNo: text(row.bankSerialNo),
    bankSerialSummary: text(row.bankSerialSummary),
    payerName: text(row.payerName),
    ourSubjectName: text(row.ourSubjectName),
    currencyConvertedFlag: numberOrNull(row.currencyConvertedFlag),
    convertedCurrency: text(row.convertedCurrency),
    convertedExchangeRate: numberOrNull(row.convertedExchangeRate),
    convertedAmount: numberOrNull(row.convertedAmount),
    invoiceNos: text(row.invoiceNos),
  }));
}

export async function fetchCrmExchangeRates(month: string, currencies: string[]) {
  const list = [...new Set(currencies.map((currency) => text(currency).toUpperCase()).filter(Boolean))];
  if (!list.length) return new Map<string, number>();
  const data = await fetchCrmJson<{ items?: Row[] }>("/openapi/v1/exchange-rates", {
    month: normalizeCrmMonth(month),
    currencies: list.join(","),
  });
  const result = new Map<string, number>();
  for (const row of data.items ?? []) {
    const currency = text(row.currency).toUpperCase();
    const rate = numberOrNull(row.exchangeRate);
    if (currency && rate !== null) result.set(currency, rate);
  }
  return result;
}

function identityOf(invoice: { customerSubjectName: string; customerShortName: string }): CrmIdentity {
  return {
    subjectName: invoice.customerSubjectName,
    shortName: invoice.customerShortName,
    subjectKey: normalizeCrmPartyName(invoice.customerSubjectName),
    shortKey: normalizeCrmPartyName(invoice.customerShortName),
  };
}

/** 本地客户档案索引：按简称 / 中文名 / 英文名归一化后建索引，用于首次自动匹配。 */
async function loadLocalCustomerLookup() {
  const rows = await queryRowsRaw<Row>(
    `SELECT customerId, customerCode, name, nameCn, shortName FROM merge_common_customers WHERE status = 'active'`,
  );
  const lookup = new Map<string, { id: string; name: string }>();
  for (const row of rows) {
    const display = text(row.shortName) || text(row.nameCn) || text(row.name) || text(row.customerCode);
    for (const candidate of [row.customerCode, row.name, row.nameCn, row.shortName]) {
      const key = normalizeCrmPartyName(candidate);
      if (key && !lookup.has(key)) lookup.set(key, { id: text(row.customerId), name: display });
    }
  }
  return lookup;
}

async function loadCrmMappings() {
  const rows = await queryRowsRaw<Row>(
    "SELECT id, crmValue, crmValueNormalized, matchField, customerId, customerName, source FROM merge_cloud_crm_customer_mappings",
  );
  return new Map(rows.map((row) => [text(row.crmValueNormalized), row]));
}

/**
 * 解析 CRM 客户 → 本地客户：主体名称优先、简称兜底，
 * 都查不到时按本地档案名称做一次自动匹配（命中后写入映射表，人工可改）。
 */
async function resolveIdentityCustomer(
  identity: CrmIdentity,
  mappings: Map<string, Row>,
  customerLookup: Map<string, { id: string; name: string }>,
  persist: (identity: CrmIdentity, matchField: string, value: string, customer: { id: string; name: string }) => Promise<void>,
) {
  for (const [key, field, value] of [
    [identity.subjectKey, "customerSubjectName", identity.subjectName],
    [identity.shortKey, "customerShortName", identity.shortName],
  ] as const) {
    if (!key) continue;
    const mapped = mappings.get(key);
    if (mapped) return { customerId: text(mapped.customerId), customerName: text(mapped.customerName) };
  }
  for (const [key, field, value] of [
    [identity.subjectKey, "customerSubjectName", identity.subjectName],
    [identity.shortKey, "customerShortName", identity.shortName],
  ] as const) {
    if (!key) continue;
    const auto = customerLookup.get(key);
    if (!auto) continue;
    await persist(identity, field, value, auto);
    return { customerId: auto.id, customerName: auto.name };
  }
  return { customerId: "", customerName: "" };
}

async function upsertCrmInvoice(invoice: CrmInvoice, businessLineId: number) {
  const existing = (await queryRowsRaw<Row>(
    "SELECT id FROM merge_cloud_crm_invoices WHERE crmInvoiceId = :crmInvoiceId",
    { crmInvoiceId: invoice.id },
  ))[0];
  const values: Row = {
    crmInvoiceId: invoice.id,
    businessLineId,
    invoiceNo: invoice.invoiceNo,
    customerShortName: invoice.customerShortName || null,
    customerSubjectName: invoice.customerSubjectName || null,
    belongMonth: invoice.belongMonth,
    period: crmMonthToPeriod(invoice.belongMonth),
    currency: invoice.currency || null,
    amountTaxExcluded: invoice.amountTaxExcluded,
    taxAmount: invoice.taxAmount,
    amountTaxIncluded: invoice.amountTaxIncluded,
    invoiceDate: invoice.invoiceDate,
    paymentTermDays: invoice.paymentTermDays,
    dueDate: invoice.dueDate,
    invoiceType: invoice.invoiceType,
    invoiceStatus: invoice.invoiceStatus,
    productServiceName: invoice.productServiceName || null,
    attachmentUrl: invoice.attachmentUrl || null,
  };
  if (existing) {
    await executeRaw(
      `UPDATE merge_cloud_crm_invoices SET businessLineId=:businessLineId, invoiceNo=:invoiceNo, customerShortName=:customerShortName,
         customerSubjectName=:customerSubjectName, belongMonth=:belongMonth, period=:period, currency=:currency,
         amountTaxExcluded=:amountTaxExcluded, taxAmount=:taxAmount, amountTaxIncluded=:amountTaxIncluded,
         invoiceDate=:invoiceDate, paymentTermDays=:paymentTermDays, dueDate=:dueDate, invoiceType=:invoiceType,
         invoiceStatus=:invoiceStatus, productServiceName=:productServiceName, attachmentUrl=:attachmentUrl, syncedAt=CURRENT_TIMESTAMP
       WHERE crmInvoiceId=:crmInvoiceId`,
      values,
    );
    return { recordId: text(existing.id), created: false };
  }
  const recordId = randomUUID();
  await executeRaw(
    `INSERT INTO merge_cloud_crm_invoices (id, crmInvoiceId, businessLineId, invoiceNo, customerShortName, customerSubjectName,
       belongMonth, period, currency, amountTaxExcluded, taxAmount, amountTaxIncluded, invoiceDate, paymentTermDays, dueDate,
       invoiceType, invoiceStatus, productServiceName, attachmentUrl)
     VALUES (:id, :crmInvoiceId, :businessLineId, :invoiceNo, :customerShortName, :customerSubjectName,
       :belongMonth, :period, :currency, :amountTaxExcluded, :taxAmount, :amountTaxIncluded, :invoiceDate, :paymentTermDays, :dueDate,
       :invoiceType, :invoiceStatus, :productServiceName, :attachmentUrl)`,
    { ...values, id: recordId },
  );
  return { recordId, created: true };
}

async function upsertCrmReceipt(receipt: CrmReceipt, month: string, businessLineId: number) {
  const existing = (await queryRowsRaw<Row>(
    "SELECT id FROM merge_cloud_crm_receipts WHERE crmReceiptId = :crmReceiptId",
    { crmReceiptId: receipt.id },
  ))[0];
  const values: Row = {
    crmReceiptId: receipt.id,
    businessLineId,
    arrivalMonth: month,
    period: crmMonthToPeriod(month),
    customerShortName: receipt.customerShortName || null,
    currency: receipt.currency || null,
    receiptStatus: receipt.receiptStatus,
    receiptAmount: receipt.receiptAmount,
    receivingBank: receipt.receivingBank || null,
    receivingAccountName: receipt.receivingAccountName || null,
    receivingAccountNo: receipt.receivingAccountNo || null,
    bankSerialNo: receipt.bankSerialNo || null,
    bankSerialSummary: receipt.bankSerialSummary || null,
    payerName: receipt.payerName || null,
    ourSubjectName: receipt.ourSubjectName || null,
    currencyConvertedFlag: receipt.currencyConvertedFlag,
    convertedCurrency: receipt.convertedCurrency || null,
    convertedExchangeRate: receipt.convertedExchangeRate,
    convertedAmount: receipt.convertedAmount,
    invoiceNos: receipt.invoiceNos || null,
  };
  if (existing) {
    await executeRaw(
      `UPDATE merge_cloud_crm_receipts SET businessLineId=:businessLineId, arrivalMonth=:arrivalMonth, period=:period,
         customerShortName=:customerShortName, currency=:currency, receiptStatus=:receiptStatus, receiptAmount=:receiptAmount,
         receivingBank=:receivingBank, receivingAccountName=:receivingAccountName, receivingAccountNo=:receivingAccountNo,
         bankSerialNo=:bankSerialNo, bankSerialSummary=:bankSerialSummary, payerName=:payerName, ourSubjectName=:ourSubjectName,
         currencyConvertedFlag=:currencyConvertedFlag, convertedCurrency=:convertedCurrency,
         convertedExchangeRate=:convertedExchangeRate, convertedAmount=:convertedAmount, invoiceNos=:invoiceNos, syncedAt=CURRENT_TIMESTAMP
       WHERE crmReceiptId=:crmReceiptId`,
      values,
    );
    return { recordId: text(existing.id), created: false };
  }
  const recordId = randomUUID();
  await executeRaw(
    `INSERT INTO merge_cloud_crm_receipts (id, crmReceiptId, businessLineId, arrivalMonth, period, customerShortName, currency,
       receiptStatus, receiptAmount, receivingBank, receivingAccountName, receivingAccountNo, bankSerialNo, bankSerialSummary,
       payerName, ourSubjectName, currencyConvertedFlag, convertedCurrency, convertedExchangeRate, convertedAmount, invoiceNos)
     VALUES (:id, :crmReceiptId, :businessLineId, :arrivalMonth, :period, :customerShortName, :currency,
       :receiptStatus, :receiptAmount, :receivingBank, :receivingAccountName, :receivingAccountNo, :bankSerialNo, :bankSerialSummary,
       :payerName, :ourSubjectName, :currencyConvertedFlag, :convertedCurrency, :convertedExchangeRate, :convertedAmount, :invoiceNos)`,
    { ...values, id: recordId },
  );
  return { recordId, created: true };
}

type BackfillOutcome = { status: string; note: string; rowId: string | null };

/** 取本地对账行：优先按客户 ID，历史行没有 ID 时退回客户名称。 */
async function findCloudRowCandidates(period: string, customerId: string, customerName: string) {
  return queryRowsRaw<Row>(
    `SELECT id, customer, customerId, invoiceNo, invoiceCurrency, invoiceNetAmount, invoiceTaxAmount, invoiceTotalAmount,
            invoiceDate, invoiceExchangeRate, collectionInvoice,
            COALESCE(customerReceivableTotalAmount, customerReceivableNetAmount, customerReceivable, 0) AS receivableAmount,
            collected, collectionCurrency, collectionTotalAmount, collectionDate
       FROM merge_cloud_rows
      WHERE period = :period AND (customerId = :customerId OR (COALESCE(customerId,'') = '' AND customer = :customerName))`,
    { period, customerId: customerId || "", customerName },
  );
}

/**
 * 多行时挑一行回填。顺序：
 * 1. 已经写过**这张发票**的行 —— 重复同步必须落回同一行，
 *    否则第二次同步会因为"优先还没发票号的行"换一行写，同一张发票的金额散到多行（重复计）。
 * 2. 还没有发票号的行
 * 3. 应收金额最接近发票金额的行
 */
function pickTargetRow(rows: Row[], amount: number | null, invoiceNo = "") {
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];
  if (invoiceNo) {
    const alreadyFilled = rows.filter((row) => text(row.invoiceNo) === invoiceNo);
    if (alreadyFilled.length === 1) return alreadyFilled[0];
  }
  const ranked = [...rows].sort((left, right) => {
    const leftEmpty = isBlank(left.invoiceNo) ? 0 : 1;
    const rightEmpty = isBlank(right.invoiceNo) ? 0 : 1;
    if (leftEmpty !== rightEmpty) return leftEmpty - rightEmpty;
    if (amount === null) return 0;
    return Math.abs(Number(left.receivableAmount ?? 0) - amount) - Math.abs(Number(right.receivableAmount ?? 0) - amount);
  });
  return ranked[0];
}

/**
 * 发票 → 本地对账行「客户开票」字段回填。
 * 本地为空才写；已有值不一致时只记录差异，不覆盖人工数据。
 */
async function backfillInvoice(
  invoice: CrmInvoice,
  customerId: string,
  customerName: string,
  exchangeRate: number | null,
  dryRun = false,
): Promise<BackfillOutcome> {
  if (invoice.invoiceStatus === INVOICE_STATUS_VOID) return { status: "void", note: "CRM 已作废，不回填", rowId: null };
  if (!customerId) return { status: "unmatched", note: "未配置 CRM 客户映射", rowId: null };
  const period = crmMonthToPeriod(invoice.belongMonth);
  const rows = await findCloudRowCandidates(period, customerId, customerName);
  if (!rows.length) return { status: "unmatched", note: `本地 ${period} 账期没有该客户的对账行`, rowId: null };
  const target = pickTargetRow(rows, invoice.amountTaxIncluded, invoice.invoiceNo);
  if (!target) return { status: "unmatched", note: `本地 ${period} 账期没有该客户的对账行`, rowId: null };

  const assignments: string[] = [];
  const values: Row = { rowId: text(target.id) };
  const differences: string[] = [];
  const plan: Array<[string, unknown, unknown, string]> = [
    ["invoiceCurrency", invoice.currency, target.invoiceCurrency, "币种"],
    ["invoiceNetAmount", invoice.amountTaxExcluded, target.invoiceNetAmount, "未税金额"],
    ["invoiceTaxAmount", invoice.taxAmount, target.invoiceTaxAmount, "税金"],
    ["invoiceTotalAmount", invoice.amountTaxIncluded, target.invoiceTotalAmount, "含税金额"],
    ["invoiceDate", invoice.invoiceDate, target.invoiceDate, "开票日期"],
  ];
  for (const [field, remote, current, label] of plan) {
    if (remote === null || remote === undefined || remote === "") continue;
    if (isBlank(current)) {
      assignments.push(`${field} = :${field}`);
      values[field] = remote;
      continue;
    }
    const same = crmValuesEqual(field, remote, current);
    if (!same) differences.push(`${label}本地 ${text(current)} / CRM ${text(remote)}`);
  }
  // 发票号单独判断：它决定这张发票是否已经回填过。
  let filledInvoiceNo = false;
  if (isBlank(target.invoiceNo)) {
    assignments.push("invoiceNo = :invoiceNo");
    values.invoiceNo = invoice.invoiceNo;
    filledInvoiceNo = true;
  } else if (text(target.invoiceNo) !== invoice.invoiceNo) {
    differences.push(`发票号本地 ${text(target.invoiceNo)} / CRM ${invoice.invoiceNo}`);
  }
  if (exchangeRate !== null && isBlank(target.invoiceExchangeRate)) {
    assignments.push("invoiceExchangeRate = :invoiceExchangeRate");
    values.invoiceExchangeRate = exchangeRate;
  }
  if (filledInvoiceNo || text(target.invoiceNo) === invoice.invoiceNo) {
    if (text(target.collectionInvoice) !== "issued") assignments.push("collectionInvoice = 'issued'");
  }
  if (assignments.length && !dryRun) {
    await executeRaw(`UPDATE merge_cloud_rows SET ${assignments.join(", ")} WHERE id = :rowId`, values);
  }
  if (differences.length) return { status: "mismatch", note: differences.join("；").slice(0, 500), rowId: text(target.id) };
  if (!assignments.length) return { status: "backfilled", note: "本地已是最新，无需变更", rowId: text(target.id) };
  return { status: "backfilled", note: "已回填到本地对账行", rowId: text(target.id) };
}

/** 回款 → 本地对账行「客户实收」字段回填，规则与发票一致（为空才写）。 */
async function backfillReceipt(
  receipt: CrmReceipt,
  month: string,
  customerId: string,
  customerName: string,
  dryRun = false,
): Promise<BackfillOutcome> {
  if (!customerId) return { status: "unmatched", note: "未配置 CRM 客户映射", rowId: null };
  const period = crmMonthToPeriod(month);
  const rows = await findCloudRowCandidates(period, customerId, customerName);
  if (!rows.length) return { status: "unmatched", note: `本地 ${period} 账期没有该客户的对账行`, rowId: null };
  const pending = rows.filter((row) => !Number(row.collected));
  /**
   * 重复同步必须落回同一行：优先挑"本行实收金额已经等于这笔回款"的行，
   * 否则第二次同步会换一行写，同一笔回款的金额散到多行（实收合计翻倍）。
   */
  const alreadyFilled = rows.filter((row) => Number(row.collected) === 1 && moneyEquals(row.collectionTotalAmount, receipt.receiptAmount));
  const target = alreadyFilled.length === 1
    ? alreadyFilled[0]
    : pickTargetRow(pending.length ? pending : rows, receipt.receiptAmount);
  if (!target) return { status: "unmatched", note: `本地 ${period} 账期没有该客户的对账行`, rowId: null };

  const assignments: string[] = [];
  const values: Row = { rowId: text(target.id) };
  const differences: string[] = [];
  if (receipt.currency && isBlank(target.collectionCurrency)) {
    assignments.push("collectionCurrency = :collectionCurrency");
    values.collectionCurrency = receipt.currency;
  }
  if (receipt.receiptAmount !== null && isBlank(target.collectionTotalAmount)) {
    assignments.push("collectionTotalAmount = :collectionTotalAmount");
    values.collectionTotalAmount = receipt.receiptAmount;
  } else if (receipt.receiptAmount !== null && !moneyEquals(target.collectionTotalAmount, receipt.receiptAmount)) {
    differences.push(`实收金额本地 ${text(target.collectionTotalAmount)} / CRM ${receipt.receiptAmount}`);
  }
  if (Number(target.collected) !== 1) assignments.push("collected = 1");
  // CRM 只给到账月份，没有具体到账日：本地为空时按当月首日预估，并在备注里说明。
  if (isBlank(target.collectionDate)) {
    assignments.push("collectionDate = :collectionDate");
    values.collectionDate = `${month}-01`;
  }
  const note = receipt.receiptStatus === RECEIPT_STATUS_MATCHED
    ? "已按到账月份回填；CRM 未提供具体到账日，日期按当月首日预估"
    : "已按到账月份回填（CRM 回款未完全匹配发票，请核对）；日期按当月首日预估";
  if (assignments.length && !dryRun) {
    await executeRaw(`UPDATE merge_cloud_rows SET ${assignments.join(", ")} WHERE id = :rowId`, values);
  }
  if (differences.length) return { status: "mismatch", note: differences.join("；").slice(0, 500), rowId: text(target.id) };
  return { status: "backfilled", note: note.slice(0, 500), rowId: text(target.id) };
}

async function downloadInvoiceAttachment(invoice: CrmInvoice, recordId: string, actor: OperationActor | null) {
  for (const url of encodeAttachmentUrlCandidates(invoice.attachmentUrl)) {
    const response = await fetch(url, { signal: AbortSignal.timeout(resolveCrmTimeoutMs()) });
    if (!response.ok) continue;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) continue;
    const fileType = response.headers.get("content-type") || "application/pdf";
    const fileName = decodeURIComponent(url.split("/").pop() ?? "") || `${invoice.invoiceNo || invoice.id}.pdf`;
    const attachment = await addCloudAttachment(
      "crm_invoice",
      recordId,
      { fileName, fileType, fileSize: buffer.length, dataUrl: `data:${fileType};base64,${buffer.toString("base64")}` },
      actor,
    );
    await executeRaw("UPDATE merge_cloud_crm_invoices SET attachmentId = :attachmentId WHERE id = :id", {
      attachmentId: text((attachment as Row | null)?.id),
      id: recordId,
    });
    return text((attachment as Row | null)?.id);
  }
  throw new Error("附件下载失败");
}

/**
 * 把发票 PDF 同时挂到「匹配上的对账行 → 客户开票附件」下，
 * 这样在明细里点附件按钮就能直接看到/下载这张发票。
 *
 * 幂等且尊重人工操作：对账行变了才把旧的摘掉重挂；
 * 同一行已经挂过就跳过 —— 用户手工删掉后不会被同步反复塞回来。
 */
async function linkInvoiceAttachmentToRow(recordId: string, rowId: string, attachmentId: string, actor: OperationActor | null) {
  const source = await findCloudAttachment(attachmentId);
  if (!source) return null;
  const fileName = text(source.fileName) || `${attachmentId}.pdf`;
  const [current] = await queryRowsRaw<Row>(
    "SELECT rowAttachmentId, rowAttachmentOwnerId FROM merge_cloud_crm_invoices WHERE id = :id",
    { id: recordId },
  );
  const linkedId = text(current?.rowAttachmentId);
  const linkedRowId = text(current?.rowAttachmentOwnerId);
  if (linkedId && linkedRowId === rowId) return { attachmentId: linkedId, linked: false };
  if (linkedId && linkedRowId && linkedRowId !== rowId) {
    // 目标对账行变了（例如映射调整后重新同步）：把旧行上的那份摘掉
    await executeRaw("DELETE FROM merge_cloud_attachments WHERE id = :id AND ownerType = 'invoice'", { id: linkedId });
  }
  const duplicate = (await queryRowsRaw<Row>(
    "SELECT id FROM merge_cloud_attachments WHERE ownerType = 'invoice' AND ownerId = :rowId AND fileName = :fileName LIMIT 1",
    { rowId, fileName },
  ))[0];
  let targetId = text(duplicate?.id);
  if (!targetId) {
    targetId = randomUUID();
    await executeRaw(
      `INSERT INTO merge_cloud_attachments (id, ownerType, ownerId, fileName, fileType, fileSize, dataUrl, uploadedByUserId, uploadedByName)
       VALUES (:id, 'invoice', :rowId, :fileName, :fileType, :fileSize, :dataUrl, NULL, 'CRM 同步')`,
      {
        id: targetId,
        rowId,
        fileName,
        fileType: text(source.fileType) || "application/pdf",
        fileSize: Number(source.fileSize ?? 0),
        dataUrl: String(source.dataUrl ?? ""),
      },
    );
  }
  await executeRaw(
    "UPDATE merge_cloud_crm_invoices SET rowAttachmentId = :targetId, rowAttachmentOwnerId = :rowId WHERE id = :recordId",
    { targetId, rowId, recordId },
  );
  return { attachmentId: targetId, linked: true };
}

export type CrmSyncOptions = {
  months?: string[];
  triggerType?: CrmSyncTrigger;
  dryRun?: boolean;
  includeReceipts?: boolean;
  downloadAttachments?: boolean;
  businessLineId?: number;
  actor?: OperationActor | null;
};

export async function syncCrmInvoices(options: CrmSyncOptions = {}): Promise<CrmSyncSummary> {
  const businessLineId = options.businessLineId ?? resolveCrmBusinessLineId();
  const requested = (options.months ?? []).map(normalizeCrmMonth).filter(Boolean);
  const months = requested.length ? [...new Set(requested)] : recentCrmMonths(resolveCrmSyncMonths());
  const triggerType = options.triggerType ?? "manual";
  const dryRun = Boolean(options.dryRun);
  const includeReceipts = options.includeReceipts !== false;
  const downloadAttachments = options.downloadAttachments !== false;
  const actor = options.actor ?? null;
  const runId = randomUUID();
  const startedAt = new Date();
  const errors: CrmSyncSummary["errors"] = [];

  if (!dryRun) {
    await executeRaw(
      `INSERT INTO merge_cloud_crm_sync_runs (syncRunId, triggerType, status, businessLineId, months, dryRun)
       VALUES (:runId, :triggerType, 'running', :businessLineId, :months, 0)`,
      { runId, triggerType, businessLineId, months: months.join(",") },
    );
  }

  const summary: CrmSyncSummary = {
    runId, status: "success", triggerType, businessLineId, months, dryRun,
    invoiceFetched: 0, invoiceCreated: 0, invoiceUpdated: 0, invoiceVoided: 0,
    receiptFetched: 0, receiptCreated: 0, receiptUpdated: 0,
    backfilled: 0, mismatch: 0, unmatched: 0, attachmentDownloaded: 0, attachmentFailed: 0,
    attachmentLinked: 0, allocationSuggested: 0, receiptSuggested: 0,
    errors, startedAt: startedAt.toISOString(), finishedAt: "",
  };

  try {
    const invoices: CrmInvoice[] = [];
    for (const month of months) {
      try {
        invoices.push(...await fetchCrmInvoices(month, businessLineId));
      } catch (error) {
        errors.push({ scope: `发票 ${month}`, message: error instanceof Error ? error.message : String(error) });
      }
    }
    summary.invoiceFetched = invoices.length;
    summary.invoiceVoided = invoices.filter((invoice) => invoice.invoiceStatus === INVOICE_STATUS_VOID).length;

    const receipts: Array<{ receipt: CrmReceipt; month: string }> = [];
    if (includeReceipts) {
      for (const month of months) {
        try {
          for (const receipt of await fetchCrmReceipts(month, businessLineId)) receipts.push({ receipt, month });
        } catch (error) {
          errors.push({ scope: `回款 ${month}`, message: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    summary.receiptFetched = receipts.length;

    // 汇率失败不影响主流程：本地汇率保持人工填写。
    const rates = new Map<string, number>();
    for (const month of months) {
      try {
        for (const [currency, rate] of await fetchCrmExchangeRates(month, ["USD", "CNY", "CLP", "HKD", "MXN", "BRL"])) rates.set(currency, rate);
      } catch (error) {
        errors.push({ scope: `汇率 ${month}`, message: error instanceof Error ? error.message : String(error) });
      }
    }

    const customerLookup = await loadLocalCustomerLookup();
    const mappings = await loadCrmMappings();
    const persistMapping = async (identity: CrmIdentity, matchField: string, value: string, customer: { id: string; name: string }) => {
      const key = normalizeCrmPartyName(value);
      if (!key) return;
      if (dryRun) { mappings.set(key, { customerId: customer.id, customerName: customer.name, source: "auto" }); return; }
      await executeRaw(
        `INSERT INTO merge_cloud_crm_customer_mappings (id, crmValue, crmValueNormalized, matchField, customerId, customerName, source)
         VALUES (:id, :crmValue, :key, :matchField, :customerId, :customerName, 'auto')
         ON DUPLICATE KEY UPDATE customerId = VALUES(customerId), customerName = VALUES(customerName)`,
        { id: randomUUID(), crmValue: value, key, matchField, customerId: customer.id, customerName: customer.name },
      );
      mappings.set(key, { customerId: customer.id, customerName: customer.name, source: "auto" });
    };

    const identityCache = new Map<string, { customerId: string; customerName: string }>();
    async function customerFor(identity: CrmIdentity) {
      const cacheKey = `${identity.subjectKey}|${identity.shortKey}`;
      const cached = identityCache.get(cacheKey);
      if (cached) return cached;
      const resolved = await resolveIdentityCustomer(identity, mappings, customerLookup, persistMapping);
      identityCache.set(cacheKey, resolved);
      return resolved;
    }

    for (const invoice of invoices) {
      if (!dryRun) {
        const { recordId, created } = await upsertCrmInvoice(invoice, businessLineId);
        if (created) summary.invoiceCreated += 1; else summary.invoiceUpdated += 1;
        const { customerId, customerName } = await customerFor(identityOf(invoice));
        /**
         * 已经做过"按账期分摊"的发票：不再走整张票的单行回填（否则会把整张金额往某一行写），
         * 只刷新客户信息即可，各行金额仍按分摊结果保留。
         */
        const records = await queryRowsRaw<Row>(
          "SELECT allocationCount FROM merge_cloud_crm_invoices WHERE id = :id",
          { id: recordId },
        );
        if (Number(records[0]?.allocationCount ?? 0) > 0) {
          await executeRaw(
            "UPDATE merge_cloud_crm_invoices SET customerId=:customerId, customerName=:customerName WHERE id=:id",
            { customerId: customerId || null, customerName: customerName || null, id: recordId },
          );
          continue;
        }
        const outcome = await backfillInvoice(invoice, customerId, customerName, rates.get(invoice.currency) ?? null, dryRun);
        await executeRaw(
          `UPDATE merge_cloud_crm_invoices SET customerId=:customerId, customerName=:customerName, targetRowId=:targetRowId,
             backfillStatus=:status, backfillNote=:note WHERE id=:id`,
          { customerId: customerId || null, customerName: customerName || null, targetRowId: outcome.rowId, status: outcome.status, note: outcome.note, id: recordId },
        );
        if (outcome.status === "backfilled") summary.backfilled += 1;
        else if (outcome.status === "mismatch") summary.mismatch += 1;
        else if (outcome.status === "unmatched") summary.unmatched += 1;
        // 附件：先把 PDF 落到本地，再把它挂到匹配上的对账行「客户开票附件」下
        let attachmentId = text((await queryRowsRaw<Row>(
          "SELECT attachmentId FROM merge_cloud_crm_invoices WHERE id = :id",
          { id: recordId },
        ))[0]?.attachmentId);
        if (downloadAttachments && invoice.attachmentUrl && outcome.status !== "void" && !attachmentId) {
          try {
            attachmentId = await downloadInvoiceAttachment(invoice, recordId, actor);
            summary.attachmentDownloaded += 1;
          } catch (error) {
            summary.attachmentFailed += 1;
            errors.push({ scope: `附件 ${invoice.invoiceNo || invoice.id}`, message: error instanceof Error ? error.message : String(error) });
          }
        }
        if (attachmentId && outcome.rowId) {
          try {
            const linked = await linkInvoiceAttachmentToRow(recordId, outcome.rowId, attachmentId, actor);
            if (linked?.linked) summary.attachmentLinked += 1;
          } catch (error) {
            errors.push({ scope: `附件挂载 ${invoice.invoiceNo || invoice.id}`, message: error instanceof Error ? error.message : String(error) });
          }
        }
        /**
         * 合并发票识别：发票金额 ≈ 该客户若干对账行的应收合计时，把候选行记下来，
         * 列表里显示"建议拆分 N 行"，由人工确认后再拆（不自动写库）。
         */
        try {
          const record = (await queryRowsRaw<Row>(
            "SELECT id, customerId, currency, amountTaxIncluded, allocationCount FROM merge_cloud_crm_invoices WHERE id = :id",
            { id: recordId },
          ))[0];
          if (record) {
            const suggestion = await refreshAllocationSuggestion(record);
            if (suggestion.length) summary.allocationSuggested += 1;
          }
        } catch (error) {
          errors.push({ scope: `分摊建议 ${invoice.invoiceNo || invoice.id}`, message: error instanceof Error ? error.message : String(error) });
        }
      } else {
        const { customerId, customerName } = await customerFor(identityOf(invoice));
        const outcome = await backfillInvoice(invoice, customerId, customerName, rates.get(invoice.currency) ?? null, true);
        if (outcome.status === "backfilled") summary.backfilled += 1;
        else if (outcome.status === "mismatch") summary.mismatch += 1;
        else if (outcome.status === "unmatched") summary.unmatched += 1;
      }
    }

    for (const { receipt, month } of receipts) {
      const identity = identityOf({ customerSubjectName: receipt.payerName, customerShortName: receipt.customerShortName });
      const { customerId, customerName } = await customerFor(identity);
      if (dryRun) {
        const outcome = await backfillReceipt(receipt, month, customerId, customerName, true);
        if (outcome.status === "backfilled") summary.backfilled += 1;
        else if (outcome.status === "mismatch") summary.mismatch += 1;
        else if (outcome.status === "unmatched") summary.unmatched += 1;
        continue;
      }
      const { recordId, created } = await upsertCrmReceipt(receipt, month, businessLineId);
      if (created) summary.receiptCreated += 1; else summary.receiptUpdated += 1;
      // 已经做过"按账期/发票分摊"的回款：不再走整笔写一行的回填
      const receiptRecords = await queryRowsRaw<Row>(
        "SELECT allocationCount FROM merge_cloud_crm_receipts WHERE id = :id",
        { id: recordId },
      );
      if (Number(receiptRecords[0]?.allocationCount ?? 0) > 0) {
        await executeRaw(
          "UPDATE merge_cloud_crm_receipts SET customerId=:customerId, customerName=:customerName WHERE id=:id",
          { customerId: customerId || null, customerName: customerName || null, id: recordId },
        );
        continue;
      }
      /**
       * 回款**不再自动整笔回填**：CRM 的"到账月份"与账期并不是一回事
       * （一笔到账常常结的是更早几个月的账），整笔写进到账月那一行会让实收合计错掉。
       * 这里只算建议（优先按关联发票覆盖的行，其次按"应收合计≈回款金额"），由人工确认后分摊。
       */
      try {
        const record = (await queryRowsRaw<Row>("SELECT * FROM merge_cloud_crm_receipts WHERE id = :id", { id: recordId }))[0];
        const suggestion = record ? await refreshReceiptAllocationSuggestion(record) : [];
        await executeRaw(
          `UPDATE merge_cloud_crm_receipts SET customerId=:customerId, customerName=:customerName,
             targetRowId=NULL, backfillStatus=:status, backfillNote=:note WHERE id=:id`,
          {
            customerId: customerId || null,
            customerName: customerName || null,
            status: suggestion.length ? "pending" : (customerId ? "unmatched" : "unmatched"),
            note: suggestion.length
              ? `建议分摊到 ${suggestion.length} 行，待确认`
              : customerId ? "未找到可分摊的账期行（可手工选择）" : "未配置 CRM 客户映射",
            id: recordId,
          },
        );
        if (suggestion.length) summary.receiptSuggested += 1;
        else summary.unmatched += 1;
      } catch (error) {
        errors.push({ scope: `回款分摊建议 ${receipt.id}`, message: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    summary.status = "failed";
    errors.push({ scope: "同步", message: error instanceof Error ? error.message : String(error) });
  }

  summary.finishedAt = new Date().toISOString();
  if (!dryRun) {
    await executeRaw(
      `UPDATE merge_cloud_crm_sync_runs SET status=:status, invoiceFetched=:invoiceFetched, invoiceChanged=:invoiceChanged,
         invoiceVoided=:invoiceVoided, receiptFetched=:receiptFetched, receiptChanged=:receiptChanged,
         backfilledCount=:backfilled, mismatchCount=:mismatch, unmatchedCount=:unmatched,
         attachmentDownloaded=:attachmentDownloaded, attachmentFailed=:attachmentFailed,
         attachmentLinked=:attachmentLinked,
         allocatedCount=:allocatedCount,
         errorCount=:errorCount, errorJson=:errorJson, message=:message, finishedAt=CURRENT_TIMESTAMP
       WHERE syncRunId=:runId`,
      {
        runId,
        status: summary.status,
        invoiceFetched: summary.invoiceFetched,
        invoiceChanged: summary.invoiceCreated + summary.invoiceUpdated,
        invoiceVoided: summary.invoiceVoided,
        receiptFetched: summary.receiptFetched,
        receiptChanged: summary.receiptCreated + summary.receiptUpdated,
        backfilled: summary.backfilled,
        mismatch: summary.mismatch,
        unmatched: summary.unmatched,
        attachmentDownloaded: summary.attachmentDownloaded,
        attachmentFailed: summary.attachmentFailed,
        attachmentLinked: summary.attachmentLinked,
        allocatedCount: summary.allocationSuggested,
        errorCount: errors.length,
        errorJson: errors.length ? JSON.stringify(errors).slice(0, 20000) : null,
        message: errors.length ? errors[0].message.slice(0, 500) : "同步完成",
      },
    );
  }
  return summary;
}

const CRM_INVOICE_STATUS_LABELS: Record<string, string> = { "1": "审核通过", "2": "已作废" };
const CRM_INVOICE_TYPE_LABELS: Record<string, string> = { "1": "预付", "2": "后付" };

export function crmInvoiceStatusLabel(value: unknown) {
  return CRM_INVOICE_STATUS_LABELS[text(value)] ?? "-";
}

export function crmInvoiceTypeLabel(value: unknown) {
  return CRM_INVOICE_TYPE_LABELS[text(value)] ?? "-";
}

/**
 * CRM 副本里存的 `customerName` 是"映射那一刻"的本地客户简称，档案改名后不会回写。
 * 列表/搜索统一按 customerId 回查档案当前简称，口径与其它模块一致。
 */
async function resolveCrmCustomerNames<T extends Row>(rows: T[], idField = "customerId"): Promise<T[]> {
  const references = [...new Set(rows.map((row) => text(row[idField])).filter(Boolean))];
  if (!references.length) return rows;
  const placeholders = references.map((_, index) => `:reference${index}`).join(", ");
  const values = Object.fromEntries(references.map((value, index) => [`reference${index}`, value]));
  const customers = await queryRowsRaw<Row>(
    `SELECT customerId, customerCode, COALESCE(NULLIF(shortName, ''), NULLIF(nameCn, ''), NULLIF(name, ''), customerCode) AS name
       FROM merge_common_customers
      WHERE customerId IN (${placeholders}) OR customerCode IN (${placeholders})`,
    values,
  );
  const lookup = new Map<string, string>();
  for (const customer of customers) {
    const name = text(customer.name);
    if (!name) continue;
    lookup.set(text(customer.customerId), name);
    if (text(customer.customerCode)) lookup.set(text(customer.customerCode), name);
  }
  return rows.map((row) => {
    const live = lookup.get(text(row[idField]));
    return live ? { ...row, customerName: live } : row;
  });
}

/** 关键词还要能按本地客户档案的当前名称匹配（发票号 / CRM 客户名之外）。 */
const CRM_LOCAL_CUSTOMER_KEYWORD_SQL = `EXISTS (
  SELECT 1 FROM merge_common_customers c
   WHERE (c.customerId = merge_cloud_crm_invoices.customerId OR c.customerCode = merge_cloud_crm_invoices.customerId)
     AND (c.shortName LIKE :keyword OR c.nameCn LIKE :keyword OR c.name LIKE :keyword OR c.customerCode LIKE :keyword))`;

export async function listCrmInvoices(params: URLSearchParams) {
  const { page, pageSize, offset } = pageParams(params);
  const conditions = ["1=1"];
  const values: Row = { limit: pageSize, offset };
  const keyword = text(params.get("keyword"));
  const month = normalizeCrmMonth(params.get("month"));
  const status = text(params.get("status"));
  const customerId = text(params.get("customerId"));
  const matchStatus = text(params.get("matchStatus"));
  if (keyword) {
    conditions.push(`(invoiceNo LIKE :keyword OR customerShortName LIKE :keyword OR customerSubjectName LIKE :keyword OR customerName LIKE :keyword OR ${CRM_LOCAL_CUSTOMER_KEYWORD_SQL})`);
    values.keyword = `%${keyword}%`;
  }
  if (month) { conditions.push("belongMonth = :month"); values.month = month; }
  if (status) { conditions.push("invoiceStatus = :status"); values.status = Number(status); }
  if (customerId) { conditions.push("customerId = :customerId"); values.customerId = customerId; }
  if (matchStatus === "unmatched") conditions.push("(customerId IS NULL OR customerId = '')");
  if (matchStatus === "mismatch") conditions.push("backfillStatus = 'mismatch'");
  const where = conditions.join(" AND ");
  const [count, rows, totals] = await Promise.all([
    queryRowsRaw<{ total: number }>(`SELECT COUNT(*) AS total FROM merge_cloud_crm_invoices WHERE ${where}`, values),
    queryRowsRaw<Row>(`SELECT * FROM merge_cloud_crm_invoices WHERE ${where} ORDER BY belongMonth DESC, invoiceDate DESC, crmInvoiceId DESC LIMIT :limit OFFSET :offset`, values),
    queryRowsRaw<Row>(
      `SELECT currency, COUNT(*) AS rowCount, COALESCE(SUM(amountTaxIncluded), 0) AS amountTaxIncluded
         FROM merge_cloud_crm_invoices WHERE ${where} GROUP BY currency ORDER BY currency`,
      values,
    ),
  ]);
  const [summary] = await queryRowsRaw<Row>(
    `SELECT COUNT(*) AS invoiceCount,
            SUM(CASE WHEN invoiceStatus = 2 THEN 1 ELSE 0 END) AS voidCount,
            SUM(CASE WHEN customerId IS NULL OR customerId = '' THEN 1 ELSE 0 END) AS unmatchedCount,
            SUM(CASE WHEN backfillStatus = 'mismatch' THEN 1 ELSE 0 END) AS mismatchCount,
            SUM(CASE WHEN backfillStatus = 'unmatched' AND customerId IS NOT NULL AND customerId <> '' THEN 1 ELSE 0 END) AS noRowCount,
            SUM(CASE WHEN backfillStatus = 'backfilled' THEN 1 ELSE 0 END) AS backfilledCount
       FROM merge_cloud_crm_invoices WHERE ${where}`,
    values,
  );
  const items = await resolveCrmCustomerNames(rows);
  // 带上分摊明细，列表里可以悬浮看"这张票拆到了哪些账期"
  const invoiceIds = items.map((row) => Number(row.crmInvoiceId)).filter((value) => Number.isFinite(value) && value > 0);
  const allocationsByInvoice = new Map<number, Row[]>();
  if (invoiceIds.length) {
    const placeholders = invoiceIds.map((_, index) => `:invoice${index}`).join(", ");
    const allocationValues = Object.fromEntries(invoiceIds.map((value, index) => [`invoice${index}`, value]));
    const allocations = await queryRowsRaw<Row>(
      `SELECT crmInvoiceId, period, account, ratio, amountTaxIncluded FROM merge_cloud_crm_invoice_allocations
        WHERE crmInvoiceId IN (${placeholders}) ORDER BY period, account`,
      allocationValues,
    );
    for (const allocation of allocations) {
      const key = Number(allocation.crmInvoiceId);
      allocationsByInvoice.set(key, [...(allocationsByInvoice.get(key) ?? []), allocation]);
    }
  }
  return {
    items: items.map<Row>((row) => ({ ...row, allocations: allocationsByInvoice.get(Number(row.crmInvoiceId)) ?? [] })),
    total: Number(count[0]?.total ?? 0), page, pageSize, currencyTotals: totals, summary: summary ?? {},
  };
}

export async function listCrmReceipts(params: URLSearchParams) {
  const { page, pageSize, offset } = pageParams(params);
  const conditions = ["1=1"];
  const values: Row = { limit: pageSize, offset };
  const keyword = text(params.get("keyword"));
  const month = normalizeCrmMonth(params.get("month"));
  const customerId = text(params.get("customerId"));
  if (keyword) {
    conditions.push(`(invoiceNos LIKE :keyword OR customerShortName LIKE :keyword OR customerName LIKE :keyword OR payerName LIKE :keyword OR bankSerialNo LIKE :keyword
      OR EXISTS (SELECT 1 FROM merge_common_customers c
        WHERE (c.customerId = merge_cloud_crm_receipts.customerId OR c.customerCode = merge_cloud_crm_receipts.customerId)
          AND (c.shortName LIKE :keyword OR c.nameCn LIKE :keyword OR c.name LIKE :keyword OR c.customerCode LIKE :keyword)))`);
    values.keyword = `%${keyword}%`;
  }
  if (month) { conditions.push("arrivalMonth = :month"); values.month = month; }
  if (customerId) { conditions.push("customerId = :customerId"); values.customerId = customerId; }
  const where = conditions.join(" AND ");
  const [count, rows, totals] = await Promise.all([
    queryRowsRaw<{ total: number }>(`SELECT COUNT(*) AS total FROM merge_cloud_crm_receipts WHERE ${where}`, values),
    queryRowsRaw<Row>(`SELECT * FROM merge_cloud_crm_receipts WHERE ${where} ORDER BY arrivalMonth DESC, crmReceiptId DESC LIMIT :limit OFFSET :offset`, values),
    queryRowsRaw<Row>(
      `SELECT currency, COUNT(*) AS rowCount, COALESCE(SUM(receiptAmount), 0) AS receiptAmount
         FROM merge_cloud_crm_receipts WHERE ${where} GROUP BY currency ORDER BY currency`,
      values,
    ),
  ]);
  const [summary] = await queryRowsRaw<Row>(
    `SELECT COUNT(*) AS receiptCount,
            SUM(CASE WHEN customerId IS NULL OR customerId = '' THEN 1 ELSE 0 END) AS unmatchedCount
       FROM merge_cloud_crm_receipts WHERE ${where}`,
    values,
  );
  const items = await resolveCrmCustomerNames(rows);
  const receiptIds = items.map((row) => Number(row.crmReceiptId)).filter((value) => Number.isFinite(value) && value > 0);
  const allocationsByReceipt = new Map<number, Row[]>();
  if (receiptIds.length) {
    const placeholders = receiptIds.map((_, index) => `:receipt${index}`).join(", ");
    const allocationValues = Object.fromEntries(receiptIds.map((value, index) => [`receipt${index}`, value]));
    const allocations = await queryRowsRaw<Row>(
      `SELECT crmReceiptId, period, account, ratio, amount FROM merge_cloud_crm_receipt_allocations
        WHERE crmReceiptId IN (${placeholders}) ORDER BY period, account`,
      allocationValues,
    );
    for (const allocation of allocations) {
      const key = Number(allocation.crmReceiptId);
      allocationsByReceipt.set(key, [...(allocationsByReceipt.get(key) ?? []), allocation]);
    }
  }
  return {
    items: items.map<Row>((row) => ({ ...row, allocations: allocationsByReceipt.get(Number(row.crmReceiptId)) ?? [] })),
    total: Number(count[0]?.total ?? 0), page, pageSize, currencyTotals: totals, summary: summary ?? {},
  };
}

/** CRM 客户清单（按已同步发票去重），带映射状态，供「客户映射维护」使用。 */
export async function listCrmCustomerIdentities() {
  const rows = await queryRowsRaw<Row>(
    `SELECT customerSubjectName, customerShortName, COUNT(*) AS invoiceCount, MAX(belongMonth) AS latestMonth
       FROM merge_cloud_crm_invoices
      GROUP BY customerSubjectName, customerShortName
      ORDER BY invoiceCount DESC, customerSubjectName`,
  );
  const mappings = await loadCrmMappings();
  const identities = rows.map((row) => {
    const identity = identityOf({ customerSubjectName: text(row.customerSubjectName), customerShortName: text(row.customerShortName) });
    const mapped = mappings.get(identity.subjectKey) ?? mappings.get(identity.shortKey);
    return {
      subjectName: identity.subjectName,
      shortName: identity.shortName,
      subjectKey: identity.subjectKey,
      shortKey: identity.shortKey,
      invoiceCount: Number(row.invoiceCount ?? 0),
      latestMonth: text(row.latestMonth),
      customerId: text(mapped?.customerId),
      customerName: text(mapped?.customerName),
      source: text(mapped?.source),
      mappingId: text(mapped?.id),
    };
  });
  // 映射表里存的客户简称也是当时的快照，这里按客户 ID 取档案当前简称
  return resolveCrmCustomerNames(identities);
}

/** 保存/更新 CRM 客户映射（人工维护优先，自动匹配可被覆盖）。 */
export async function saveCrmCustomerMapping(body: Row, actor: OperationActor | null) {
  const crmValue = text(body.crmValue);
  const customerId = text(body.customerId);
  if (!crmValue) throw new Error("请选择要映射的 CRM 客户");
  if (!customerId) throw new Error("请选择本地对账客户");
  const key = normalizeCrmPartyName(crmValue);
  if (!key) throw new Error("CRM 客户名称无效");
  const customer = (await queryRowsRaw<Row>(
    `SELECT customerId, customerCode, name, nameCn, shortName FROM merge_common_customers
      WHERE customerId = :customerId OR customerCode = :customerId LIMIT 1`,
    { customerId },
  ))[0];
  if (!customer) throw new Error("本地客户不存在");
  const customerName = text(customer.shortName) || text(customer.nameCn) || text(customer.name) || text(customer.customerCode);
  const matchField = text(body.matchField) === "customerShortName" ? "customerShortName" : "customerSubjectName";
  await executeRaw(
    `INSERT INTO merge_cloud_crm_customer_mappings
       (id, crmValue, crmValueNormalized, matchField, customerId, customerName, source, createdByUserId, createdByName, updatedByUserId, updatedByName)
     VALUES (:id, :crmValue, :key, :matchField, :customerId, :customerName, 'manual', :userId, :userName, :userId, :userName)
     ON DUPLICATE KEY UPDATE crmValue = VALUES(crmValue), matchField = VALUES(matchField), customerId = VALUES(customerId),
       customerName = VALUES(customerName), source = 'manual', updatedByUserId = VALUES(updatedByUserId), updatedByName = VALUES(updatedByName)`,
    {
      id: randomUUID(), crmValue, key, matchField,
      customerId: text(customer.customerId), customerName,
      userId: actor?.userId ?? null, userName: actor?.displayName ?? null,
    },
  );
  return { ok: true, crmValue, customerId: text(customer.customerId), customerName };
}

export async function deleteCrmCustomerMapping(id: string) {
  await executeRaw("DELETE FROM merge_cloud_crm_customer_mappings WHERE id = :id", { id });
  return { ok: true };
}

/**
 * 「编辑客户开票」里的发票搜索：按发票号 / 客户简称 / 客户主体 / 本地客户名模糊搜，
 * 结果把与本行客户相同的排前面，方便人工把发票挂到某条对账明细上。
 */
export async function searchCrmInvoicesForMatching(params: URLSearchParams) {
  const keyword = text(params.get("keyword"));
  const customerId = text(params.get("customerId"));
  const limit = Math.min(Math.max(Math.floor(Number(params.get("limit") ?? 20) || 20), 1), 50);
  const conditions: string[] = [];
  const values: Row = { limit, preferredCustomerId: customerId };
  if (keyword) {
    conditions.push(`(invoiceNo LIKE :keyword OR customerShortName LIKE :keyword OR customerSubjectName LIKE :keyword OR customerName LIKE :keyword OR productServiceName LIKE :keyword OR ${CRM_LOCAL_CUSTOMER_KEYWORD_SQL})`);
    values.keyword = `%${keyword}%`;
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await queryRowsRaw<Row>(
    `SELECT id, crmInvoiceId, invoiceNo, customerShortName, customerSubjectName, customerName,
            customerId AS mappedCustomerId, belongMonth, currency, amountTaxExcluded, taxAmount, amountTaxIncluded,
            invoiceDate, invoiceStatus, targetRowId, rowAttachmentId, attachmentId, backfillStatus
       FROM merge_cloud_crm_invoices ${where}
      ORDER BY (customerId = :preferredCustomerId) DESC, belongMonth DESC, invoiceDate DESC, crmInvoiceId DESC
      LIMIT :limit`,
    values,
  );
  return resolveCrmCustomerNames(rows, "mappedCustomerId");
}

/**
 * 把一张 CRM 发票手工匹配到某条对账明细。
 *
 * - `applyFields=true`（默认）时用发票信息写对账行的客户开票字段；
 *   调用方已经保存过表单时传 false，只建立匹配关系、不动数字。
 * - 建立匹配后会补一条客户映射（仅在该 CRM 客户还没有映射时），让后续同步自动复用；
 * - 发票 PDF 会挂到该对账行的「客户开票附件」下（未下载过则先下载）。
 */
export async function matchCrmInvoiceToRow(options: { crmInvoiceId: unknown; rowId: unknown; applyFields?: boolean; actor?: OperationActor | null }) {
  const crmInvoiceId = Number(options.crmInvoiceId);
  const rowId = text(options.rowId);
  if (!Number.isFinite(crmInvoiceId) || crmInvoiceId <= 0) throw new Error("请选择要匹配的 CRM 发票");
  if (!rowId) throw new Error("缺少对账明细ID");
  const invoice = (await queryRowsRaw<Row>(
    "SELECT * FROM merge_cloud_crm_invoices WHERE crmInvoiceId = :crmInvoiceId",
    { crmInvoiceId },
  ))[0];
  if (!invoice) throw new Error("CRM 发票不存在，请先在「账期发票（CRM）」里同步一次");
  if (Number(invoice.invoiceStatus) === INVOICE_STATUS_VOID) throw new Error("该发票在 CRM 里已作废，不能匹配");
  const row = (await queryRowsRaw<Row>(
    "SELECT id, customer, customerId FROM merge_cloud_rows WHERE id = :rowId",
    { rowId },
  ))[0];
  if (!row) throw new Error("对账明细不存在或已被删除");

  if (options.applyFields !== false) {
    await executeRaw(
      `UPDATE merge_cloud_rows SET invoiceNo = :invoiceNo, invoiceCurrency = :invoiceCurrency,
         invoiceNetAmount = :invoiceNetAmount, invoiceTaxAmount = :invoiceTaxAmount, invoiceTotalAmount = :invoiceTotalAmount,
         invoiceDate = :invoiceDate, collectionInvoice = 'issued'
       WHERE id = :rowId`,
      {
        invoiceNo: text(invoice.invoiceNo),
        invoiceCurrency: text(invoice.currency) || null,
        invoiceNetAmount: numberOrNull(invoice.amountTaxExcluded),
        invoiceTaxAmount: numberOrNull(invoice.taxAmount),
        invoiceTotalAmount: numberOrNull(invoice.amountTaxIncluded),
        invoiceDate: crmDateValue(invoice.invoiceDate),
        rowId,
      },
    );
  }

  // 对账行的客户名称按档案当前值取，避免把旧简称写进 CRM 副本
  const rowCustomerReference = text(row.customerId) || text(row.customer);
  const rowCustomer = rowCustomerReference
    ? (await queryRowsRaw<Row>(
      `SELECT customerId, COALESCE(NULLIF(shortName, ''), NULLIF(nameCn, ''), NULLIF(name, ''), customerCode) AS name
         FROM merge_common_customers WHERE customerId = :reference OR customerCode = :reference LIMIT 1`,
      { reference: rowCustomerReference },
    ))[0]
    : undefined;
  const customerId = text(rowCustomer?.customerId) || text(row.customerId);
  const customerName = text(rowCustomer?.name) || text(row.customerName) || text(row.customer);
  const recordId = text(invoice.id);
  await executeRaw(
    `UPDATE merge_cloud_crm_invoices
        SET targetRowId = :rowId, customerId = :customerId, customerName = :customerName,
            backfillStatus = 'backfilled', backfillNote = '手工匹配到对账明细'
      WHERE crmInvoiceId = :crmInvoiceId`,
    { rowId, customerId: customerId || null, customerName: customerName || null, crmInvoiceId },
  );

  // 该 CRM 客户还没做过映射时顺手补一条，后续同步就能自动回填
  const identity = identityOf({ customerSubjectName: text(invoice.customerSubjectName), customerShortName: text(invoice.customerShortName) });
  if (customerId) {
    const mappingValue = identity.subjectName || identity.shortName;
    const mappingKey = identity.subjectKey || identity.shortKey;
    if (mappingKey) {
      const existing = (await queryRowsRaw<Row>(
        "SELECT id FROM merge_cloud_crm_customer_mappings WHERE crmValueNormalized = :key LIMIT 1",
        { key: mappingKey },
      ))[0];
      if (!existing) {
        await executeRaw(
          `INSERT INTO merge_cloud_crm_customer_mappings
             (id, crmValue, crmValueNormalized, matchField, customerId, customerName, source, remark, createdByName, updatedByName)
           VALUES (:id, :crmValue, :key, :matchField, :customerId, :customerName, 'manual', '手工匹配发票时自动补建',
             :userName, :userName)`,
          {
            id: randomUUID(), crmValue: mappingValue, key: mappingKey,
            matchField: identity.subjectName ? "customerSubjectName" : "customerShortName",
            customerId, customerName: customerName || null,
            userName: options.actor?.displayName ?? null,
          },
        );
      }
    }
  }

  // 发票 PDF 落到该对账行的开票附件下（未下载过就现在下载）
  let attachmentId = text(invoice.attachmentId);
  if (!attachmentId && text(invoice.attachmentUrl)) {
    await downloadInvoiceAttachment({
      id: crmInvoiceId,
      customerShortName: text(invoice.customerShortName),
      customerSubjectName: text(invoice.customerSubjectName),
      belongMonth: text(invoice.belongMonth),
      currency: text(invoice.currency),
      amountTaxExcluded: numberOrNull(invoice.amountTaxExcluded),
      taxAmount: numberOrNull(invoice.taxAmount),
      amountTaxIncluded: numberOrNull(invoice.amountTaxIncluded),
      invoiceNo: text(invoice.invoiceNo),
      invoiceDate: crmDateValue(invoice.invoiceDate) ?? "",
      paymentTermDays: numberOrNull(invoice.paymentTermDays),
      dueDate: crmDateValue(invoice.dueDate),
      invoiceType: numberOrNull(invoice.invoiceType),
      invoiceStatus: numberOrNull(invoice.invoiceStatus),
      productServiceName: text(invoice.productServiceName),
      attachmentUrl: text(invoice.attachmentUrl),
    }, recordId, options.actor ?? null);
    attachmentId = text((await queryRowsRaw<Row>(
      "SELECT attachmentId FROM merge_cloud_crm_invoices WHERE id = :id",
      { id: recordId },
    ))[0]?.attachmentId);
  }
  let attachmentLinked = false;
  if (attachmentId) {
    const linked = await linkInvoiceAttachmentToRow(recordId, rowId, attachmentId, options.actor ?? null);
    attachmentLinked = Boolean(linked?.linked);
  }
  return { ok: true, rowId, crmInvoiceId, invoiceNo: text(invoice.invoiceNo), attachmentLinked, attachmentId };
}

export async function latestCrmSyncRun() {
  return (await queryRowsRaw<Row>(
    "SELECT * FROM merge_cloud_crm_sync_runs ORDER BY startedAt DESC LIMIT 1",
  ))[0] ?? null;
}

/* --------------------------------------------------------------------------
 * 合并发票分摊：一张发票覆盖多个月 / 同一个账期多个华为账号时，
 * 按各行「客户应收（含税）」比例把发票金额拆到对应账期月。
 * ------------------------------------------------------------------------ */

const ALLOCATION_TOLERANCE = 0.5;
/** 组合搜索的候选行上限：一个客户最多 8 个账期 × 多个账号，取 16 行避免把更早的账期截掉。 */
const ALLOCATION_MAX_CANDIDATES = 16;
const ALLOCATION_MAX_DEPTH = 6;

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * 按权重把总金额拆成若干份（保留 2 位），四舍五入的尾差落在金额最大的一份上，
 * 保证各份之和**永远等于**总金额 —— 台账各月分摊额合计必须等于发票金额。
 */
export function splitInvoiceAmount(total: number, weights: number[]) {
  if (!weights.length) return [] as number[];
  const safeTotal = Number.isFinite(total) ? total : 0;
  const positive = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0));
  const weightTotal = positive.reduce((sum, value) => sum + value, 0);
  const shares = positive.map((weight) => round2(safeTotal * (weightTotal > 0 ? weight / weightTotal : 1 / positive.length)));
  const remainder = round2(safeTotal - shares.reduce((sum, value) => sum + value, 0));
  if (Math.abs(remainder) >= 0.01) {
    const maxIndex = shares.indexOf(Math.max(...shares));
    shares[maxIndex] = round2(shares[maxIndex] + remainder);
  }
  return shares;
}

/** 对账行的"客户应收（含税）"，缺失时退回未税。 */
const CLOUD_ROW_RECEIVABLE_SQL = "COALESCE(customerReceivableTotalAmount, customerReceivableNetAmount, customerReceivable, 0)";

type AllocationCandidate = Row & {
  rowId: string;
  period: string;
  account: string;
  receivableAmount: number;
};

/** 取某客户可参与分摊的对账行：可选账期（默认不限）、同币种口径由调用方决定。 */
async function loadAllocationCandidates(customerId: string, currency: string) {
  const rows = await queryRowsRaw<Row>(
    `SELECT id, period, account, customer, customerId, invoiceNo, invoiceCurrency, invoiceTotalAmount, invoiceDate, collectionInvoice,
            ${CLOUD_ROW_RECEIVABLE_SQL} AS receivableAmount
       FROM merge_cloud_rows
      WHERE customerId = :customerId
      ORDER BY period DESC, account`,
    { customerId },
  );
  const currencyLabel = text(currency).toUpperCase();
  return rows.map<AllocationCandidate>((row) => ({
    ...row,
    rowId: text(row.id),
    period: text(row.period),
    account: text(row.account),
    receivableAmount: Number(row.receivableAmount ?? 0),
  })).filter((row) => {
    // 已经开了别的发票（且币种不同）的行不参与建议，避免把已开票的月份又拆一遍
    const existing = text(row.invoiceNo);
    if (!existing) return true;
    return !currencyLabel || !text(row.invoiceCurrency) || text(row.invoiceCurrency).toUpperCase() === currencyLabel;
  });
}

/** 在候选行里找"应收合计≈发票金额"的组合（最多 6 行），用于同步建议与界面预勾选。 */
function suggestAllocationCombination(candidates: AllocationCandidate[], amount: number) {
  const pool = candidates
    .filter((row) => row.receivableAmount > 0)
    .slice(0, ALLOCATION_MAX_CANDIDATES);
  if (!pool.length || !Number.isFinite(amount) || amount <= 0) return [] as AllocationCandidate[];
  const tolerance = Math.max(ALLOCATION_TOLERANCE, amount * 0.001);
  let best: AllocationCandidate[] = [];
  const walk = (start: number, picked: AllocationCandidate[], sum: number) => {
    if (picked.length >= 2 && Math.abs(sum - amount) <= tolerance) {
      if (!best.length || Math.abs(sum - amount) < Math.abs(best.reduce((total, row) => total + row.receivableAmount, 0) - amount)) {
        best = [...picked];
      }
    }
    if (picked.length >= ALLOCATION_MAX_DEPTH || start >= pool.length || sum > amount + tolerance) return;
    for (let index = start; index < pool.length; index += 1) {
      picked.push(pool[index]);
      walk(index + 1, picked, sum + pool[index].receivableAmount);
      picked.pop();
    }
  };
  walk(0, [], 0);
  return best;
}

/** 同步时给未分摊的发票算一次建议（存到发票记录上，界面直接显示"建议拆分 N 行"）。 */
async function refreshAllocationSuggestion(invoice: Row) {
  const recordId = text(invoice.id);
  const customerId = text(invoice.customerId);
  const amount = numberOrNull(invoice.amountTaxIncluded) ?? 0;
  if (!recordId || Number(invoice.allocationCount ?? 0) > 0) return [] as string[];
  if (!customerId) {
    await executeRaw("UPDATE merge_cloud_crm_invoices SET suggestionRowIds = NULL, suggestionAmount = NULL WHERE id = :id", { id: recordId });
    return [] as string[];
  }
  const candidates = await loadAllocationCandidates(customerId, text(invoice.currency));
  const combination = suggestAllocationCombination(candidates, amount);
  const suggestionAmount = combination.reduce((total, row) => total + row.receivableAmount, 0);
  await executeRaw(
    "UPDATE merge_cloud_crm_invoices SET suggestionRowIds = :ids, suggestionAmount = :amount WHERE id = :id",
    {
      ids: combination.length ? combination.map((row) => row.rowId).join(",").slice(0, 500) : null,
      amount: combination.length ? round2(suggestionAmount) : null,
      id: recordId,
    },
  );
  return combination.map((row) => row.rowId);
}

export type AllocationInput = { rowId: string; amountTaxIncluded: number };

/**
 * 「匹配发票」弹层的数据：发票、该客户可参与分摊的对账行、当前分摊、建议勾选。
 */
export async function getInvoiceAllocationPlan(crmInvoiceId: unknown) {
  const id = Number(crmInvoiceId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("缺少发票ID");
  const invoice = (await queryRowsRaw<Row>("SELECT * FROM merge_cloud_crm_invoices WHERE crmInvoiceId = :id", { id }))[0];
  if (!invoice) throw new Error("CRM 发票不存在，请先同步");
  const allocations = await queryRowsRaw<Row>(
    "SELECT * FROM merge_cloud_crm_invoice_allocations WHERE crmInvoiceId = :id ORDER BY period, account",
    { id },
  );
  const candidates = text(invoice.customerId)
    ? await loadAllocationCandidates(text(invoice.customerId), text(invoice.currency))
    : [];
  const suggested = text(invoice.suggestionRowIds) ? text(invoice.suggestionRowIds).split(",").filter(Boolean) : [];
  return {
    invoice,
    allocations,
    candidates: candidates.map((row) => ({
      rowId: row.rowId,
      period: row.period,
      account: row.account,
      customer: text(row.customer),
      receivableAmount: round2(row.receivableAmount),
      invoiceNo: text(row.invoiceNo),
      invoiceTotalAmount: row.invoiceTotalAmount,
      invoiceDate: row.invoiceDate,
      suggested: suggested.includes(row.rowId),
    })),
    suggestionRowIds: suggested,
  };
}

/**
 * 保存分摊：把发票金额按各行「客户应收（含税）」比例拆到对账行，写入各行「客户开票」字段。
 *
 * - 传了 `allocations` 就按调用方给的含税金额（人工调整过），否则按应收比例自动算；
 * - 本地已开**其它**发票的行跳过并在 `skipped` 里说明，不覆盖人工数据；
 * - 合计必须等于发票含税金额（误差 0.01 以内），尾差落到金额最大的一行；
 * - 发票 PDF 挂到所有被分摊的行。
 */
export async function allocateInvoiceToRows(options: {
  crmInvoiceId: unknown;
  allocations?: AllocationInput[];
  actor?: OperationActor | null;
}) {
  const crmInvoiceId = Number(options.crmInvoiceId);
  if (!Number.isFinite(crmInvoiceId) || crmInvoiceId <= 0) throw new Error("缺少发票ID");
  const invoice = (await queryRowsRaw<Row>("SELECT * FROM merge_cloud_crm_invoices WHERE crmInvoiceId = :id", { id: crmInvoiceId }))[0];
  if (!invoice) throw new Error("CRM 发票不存在，请先同步");
  if (Number(invoice.invoiceStatus) === INVOICE_STATUS_VOID) throw new Error("该发票在 CRM 里已作废，不能分摊");
  const customerId = text(invoice.customerId);
  if (!customerId) throw new Error("该发票还没匹配本地客户，请先在「客户映射」里配置");
  const recordId = text(invoice.id);
  const invoiceNo = text(invoice.invoiceNo);
  const amountIncluded = numberOrNull(invoice.amountTaxIncluded) ?? 0;
  const amountExcluded = numberOrNull(invoice.amountTaxExcluded) ?? 0;

  const candidates = await loadAllocationCandidates(customerId, text(invoice.currency));
  const candidateMap = new Map(candidates.map((row) => [row.rowId, row]));
  const requested = options.allocations?.length
    ? options.allocations.map((item) => ({ rowId: text(item.rowId), amountTaxIncluded: Number(item.amountTaxIncluded ?? 0) }))
    : null;

  const skipped: Array<{ rowId: string; period: string; account: string; reason: string }> = [];
  const targets: AllocationCandidate[] = [];
  if (requested) {
    for (const item of requested) {
      const row = candidateMap.get(item.rowId);
      if (!row) { skipped.push({ rowId: item.rowId, period: "", account: "", reason: "该行不属于这张发票的客户或已被删除" }); continue; }
      const existing = text(row.invoiceNo);
      if (existing && existing !== invoiceNo) {
        skipped.push({ rowId: row.rowId, period: row.period, account: row.account, reason: `本地已有发票 ${existing}，未覆盖` });
        continue;
      }
      targets.push(row);
    }
  } else {
    for (const row of candidates) {
      const existing = text(row.invoiceNo);
      if (existing && existing !== invoiceNo) continue;
      targets.push(row);
    }
  }
  if (!targets.length) throw new Error("没有可分摊的对账行：这些行可能已经开了别的发票");

  // 计算分摊金额：默认按各行应收含税占比；调用方给了金额就按给定的算，尾差落到最大的一行
  const weights = (() => {
    if (requested) {
      const total = targets.reduce((sum, row) => sum + (requested.find((item) => item.rowId === row.rowId)?.amountTaxIncluded ?? 0), 0);
      return targets.map((row) => {
        const amount = requested.find((item) => item.rowId === row.rowId)?.amountTaxIncluded ?? 0;
        return total > 0 ? amount / total : 1 / targets.length;
      });
    }
    const total = targets.reduce((sum, row) => sum + row.receivableAmount, 0);
    return total > 0 ? targets.map((row) => row.receivableAmount / total) : targets.map(() => 1 / targets.length);
  })();
  const included = splitInvoiceAmount(amountIncluded, weights);
  if (Math.abs(included.reduce((sum, value) => sum + value, 0) - amountIncluded) >= 0.01) {
    throw new Error(`分摊合计与发票含税金额不一致（差 ${round2(included.reduce((sum, value) => sum + value, 0) - amountIncluded)}），请调整分摊金额`);
  }
  const totalIncluded = included.reduce((sum, value) => sum + value, 0);

  const applied: Array<Row> = [];
  for (const [index, row] of targets.entries()) {
    const ratio = totalIncluded > 0 ? included[index] / totalIncluded : 1 / targets.length;
    const taxExcluded = round2(amountExcluded * ratio);
    const taxAmount = round2(included[index] - taxExcluded);
    const allocationId = randomUUID();
    await executeRaw(
      `INSERT INTO merge_cloud_crm_invoice_allocations
         (id, crmInvoiceId, invoiceRecordId, rowId, period, account, customerId, customerName, currency,
          rowReceivableAmount, ratio, amountTaxExcluded, taxAmount, amountTaxIncluded, source,
          createdByUserId, createdByName, updatedByUserId, updatedByName)
       VALUES (:id, :crmInvoiceId, :recordId, :rowId, :period, :account, :customerId, :customerName, :currency,
          :rowReceivableAmount, :ratio, :taxExcluded, :taxAmount, :included, :source,
          :userId, :userName, :userId, :userName)
       ON DUPLICATE KEY UPDATE period = VALUES(period), account = VALUES(account), rowReceivableAmount = VALUES(rowReceivableAmount),
         ratio = VALUES(ratio), amountTaxExcluded = VALUES(amountTaxExcluded), taxAmount = VALUES(taxAmount),
         amountTaxIncluded = VALUES(amountTaxIncluded), source = VALUES(source),
         updatedByUserId = VALUES(updatedByUserId), updatedByName = VALUES(updatedByName)`,
      {
        id: allocationId, crmInvoiceId, recordId, rowId: row.rowId, period: row.period, account: row.account,
        customerId, customerName: text(invoice.customerName) || null, currency: text(invoice.currency) || null,
        rowReceivableAmount: round2(row.receivableAmount), ratio: Number(ratio.toFixed(6)),
        taxExcluded, taxAmount, included: included[index], source: requested ? "manual" : "auto",
        userId: options.actor?.userId ?? null, userName: options.actor?.displayName ?? null,
      },
    );
    await executeRaw(
      `UPDATE merge_cloud_rows SET invoiceNo = :invoiceNo, invoiceCurrency = :currency,
         invoiceNetAmount = :taxExcluded, invoiceTaxAmount = :taxAmount, invoiceTotalAmount = :included,
         invoiceDate = :invoiceDate, collectionInvoice = 'issued'
       WHERE id = :rowId`,
      {
        invoiceNo, currency: text(invoice.currency) || null, taxExcluded, taxAmount, included: included[index],
        invoiceDate: crmDateValue(invoice.invoiceDate), rowId: row.rowId,
      },
    );
    applied.push({ rowId: row.rowId, period: row.period, account: row.account, ratio: Number(ratio.toFixed(6)), amountTaxIncluded: included[index], amountTaxExcluded: taxExcluded, taxAmount });
  }

  const primary = [...applied].sort((left, right) => Number(right.amountTaxIncluded) - Number(left.amountTaxIncluded))[0];
  await executeRaw(
    `UPDATE merge_cloud_crm_invoices SET targetRowId = :targetRowId, allocationCount = :count,
       allocationSource = :source, backfillStatus = 'backfilled',
       backfillNote = :note, suggestionRowIds = NULL, suggestionAmount = NULL
     WHERE crmInvoiceId = :crmInvoiceId`,
    {
      targetRowId: text(primary?.rowId) || null,
      count: applied.length,
      source: requested ? "manual" : "auto",
      note: `已拆分为 ${applied.length} 个账期/明细行`,
      crmInvoiceId,
    },
  );

  const attachment = await ensureInvoiceAttachmentForRows(recordId, applied.map((row) => text(row.rowId)), options.actor ?? null);
  return { ok: true, crmInvoiceId, invoiceNo, allocations: applied, skipped, ...attachment };
}

/**
 * 取消分摊：把这张发票写过的开票字段清回未开票（只清"发票号等于本票"的行），
 * 同时删掉我们挂到这些行上的附件副本。人工自己填过的数据不动。
 */
export async function clearInvoiceAllocation(options: { crmInvoiceId: unknown }) {
  const crmInvoiceId = Number(options.crmInvoiceId);
  if (!Number.isFinite(crmInvoiceId) || crmInvoiceId <= 0) throw new Error("缺少发票ID");
  const invoice = (await queryRowsRaw<Row>("SELECT * FROM merge_cloud_crm_invoices WHERE crmInvoiceId = :id", { id: crmInvoiceId }))[0];
  if (!invoice) throw new Error("CRM 发票不存在");
  const invoiceNo = text(invoice.invoiceNo);
  const allocations = await queryRowsRaw<Row>(
    "SELECT rowId FROM merge_cloud_crm_invoice_allocations WHERE crmInvoiceId = :id",
    { id: crmInvoiceId },
  );
  let cleared = 0;
  for (const allocation of allocations) {
    const rowId = text(allocation.rowId);
    const result = await executeRaw(
      `UPDATE merge_cloud_rows SET invoiceNo = NULL, invoiceCurrency = NULL, invoiceNetAmount = NULL,
         invoiceTaxAmount = NULL, invoiceTotalAmount = NULL, invoiceDate = NULL,
         collectionInvoice = CASE WHEN collectionInvoice = 'issued' THEN 'not_issued' ELSE collectionInvoice END
       WHERE id = :rowId AND invoiceNo = :invoiceNo`,
      { rowId, invoiceNo },
    ) as { affectedRows?: number };
    if (Number(result?.affectedRows ?? 0) > 0) cleared += 1;
    await executeRaw("DELETE FROM merge_cloud_attachments WHERE ownerType = 'invoice' AND ownerId = :rowId AND uploadedByName = 'CRM 同步'", { rowId });
  }
  await executeRaw("DELETE FROM merge_cloud_crm_invoice_allocations WHERE crmInvoiceId = :id", { id: crmInvoiceId });
  await executeRaw(
    `UPDATE merge_cloud_crm_invoices SET targetRowId = NULL, rowAttachmentId = NULL, rowAttachmentOwnerId = NULL,
       allocationCount = 0, allocationSource = NULL, backfillStatus = 'pending', backfillNote = '已取消分摊'
     WHERE crmInvoiceId = :id`,
    { id: crmInvoiceId },
  );
  // 取消后重新算一次建议，用户可以直接照建议再拆
  const record = (await queryRowsRaw<Row>(
    "SELECT id, customerId, currency, amountTaxIncluded, allocationCount FROM merge_cloud_crm_invoices WHERE crmInvoiceId = :id",
    { id: crmInvoiceId },
  ))[0];
  if (record) await refreshAllocationSuggestion(record);
  return { ok: true, clearedRows: cleared };
}

/**
 * 把发票 PDF 挂到分摊到的每一行「客户开票附件」下，并清掉不再分摊的行上的副本。
 * 附件内容复制一份到各行（下载接口按附件 ID 取数，各自可下）。
 */
async function ensureInvoiceAttachmentForRows(recordId: string, rowIds: string[], actor: OperationActor | null) {
  if (!rowIds.length) return { attachmentId: "", attachmentLinked: 0 };
  let attachmentId = text((await queryRowsRaw<Row>(
    "SELECT attachmentId FROM merge_cloud_crm_invoices WHERE id = :id",
    { id: recordId },
  ))[0]?.attachmentId);
  if (!attachmentId) {
    const invoice = (await queryRowsRaw<Row>("SELECT * FROM merge_cloud_crm_invoices WHERE id = :id", { id: recordId }))[0];
    if (invoice && text(invoice.attachmentUrl)) {
      await downloadInvoiceAttachment({
        id: Number(invoice.crmInvoiceId),
        customerShortName: text(invoice.customerShortName),
        customerSubjectName: text(invoice.customerSubjectName),
        belongMonth: text(invoice.belongMonth),
        currency: text(invoice.currency),
        amountTaxExcluded: numberOrNull(invoice.amountTaxExcluded),
        taxAmount: numberOrNull(invoice.taxAmount),
        amountTaxIncluded: numberOrNull(invoice.amountTaxIncluded),
        invoiceNo: text(invoice.invoiceNo),
        invoiceDate: crmDateValue(invoice.invoiceDate) ?? "",
        paymentTermDays: numberOrNull(invoice.paymentTermDays),
        dueDate: crmDateValue(invoice.dueDate),
        invoiceType: numberOrNull(invoice.invoiceType),
        invoiceStatus: numberOrNull(invoice.invoiceStatus),
        productServiceName: text(invoice.productServiceName),
        attachmentUrl: text(invoice.attachmentUrl),
      }, recordId, actor);
      attachmentId = text((await queryRowsRaw<Row>(
        "SELECT attachmentId FROM merge_cloud_crm_invoices WHERE id = :id",
        { id: recordId },
      ))[0]?.attachmentId);
    }
  }
  if (!attachmentId) return { attachmentId: "", attachmentLinked: 0 };
  const source = await findCloudAttachment(attachmentId);
  if (!source) return { attachmentId, attachmentLinked: 0 };
  const fileName = text(source.fileName) || `${attachmentId}.pdf`;
  let linked = 0;
  for (const rowId of rowIds) {
    const existing = (await queryRowsRaw<Row>(
      "SELECT id FROM merge_cloud_attachments WHERE ownerType = 'invoice' AND ownerId = :rowId AND fileName = :fileName LIMIT 1",
      { rowId, fileName },
    ))[0];
    if (existing) continue;
    await executeRaw(
      `INSERT INTO merge_cloud_attachments (id, ownerType, ownerId, fileName, fileType, fileSize, dataUrl, uploadedByUserId, uploadedByName)
       VALUES (:id, 'invoice', :rowId, :fileName, :fileType, :fileSize, :dataUrl, :userId, 'CRM 同步')`,
      {
        id: randomUUID(), rowId, fileName,
        fileType: text(source.fileType) || "application/pdf",
        fileSize: Number(source.fileSize ?? 0),
        dataUrl: String(source.dataUrl ?? ""),
        userId: actor?.userId ?? null,
      },
    );
    linked += 1;
  }
  // 不再分摊的行：清掉我们挂上去的附件副本
  const placeholders = rowIds.map((_, index) => `:row${index}`).join(", ");
  const values = Object.fromEntries(rowIds.map((rowId, index) => [`row${index}`, rowId]));
  await executeRaw(
    `DELETE FROM merge_cloud_attachments WHERE ownerType = 'invoice' AND uploadedByName = 'CRM 同步'
       AND ownerId NOT IN (${placeholders}) AND fileName = :fileName`,
    { ...values, fileName },
  );
  const primaryRowId = rowIds[0];
  const primaryAttachment = (await queryRowsRaw<Row>(
    "SELECT id FROM merge_cloud_attachments WHERE ownerType = 'invoice' AND ownerId = :rowId AND fileName = :fileName LIMIT 1",
    { rowId: primaryRowId, fileName },
  ))[0];
  await executeRaw(
    "UPDATE merge_cloud_crm_invoices SET rowAttachmentId = :attachmentId, rowAttachmentOwnerId = :rowId WHERE id = :id",
    { attachmentId: text(primaryAttachment?.id) || attachmentId, rowId: primaryRowId, id: recordId },
  );
  return { attachmentId, attachmentLinked: linked };
}

/* --------------------------------------------------------------------------
 * 回款分摊：一笔回款覆盖多张发票/多个账期时，按各行开票金额（拿不到就用客户应收）
 * 把实收金额拆到对应账期月 —— 与发票分摊同一套口径。
 * ------------------------------------------------------------------------ */

type ReceiptCandidate = AllocationCandidate & { collected: number; collectionCurrency: string; collectionTotalAmount: unknown; invoiceTotalAmountValue: number | null };

/** 回款候选行：该客户的对账行；已被别的回款收过款的行不参与（我们自己写过的那笔除外）。 */
async function loadReceiptCandidates(customerId: string, currency: string, receiptAmount: number | null) {
  const rows = await queryRowsRaw<Row>(
    `SELECT id, period, account, customer, customerId, invoiceNo, invoiceTotalAmount, collected,
            collectionCurrency, collectionTotalAmount,
            ${CLOUD_ROW_RECEIVABLE_SQL} AS receivableAmount
       FROM merge_cloud_rows
      WHERE customerId = :customerId
      ORDER BY period DESC, account`,
    { customerId },
  );
  const currencyLabel = text(currency).toUpperCase();
  return rows
    .map<ReceiptCandidate>((row) => ({
      ...row,
      rowId: text(row.id),
      period: text(row.period),
      account: text(row.account),
      receivableAmount: Number(row.receivableAmount ?? 0),
      collected: Number(row.collected ?? 0),
      collectionCurrency: text(row.collectionCurrency),
      collectionTotalAmount: row.collectionTotalAmount,
      invoiceTotalAmountValue: numberOrNull(row.invoiceTotalAmount),
    }))
    .filter((row) => {
      const ownReceipt = row.collected === 1 && receiptAmount !== null && moneyEquals(row.collectionTotalAmount, receiptAmount);
      if (row.collected === 1 && !ownReceipt) return false;
      if (!currencyLabel || !row.collectionCurrency) return true;
      return row.collectionCurrency.toUpperCase() === currencyLabel;
    });
}

/** 回款关联发票 → 这些发票覆盖的对账行（已分摊用分摊表，未分摊用发票回填到的那一行）。 */
async function loadReceiptInvoiceRows(receipt: Row) {
  const numbers = text(receipt.invoiceNos).split(/[,，\s]+/).map((value) => value.trim()).filter(Boolean);
  const customerId = text(receipt.customerId);
  if (!numbers.length || !customerId) return [] as Array<{ invoiceNo: string; amount: number; rows: Row[] }>;
  const placeholders = numbers.map((_, index) => `:no${index}`).join(", ");
  const values = Object.fromEntries(numbers.map((value, index) => [`no${index}`, value]));
  const invoices = await queryRowsRaw<Row>(
    `SELECT crmInvoiceId, invoiceNo, amountTaxIncluded, currency FROM merge_cloud_crm_invoices
      WHERE invoiceNo IN (${placeholders}) AND customerId = :customerId`,
    { ...values, customerId },
  );
  const result: Array<{ invoiceNo: string; amount: number; rows: Row[] }> = [];
  for (const invoice of invoices) {
    const allocated = await queryRowsRaw<Row>(
      `SELECT a.rowId, a.period, a.account, a.amountTaxIncluded, r.customerId FROM merge_cloud_crm_invoice_allocations a
         LEFT JOIN merge_cloud_rows r ON r.id = a.rowId
        WHERE a.crmInvoiceId = :id`,
      { id: invoice.crmInvoiceId },
    );
    const rows = allocated.length
      ? allocated
      : await queryRowsRaw<Row>(
        `SELECT id AS rowId, period, account, invoiceTotalAmount AS amountTaxIncluded, customerId
           FROM merge_cloud_rows WHERE customerId = :customerId AND invoiceNo = :invoiceNo`,
        { customerId, invoiceNo: text(invoice.invoiceNo) },
      );
    if (rows.length) result.push({ invoiceNo: text(invoice.invoiceNo), amount: numberOrNull(invoice.amountTaxIncluded) ?? 0, rows });
  }
  return result;
}

/** 同步时给未分摊的回款算建议：优先按关联发票覆盖的行，其次按"应收合计≈回款金额"。 */
async function refreshReceiptAllocationSuggestion(receipt: Row) {
  const recordId = text(receipt.id);
  if (!recordId || Number(receipt.allocationCount ?? 0) > 0) return [] as string[];
  const amount = numberOrNull(receipt.receiptAmount) ?? 0;
  const customerId = text(receipt.customerId);
  if (!customerId) {
    await executeRaw("UPDATE merge_cloud_crm_receipts SET suggestionRowIds = NULL, suggestionAmount = NULL WHERE id = :id", { id: recordId });
    return [] as string[];
  }
  const linked = await loadReceiptInvoiceRows(receipt);
  const linkedRows = linked.flatMap((item) => item.rows);
  const linkedTotal = linkedRows.reduce((sum, row) => sum + (numberOrNull(row.amountTaxIncluded) ?? 0), 0);
  let suggested: string[] = [];
  let suggestedAmount = 0;
  if (linkedRows.length && Math.abs(linkedTotal - amount) <= Math.max(ALLOCATION_TOLERANCE, amount * 0.001)) {
    suggested = linkedRows.map((row) => text(row.rowId));
    suggestedAmount = linkedTotal;
  } else {
    const candidates = await loadReceiptCandidates(customerId, text(receipt.currency), amount);
    const combination = suggestAllocationCombination(candidates, amount);
    suggested = combination.map((row) => row.rowId);
    suggestedAmount = combination.reduce((sum, row) => sum + row.receivableAmount, 0);
  }
  await executeRaw(
    "UPDATE merge_cloud_crm_receipts SET suggestionRowIds = :ids, suggestionAmount = :amount WHERE id = :id",
    {
      ids: suggested.length ? suggested.join(",").slice(0, 500) : null,
      amount: suggested.length ? round2(suggestedAmount) : null,
      id: recordId,
    },
  );
  return suggested;
}

/** 回款分摊弹层数据：回款信息、候选行、当前分摊、关联发票覆盖的行、系统建议。 */
export async function getReceiptAllocationPlan(crmReceiptId: unknown) {
  const id = Number(crmReceiptId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("缺少回款ID");
  const receipt = (await queryRowsRaw<Row>("SELECT * FROM merge_cloud_crm_receipts WHERE crmReceiptId = :id", { id }))[0];
  if (!receipt) throw new Error("CRM 回款不存在，请先同步");
  const allocations = await queryRowsRaw<Row>(
    "SELECT * FROM merge_cloud_crm_receipt_allocations WHERE crmReceiptId = :id ORDER BY period, account",
    { id },
  );
  const customerId = text(receipt.customerId);
  const candidates = customerId
    ? await loadReceiptCandidates(customerId, text(receipt.currency), numberOrNull(receipt.receiptAmount))
    : [];
  const linkedInvoices = customerId ? await loadReceiptInvoiceRows(receipt) : [];
  const suggested = text(receipt.suggestionRowIds) ? text(receipt.suggestionRowIds).split(",").filter(Boolean) : [];
  /**
   * 「已被其它回款收过款」的行默认不进候选，但系统建议 / 本笔已分摊到的行必须显示出来，
   * 否则界面会看不到这几行、也没法重新分摊。这里把缺的行补回候选并标记。
   */
  const knownIds = new Set(candidates.map((row) => row.rowId));
  const extraIds = [...new Set([...suggested, ...allocations.map((row) => text(row.rowId))])].filter((rowId) => rowId && !knownIds.has(rowId));
  if (extraIds.length) {
    const placeholders = extraIds.map((_, index) => `:extra${index}`).join(", ");
    const values = Object.fromEntries(extraIds.map((rowId, index) => [`extra${index}`, rowId]));
    const extraRows = await queryRowsRaw<Row>(
      `SELECT id, period, account, customer, invoiceNo, invoiceTotalAmount, collected, collectionCurrency, collectionTotalAmount,
              ${CLOUD_ROW_RECEIVABLE_SQL} AS receivableAmount
         FROM merge_cloud_rows WHERE id IN (${placeholders})`,
      values,
    );
    for (const row of extraRows) {
      candidates.push({
        ...row,
        rowId: text(row.id),
        period: text(row.period),
        account: text(row.account),
        receivableAmount: Number(row.receivableAmount ?? 0),
        collected: Number(row.collected ?? 0),
        collectionCurrency: text(row.collectionCurrency),
        collectionTotalAmount: row.collectionTotalAmount,
        invoiceTotalAmountValue: numberOrNull(row.invoiceTotalAmount),
      });
    }
  }
  return {
    receipt,
    allocations,
    candidates: candidates.map((row) => ({
      rowId: row.rowId,
      period: row.period,
      account: row.account,
      customer: text(row.customer),
      receivableAmount: round2(row.receivableAmount),
      invoiceNo: text(row.invoiceNo),
      invoiceTotalAmount: row.invoiceTotalAmount,
      collected: row.collected,
      collectionTotalAmount: row.collectionTotalAmount,
      suggested: suggested.includes(row.rowId),
    })),
    linkedInvoices: linkedInvoices.map((item) => ({
      invoiceNo: item.invoiceNo,
      amount: item.amount,
      rows: item.rows.map((row) => ({ rowId: text(row.rowId), period: text(row.period), account: text(row.account), amount: numberOrNull(row.amountTaxIncluded) ?? 0 })),
    })),
    suggestionRowIds: suggested,
  };
}

export type ReceiptAllocationInput = { rowId: string; amount: number };

/**
 * 保存回款分摊：默认按"关联发票覆盖行的开票金额"比例拆，拿不到就按客户应收比例拆；
 * 也可以传人工调整后的金额（合计必须等于回款金额）。
 */
export async function allocateReceiptToRows(options: {
  crmReceiptId: unknown;
  allocations?: ReceiptAllocationInput[];
  actor?: OperationActor | null;
}) {
  const crmReceiptId = Number(options.crmReceiptId);
  if (!Number.isFinite(crmReceiptId) || crmReceiptId <= 0) throw new Error("缺少回款ID");
  const receipt = (await queryRowsRaw<Row>("SELECT * FROM merge_cloud_crm_receipts WHERE crmReceiptId = :id", { id: crmReceiptId }))[0];
  if (!receipt) throw new Error("CRM 回款不存在，请先同步");
  const customerId = text(receipt.customerId);
  if (!customerId) throw new Error("该回款还没匹配本地客户，请先在「客户映射」里配置");
  const recordId = text(receipt.id);
  const amount = numberOrNull(receipt.receiptAmount) ?? 0;
  const arrivalMonth = normalizeCrmMonth(receipt.arrivalMonth);
  const currency = text(receipt.currency);

  const candidates = await loadReceiptCandidates(customerId, currency, amount);
  const candidateMap = new Map(candidates.map((row) => [row.rowId, row]));
  const requested = options.allocations?.length ? options.allocations : null;

  const skipped: Array<{ rowId: string; period: string; account: string; reason: string }> = [];
  const targets: ReceiptCandidate[] = [];
  if (requested) {
    /**
     * 人工分摊时按传入的行号直接取行：候选列表会过滤掉"已被其它回款收过款"的行，
     * 但用户在这张回款里明确勾选的行必须能写（例如先把错的实收清掉再重新拆）。
     */
    const ids = [...new Set(requested.map((item) => text(item.rowId)).filter(Boolean))];
    const placeholders = ids.map((_, index) => `:row${index}`).join(", ");
    const values = Object.fromEntries(ids.map((value, index) => [`row${index}`, value]));
    const requestedRows = ids.length
      ? await queryRowsRaw<Row>(
        `SELECT id, period, account, customer, customerId, invoiceNo, invoiceTotalAmount, collected, collectionCurrency, collectionTotalAmount,
                ${CLOUD_ROW_RECEIVABLE_SQL} AS receivableAmount
           FROM merge_cloud_rows WHERE id IN (${placeholders})`,
        values,
      )
      : [];
    const requestedMap = new Map(requestedRows.map((row) => [text(row.id), row]));
    for (const id of ids) {
      const row = requestedMap.get(id);
      if (!row) { skipped.push({ rowId: id, period: "", account: "", reason: "对账行不存在或已被删除" }); continue; }
      const rowCustomerId = text(row.customerId);
      if (rowCustomerId && rowCustomerId !== customerId) {
        skipped.push({ rowId: id, period: text(row.period), account: text(row.account), reason: "该行不属于这笔回款的客户" });
        continue;
      }
      targets.push({
        ...row,
        rowId: id,
        period: text(row.period),
        account: text(row.account),
        receivableAmount: Number(row.receivableAmount ?? 0),
        collected: Number(row.collected ?? 0),
        collectionCurrency: text(row.collectionCurrency),
        collectionTotalAmount: row.collectionTotalAmount,
        invoiceTotalAmountValue: numberOrNull(row.invoiceTotalAmount),
      });
    }
  } else {
    // 自动模式：优先用关联发票覆盖的行，其次用客户全部候选行
    const linked = await loadReceiptInvoiceRows(receipt);
    const linkedRowIds = linked.flatMap((item) => item.rows.map((row) => text(row.rowId)));
    for (const rowId of linkedRowIds) {
      const row = candidateMap.get(rowId);
      if (row) targets.push(row);
    }
    if (!targets.length) for (const row of candidates) targets.push(row);
  }
  if (!targets.length) throw new Error("没有可分摊的对账行：这些行可能已经被别的回款收过款");

  // 权重：人工指定按给定金额；自动按"该行开票金额"，没有开票金额时退回客户应收
  const weights = requested
    ? targets.map((row) => Math.max(0, Number(requested.find((item) => text(item.rowId) === row.rowId)?.amount ?? 0)))
    : targets.map((row) => (row.invoiceTotalAmountValue && row.invoiceTotalAmountValue > 0 ? row.invoiceTotalAmountValue : row.receivableAmount));
  const shares = splitInvoiceAmount(amount, weights);
  if (Math.abs(shares.reduce((sum, value) => sum + value, 0) - amount) >= 0.01) {
    throw new Error("分摊合计与回款金额不一致，请调整分摊金额");
  }
  const totalShare = shares.reduce((sum, value) => sum + value, 0);

  const applied: Row[] = [];
  for (const [index, row] of targets.entries()) {
    const ratio = totalShare > 0 ? shares[index] / totalShare : 1 / targets.length;
    await executeRaw(
      `INSERT INTO merge_cloud_crm_receipt_allocations
         (id, crmReceiptId, receiptRecordId, rowId, period, account, customerId, customerName, currency,
          rowReceivableAmount, rowInvoiceAmount, ratio, amount, invoiceNos, source,
          createdByUserId, createdByName, updatedByUserId, updatedByName)
       VALUES (:id, :crmReceiptId, :recordId, :rowId, :period, :account, :customerId, :customerName, :currency,
          :rowReceivableAmount, :rowInvoiceAmount, :ratio, :amount, :invoiceNos, :source,
          :userId, :userName, :userId, :userName)
       ON DUPLICATE KEY UPDATE period = VALUES(period), account = VALUES(account), rowReceivableAmount = VALUES(rowReceivableAmount),
         rowInvoiceAmount = VALUES(rowInvoiceAmount), ratio = VALUES(ratio), amount = VALUES(amount),
         invoiceNos = VALUES(invoiceNos), source = VALUES(source),
         updatedByUserId = VALUES(updatedByUserId), updatedByName = VALUES(updatedByName)`,
      {
        id: randomUUID(), crmReceiptId, recordId, rowId: row.rowId, period: row.period, account: row.account,
        customerId, customerName: text(receipt.customerName) || null, currency: currency || null,
        rowReceivableAmount: round2(row.receivableAmount), rowInvoiceAmount: row.invoiceTotalAmountValue,
        ratio: Number(ratio.toFixed(6)), amount: shares[index], invoiceNos: text(row.invoiceNo) || null,
        source: requested ? "manual" : "auto",
        userId: options.actor?.userId ?? null, userName: options.actor?.displayName ?? null,
      },
    );
    const assignments = [
      "collectionCurrency = :currency",
      "collectionTotalAmount = :amount",
      "collected = 1",
      "collectionPayer = :customerName",
    ];
    const values: Row = { currency: currency || null, amount: shares[index], customerName: text(receipt.customerName) || null, rowId: row.rowId };
    if (arrivalMonth) {
      // CRM 只给到账月份：本地为空时按当月首日预估，已有日期不覆盖
      assignments.push("collectionDate = COALESCE(collectionDate, :collectionDate)");
      values.collectionDate = `${arrivalMonth}-01`;
    }
    await executeRaw(`UPDATE merge_cloud_rows SET ${assignments.join(", ")} WHERE id = :rowId`, values);
    applied.push({ rowId: row.rowId, period: row.period, account: row.account, ratio: Number(ratio.toFixed(6)), amount: shares[index] });
  }

  const primary = [...applied].sort((left, right) => Number(right.amount) - Number(left.amount))[0];
  await executeRaw(
    `UPDATE merge_cloud_crm_receipts SET targetRowId = :targetRowId, allocationCount = :count, allocationSource = :source,
       backfillStatus = 'backfilled', backfillNote = :note, suggestionRowIds = NULL, suggestionAmount = NULL
     WHERE crmReceiptId = :crmReceiptId`,
    {
      targetRowId: text(primary?.rowId) || null,
      count: applied.length,
      source: requested ? "manual" : "auto",
      note: `已按账期/发票拆分为 ${applied.length} 行`,
      crmReceiptId,
    },
  );
  return { ok: true, crmReceiptId, allocations: applied, skipped };
}

/** 取消回款分摊：只清"金额与分摊记录一致"的行，人工改过的不动。 */
export async function clearReceiptAllocation(options: { crmReceiptId: unknown }) {
  const crmReceiptId = Number(options.crmReceiptId);
  if (!Number.isFinite(crmReceiptId) || crmReceiptId <= 0) throw new Error("缺少回款ID");
  const allocations = await queryRowsRaw<Row>(
    "SELECT rowId, amount FROM merge_cloud_crm_receipt_allocations WHERE crmReceiptId = :id",
    { id: crmReceiptId },
  );
  let cleared = 0;
  for (const allocation of allocations) {
    const result = await executeRaw(
      `UPDATE merge_cloud_rows SET collectionCurrency = NULL, collectionTotalAmount = NULL, collectionDate = NULL, collected = 0
        WHERE id = :rowId AND ABS(COALESCE(collectionTotalAmount, 0) - :amount) < 0.01`,
      { rowId: text(allocation.rowId), amount: Number(allocation.amount ?? 0) },
    ) as { affectedRows?: number };
    if (Number(result?.affectedRows ?? 0) > 0) cleared += 1;
  }
  await executeRaw("DELETE FROM merge_cloud_crm_receipt_allocations WHERE crmReceiptId = :id", { id: crmReceiptId });
  await executeRaw(
    `UPDATE merge_cloud_crm_receipts SET targetRowId = NULL, allocationCount = 0, allocationSource = NULL,
       backfillStatus = 'pending', backfillNote = '已取消分摊' WHERE crmReceiptId = :id`,
    { id: crmReceiptId },
  );
  const record = (await queryRowsRaw<Row>(
    "SELECT * FROM merge_cloud_crm_receipts WHERE crmReceiptId = :id",
    { id: crmReceiptId },
  ))[0];
  if (record) await refreshReceiptAllocationSuggestion(record);
  return { ok: true, clearedRows: cleared };
}
