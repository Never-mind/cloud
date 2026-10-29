import { randomUUID } from "node:crypto";
import { completeInvoiceReviewAmounts, validateInvoiceReview } from "./invoice-review";
import { defaultInvoicePaymentTermDays, resolveInvoicePaymentDates } from "./invoice-payment-terms";
import { executeRaw, queryRowsRaw, executeRaw as executeOutsideTransaction, queryRowsRaw as queryOutsideTransaction, withTransaction, executeInTransaction, queryRowsInTransaction, type Row } from "./db";
import type { PoolConnection } from "mysql2/promise";
import { allocationInvoiceLines, allocationTotals, readInvoiceAllocationPlan, servicePeriodLabel, type InvoiceAllocationPlan } from "./invoice-allocation";
import { loadAllocationSources, prepareInvoiceAllocationPlan, lockInvoiceAllocationSources, writeInvoiceAllocations } from "./invoice-allocation-service";
import { deleteFileObject, readFile, storeFile } from "./file-storage-service";
import { renderInvoicePdf } from "./invoice-pdf";
import {
  collectMissingInvoiceFields,
  renderInvoice,
  type InvoiceLineInput,
  type InvoiceTemplateKind,
} from "./invoice-renderer";

/**
 * 开票服务：一张票有两种来源，落在同一条开票记录上。
 *   - source=generated：系统按档案 + 账单生成票面文件（票号 INV-<账期>-<流水>）；
 *   - source=external ：外部已经开好票，上传文件 + 登记票号金额。
 * 两者都会回填来源账单的开票信息，并把文件挂到该单据的开票附件位置。
 */

export type InvoiceSource = "generated" | "external";
export type InvoiceStatus = "draft" | "issued" | "void";
export type InvoiceSourceType = "cloud_row" | "billing_statement" | "service_fee" | "settlement_invoice" | "manual";

export type InvoiceActor = { userId?: string | null; name?: string | null };

export type InvoiceLinePayload = {
  periodLabel?: string | null;
  description?: string | null;
  amount?: string | number | null;
  sgdRate?: string | number | null;
};

export type InvoiceDraftInput = {
  allocationPlan?: InvoiceAllocationPlan | null;
  recognitionFacts?: Record<string, string>;
  /** 系统生成票面（generated）还是外部已开票（external）；不传时按有没有上传文件推断。 */
  source?: InvoiceSource | null;
  /** 合并开票时勾选的账单行 ID（目前支持华为云对账行）；传了就以服务端的行数据为准生成明细与金额。 */
  allocationSourceIds?: string[] | null;
  template?: InvoiceTemplateKind | null;
  sourceType?: InvoiceSourceType | null;
  sourceId?: string | null;
  sourceNo?: string | null;
  period?: string | null;
  invoiceNo?: string | null;
  customerId?: string | null;
  undertakingUnitId?: string | null;
  bankAccountId?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  paymentTermDays?: string | number | null;
  currency?: string | null;
  exchangeRate?: string | number | null;
  amountExcludingTax?: string | number | null;
  taxRate?: string | number | null;
  taxAmount?: string | number | null;
  amountIncludingTax?: string | number | null;
  sgdRate?: string | number | null;
  sgdTotal?: string | number | null;
  gstRegNo?: string | null;
  comment?: string | null;
  customerName?: string | null;
  customerTaxNumber?: string | null;
  customerAddress?: string | null;
  customerContact?: string | null;
  customerContactPhone?: string | null;
  customerContactEmail?: string | null;
  sellerName?: string | null;
  sellerCountry?: string | null;
  sellerAddress?: string | null;
  sellerTelephone?: string | null;
  sellerContactName?: string | null;
  sellerFinanceEmail?: string | null;
  /** 银行栏也允许在弹层里手工改（档案没建银行账户时至少能开票） */
  bankAccountName?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  bankSwiftCode?: string | null;
  bankCode?: string | null;
  bankAddress?: string | null;
  lines?: InvoiceLinePayload[] | null;
  file?: { fileName: string; fileType: string; bytes: Buffer } | null;
  remark?: string | null;
};

const INVOICE_TABLE = "merge_common_invoices";
const INVOICE_ITEM_TABLE = "merge_common_invoice_items";
const INVOICE_NO_PREFIX = "INV";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 国家中文名 → 票面用的英文名（票面是全英文的）。 */
const COUNTRY_EN: Record<string, string> = {
  中国: "China", 香港: "Hong Kong", 澳门: "Macau", 台湾: "Taiwan",
  墨西哥: "Mexico", 智利: "Chile", 阿根廷: "Argentina", 巴西: "Brazil",
  新加坡: "Singapore", 越南: "Vietnam", 秘鲁: "Peru", 哥伦比亚: "Colombia",
};

export function invoiceCountryName(value: unknown) {
  const raw = String(value ?? "").trim();
  return COUNTRY_EN[raw] ?? raw;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function decimalString(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : String(value);
}

function isoDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${value.getFullYear()}-${month}-${day}`;
  }
  const matched = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  return matched ? matched[0] : "";
}

function addDays(dateString: string, days: number) {
  const base = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  return isoDate(new Date(base.getTime() + days * 86400000));
}

function periodOf(dateString: string) {
  return /^\d{4}-\d{2}/.test(dateString) ? dateString.slice(0, 7).replace("-", "") : "";
}

/**
 * 各来源表的税率口径不统一：华为云对账行、服务费对账单存的是小数（0.08），
 * 集采结算发票存的是百分数（16）。开票界面统一按**百分数**展示与录入，
 * 写回来源表时再按各自口径换算（见 backfillSource）。
 */
function percentFromStoredRate(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return raw;
  return String(Number((numeric * 100).toFixed(4)));
}

/** 百分数 → 小数（0.08），用于写回按小数存税率的表。 */
function rateToFraction(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? String(Number((numeric / 100).toFixed(6))) : raw;
}

export function periodLabel(value: unknown) {
  const raw = text(value);
  return /^\d{6}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}` : raw;
}

/** 台账展示口径：客户/承接单位名称按档案当前简称走（与系统其它列表一致）。 */
const LIST_SQL = `
  SELECT i.*,
         COALESCE(NULLIF(cu.shortName, ''), NULLIF(cu.nameCn, ''), NULLIF(cu.name, ''), i.customerName) AS customerDisplayName,
         COALESCE(NULLIF(uu.shortName, ''), NULLIF(uu.nameCn, ''), NULLIF(uu.nameEn, ''), i.sellerName) AS sellerDisplayName,
         (SELECT a.serialNumber FROM merge_common_feishu_approvals a WHERE a.instanceCode = i.approvalInstanceCode LIMIT 1) AS approvalSerialNumber
    FROM ${INVOICE_TABLE} i
    LEFT JOIN merge_common_customers cu ON cu.customerId = i.customerId
    LEFT JOIN merge_common_undertaking_units uu ON uu.undertakingUnitId = i.undertakingUnitId`;

export type InvoiceListQuery = {
  keyword?: string;
  period?: string;
  source?: string;
  status?: string;
  customerId?: string;
  page?: number;
  pageSize?: number;
};

export async function listInvoices(query: InvoiceListQuery = {}) {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};
  const keyword = text(query.keyword);
  if (keyword) {
    conditions.push(
      "(i.invoiceNo LIKE :keyword OR i.customerName LIKE :keyword OR cu.shortName LIKE :keyword OR cu.nameCn LIKE :keyword OR cu.name LIKE :keyword OR i.sourceNo LIKE :keyword OR i.sellerName LIKE :keyword OR EXISTS (SELECT 1 FROM merge_common_feishu_approvals a WHERE a.instanceCode = i.approvalInstanceCode AND a.serialNumber LIKE :keyword))",
    );
    params.keyword = `%${keyword}%`;
  }
  if (text(query.period)) {
    conditions.push("i.period = :period");
    params.period = text(query.period);
  }
  if (text(query.source)) {
    conditions.push("i.source = :source");
    params.source = text(query.source);
  }
  if (text(query.status)) {
    conditions.push("i.status = :status");
    params.status = text(query.status);
  }
  if (text(query.customerId)) {
    conditions.push("i.customerId = :customerId");
    params.customerId = text(query.customerId);
  }
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20) || 20, 1), 200);
  const page = Math.max(Number(query.page ?? 1) || 1, 1);

  const totalRows = await queryRowsRaw<Row>(
    `SELECT COUNT(*) AS total FROM (${LIST_SQL}${where}) AS t`,
    params,
  );
  const rows = await queryRowsRaw<Row>(
    `${LIST_SQL}${where} ORDER BY i.invoiceDate DESC, i.invoiceNo DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    params,
  );
  const total = Number(totalRows[0]?.total ?? 0);
  return { rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getInvoice(id: string) {
  const rows = await queryRowsRaw<Row>(`${LIST_SQL} WHERE i.id = :id LIMIT 1`, { id });
  if (!rows.length) return null;
  const items = await queryRowsRaw<Row>(
    `SELECT id, lineNo, periodLabel, description, amount, sgdRate FROM ${INVOICE_ITEM_TABLE} WHERE invoiceId = :id ORDER BY lineNo`,
    { id },
  );
  const allocations = await queryRowsRaw<Row>(
    `SELECT id, sourceType, sourceId, sourceNo, period, currency, amountExcludingTax, taxRate, taxAmount, amountIncludingTax
       FROM merge_common_invoice_allocations WHERE invoiceId = :id ORDER BY period`,
    { id },
  );
  return { ...rows[0], items, allocations } as Row & { items: Row[]; allocations: Row[] };
}

/** 票号分配：INV-<账期>-<4位流水>，同账期内递增；并发下靠唯一键兜底重试。 */
export async function nextInvoiceNo(period: string) {
  const prefix = `${INVOICE_NO_PREFIX}-${period}-`;
  const rows = await queryRowsRaw<Row>(
    `SELECT invoiceNo FROM ${INVOICE_TABLE} WHERE invoiceNo LIKE :prefix ORDER BY invoiceNo DESC LIMIT 1`,
    { prefix: `${prefix}%` },
  );
  const last = text(rows[0]?.invoiceNo).slice(prefix.length);
  const next = Number.parseInt(last, 10);
  return `${prefix}${String(Number.isFinite(next) ? next + 1 : 1).padStart(4, "0")}`;
}

type PartySnapshot = {
  customerId: string;
  customerName: string;
  customerAddress: string;
  customerTaxNumber: string;
  customerContact: string;
  customerContactPhone: string;
  customerContactEmail: string;
  undertakingUnitId: string;
  sellerName: string;
  sellerCountry: string;
  sellerAddress: string;
  sellerTelephone: string;
  /** 承接单位主联系人姓名（票面 FROM 的 CONTACT 一格） */
  sellerContactName: string;
  sellerFinanceEmail: string;
  bankAccountId: string;
  bankAccountName: string;
  bankName: string;
  bankAccount: string;
  bankSwiftCode: string;
  bankCode: string;
  bankAddress: string;
  paymentTermDays: string;
  signatureImage: string;
};

/** 开票弹层的预填结构：来源单据能带多少带多少，剩下的由用户补。 */
export type InvoicePrefill = {
  exchangeRate?: string;
  dueDate?: string;
  sourceType: InvoiceSourceType;
  sourceId: string;
  sourceNo: string;
  period: string;
  customerId: string;
  undertakingUnitId: string;
  currency: string;
  amountExcludingTax: string;
  taxRate: string;
  taxAmount: string;
  amountIncludingTax: string;
  invoiceDate: string;
};

function emptyPrefill(sourceType: InvoiceSourceType, sourceId: string): InvoicePrefill {
  return {
    sourceType, sourceId, sourceNo: "", period: "", customerId: "", undertakingUnitId: "",
    currency: "USD", amountExcludingTax: "", taxRate: "", taxAmount: "", amountIncludingTax: "", invoiceDate: "",
  };
}

/** 合并开票用：按 ID 逐条取对账行（勾选行数很少，逐条查比拼 IN 更省心）。 */
async function loadMergeRows(ids: string[]) {
  const rows: Row[] = [];
  for (const id of ids) {
    const row = (await queryRowsRaw<Row>(
      `SELECT id, period, account, customer, customerId, undertakingUnitId, invoicePayeeUndertakingUnitId, invoicePayerCustomerId,
              invoiceCurrency, collectionCurrency, customerReceivable, customerReceivableNetAmount, customerReceivableTaxAmount,
              customerReceivableTotalAmount, customerTaxRate, invoiceNetAmount, invoiceTaxAmount, invoiceTotalAmount, invoiceTaxRate
         FROM merge_cloud_rows WHERE id = :id LIMIT 1`,
      { id },
    ))[0];
    if (row) rows.push(row);
  }
  // 保持账期顺序，票面明细看起来才自然
  return rows.sort((left, right) => text(left.period).localeCompare(text(right.period)));
}

/**
 * 取一条对账行的未税 / 含税金额。
 *
 * 合并开票用的是**客户应收**口径（这是账单本身的金额）；已开票金额只在没有应收时兜底，
 * 因为一张作废过的票可能在工作行上留下过金额，直接用会把上次的总额带进来。
 */
function rowAmount(row: Row, kind: "net" | "total") {
  if (kind === "net") {
    return Number(text(row.customerReceivableNetAmount) || text(row.customerReceivable) || text(row.invoiceNetAmount) || 0);
  }
  return Number(text(row.customerReceivableTotalAmount) || text(row.customerReceivable) || text(row.invoiceTotalAmount) || 0);
}

/** 可合并开票的账单行（当前支持华为云对账行）：只列未开票、同客户、同币种、有应收金额的行。 */
export async function listMergeCandidates(params: { customerId?: string; currency?: string; from?: string; to?: string }) {
  const conditions = ["r.customerReceivableTotalAmount > 0", "(r.invoiceNo IS NULL OR r.invoiceNo = '')"];
  const values: Record<string, unknown> = {};
  if (text(params.customerId)) { conditions.push("r.customerId = :customerId"); values.customerId = text(params.customerId); }
  if (text(params.from)) { conditions.push("r.period >= :from"); values.from = text(params.from); }
  if (text(params.to)) { conditions.push("r.period <= :to"); values.to = text(params.to); }
  if (text(params.currency)) {
    // 很多对账行的币种字段是空的（默认 USD），空值也要当作可选，否则一个候选都出不来
    conditions.push(
      "(COALESCE(NULLIF(r.invoiceCurrency,''), NULLIF(r.collectionCurrency,'')) = :currency" +
      " OR COALESCE(NULLIF(r.invoiceCurrency,''), NULLIF(r.collectionCurrency,'')) IS NULL)",
    );
    values.currency = text(params.currency);
  }
  const rows = await queryRowsRaw<Row>(
    `SELECT r.id, r.period, r.customer, r.account, r.customerId, r.invoicePayeeUndertakingUnitId, r.undertakingUnitId,
            COALESCE(NULLIF(r.invoiceCurrency, ''), NULLIF(r.collectionCurrency, '')) AS currency,
            r.customerReceivableNetAmount, r.customerReceivable, r.customerTaxRate, r.customerReceivableTaxAmount,
            r.customerReceivableTotalAmount, r.invoiceNetAmount, r.invoiceTaxAmount, r.invoiceTotalAmount,
            c.nameEn AS customerNameEn, c.shortName AS customerShortName
       FROM merge_cloud_rows r
       LEFT JOIN merge_common_customers c ON c.customerId = r.customerId
      WHERE ${conditions.join(" AND ")}
      ORDER BY r.period, r.account`,
    values,
  );
  return {
    rows: rows.map((row) => ({
      id: text(row.id),
      period: text(row.period),
      account: text(row.account),
      customer: text(row.customerShortName) || text(row.customer),
      customerNameEn: text(row.customerNameEn),
      currency: text(row.currency) || "USD",
      amountExcludingTax: rowAmount(row, "net"),
      taxRate: Number(percentFromStoredRate(text(row.invoiceTaxRate) || text(row.customerTaxRate)) || 0),
      amountIncludingTax: rowAmount(row, "total"),
    })),
  };
}

/** 从档案取开票资料：客户抬头/地址/联系人 + 承接单位 + 默认银行账户。 */
export async function resolveInvoiceParties(input: { customerId?: string | null; undertakingUnitId?: string | null; bankAccountId?: string | null }): Promise<PartySnapshot> {
  const snapshot: PartySnapshot = {
    customerId: text(input.customerId), customerName: "", customerAddress: "", customerTaxNumber: "",
    customerContact: "", customerContactPhone: "", customerContactEmail: "",
    undertakingUnitId: text(input.undertakingUnitId), sellerName: "", sellerCountry: "", sellerAddress: "",
    sellerTelephone: "", sellerContactName: "", sellerFinanceEmail: "",
    bankAccountId: "", bankAccountName: "", bankName: "", bankAccount: "", bankSwiftCode: "", bankCode: "", bankAddress: "",
    paymentTermDays: "", signatureImage: "",
  };

  if (snapshot.customerId) {
    const rows = await queryRowsRaw<Row>(
      `SELECT name, nameCn, nameEn, shortName, address, country, city, taxNumber, contactName, contactPhone, contactEmail
         FROM merge_common_customers WHERE customerId = :id LIMIT 1`,
      { id: snapshot.customerId },
    );
    const row = rows[0];
    if (row) {
      // 票面抬头优先英文名，其次注册名，最后简称
      snapshot.customerName = text(row.nameEn) || text(row.name) || text(row.nameCn) || text(row.shortName);
      snapshot.customerAddress = text(row.address);
      snapshot.customerTaxNumber = text(row.taxNumber);
      const contacts = await queryRowsRaw<Row>(
        `SELECT name, phone, email FROM merge_common_customer_contacts WHERE customerId = :id ORDER BY isPrimary DESC, createdAt LIMIT 1`,
        { id: snapshot.customerId },
      );
      snapshot.customerContact = text(contacts[0]?.name) || text(row.contactName);
      snapshot.customerContactPhone = text(contacts[0]?.phone) || text(row.contactPhone);
      snapshot.customerContactEmail = text(contacts[0]?.email) || text(row.contactEmail);
    }
  }

  if (snapshot.undertakingUnitId) {
    const rows = await queryRowsRaw<Row>(
      `SELECT nameCn, nameEn, name, entityName, shortName, country, address, registeredAddress, taxNumber, contactName, contactPhone, contactEmail, financeEmail, paymentTermDays, signatureImage
         FROM merge_common_undertaking_units WHERE undertakingUnitId = :id LIMIT 1`,
      { id: snapshot.undertakingUnitId },
    );
    const row = rows[0];
    if (row) {
      snapshot.sellerName = text(row.nameEn) || text(row.entityName) || text(row.nameCn) || text(row.name) || text(row.shortName);
      snapshot.sellerCountry = text(row.country);
      snapshot.sellerAddress = text(row.registeredAddress) || text(row.address);
      // 票面 CONTACT 区的电话/邮箱优先取「联系人」里设为主联系人那条，没维护再回落到档案字段
      const contacts = await queryRowsRaw<Row>(
        `SELECT name, phone, email FROM merge_common_undertaking_unit_contacts
          WHERE undertakingUnitId = :id ORDER BY isPrimary DESC, createdAt LIMIT 1`,
        { id: snapshot.undertakingUnitId },
      );
      snapshot.sellerContactName = text(contacts[0]?.name) || text(row.contactName);
      snapshot.sellerTelephone = text(contacts[0]?.phone) || text(row.contactPhone);
      snapshot.sellerFinanceEmail = text(row.financeEmail) || text(contacts[0]?.email) || text(row.contactEmail);
      snapshot.paymentTermDays = text(row.paymentTermDays);
      snapshot.signatureImage = text(row.signatureImage);
    }
    const accounts = await queryRowsRaw<Row>(
      `SELECT accountId, accountName, bankName, bankAccount, bankRoutingNumber, swiftCode, bankAddress
         FROM merge_common_undertaking_unit_bank_accounts
        WHERE undertakingUnitId = :id
        ORDER BY (accountId = :accountId) DESC, isDefault DESC, createdAt LIMIT 1`,
      { id: snapshot.undertakingUnitId, accountId: text(input.bankAccountId) },
    );
    const account = accounts[0];
    if (account) {
      snapshot.bankAccountId = text(account.accountId);
      snapshot.bankAccountName = text(account.accountName) || snapshot.sellerName;
      snapshot.bankName = text(account.bankName);
      snapshot.bankAccount = text(account.bankAccount);
      snapshot.bankSwiftCode = text(account.swiftCode);
      snapshot.bankCode = text(account.bankRoutingNumber);
      snapshot.bankAddress = text(account.bankAddress);
    }
  }
  return snapshot;
}

/** 弹层预填：按来源单据把金额、客户、承接单位、银行都取好，并列出缺哪些档案资料。 */
export async function buildInvoicePrefill(params: { sourceType: InvoiceSourceType; sourceId?: string | null; sourceIds?: string[] | null }) {
  const sourceType = params.sourceType;
  const sourceId = text(params.sourceId);
  const prefill = emptyPrefill(sourceType, sourceId);
  let lines: InvoiceLineInput[] = [];
  const mergeIds = (params.sourceIds ?? []).map(text).filter(Boolean);

  if (sourceType === "service_fee" && mergeIds.length > 0) {
    const rows = await loadAllocationSources("service_fee", [...new Set(mergeIds)]);
    if (rows.length !== new Set(mergeIds).size) throw new Error("所选服务费账单已不存在");
    if (new Set(rows.map(row => row.customerId)).size !== 1 || new Set(rows.map(row => row.sourceCurrency)).size !== 1) throw new Error("请先选择同一客户、同一账单币种的服务费账单");
    Object.assign(prefill, { sourceId: rows[0].sourceId, sourceNo: `${rows.length} 条账单：${servicePeriodLabel(rows.map(row => row.period))}`, period: rows[0].period,
      customerId: rows[0].customerId, undertakingUnitId: rows[0].undertakingUnitId, currency: rows[0].sourceCurrency,
      amountExcludingTax: rows.reduce((sum,row)=>sum+Number(row.sourceNet),0).toFixed(2), taxAmount: rows.reduce((sum,row)=>sum+Number(row.sourceTax),0).toFixed(2),
      amountIncludingTax: rows.reduce((sum,row)=>sum+Number(row.sourceTotal),0).toFixed(2), taxRate: rows[0].sourceTaxRate });
    return finishPrefill(prefill, rows.map(row=>({date:periodLabel(row.period),desc:`Suanli service fee ${periodLabel(row.period)}`,cost:row.sourceTotal})), []);
  }

  // 合并开票：勾选多条账单行时，明细与金额都按这些行现算（服务端为准）
  if (sourceType === "cloud_row" && mergeIds.length > 0) {
    const rows = await loadMergeRows(mergeIds);
    if (!rows.length) throw new Error("选中的账单行已不存在，请重新选择");
    const periods = rows.map((row) => text(row.period)).filter(Boolean).sort();
    const net = rows.reduce((sum, row) => sum + rowAmount(row, "net"), 0);
    const total = rows.reduce((sum, row) => sum + rowAmount(row, "total"), 0);
    const units = new Set(rows.map((row) => text(row.invoicePayeeUndertakingUnitId) || text(row.undertakingUnitId)).filter(Boolean));
    Object.assign(prefill, {
      sourceType,
      sourceId: text(rows[0].id),
      sourceNo: periods.length > 1 ? `${periods.length} 个账期：${periods[0]}–${periods[periods.length - 1]}` : `${periods[0] ?? ""} · ${text(rows[0].account)}`,
      period: periods[0] ?? "",
      undertakingUnitId: text(rows[0].invoicePayeeUndertakingUnitId) || text(rows[0].undertakingUnitId),
      customerId: text(rows[0].invoicePayerCustomerId) || text(rows[0].customerId),
      currency: text(rows[0].invoiceCurrency) || text(rows[0].collectionCurrency) || "USD",
      amountExcludingTax: net.toFixed(2),
      taxRate: percentFromStoredRate(text(rows[0].invoiceTaxRate) || text(rows[0].customerTaxRate)),
      taxAmount: (total - net).toFixed(2),
      amountIncludingTax: total.toFixed(2),
      invoiceDate: "",
    } satisfies Partial<InvoicePrefill>);
    lines = rows.map((row) => ({
      date: periodLabel(row.period),
      desc: `Huawei Cloud service fee ${periodLabel(row.period)}`.trim(),
      cost: rowAmount(row, "total").toFixed(2),
    }));
    const result = await finishPrefill(prefill, lines, units.size > 1 ? ["勾选的账单行收款单位不一致，票面只会印弹层里选定的那一个"] : []);
    return result;
  }

  if (sourceType === "cloud_row" && sourceId) {
    const rows = await queryRowsRaw<Row>(
      `SELECT id, period, account, customer, customerId, undertakingUnitId, invoicePayeeUndertakingUnitId, invoicePayerCustomerId,
              invoiceCurrency, invoiceExchangeRate, receivableDate, invoiceNetAmount, invoiceTaxRate, invoiceTaxAmount, invoiceTotalAmount, invoiceDate, collectionCurrency,
              customerReceivable, customerTaxRate, customerReceivableTotalAmount, customerReceivableNetAmount, customerReceivableTaxAmount
         FROM merge_cloud_rows WHERE id = :id LIMIT 1`,
      { id: sourceId },
    );
    const row = rows[0];
    if (row) {
      /**
       * 「客户开票」三件套与「客户应收」三件套必须整体取用，不能按字段各自兜底：
       * 对账行里 invoiceNetAmount 常常存的是 MXN 原币（invoiceTotalAmount 反而为空），
       * 而 customerReceivable* 是折算后的 USD。混着取会得到「未税 11424 / 含税 962.55」这种跨币种组合。
       * 所以以「含税金额」在哪一组为准，整组跟着走。
       */
      const invoiceTotal = text(row.invoiceTotalAmount);
      const useInvoiceGroup = Boolean(invoiceTotal);
      const net = useInvoiceGroup ? text(row.invoiceNetAmount) : text(row.customerReceivableNetAmount) || text(row.customerReceivable);
      const tax = useInvoiceGroup ? text(row.invoiceTaxAmount) : text(row.customerReceivableTaxAmount);
      const total = useInvoiceGroup ? invoiceTotal : text(row.customerReceivableTotalAmount) || net;
      Object.assign(prefill, {
        sourceType,
        sourceId,
        sourceNo: text(row.period) && text(row.account) ? `${text(row.period)} · ${text(row.account)}` : text(row.period),
        period: text(row.period),
        customerId: text(row.invoicePayerCustomerId) || text(row.customerId),
        undertakingUnitId: text(row.invoicePayeeUndertakingUnitId) || text(row.undertakingUnitId),
        currency: (useInvoiceGroup ? text(row.invoiceCurrency) : "") || text(row.collectionCurrency) || "USD",
        // 金额统一给到 2 位小数，避免弹层里出现 6864.5772 这种 4 位小数的库值
        amountExcludingTax: decimalString(net),
        // 对账行存的是小数税率（0.08），界面统一显示百分数（8）
        taxRate: percentFromStoredRate(useInvoiceGroup ? text(row.invoiceTaxRate) : text(row.customerTaxRate)),
        taxAmount: decimalString(tax),
        amountIncludingTax: decimalString(total || net),
        invoiceDate: isoDate(row.invoiceDate),
        dueDate: isoDate(row.receivableDate), exchangeRate: useInvoiceGroup ? text(row.invoiceExchangeRate) : "",
      } satisfies Partial<InvoicePrefill>);
      lines = [{
        date: periodLabel(row.period),
        desc: `Huawei Cloud service fee ${periodLabel(row.period)}`.trim(),
        cost: decimalString(total || net),
      }];
    }
  } else if (sourceType === "billing_statement" && sourceId) {
    const rows = await queryRowsRaw<Row>(
      `SELECT snapshotNo, countryCode, startDate, endDate, currencySummary, totalAmount, invoiceCurrency, invoiceNetAmount,
              invoiceTaxRate, invoiceTaxAmount, invoiceTotalAmount, invoiceDate
         FROM merge_power_billingstatementsnapshots WHERE snapshotNo = :id LIMIT 1`,
      { id: sourceId },
    );
    const row = rows[0];
    if (row) {
      const country = await queryRowsRaw<Row>(
        `SELECT defaultUndertakingUnitId, defaultCustomerId FROM merge_power_countries WHERE code = :code LIMIT 1`,
        { code: text(row.countryCode) },
      ).catch(() => [] as Row[]);
      const currency = text(row.invoiceCurrency) || (text(row.currencySummary).split(":")[0] || "USD");
      Object.assign(prefill, {
        sourceType,
        sourceId,
        sourceNo: text(row.snapshotNo),
        period: periodOf(isoDate(row.endDate)) || periodOf(isoDate(row.startDate)),
        // 对账单是按国家出的（可能覆盖多个客户），所以默认取国家的默认承接单位/客户，客户仍可在弹层里改
        undertakingUnitId: text(country[0]?.defaultUndertakingUnitId),
        customerId: text(country[0]?.defaultCustomerId),
        currency,
        amountExcludingTax: decimalString(row.invoiceNetAmount),
        taxRate: percentFromStoredRate(text(row.invoiceTaxRate)),
        taxAmount: decimalString(row.invoiceTaxAmount),
        amountIncludingTax: decimalString(text(row.invoiceTotalAmount) || text(row.totalAmount)),
        invoiceDate: isoDate(row.invoiceDate),
      } satisfies Partial<InvoicePrefill>);
      lines = [{
        date: periodLabel(prefill.period),
        desc: `Suanli service fee ${periodLabel(prefill.period)}`.trim(),
        cost: decimalString(text(row.invoiceTotalAmount) || text(row.totalAmount)),
      }];
    }
  } else if (sourceType === "service_fee" && sourceId) {
    // 服务费对账单：账期取核销月份，客户/承接单位优先用对账单上已选的那两个，其次取国家默认
    const rows = await queryRowsRaw<Row>(
      `SELECT snapshotNo, writeOffMonth, countryCode, serviceFeeCurrency, serviceFeeTotal, serviceFeeTotalExcludingTax, vatRate,
              invoiceCurrency, invoiceReceivingUnitId, invoicePayerCustomerId,
              invoiceAmountExcludingTax, invoiceVatRate, invoiceAmountIncludingTax, invoiceDate, receivableDate
         FROM merge_power_servicefeesnapshots WHERE snapshotNo = :id LIMIT 1`,
      { id: sourceId },
    );
    const row = rows[0];
    if (row) {
      const country = await queryRowsRaw<Row>(
        `SELECT defaultUndertakingUnitId, defaultCustomerId FROM merge_power_countries WHERE code = :code LIMIT 1`,
        { code: text(row.countryCode) },
      ).catch(() => [] as Row[]);
      const net = text(row.invoiceAmountExcludingTax) || text(row.serviceFeeTotalExcludingTax) || text(row.serviceFeeTotal);
      const total = text(row.invoiceAmountIncludingTax) || text(row.serviceFeeTotal);
      Object.assign(prefill, {
        sourceType,
        sourceId,
        sourceNo: text(row.snapshotNo),
        period: periodOf(isoDate(row.writeOffMonth)),
        undertakingUnitId: text(row.invoiceReceivingUnitId) || text(country[0]?.defaultUndertakingUnitId),
        customerId: text(row.invoicePayerCustomerId) || text(country[0]?.defaultCustomerId),
        currency: text(row.invoiceCurrency) || text(row.serviceFeeCurrency) || "USD",
        amountExcludingTax: decimalString(net),
        taxRate: percentFromStoredRate(text(row.invoiceVatRate) || text(row.vatRate)),
        taxAmount: decimalString(Number(total) - Number(net) || 0),
        amountIncludingTax: decimalString(total || net),
        invoiceDate: isoDate(row.invoiceDate), dueDate: isoDate(row.receivableDate),
      } satisfies Partial<InvoicePrefill>);
      lines = [{
        date: periodLabel(prefill.period),
        desc: `Suanli service fee ${periodLabel(prefill.period)}`.trim(),
        cost: decimalString(total || net),
      }];
    }
  } else if (sourceType === "settlement_invoice" && sourceId) {
    // 集采项目结算发票：客户/承接单位取项目上的，金额取发票本身
    const rows = await queryRowsRaw<Row>(
      `SELECT i.id, i.type, i.accountPeriod, i.invoiceDate, i.receivableDate, i.invoiceNo, i.currency, i.taxRate,
              i.invoiceTotal, i.invoiceTaxExcludedTotal, i.invoiceTaxAmount, i.exchangeRate, i.companyEntityId, i.invoiceEntityId, i.invoiceEntityType,
              p.projectNo, p.projectName, p.customerId, p.contractingUnitId
         FROM merge_po_settlement_invoices i
         LEFT JOIN merge_po_settlement_projects p ON p.id = i.projectId
        WHERE i.id = :id LIMIT 1`,
      { id: sourceId },
    );
    const row = rows[0];
    if (row) {
      const total = text(row.invoiceTotal);
      Object.assign(prefill, {
        sourceType,
        sourceId,
        sourceNo: `${text(row.projectNo)} · ${text(row.invoiceNo) || "未填发票号"}`,
        period: periodOf(isoDate(row.accountPeriod)) || periodOf(isoDate(row.invoiceDate)),
        undertakingUnitId: text(row.companyEntityId) || text(row.contractingUnitId),
        customerId: row.type === "income" && row.invoiceEntityType === "customer" ? text(row.invoiceEntityId) || text(row.customerId) : text(row.customerId),
        currency: text(row.currency) || "USD",
        amountExcludingTax: decimalString(row.invoiceTaxExcludedTotal),
        // 集采结算发票本身就是百分数（16 = 16%），直接用
        taxRate: decimalString(row.taxRate),
        taxAmount: decimalString(row.invoiceTaxAmount),
        amountIncludingTax: decimalString(total),
        invoiceDate: isoDate(row.invoiceDate), dueDate: isoDate(row.receivableDate), exchangeRate: text(row.exchangeRate),
      } satisfies Partial<InvoicePrefill>);
      lines = [{
        date: periodLabel(prefill.period),
        desc: `${text(row.projectName) || text(row.projectNo)} ${periodLabel(prefill.period)}`.trim(),
        cost: decimalString(total),
      }];
    }
  }

  return finishPrefill(prefill, lines);
}

/**
 * 预填收尾：解析双方档案资料、算到期日、分配建议票号，并列出还缺哪些档案信息。
 * 单账期与合并多账期共用，保证两条路径的取值口径一致。
 */
async function finishPrefill(prefill: InvoicePrefill, lines: InvoiceLineInput[], extraWarnings: string[] = []) {
  const parties = await resolveInvoiceParties({
    customerId: text(prefill.customerId),
    undertakingUnitId: text(prefill.undertakingUnitId),
  });
  const period = text(prefill.period) || periodOf(isoDate(prefill.invoiceDate));
  const invoiceDate = text(prefill.invoiceDate) || isoDate(new Date());
  const paymentTermDays = defaultInvoicePaymentTermDays(parties.paymentTermDays);
  const merged = {
    ...prefill,
    ...parties,
    period,
    invoiceDate,
    paymentTermDays,
    dueDate: prefill.dueDate || addDays(invoiceDate, paymentTermDays),
    template: "normal",
    suggestedInvoiceNo: period ? await nextInvoiceNo(period) : "",
    lines,
  };
  const missing = collectMissingInvoiceFields({
    invoiceNo: merged.suggestedInvoiceNo || "TMP",
    invoiceDate: merged.invoiceDate,
    dueDate: merged.dueDate,
    currency: merged.currency,
    total: decimalString(merged.amountIncludingTax) || "0",
    sellerName: parties.sellerName,
    sellerCountry: invoiceCountryName(parties.sellerCountry),
    sellerAddress1: parties.sellerAddress,
    bankAccount: parties.bankAccount,
    customerName: parties.customerName,
    customerAddress: parties.customerAddress,
    lines: merged.lines,
  });
  return { ...merged, missing, warnings: extraWarnings };
}

type ResolvedInvoice = {
  exchangeRate?: string;
  invoiceNo: string;
  template: InvoiceTemplateKind;
  customer: PartySnapshot;
  bank: PartySnapshot;
  invoiceDate: string;
  dueDate: string;
  paymentTermDays: number;
  currency: string;
  amountExcludingTax: string;
  taxRate: string;
  taxAmount: string;
  amountIncludingTax: string;
  sgdRate: string;
  sgdTotal: string;
  gstRegNo: string;
  comment: string;
  lines: Array<{ periodLabel: string; description: string; amount: string; sgdRate: string }>;
};

function pick(override: unknown, fallback: string) {
  return override === undefined || override === null ? fallback : text(override);
}

/** 数据库回落时存的 data URL —— 与附件表口径一致，readFile 才能正确解出字节。 */
function toDataUrl(fileType: string, bytes: Buffer) {
  return `data:${fileType || "application/octet-stream"};base64,${bytes.toString("base64")}`;
}

async function resolveInvoice(input: InvoiceDraftInput, forUpdate: boolean): Promise<ResolvedInvoice> {
  const parties = await resolveInvoiceParties({
    customerId: input.customerId,
    undertakingUnitId: input.undertakingUnitId,
    bankAccountId: input.bankAccountId,
  });
  if ((input.source === "external" || input.file) && (!parties.customerName || !parties.sellerName)) {
    throw new Error("客户或开票主体档案不存在，请重新选择");
  }
  const period = text(input.period) || periodOf(isoDate(input.invoiceDate));
  const invoiceDate = isoDate(input.invoiceDate) || isoDate(new Date());
  const paymentDates = input.source === "external" || (input.source !== "generated" && input.file)
    ? resolveInvoicePaymentDates({ invoiceDate, dueDate: input.dueDate, paymentTermDays: input.paymentTermDays }, parties.paymentTermDays)
    : { paymentTermDays: defaultInvoicePaymentTermDays(text(input.paymentTermDays) || parties.paymentTermDays),
        dueDate: isoDate(input.dueDate) || addDays(invoiceDate, defaultInvoicePaymentTermDays(text(input.paymentTermDays) || parties.paymentTermDays)) };
  const lines = (input.lines ?? []).map((line) => ({
    periodLabel: text(line.periodLabel) || periodLabel(period),
    description: text(line.description),
    amount: decimalString(line.amount),
    sgdRate: text(line.sgdRate),
  })).filter((line) => line.description || Number(line.amount));
  const customer = {
    ...parties,
    customerName: pick(input.customerName, parties.customerName),
    customerTaxNumber: pick(input.customerTaxNumber, parties.customerTaxNumber),
    customerAddress: pick(input.customerAddress, parties.customerAddress),
    customerContact: pick(input.customerContact, parties.customerContact),
    customerContactPhone: pick(input.customerContactPhone, parties.customerContactPhone),
    customerContactEmail: pick(input.customerContactEmail, parties.customerContactEmail),
  };
  const bank = {
    ...parties,
    sellerName: pick(input.sellerName, parties.sellerName),
    sellerCountry: pick(input.sellerCountry, parties.sellerCountry),
    sellerAddress: pick(input.sellerAddress, parties.sellerAddress),
    sellerTelephone: pick(input.sellerTelephone, parties.sellerTelephone),
    sellerContactName: pick(input.sellerContactName, parties.sellerContactName),
    sellerFinanceEmail: pick(input.sellerFinanceEmail, parties.sellerFinanceEmail),
    bankAccountName: pick(input.bankAccountName, parties.bankAccountName),
    bankName: pick(input.bankName, parties.bankName),
    bankAccount: pick(input.bankAccount, parties.bankAccount),
    bankSwiftCode: pick(input.bankSwiftCode, parties.bankSwiftCode),
    bankCode: pick(input.bankCode, parties.bankCode),
    bankAddress: pick(input.bankAddress, parties.bankAddress),
  };
  const total = decimalString(input.amountIncludingTax)
    || decimalString(lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0));
  const invoiceNo = text(input.invoiceNo) || (period ? await nextInvoiceNo(period) : "");
  if (!invoiceNo) throw new Error("缺少发票号，且无法按账期自动生成（请先确定账期）");
  if (forUpdate) {
    const exists = await queryRowsRaw<Row>(`SELECT id FROM ${INVOICE_TABLE} WHERE invoiceNo = :invoiceNo AND undertakingUnitId = :unit LIMIT 1`, { invoiceNo, unit: parties.undertakingUnitId });
    if (exists.length) throw Object.assign(new Error(`发票 ${invoiceNo} 已登记，可查看并调整关联账期及分摊`), { existingInvoiceId: text(exists[0].id) });
  }
  return {
    invoiceNo,
    exchangeRate: text(input.exchangeRate),
    template: input.template === "sgd" ? "sgd" : "normal",
    customer,
    bank,
    invoiceDate,
    ...paymentDates,
    currency: pick(input.currency, "USD").toUpperCase(),
    amountExcludingTax: decimalString(input.amountExcludingTax),
    taxRate: text(input.taxRate),
    taxAmount: decimalString(input.taxAmount),
    amountIncludingTax: total,
    sgdRate: decimalString(input.sgdRate),
    sgdTotal: decimalString(input.sgdTotal),
    gstRegNo: text(input.gstRegNo),
    comment: text(input.comment),
    lines,
  };
}

function toRenderInput(resolved: ResolvedInvoice) {
  return {
    invoiceNo: resolved.invoiceNo,
    invoiceDate: resolved.invoiceDate,
    dueDate: resolved.dueDate,
    paymentTermDays: resolved.paymentTermDays,
    currency: resolved.currency,
    total: resolved.amountIncludingTax,
    sellerName: resolved.bank.sellerName,
    sellerCountry: invoiceCountryName(resolved.bank.sellerCountry),
    sellerAddress1: resolved.bank.sellerAddress,
    sellerTelephone: resolved.bank.sellerTelephone,
    sellerContactName: resolved.bank.sellerContactName,
    sellerFinanceEmail: resolved.bank.sellerFinanceEmail,
    bankAccountName: resolved.bank.bankAccountName || resolved.bank.sellerName,
    bankName: resolved.bank.bankName,
    bankAddress: resolved.bank.bankAddress,
    bankSwiftCode: resolved.bank.bankSwiftCode,
    bankCode: resolved.bank.bankCode,
    bankAccount: resolved.bank.bankAccount,
    customerName: resolved.customer.customerName,
    customerAddress: resolved.customer.customerAddress,
    customerContact: resolved.customer.customerContact,
    customerContactValue: resolved.customer.customerContactPhone,
    customerContactValue2: resolved.customer.customerContactEmail,
    comment: resolved.comment,
    authImg: resolved.bank.signatureImage,
    sgdTotal: resolved.sgdTotal,
    gstRegNo: resolved.gstRegNo,
    lines: resolved.lines.map((line) => ({
      date: line.periodLabel,
      desc: line.description,
      cost: line.amount,
      sgdRate: line.sgdRate || resolved.sgdRate,
    })),
  };
}

/** 生成/保存开票记录。source=generated 时渲染票面文件；external 时用传入的附件。 */
export async function saveInvoice(input: InvoiceDraftInput, actor: InvoiceActor = {}, approvalReturn?: { fileId: string; instanceCode: string; relatedFileIds: string[]; mode?: "automatic" | "manual" }) {
  /**
   * 来源判定：以弹层明确传来的 source 为准，其次按有没有上传文件判断。
   * 注意**不能**用 sourceType === \"manual\" 来判断——手工开票（无来源单据）同样要生成票面，
   * 早先这样写会把手工开票误判成外部上传，报“请先上传外部发票文件”。
   */
  const source: InvoiceSource = input.source === "external"
    ? "external"
    : input.source === "generated"
      ? "generated"
      : input.file ? "external" : "generated";
  if(source==="external"&&text(input.invoiceNo)&&text(input.undertakingUnitId)) {
    const [existing]=await queryRowsRaw<Row>("SELECT id FROM merge_common_invoices WHERE undertakingUnitId=:unit AND invoiceNo=:invoiceNo LIMIT 1",{unit:input.undertakingUnitId,invoiceNo:input.invoiceNo});
    if(existing)throw Object.assign(new Error("该发票已登记，请查看并调整原票的关联账期及分摊"),{existingInvoiceId:text(existing.id)});
  }

  /**
   * 合并开票：勾选多条对账行时，明细/金额一律以**服务端读到的行数据**为准，
   * 避免前端传错金额；主行取账期最早那条，其余行保存后一起回填并挂票面。
   */
  let plannedAllocation: InvoiceAllocationPlan | null = null;
  if (input.allocationPlan) {
    if (input.allocationPlan.sourceType !== input.sourceType) throw new Error("分摊来源类型不一致");
    if (!input.allocationPlan.allocations.some(row=>row.sourceId===input.sourceId)) throw new Error("当前来源不在关联账期中");
    await queryRowsRaw("SELECT allocationPlanJson FROM merge_common_invoices LIMIT 0");
    let snapshot: InvoiceAllocationPlan | null = null;
    if (approvalReturn) {
      const [approval] = await queryRowsRaw<Row>("SELECT allocationPlanJson FROM merge_common_feishu_approvals WHERE instanceCode=:code", {code:approvalReturn.instanceCode});
      snapshot = readInvoiceAllocationPlan(approval?.allocationPlanJson);
    }
    plannedAllocation = await prepareInvoiceAllocationPlan(input.allocationPlan, {amountExcludingTax:input.amountExcludingTax,taxAmount:input.taxAmount,amountIncludingTax:input.amountIncludingTax}, {instanceCode:approvalReturn?.instanceCode,snapshot});
    if (plannedAllocation.currency !== text(input.currency).toUpperCase()) throw new Error("分摊币种与发票币种不一致");
  }
  const allocationIds = plannedAllocation ? plannedAllocation.allocations.map(row=>row.sourceId) : [...new Set((input.allocationSourceIds ?? []).map(text).filter(Boolean))];
  if (source === "external") {
    if (allocationIds.length && !approvalReturn && !plannedAllocation) throw new Error("外部发票请先按实际账期分摊确认，不能用整票金额覆盖多条账单");
    const review = { invoiceNo: input.invoiceNo, invoiceDate: input.invoiceDate, currency: input.currency,
      amountExcludingTax: text(input.amountExcludingTax), taxRate: text(input.taxRate), taxAmount: text(input.taxAmount), amountIncludingTax: text(input.amountIncludingTax) };
    const error = validateInvoiceReview(review);
    if (error) throw new Error(error);
    if (!text(input.customerId) || !text(input.undertakingUnitId)) throw new Error("请选择客户和开票主体");
    if (text(input.exchangeRate) && (!Number.isFinite(Number(input.exchangeRate)) || Number(input.exchangeRate) <= 0)) throw new Error("汇率必须是大于 0 的有效数字");
    input = { ...input, ...completeInvoiceReviewAmounts(review) };
    const tables: Record<string, [string, string]> = { cloud_row: ["merge_cloud_rows", "id"], service_fee: ["merge_power_servicefeesnapshots", "snapshotNo"], billing_statement: ["merge_power_billingstatementsnapshots", "snapshotNo"], settlement_invoice: ["merge_po_settlement_invoices", "id"] };
    if (input.sourceType && input.sourceType !== "manual") {
      const target = tables[input.sourceType];
      if (!target || !input.sourceId || !(await queryRowsRaw(`SELECT ${target[1]} FROM ${target[0]} WHERE ${target[1]} = :id LIMIT 1`, { id: input.sourceId })).length) throw new Error("来源单据不存在，请刷新重试");
      const existing = await queryRowsRaw(`SELECT invoiceNo FROM ${INVOICE_TABLE} WHERE sourceType = :sourceType AND sourceId = :sourceId AND status = 'issued' LIMIT 1`, { sourceType: input.sourceType, sourceId: input.sourceId });
      if (existing.length) throw new Error(`该来源已有发票 ${text(existing[0].invoiceNo)}，请先核对，不能重复覆盖`);
    }
  }
  let mergeRows: Row[] = [];
  let effectiveInput = plannedAllocation ? { ...input, sourceNo: `${plannedAllocation.allocations.length} 条账单：${servicePeriodLabel(plannedAllocation.allocations.map(row=>row.period))}`, lines: allocationInvoiceLines(plannedAllocation) } : input;
  if (!plannedAllocation && allocationIds.length && (text(input.sourceType) || "cloud_row") === "cloud_row") {
    mergeRows = await loadMergeRows(allocationIds);
    if (mergeRows.length !== allocationIds.length) throw new Error("选中的账单行已不存在，请重新选择");
    const net = mergeRows.reduce((sum, row) => sum + rowAmount(row, "net"), 0);
    const total = mergeRows.reduce((sum, row) => sum + rowAmount(row, "total"), 0);
    if (source === "external") {
      if (Math.round(Number(input.amountIncludingTax) * 100) !== Math.round(total * 100) || Math.round(Number(input.amountExcludingTax) * 100) !== Math.round(net * 100)) {
        throw new Error("回票金额与合并账期合计不同，请先核对分摊金额，不能将整票金额覆盖各账期");
      }
      if (mergeRows.some(row => (text(row.invoiceCurrency) || text(row.collectionCurrency) || "USD").toUpperCase() !== text(input.currency).toUpperCase())) {
        throw new Error("合并账期币种与发票不同，请先核对");
      }
    }
    const periods = mergeRows.map((row) => text(row.period)).filter(Boolean).sort();
    effectiveInput = {
      ...input,
      sourceType: "cloud_row",
      sourceId: text(mergeRows[0].id),
      sourceNo: periods.length > 1
        ? `${periods.length} 个账期：${periods[0]}–${periods[periods.length - 1]}`
        : `${periods[0] ?? ""} · ${text(mergeRows[0].account)}`,
      period: periods[0] ?? text(input.period),
      customerId: text(input.customerId) || text(mergeRows[0].invoicePayerCustomerId) || text(mergeRows[0].customerId),
      undertakingUnitId: text(input.undertakingUnitId) || text(mergeRows[0].invoicePayeeUndertakingUnitId) || text(mergeRows[0].undertakingUnitId),
      currency: text(input.currency) || text(mergeRows[0].invoiceCurrency) || text(mergeRows[0].collectionCurrency) || "USD",
      amountExcludingTax: source === "external" ? input.amountExcludingTax : net.toFixed(2),
      taxRate: source === "external" ? input.taxRate : percentFromStoredRate(text(mergeRows[0].invoiceTaxRate) || text(mergeRows[0].customerTaxRate)),
      taxAmount: source === "external" ? input.taxAmount : (total - net).toFixed(2),
      amountIncludingTax: source === "external" ? input.amountIncludingTax : total.toFixed(2),
      lines: mergeRows.map((row) => ({
        periodLabel: periodLabel(row.period),
        description: `Huawei Cloud service fee ${periodLabel(row.period)}`.trim(),
        amount: rowAmount(row, "total").toFixed(2),
      })),
    };
  }

  const resolved = await resolveInvoice(effectiveInput, true);
  const id = randomUUID();
  const sourceTypeValue = text(effectiveInput.sourceType) || "manual";
  const sourceIdValue = text(effectiveInput.sourceId);

  let bytes: Buffer | null = null;
  let fileName = "";
  let fileType = "";
  if (source === "generated") {
    const renderInput = toRenderInput(resolved);
    const missing = collectMissingInvoiceFields(renderInput, resolved.template);
    if (missing.length) throw new Error(`开票资料不完整：${missing.join("、")}`);
    const html = renderInvoice(renderInput, { template: resolved.template });
    // 有浏览器就用无头 Chrome 转成 PDF（业务要的是 PDF）；转不了就回落 HTML，功能不中断
    const pdf = await renderInvoicePdf(html);
    if (pdf) {
      bytes = pdf;
      fileName = `${resolved.invoiceNo}.pdf`;
      fileType = "application/pdf";
    } else {
      bytes = Buffer.from(html, "utf8");
      fileName = `${resolved.invoiceNo}.html`;
      // 用不带参数的 MIME：readFile 解析 data URL 时只认 `type;base64,`
      fileType = "text/html";
    }
  } else {
    if (!input.file?.bytes?.length) throw new Error("请先上传外部发票文件");
    bytes = input.file.bytes;
    fileName = input.file.fileName || `${resolved.invoiceNo}.pdf`;
    fileType = input.file.fileType || "application/octet-stream";
  }

  const period = text(effectiveInput.period) || periodOf(resolved.invoiceDate);
  const stored = await storeFile({
    context: { system: "invoice", period, invoiceNo: resolved.invoiceNo },
    attachmentId: id,
    fileName,
    fileType,
    bytes,
    isInvoice: true,
  });

  try {
  await withTransaction(async connection => {
  const executeRaw = (sql: string, params: Row = {}) => executeInTransaction(connection, sql, params);
  if (approvalReturn) {
    const [approval] = await queryRowsInTransaction<Row>(connection, "SELECT status, invoiceId, ownerType, ownerId, allocationSourceIds FROM merge_common_feishu_approvals WHERE instanceCode = :instanceCode FOR UPDATE", { instanceCode: approvalReturn.instanceCode });
    if (!approval || approval.status !== "approved") throw new Error("审批尚未通过或已撤回，不能登记回票");
    if (approval.invoiceId) throw new Error("该审批已有正式发票，不能自动覆盖，请先核对已有记录");
    const approvedIds = text(approval.allocationSourceIds).split(",").filter(Boolean).sort();
    const sameSources = mergeRows.length || plannedAllocation
      ? approvedIds.join(",") === [...allocationIds].sort().join(",") && approvedIds.includes(sourceIdValue) && approvedIds.includes(text(approval.ownerId))
      : approval.ownerId === sourceIdValue && approvedIds.length <= 1;
    if (approval.ownerType !== sourceTypeValue || !sameSources) throw new Error("回票与来源单据不一致");
    const [file] = await queryRowsInTransaction<Row>(connection, "SELECT id, invoiceId FROM merge_common_invoice_approval_files WHERE id = :id AND instanceCode = :instanceCode FOR UPDATE", { id: approvalReturn.fileId, instanceCode: approvalReturn.instanceCode });
    if (!file || file.invoiceId) throw new Error("回票已登记或不存在，请刷新");
    // Serialize invoice-number deduplication for this issuing entity across different source documents.
    await queryRowsInTransaction(connection, "SELECT undertakingUnitId FROM merge_common_undertaking_units WHERE undertakingUnitId = :id FOR UPDATE", { id: resolved.bank.undertakingUnitId });
    const duplicates = await queryRowsInTransaction(connection, "SELECT id FROM merge_common_invoices WHERE undertakingUnitId = :unit AND invoiceNo = :number AND status = 'issued' LIMIT 1 FOR UPDATE", { unit: resolved.bank.undertakingUnitId, number: resolved.invoiceNo });
    if (duplicates.length) throw new Error("该开票主体下已有相同票号，不能重复登记");
    if (mergeRows.length) {
      for (const rowId of mergeRows.map(row => text(row.id)).sort()) {
        const [lockedRow] = await queryRowsInTransaction(connection, "SELECT * FROM merge_cloud_rows WHERE id = :id FOR UPDATE", { id: rowId });
        const original = mergeRows.find(row => text(row.id) === rowId)!;
        if (!lockedRow || rowAmount(lockedRow, "net") !== rowAmount(original, "net") || rowAmount(lockedRow, "total") !== rowAmount(original, "total")) throw new Error("合并账期数据已变化，请刷新后重新核对");
        const conflicts = await queryRowsInTransaction(connection, "SELECT i.id FROM merge_common_invoices i LEFT JOIN merge_common_invoice_allocations a ON a.invoiceId = i.id WHERE i.status = 'issued' AND ((i.sourceType = 'cloud_row' AND i.sourceId = :id) OR (a.sourceType = 'cloud_row' AND a.sourceId = :id)) LIMIT 1 FOR UPDATE", { id: rowId });
        if (conflicts.length) throw new Error("合并账期中已有已登记发票，请刷新核对");
      }
    }
  }
  if (plannedAllocation) {
    await lockInvoiceAllocationSources(connection,plannedAllocation,{instanceCode:approvalReturn?.instanceCode});
    await queryRowsInTransaction(connection,"SELECT undertakingUnitId FROM merge_common_undertaking_units WHERE undertakingUnitId=:id FOR UPDATE",{id:resolved.bank.undertakingUnitId});
    const duplicates = await queryRowsInTransaction<Row>(connection,"SELECT id FROM merge_common_invoices WHERE undertakingUnitId=:unit AND invoiceNo=:number LIMIT 1 FOR UPDATE",{unit:resolved.bank.undertakingUnitId,number:resolved.invoiceNo});
    if (duplicates.length) throw Object.assign(new Error("这张发票已登记，请调整原发票的关联账期"),{existingInvoiceId:text(duplicates[0].id)});
  }
  if (source === "external" && sourceIdValue && sourceTypeValue !== "manual") {
    const targets: Record<string, [string, string]> = { cloud_row: ["merge_cloud_rows", "id"], service_fee: ["merge_power_servicefeesnapshots", "snapshotNo"], billing_statement: ["merge_power_billingstatementsnapshots", "snapshotNo"], settlement_invoice: ["merge_po_settlement_invoices", "id"] };
    const target = targets[sourceTypeValue];
    const sourceRows = await queryRowsInTransaction(connection, `SELECT ${target[1]} FROM ${target[0]} WHERE ${target[1]} = :id FOR UPDATE`, { id: sourceIdValue });
    if (!sourceRows.length) throw new Error("来源单据已删除");
    const duplicate = await queryRowsInTransaction(connection, `SELECT id FROM ${INVOICE_TABLE} WHERE sourceType = :type AND sourceId = :id AND status = 'issued' LIMIT 1 FOR UPDATE`, { type: sourceTypeValue, id: sourceIdValue });
    if (duplicate.length) throw new Error("该来源已开票，请刷新后核对");
  }
  await executeRaw(
    `INSERT INTO ${INVOICE_TABLE}
      (id, invoiceNo, source, template, status, sourceType, sourceId, sourceNo, period,
       customerId, customerName, customerAddress, customerTaxNumber, customerContact, customerContactPhone, customerContactEmail,
       undertakingUnitId, sellerName, sellerCountry, sellerAddress, sellerTelephone, sellerContactName, sellerFinanceEmail,
       bankAccountId, bankAccountName, bankName, bankAccount, bankSwiftCode, bankCode, bankAddress,
       currency, exchangeRate, amountExcludingTax, taxRate, taxAmount, amountIncludingTax, sgdRate, sgdTotal, gstRegNo,
       invoiceDate, dueDate, paymentTermDays, comment, authImg,
       fileName, fileType, fileSize, fileProvider, storageKey, fileContent,
       issuedAt, issuedByUserId, issuedByName, remark, createdByUserId, createdByName, updatedByUserId, updatedByName)
     VALUES
      (:id, :invoiceNo, :source, :template, 'issued', :sourceType, :sourceId, :sourceNo, :period,
       :customerId, :customerName, :customerAddress, :customerTaxNumber, :customerContact, :customerContactPhone, :customerContactEmail,
       :undertakingUnitId, :sellerName, :sellerCountry, :sellerAddress, :sellerTelephone, :sellerContactName, :sellerFinanceEmail,
       :bankAccountId, :bankAccountName, :bankName, :bankAccount, :bankSwiftCode, :bankCode, :bankAddress,
       :currency, :exchangeRate, :amountExcludingTax, :taxRate, :taxAmount, :amountIncludingTax, :sgdRate, :sgdTotal, :gstRegNo,
       :invoiceDate, :dueDate, :paymentTermDays, :comment, :authImg,
       :fileName, :fileType, :fileSize, :fileProvider, :storageKey, :fileContent,
       NOW(), :actorId, :actorName, :remark, :actorId, :actorName, :actorId, :actorName)`,
    {
      id,
      invoiceNo: resolved.invoiceNo,
      source,
      template: resolved.template,
      sourceType: sourceTypeValue,
      sourceId: sourceIdValue || null,
      sourceNo: text(effectiveInput.sourceNo) || null,
      period: period || null,
      customerId: resolved.customer.customerId || null,
      customerName: resolved.customer.customerName,
      customerAddress: resolved.customer.customerAddress,
      customerTaxNumber: resolved.customer.customerTaxNumber,
      customerContact: resolved.customer.customerContact,
      customerContactPhone: resolved.customer.customerContactPhone,
      customerContactEmail: resolved.customer.customerContactEmail,
      undertakingUnitId: resolved.bank.undertakingUnitId || null,
      sellerName: resolved.bank.sellerName,
      sellerCountry: resolved.bank.sellerCountry,
      sellerAddress: resolved.bank.sellerAddress,
      sellerTelephone: resolved.bank.sellerTelephone,
      sellerContactName: resolved.bank.sellerContactName,
      sellerFinanceEmail: resolved.bank.sellerFinanceEmail,
      bankAccountId: resolved.bank.bankAccountId || null,
      bankAccountName: resolved.bank.bankAccountName,
      bankName: resolved.bank.bankName,
      bankAccount: resolved.bank.bankAccount,
      bankSwiftCode: resolved.bank.bankSwiftCode,
      bankCode: resolved.bank.bankCode,
      bankAddress: resolved.bank.bankAddress,
      currency: resolved.currency,
      exchangeRate: text(effectiveInput.exchangeRate) || null,
      amountExcludingTax: resolved.amountExcludingTax || null,
      taxRate: resolved.taxRate || null,
      taxAmount: resolved.taxAmount || null,
      amountIncludingTax: resolved.amountIncludingTax || null,
      sgdRate: resolved.sgdRate || null,
      sgdTotal: resolved.sgdTotal || null,
      gstRegNo: resolved.gstRegNo || null,
      invoiceDate: resolved.invoiceDate,
      dueDate: resolved.dueDate,
      paymentTermDays: resolved.paymentTermDays,
      comment: resolved.comment || null,
      authImg: resolved.bank.signatureImage || null,
      fileName: stored.fileName,
      fileType,
      fileSize: bytes.length,
      fileProvider: stored.provider,
      storageKey: stored.storageKey,
      fileContent: stored.provider === "db" ? toDataUrl(fileType, bytes) : null,
      remark: text(input.remark) || null,
      actorId: text(actor.userId) || null,
      actorName: text(actor.name) || null,
    },
  );

  for (const [index, line] of resolved.lines.entries()) {
    await executeRaw(
      `INSERT INTO ${INVOICE_ITEM_TABLE} (id, invoiceId, lineNo, periodLabel, description, amount, sgdRate)
       VALUES (:id, :invoiceId, :lineNo, :periodLabel, :description, :amount, :sgdRate)`,
      {
        id: randomUUID(),
        invoiceId: id,
        lineNo: index + 1,
        periodLabel: line.periodLabel || null,
        description: line.description || null,
        amount: line.amount || 0,
        sgdRate: line.sgdRate || null,
      },
    );
  }

  if (!mergeRows.length && !plannedAllocation) await backfillSource({ id, sourceType: sourceTypeValue, sourceId: sourceIdValue, resolved, source }, connection);
  await attachInvoiceFileToSource({
    invoiceId: id,
    sourceType: sourceTypeValue,
    sourceId: sourceIdValue,
    actor,
    fileName: stored.fileName,
    fileType,
    fileSize: bytes.length,
    provider: stored.provider,
    storageKey: stored.storageKey,
    dataUrl: stored.provider === "db" ? toDataUrl(fileType, bytes!) : null,
  }, connection);

  if (plannedAllocation) {
    await writeInvoiceAllocations(connection,id,plannedAllocation);
    for (const row of plannedAllocation.allocations) {
      await backfillSource({id,sourceType:plannedAllocation.sourceType,sourceId:row.sourceId,source,resolved:{...resolved,
        amountExcludingTax:row.amountExcludingTax,taxRate:row.taxRate,taxAmount:row.taxAmount,amountIncludingTax:row.amountIncludingTax,
        exchangeRate:row.sourceCurrency === "USD" ? row.exchangeRate : row.invoiceUsdRate || ""}},connection);
      if (row.sourceId !== sourceIdValue) await attachInvoiceFileToSource({invoiceId:id,sourceType:plannedAllocation.sourceType,sourceId:row.sourceId,actor,
        fileName:stored.fileName,fileType,fileSize:bytes!.length,provider:stored.provider,storageKey:stored.storageKey,dataUrl:stored.provider==="db"?toDataUrl(fileType,bytes!):null},connection);
    }
  }

  /**
   * 合并开票：写分摊记录，并把票面/回填逐行落到其余账单行上（主行上面已经处理过）。
   * 作废时按这些分摊记录一次性回退。
   */
  if (mergeRows.length) {
    for (const [index, row] of mergeRows.entries()) {
      const rowId = text(row.id);
      const line = resolved.lines[index];
      const rowNet = rowAmount(row, "net");
      const rowTotal = Number(line?.amount ?? rowAmount(row, "total"));
      await executeRaw(
        `INSERT INTO merge_common_invoice_allocations
           (id, invoiceId, sourceType, sourceId, sourceNo, period, currency, amountExcludingTax, taxRate, taxAmount, amountIncludingTax)
         VALUES (:id, :invoiceId, 'cloud_row', :sourceId, :sourceNo, :period, :currency, :net, :taxRate, :taxAmount, :total)
         ON DUPLICATE KEY UPDATE amountIncludingTax = VALUES(amountIncludingTax), updatedAt = NOW()`,
        {
          id: randomUUID(),
          invoiceId: id,
          sourceId: rowId,
          sourceNo: `${text(row.period)} · ${text(row.account)}`,
          period: text(row.period) || null,
          currency: resolved.currency,
          net: rowNet.toFixed(2),
          taxRate: resolved.taxRate || null,
          taxAmount: (rowTotal - rowNet).toFixed(2),
          total: rowTotal.toFixed(2),
        },
      );
      /**
       * 每一行只回填**它自己分摊到的金额**，而不是整张票的总额——
       * 否则三行会全部显示 823.03，台账和后续对账就都错了。
       */
      await backfillSource({
        id,
        sourceType: "cloud_row",
        sourceId: rowId,
        resolved: {
          ...resolved,
          amountExcludingTax: rowNet.toFixed(2),
          taxAmount: (rowTotal - rowNet).toFixed(2),
          amountIncludingTax: rowTotal.toFixed(2),
        },
        source,
      }, connection);
      if (rowId === sourceIdValue) continue; // 主行的票面附件上面已经挂过
      await attachInvoiceFileToSource({
        invoiceId: id,
        sourceType: "cloud_row",
        sourceId: rowId,
        actor,
        fileName: stored.fileName,
        fileType,
        fileSize: bytes.length,
        provider: stored.provider,
        storageKey: stored.storageKey,
        dataUrl: stored.provider === "db" ? toDataUrl(fileType, bytes!) : null,
      }, connection);
    }
  }
  if (approvalReturn) {
    await executeRaw("UPDATE merge_common_invoices SET approvalInstanceCode = :code, approvalStatus = 'approved' WHERE id = :id", { code: approvalReturn.instanceCode, id });
    await executeRaw("UPDATE merge_common_feishu_approvals SET invoiceId = :id WHERE instanceCode = :code", { id, code: approvalReturn.instanceCode });
    // Prepared execute does not expand an array bound to one IN placeholder.
    const fileIds=Object.fromEntries(approvalReturn.relatedFileIds.map((fileId,index)=>[`fileId${index}`,fileId]));
    await executeRaw(`UPDATE merge_common_invoice_approval_files SET invoiceId = :id, confirmedJson = :confirmed, confirmedBy = :actor, confirmedAt = NOW() WHERE instanceCode = :code AND id IN (${Object.keys(fileIds).map(key=>`:${key}`).join(",")})`, {
      id, code: approvalReturn.instanceCode, ...fileIds, actor: text(actor.userId || actor.name),
      confirmed: JSON.stringify({ registrationMode: approvalReturn.mode || "manual", invoiceNo: resolved.invoiceNo, invoiceDate: resolved.invoiceDate, currency: resolved.currency,
        customerId: resolved.customer.customerId, undertakingUnitId: resolved.bank.undertakingUnitId,
        amountExcludingTax: resolved.amountExcludingTax, taxAmount: resolved.taxAmount, taxRate: resolved.taxRate,
        amountIncludingTax: resolved.amountIncludingTax, dueDate: resolved.dueDate, paymentTermDays: resolved.paymentTermDays }),
    });
  }
  });
  } catch (error) {
    await deleteFileObject({ storageProvider: stored.provider, storageKey: stored.storageKey });
    throw error;
  }
  return getInvoice(id);
}

/**
 * 把票面挂到来源单据的开票附件位。
 *
 * 同步到华为云、月账单、服务费或项目结算各自的附件位置。
 * OBS 上的文件按**引用**挂（复制 storageKey），不重复上传字节；数据库回落时复制 data URL。
 */
export async function attachInvoiceFileToSource(params: {
  invoiceId: string;
  sourceType: string;
  sourceId: string;
  actor: InvoiceActor;
  fileName: string;
  fileType: string;
  fileSize: number;
  provider: string;
  storageKey: string | null;
  dataUrl: string | null;
}, connection?: PoolConnection) {
  const executeRaw = (sql: string, values: Row = {}) => connection ? executeInTransaction(connection, sql, values) : executeOutsideTransaction(sql, values);
  const queryRowsRaw = <T extends Row>(sql: string, values: Row = {}) => connection ? queryRowsInTransaction<T>(connection, sql, values) : queryOutsideTransaction<T>(sql, values);
  const { invoiceId, sourceType, sourceId } = params;
  if (!sourceId) return "";
  if (sourceType === "billing_statement") {
    const { attachInvoiceFileToStatement } = await import("./billing-statement-attachment-service");
    const attachmentId = await attachInvoiceFileToStatement({
      snapshotNo: sourceId,
      fileName: params.fileName,
      fileType: params.fileType,
      fileSize: params.fileSize,
      provider: params.provider,
      storageKey: params.storageKey,
      dataUrl: params.dataUrl,
      actor: params.actor,
    }, connection);
    await executeRaw(`UPDATE ${INVOICE_TABLE} SET sourceAttachmentId = :attachmentId WHERE id = :invoiceId`, { attachmentId, invoiceId });
    return attachmentId;
  }
  if (sourceType === "service_fee") {
    const existing = await queryRowsRaw<Row>(
      `SELECT id FROM merge_cloud_attachments
        WHERE ownerType = 'service_fee_invoice' AND ownerId = :ownerId AND fileName = :fileName LIMIT 1`,
      { ownerId: sourceId, fileName: params.fileName },
    );
    const attachmentId = text(existing[0]?.id) || randomUUID();
    const common = {
      id: attachmentId,
      ownerId: sourceId,
      fileName: params.fileName,
      fileType: params.fileType,
      fileSize: params.fileSize,
      dataUrl: params.dataUrl,
      storageProvider: params.provider,
      storageKey: params.storageKey,
    };
    if (existing.length) {
      await executeRaw(
        `UPDATE merge_cloud_attachments
            SET fileType = :fileType, fileSize = :fileSize, dataUrl = :dataUrl,
                storageProvider = :storageProvider, storageKey = :storageKey, updatedAt = NOW()
          WHERE id = :id`,
        common,
      );
    } else {
      await executeRaw(
        `INSERT INTO merge_cloud_attachments
           (id, ownerType, ownerId, fileName, fileType, fileSize, dataUrl, storageProvider, storageKey, uploadedByUserId, uploadedByName)
         VALUES (:id, 'service_fee_invoice', :ownerId, :fileName, :fileType, :fileSize, :dataUrl, :storageProvider, :storageKey, :actorId, :actorName)`,
        { ...common, actorId: text(params.actor.userId) || null, actorName: text(params.actor.name) || "开票功能" },
      );
    }
    await executeRaw(`UPDATE ${INVOICE_TABLE} SET sourceAttachmentId = :attachmentId WHERE id = :invoiceId`, { attachmentId, invoiceId });
    return attachmentId;
  }
  if (sourceType === "settlement_invoice") {
    const invoice = (await queryRowsRaw("SELECT projectId FROM merge_po_settlement_invoices WHERE id = :id", { id: sourceId }))[0];
    if (!invoice) throw new Error("结算发票不存在");
    const attachmentId = randomUUID();
    await executeRaw(`INSERT INTO merge_po_settlement_attachments (id, projectId, invoiceId, fileName, fileType, fileSize, dataUrl, storageProvider, storageKey, description, uploadedByUserId, uploadedByName)
      VALUES (:id, :projectId, :invoiceId, :fileName, :fileType, :fileSize, :dataUrl, :provider, :storageKey, '发票原件', :userId, :userName)`,
      { id: attachmentId, projectId: invoice.projectId, invoiceId: sourceId, fileName: params.fileName, fileType: params.fileType, fileSize: params.fileSize, dataUrl: params.dataUrl, provider: params.provider, storageKey: params.storageKey, userId: params.actor.userId ?? null, userName: params.actor.name ?? null });
    await executeRaw(`UPDATE ${INVOICE_TABLE} SET sourceAttachmentId = :attachmentId WHERE id = :invoiceId`, { attachmentId, invoiceId });
    return attachmentId;
  }
  if (sourceType !== "cloud_row") return "";
  const existing = await queryRowsRaw<Row>(
    `SELECT id FROM merge_cloud_attachments
      WHERE ownerType = 'invoice' AND ownerId = :ownerId AND fileName = :fileName LIMIT 1`,
    { ownerId: sourceId, fileName: params.fileName },
  );
  const attachmentId = text(existing[0]?.id) || randomUUID();
  const common = {
    id: attachmentId,
    ownerId: sourceId,
    fileName: params.fileName,
    fileType: params.fileType,
    fileSize: params.fileSize,
    dataUrl: params.dataUrl,
    storageProvider: params.provider,
    storageKey: params.storageKey,
  };
  if (existing.length) {
    await executeRaw(
      `UPDATE merge_cloud_attachments
          SET fileType = :fileType, fileSize = :fileSize, dataUrl = :dataUrl,
              storageProvider = :storageProvider, storageKey = :storageKey, updatedAt = NOW()
        WHERE id = :id`,
      common,
    );
  } else {
    await executeRaw(
      `INSERT INTO merge_cloud_attachments
         (id, ownerType, ownerId, fileName, fileType, fileSize, dataUrl, storageProvider, storageKey, uploadedByUserId, uploadedByName)
       VALUES (:id, 'invoice', :ownerId, :fileName, :fileType, :fileSize, :dataUrl, :storageProvider, :storageKey, :actorId, :actorName)`,
      { ...common, actorId: text(params.actor.userId) || null, actorName: text(params.actor.name) || "开票功能" },
    );
  }
  await executeRaw(`UPDATE ${INVOICE_TABLE} SET sourceAttachmentId = :attachmentId WHERE id = :invoiceId`, { attachmentId, invoiceId });
  return attachmentId;
}

/**
 * 附件栏自愈：来源已有已开票记录、但附件索引缺失时，从发票记录补挂票面。
 * 覆盖历史本地开票和飞书审批开票留下的缺附件数据。
 */
export async function ensureInvoiceAttachmentForSource(sourceType: "cloud_row" | "service_fee", sourceId: string) {
  if (!sourceId) return "";
  if (sourceType === "service_fee") {
    const legacy = (await queryRowsRaw<Row>(
      "SELECT invoiceOriginalName FROM merge_power_servicefeesnapshots WHERE snapshotNo = :sourceId LIMIT 1",
      { sourceId },
    ))[0];
    if (text(legacy?.invoiceOriginalName)) return "";
  }
  const rows = await queryRowsRaw<Row>(
    `SELECT id, fileName, fileType, fileSize, fileProvider, storageKey, fileContent
       FROM ${INVOICE_TABLE}
      WHERE sourceType = :sourceType AND sourceId = :sourceId AND status = 'issued'
        AND fileName IS NOT NULL AND fileName <> ''
      ORDER BY createdAt DESC LIMIT 1`,
    { sourceType, sourceId },
  );
  const invoice = rows[0];
  if (!invoice) return "";
  return attachInvoiceFileToSource({
    invoiceId: text(invoice.id),
    sourceType,
    sourceId,
    actor: { name: "开票附件修复" },
    fileName: text(invoice.fileName),
    fileType: text(invoice.fileType) || "application/pdf",
    fileSize: Number(invoice.fileSize ?? 0),
    provider: text(invoice.fileProvider) || "db",
    storageKey: text(invoice.storageKey) || null,
    dataUrl: text(invoice.fileContent) || null,
  });
}

/**
 * 回填来源单据：票号/币种/金额/开票日期 + 状态置已开票。
 *
 * 本地开票和飞书审批开票（审批通过后按回传的真实发票登记）都走这里，
 * 保证两条链的字段口径一致 —— 以前飞书那条链把回填写死成只更新华为云对账行。
 */
export async function backfillInvoiceSourceFields(params: {
  exchangeRate?: string | null;
  dueDate?: string | null;
  /** 本地开票记录 id（月账单对账单要写 invoiceId；其它来源可空） */
  invoiceId?: string | null;
  sourceType: string;
  sourceId: string;
  invoiceNo: string;
  currency?: string | null;
  /** 税率传百分数（16 = 16%） */
  taxRate?: string | number | null;
  amountExcludingTax?: string | number | null;
  taxAmount?: string | number | null;
  amountIncludingTax?: string | number | null;
  invoiceDate?: string | null;
  undertakingUnitId?: string | null;
  customerId?: string | null;
}, connection?: PoolConnection) {
  const executeRaw = (sql: string, values: Row = {}) => connection ? executeInTransaction(connection, sql, values) : executeOutsideTransaction(sql, values);
  const queryRowsRaw = <T extends Row>(sql: string, values: Row = {}) => connection ? queryRowsInTransaction<T>(connection, sql, values) : queryOutsideTransaction<T>(sql, values);
  const { sourceType, sourceId } = params;
  if (!sourceId) return;
  const invoiceNo = text(params.invoiceNo) || null;
  const currency = text(params.currency) || null;
  const net = text(params.amountExcludingTax) || null;
  /** 开票界面统一按百分数录入，写回按小数存税率的表时再换算。 */
  const taxRatePercent = text(params.taxRate) || null;
  const taxRate = rateToFraction(taxRatePercent) || null;
  const taxAmount = text(params.taxAmount) || null;
  const total = text(params.amountIncludingTax) || null;
  const invoiceDate = text(params.invoiceDate) || null;
  const extra = { exchangeRate: text(params.exchangeRate) || null, dueDate: text(params.dueDate) || null,
    unitId: text(params.undertakingUnitId) || null, customerId: text(params.customerId) || null };

  if (sourceType === "cloud_row") {
    await executeRaw(
      `UPDATE merge_cloud_rows
          SET invoiceExchangeRate = CASE
                WHEN :currency IS NULL OR UPPER(COALESCE(NULLIF(invoiceCurrency, ''), NULLIF(collectionCurrency, ''), 'USD')) = UPPER(:currency)
                THEN COALESCE(:exchangeRate, invoiceExchangeRate) ELSE :exchangeRate END,
              invoiceNo = :invoiceNo, invoiceCurrency = :currency, invoiceNetAmount = :net,
              invoiceTaxRate = :taxRate, invoiceTaxAmount = :taxAmount, invoiceTotalAmount = :total,
              invoiceDate = :invoiceDate, collectionInvoice = 'issued', updatedAt = NOW(),
              receivableDate = COALESCE(:dueDate, receivableDate),
              invoicePayeeUndertakingUnitId = COALESCE(:unitId, invoicePayeeUndertakingUnitId),
              invoicePayerCustomerId = COALESCE(:customerId, invoicePayerCustomerId)
        WHERE id = :sourceId`,
      { invoiceNo, currency, net, taxRate, taxAmount, total, invoiceDate, sourceId, ...extra },
    );
    return;
  }
  if (sourceType === "billing_statement") {
    await executeRaw(
      `UPDATE merge_power_billingstatementsnapshots
          SET invoiceId = :invoiceId, invoiceNo = :invoiceNo, invoiceCurrency = :currency, invoiceNetAmount = :net,
              invoiceTaxRate = :taxRate, invoiceTaxAmount = :taxAmount, invoiceTotalAmount = :total,
              invoiceDate = :invoiceDate, invoiceStatus = 'issued', updatedAt = NOW()
        WHERE snapshotNo = :sourceId`,
      { invoiceId: text(params.invoiceId) || null, invoiceNo, currency, net, taxRate, taxAmount, total, invoiceDate, sourceId },
    );
    return;
  }
  if (sourceType === "service_fee") {
    await executeRaw(
      `UPDATE merge_power_servicefeesnapshots
          SET invoiceNo = :invoiceNo, invoiceCurrency = :currency, invoiceReceivingUnitId = COALESCE(:unitId, invoiceReceivingUnitId),
              invoicePayerCustomerId = COALESCE(:customerId, invoicePayerCustomerId), invoiceAmountExcludingTax = :net, invoiceVatRate = :taxRate,
              invoiceAmountIncludingTax = :total, invoiceDate = :invoiceDate, receivableDate = COALESCE(:dueDate, receivableDate), invoiceStatus = '已开票', updatedAt = NOW()
        WHERE snapshotNo = :sourceId`,
      {
        invoiceNo, currency, net, taxRate, total, invoiceDate, sourceId, ...extra,
        unitId: text(params.undertakingUnitId) || null,
        customerId: text(params.customerId) || null,
      },
    );
    return;
  }
  if (sourceType === "settlement_invoice") {
    // 集采结算发票：税率存百分数、金额直接写回，否则开完票在发票汇总里还是旧金额（老毛病）。
    const existing = (await queryRowsRaw<Row>(
      "SELECT type, exchangeRate FROM merge_po_settlement_invoices WHERE id = :sourceId LIMIT 1",
      { sourceId },
    ))[0];
    const exchangeRate = Number(extra.exchangeRate || text(existing?.exchangeRate)) || 1;
    const netNumber = net === null ? null : Number(net);
    const usdAmount = netNumber === null || !Number.isFinite(netNumber)
      ? null
      : ((text(existing?.type) === "cost" ? -1 : 1) * netNumber / exchangeRate).toFixed(2);
    await executeRaw(
      `UPDATE merge_po_settlement_invoices
          SET invoiceNo = COALESCE(:invoiceNo, invoiceNo),
              invoiceDate = COALESCE(:invoiceDate, invoiceDate),
              exchangeRate = COALESCE(:exchangeRate, exchangeRate),
              receivableDate = COALESCE(:dueDate, receivableDate),
              companyEntityId = COALESCE(:unitId, companyEntityId),
              companyEntity = COALESCE((SELECT COALESCE(NULLIF(shortName, ''), NULLIF(entityName, ''), NULLIF(name, '')) FROM merge_common_undertaking_units WHERE undertakingUnitId = :unitId LIMIT 1), companyEntity),
              invoiceEntityId = CASE WHEN type = 'income' THEN COALESCE(:customerId, invoiceEntityId) ELSE invoiceEntityId END,
              invoiceEntity = CASE WHEN type = 'income' THEN COALESCE((SELECT COALESCE(NULLIF(shortName, ''), NULLIF(nameCn, ''), NULLIF(name, '')) FROM merge_common_customers WHERE customerId = :customerId LIMIT 1), invoiceEntity) ELSE invoiceEntity END,
              currency = COALESCE(:currency, currency),
              taxRate = COALESCE(:taxRatePercent, taxRate),
              invoiceTotal = COALESCE(:total, invoiceTotal),
              invoiceTaxExcludedTotal = COALESCE(:net, invoiceTaxExcludedTotal),
              invoiceTaxAmount = COALESCE(:taxAmount, invoiceTaxAmount),
              usdAmount = COALESCE(:usdAmount, usdAmount),
              isInvoiced = 1, updatedAt = NOW()
        WHERE id = :sourceId`,
      { invoiceNo, invoiceDate, currency, taxRatePercent, total, net, taxAmount, usdAmount, sourceId, ...extra },
    );
    return;
  }
}

/** 国家的默认承接单位 / 客户（月账单对账单、服务费对账单没填往来方时用它兜底）。 */
async function defaultPartiesByCountry(countryCode: string) {
  if (!countryCode) return { customerId: "", undertakingUnitId: "" };
  const rows = await queryRowsRaw<Row>(
    `SELECT defaultUndertakingUnitId, defaultCustomerId FROM merge_power_countries WHERE code = :code LIMIT 1`,
    { code: countryCode },
  ).catch(() => [] as Row[]);
  return {
    customerId: text(rows[0]?.defaultCustomerId),
    undertakingUnitId: text(rows[0]?.defaultUndertakingUnitId),
  };
}

/**
 * 取来源单据上的客户 / 承接单位，规则与开票预填保持一致。
 * 飞书审批开票（取客户税号、承接单位税号做核验）和本地开票都要用，所以放在这里共用。
 */
export async function loadInvoiceSourceParties(sourceType: string, sourceId: string) {
  if (!sourceId) return { customerId: "", undertakingUnitId: "" };
  if (sourceType === "cloud_row") {
    const rows = await queryRowsRaw<Row>(
      "SELECT customerId, undertakingUnitId FROM merge_cloud_rows WHERE id = :id LIMIT 1",
      { id: sourceId },
    );
    return { customerId: text(rows[0]?.customerId), undertakingUnitId: text(rows[0]?.undertakingUnitId) };
  }
  if (sourceType === "billing_statement") {
    // 对账单按国家出具（可能覆盖多个客户），所以取国家的默认往来方，客户仍可在弹层里改
    const rows = await queryRowsRaw<Row>(
      "SELECT countryCode FROM merge_power_billingstatementsnapshots WHERE snapshotNo = :id LIMIT 1",
      { id: sourceId },
    );
    return defaultPartiesByCountry(text(rows[0]?.countryCode));
  }
  if (sourceType === "service_fee") {
    const rows = await queryRowsRaw<Row>(
      `SELECT invoicePayerCustomerId, invoiceReceivingUnitId, countryCode
         FROM merge_power_servicefeesnapshots WHERE snapshotNo = :id LIMIT 1`,
      { id: sourceId },
    );
    const fallback = await defaultPartiesByCountry(text(rows[0]?.countryCode));
    return {
      customerId: text(rows[0]?.invoicePayerCustomerId) || fallback.customerId,
      undertakingUnitId: text(rows[0]?.invoiceReceivingUnitId) || fallback.undertakingUnitId,
    };
  }
  if (sourceType === "settlement_invoice") {
    const rows = await queryRowsRaw<Row>(
      `SELECT p.customerId, p.contractingUnitId FROM merge_po_settlement_invoices i
         LEFT JOIN merge_po_settlement_projects p ON p.id = i.projectId
        WHERE i.id = :id LIMIT 1`,
      { id: sourceId },
    );
    return { customerId: text(rows[0]?.customerId), undertakingUnitId: text(rows[0]?.contractingUnitId) };
  }
  return { customerId: "", undertakingUnitId: "" };
}

/** 来源单据上的含税金额（飞书审批回传发票的核验基准）。 */
export async function loadInvoiceSourceTotal(sourceType: string, sourceId: string) {
  if (!sourceId) return 0;
  const queries: Record<string, string> = {
    cloud_row: "SELECT invoiceTotalAmount AS total FROM merge_cloud_rows WHERE id = :id LIMIT 1",
    billing_statement: "SELECT COALESCE(invoiceTotalAmount, totalAmount) AS total FROM merge_power_billingstatementsnapshots WHERE snapshotNo = :id LIMIT 1",
    service_fee: "SELECT COALESCE(invoiceAmountIncludingTax, serviceFeeTotal) AS total FROM merge_power_servicefeesnapshots WHERE snapshotNo = :id LIMIT 1",
    settlement_invoice: "SELECT invoiceTotal AS total FROM merge_po_settlement_invoices WHERE id = :id LIMIT 1",
  };
  const sql = queries[sourceType];
  if (!sql) return 0;
  const rows = await queryRowsRaw<{ total: string | null }>(sql, { id: sourceId });
  return Number(text(rows[0]?.total) || 0);
}

/** 回填来源账单：票号/币种/金额/开票日期 + 状态置已开票。 */
async function backfillSource(params: {
  id: string;
  sourceType: string;
  sourceId: string;
  resolved: ResolvedInvoice;
  source: InvoiceSource;
}, connection?: PoolConnection) {
  const { id, sourceType, sourceId, resolved } = params;
  if (!sourceId) return;
  // 字段口径统一走 backfillInvoiceSourceFields：飞书审批开票回填也调它，避免两条链分叉。
  await backfillInvoiceSourceFields({
    invoiceId: id,
    sourceType,
    sourceId,
    invoiceNo: resolved.invoiceNo,
    currency: resolved.currency,
    taxRate: resolved.taxRate,
    amountExcludingTax: resolved.amountExcludingTax,
    taxAmount: resolved.taxAmount,
    amountIncludingTax: resolved.amountIncludingTax,
    invoiceDate: resolved.invoiceDate,
    exchangeRate: resolved.exchangeRate, dueDate: resolved.dueDate,
    undertakingUnitId: resolved.bank?.undertakingUnitId ?? null,
    customerId: resolved.customer?.customerId ?? null,
  }, connection);
}

/** 作废：票面数据保留供审计，来源账单回到"未开票"。 */
export async function voidInvoice(id: string, reason: string, actor: InvoiceActor = {}) {
  const current = await queryRowsRaw<Row>(
    `SELECT id, invoiceNo, status, sourceType, sourceId FROM ${INVOICE_TABLE} WHERE id = :id LIMIT 1`,
    { id },
  );
  const row = current[0];
  if (!row) throw new Error("开票记录不存在");
  if (text(row.status) === "void") throw new Error("这张发票已经作废了");
  const allocations = await queryRowsRaw<Row>(
    `SELECT sourceType, sourceId FROM merge_common_invoice_allocations WHERE invoiceId = :id`, { id },
  );
  if (allocations.length && ["cloud_row", "service_fee"].includes(text(row.sourceType))) {
    // 合并票的状态、全部月份和附件引用必须一起提交或一起回滚。
    await withTransaction(async connection => {
      const [invoice] = await queryRowsInTransaction<Row>(connection, `SELECT * FROM ${INVOICE_TABLE} WHERE id=:id FOR UPDATE`, {id});
      if (!invoice || invoice.status === "void") throw new Error("发票状态已变化，请刷新后核对");
      const currentAllocations = await queryRowsInTransaction<Row>(connection,
        "SELECT sourceType, sourceId FROM merge_common_invoice_allocations WHERE invoiceId=:id ORDER BY sourceId FOR UPDATE", {id});
      const sourceType = text(invoice.sourceType);
      const ids = [...new Set([text(invoice.sourceId), ...currentAllocations.map(item=>text(item.sourceId))])].filter(Boolean).sort();
      for (const sourceId of ids) {
        await backfillRevert(sourceType, sourceId, text(invoice.invoiceNo), connection);
        await executeInTransaction(connection, `DELETE FROM merge_cloud_attachments
          WHERE ownerType=:ownerType AND ownerId=:sourceId AND fileName=:fileName
            AND COALESCE(storageKey,'')=COALESCE(:storageKey,'')`, {
          ownerType: sourceType === "cloud_row" ? "invoice" : "service_fee_invoice", sourceId,
          fileName: text(invoice.fileName), storageKey: text(invoice.storageKey),
        });
      }
      await executeInTransaction(connection, `UPDATE ${INVOICE_TABLE} SET status='void',voidedAt=NOW(),voidReason=:reason,
        sourceAttachmentId=NULL,updatedByUserId=:actorId,updatedByName=:actorName WHERE id=:id`,
        {id,reason:text(reason)||null,actorId:text(actor.userId)||null,actorName:text(actor.name)||null});
    });
    return getInvoice(id);
  }

  await executeRaw(
    `UPDATE ${INVOICE_TABLE} SET status = 'void', voidedAt = NOW(), voidReason = :reason,
       updatedByUserId = :actorId, updatedByName = :actorName WHERE id = :id`,
    { id, reason: text(reason) || null, actorId: text(actor.userId) || null, actorName: text(actor.name) || null },
  );
  const sourceType = text(row.sourceType);
  const sourceId = text(row.sourceId);
  const invoiceFileName = text((await queryRowsRaw<Row>(
    `SELECT fileName FROM ${INVOICE_TABLE} WHERE id = :id`,
    { id },
  ))[0]?.fileName);
  // 合并开票：先按分摊记录把每一行的票面附件摘掉（主行下面还会再走一次，删不到就忽略）
  if (allocations.length > 1 && invoiceFileName) {
    for (const allocation of allocations) {
      await executeRaw(
        `DELETE FROM merge_cloud_attachments
          WHERE ownerType = 'invoice' AND ownerId = :ownerId AND fileName = :fileName`,
        { ownerId: text(allocation.sourceId), fileName: invoiceFileName },
      );
    }
  }
  // 摘掉挂在来源单据开票附件位上的那张票面（票面本身仍在开票记录里，作废后仍可下载审计）
  const attachmentId = text((await queryRowsRaw<Row>(
    `SELECT sourceAttachmentId FROM ${INVOICE_TABLE} WHERE id = :id`,
    { id },
  ))[0]?.sourceAttachmentId);
  if (attachmentId) {
    if (sourceType === "billing_statement" && sourceId) {
      const { deleteStatementAttachment } = await import("./billing-statement-attachment-service");
      await deleteStatementAttachment(sourceId, attachmentId).catch(() => undefined);
    } else if (sourceType === "service_fee" && sourceId) {
      await executeRaw("DELETE FROM merge_cloud_attachments WHERE id = :attachmentId AND ownerType = 'service_fee_invoice' AND ownerId = :sourceId", { attachmentId, sourceId });
    } else if (sourceType === "settlement_invoice" && sourceId) {
      await executeRaw("DELETE FROM merge_po_settlement_attachments WHERE id = :attachmentId AND invoiceId = :sourceId", { attachmentId, sourceId });
    } else {
      await executeRaw(
        `DELETE FROM merge_cloud_attachments WHERE id = :attachmentId AND ownerType = 'invoice'`,
        { attachmentId },
      );
    }
    await executeRaw(`UPDATE ${INVOICE_TABLE} SET sourceAttachmentId = NULL WHERE id = :id`, { id });
  }
  if (sourceType === "cloud_row" && sourceId) {
    // 走统一的回退逻辑：台账行连金额一起清（只在票号确实是这张作废票时清，避免擦掉人工填的其它票号）
    await backfillRevert("cloud_row", sourceId, text(row.invoiceNo));
  } else if (sourceType === "billing_statement" && sourceId) {
    await executeRaw(
      `UPDATE merge_power_billingstatementsnapshots
          SET invoiceId = NULL, invoiceNo = IF(invoiceNo = :invoiceNo, NULL, invoiceNo), invoiceStatus = 'not_issued', updatedAt = NOW()
        WHERE snapshotNo = :sourceId`,
      { sourceId, invoiceNo: text(row.invoiceNo) },
    );
  } else if (sourceType === "service_fee" && sourceId) {
    await executeRaw(
      `UPDATE merge_power_servicefeesnapshots
          SET invoiceStatus = '未开票', invoiceNo = IF(invoiceNo = :invoiceNo, NULL, invoiceNo), updatedAt = NOW()
        WHERE snapshotNo = :sourceId`,
      { sourceId, invoiceNo: text(row.invoiceNo) },
    );
  } else if (sourceType === "settlement_invoice" && sourceId) {
    await executeRaw(
      `UPDATE merge_po_settlement_invoices
          SET isInvoiced = 0, invoiceNo = IF(invoiceNo = :invoiceNo, NULL, invoiceNo), updatedAt = NOW()
        WHERE id = :sourceId`,
      { sourceId, invoiceNo: text(row.invoiceNo) },
    );
  }
  // 合并开票：分摊到其余账期的行也一起退回未开票
  for (const allocation of allocations) {
    const allocationSourceId = text(allocation.sourceId);
    if (!allocationSourceId || allocationSourceId === sourceId) continue;
    await backfillRevert(text(allocation.sourceType) || "cloud_row", allocationSourceId, text(row.invoiceNo));
  }
  return getInvoice(id);
}

/** 作废时把某一条来源账单行退回未开票（只在票号一致时清空票号）。 */
async function backfillRevert(sourceType: string, sourceId: string, invoiceNo: string, connection?: PoolConnection) {
  const executeRaw = (sql: string, values: Row) => connection ? executeInTransaction(connection,sql,values) : executeOutsideTransaction(sql,values);
  if (sourceType === "cloud_row") {
    // 先按"票号是否还是这张票"清金额，再清票号：MySQL 的 SET 是从左到右用新值，
    // 合成一条 SQL 的话后面几个 CASE 会读到已经被置空的 invoiceNo，金额就清不掉了。
    await executeRaw(
      `UPDATE merge_cloud_rows
          SET invoiceNetAmount = CASE WHEN invoiceNo = :invoiceNo THEN NULL ELSE invoiceNetAmount END,
              invoiceTaxRate = CASE WHEN invoiceNo = :invoiceNo THEN NULL ELSE invoiceTaxRate END,
              invoiceTaxAmount = CASE WHEN invoiceNo = :invoiceNo THEN NULL ELSE invoiceTaxAmount END,
              invoiceTotalAmount = CASE WHEN invoiceNo = :invoiceNo THEN NULL ELSE invoiceTotalAmount END,
              invoiceDate = CASE WHEN invoiceNo = :invoiceNo THEN NULL ELSE invoiceDate END
        WHERE id = :sourceId`,
      { sourceId, invoiceNo },
    );
    await executeRaw(
      `UPDATE merge_cloud_rows
          SET invoiceNo = NULL, collectionInvoice = 'not_issued', updatedAt = NOW()
        WHERE id = :sourceId AND invoiceNo = :invoiceNo`,
      { sourceId, invoiceNo },
    );
  } else if (sourceType === "billing_statement") {
    await executeRaw(
      `UPDATE merge_power_billingstatementsnapshots
          SET invoiceId = NULL, invoiceNo = IF(invoiceNo = :invoiceNo, NULL, invoiceNo), invoiceStatus = 'not_issued', updatedAt = NOW()
        WHERE snapshotNo = :sourceId`,
      { sourceId, invoiceNo },
    );
  } else if (sourceType === "service_fee") {
    await executeRaw(
      `UPDATE merge_power_servicefeesnapshots
          SET invoiceStatus = '未开票', invoiceNo = NULL, invoiceAmountExcludingTax = NULL,
              invoiceAmountIncludingTax = NULL, invoiceVatRate = NULL, invoiceDate = NULL, updatedAt = NOW()
        WHERE snapshotNo = :sourceId AND invoiceNo = :invoiceNo`,
      { sourceId, invoiceNo },
    );
  } else if (sourceType === "settlement_invoice") {
    await executeRaw(
      `UPDATE merge_po_settlement_invoices
          SET isInvoiced = 0, invoiceNo = IF(invoiceNo = :invoiceNo, NULL, invoiceNo), updatedAt = NOW()
        WHERE id = :sourceId`,
      { sourceId, invoiceNo },
    );
  }
}

/** 按需渲染票面 HTML（调试、或业务要 Excel 版打印时用；不写库）。 */
export async function renderInvoiceHtmlById(id: string) {
  const invoice = await getInvoice(id);
  if (!invoice) return null;
  if (text(invoice.source) === "external") return null;
  const resolved = await resolveSnapshotInvoice(invoice);
  const renderInput = toRenderInput(resolved);
  const missing = collectMissingInvoiceFields(renderInput, resolved.template);
  if (missing.length) throw new Error(`开票资料不完整：${missing.join("、")}`);
  return renderInvoice(renderInput, { template: resolved.template });
}

export async function readInvoiceFile(id: string) {
  const rows = await queryRowsRaw<Row>(
    `SELECT fileName, fileType, fileProvider, storageKey, fileContent FROM ${INVOICE_TABLE} WHERE id = :id LIMIT 1`,
    { id },
  );
  const row = rows[0];
  if (!row) return null;
  // 历史记录里可能存了带参数的 MIME（text/html; charset=utf-8），readFile 只认简单类型，这里统一归一化。
  const raw = text(row.fileContent);
  const dataUrl = raw.startsWith("data:") ? raw.replace(/^data:[^,]*,/, "data:application/octet-stream;base64,") : raw;
  const file = await readFile({
    dataUrl,
    storageProvider: row.fileProvider,
    storageKey: row.storageKey,
    fileType: row.fileType,
  });
  if (!file) return null;
  return { bytes: file.bytes, contentType: file.contentType, fileName: text(row.fileName) || "invoice.html" };
}

/** 重新生成票面（票号不变，用于补签章或改数据后重出）。 */
/** 用开票记录里的**快照**构造渲染入参：已开出的票面不能随档案改名而变。 */
async function resolveSnapshotInvoice(invoice: Row & { items?: Row[] }) {
  const items = (invoice.items ?? []) as Row[];
  return resolveInvoice({
    template: text(invoice.template) === "sgd" ? "sgd" : "normal",
    invoiceNo: text(invoice.invoiceNo),
    customerId: text(invoice.customerId),
    undertakingUnitId: text(invoice.undertakingUnitId),
    bankAccountId: text(invoice.bankAccountId),
    invoiceDate: isoDate(invoice.invoiceDate),
    dueDate: isoDate(invoice.dueDate),
    paymentTermDays: defaultInvoicePaymentTermDays(invoice.paymentTermDays),
    currency: text(invoice.currency),
    amountExcludingTax: text(invoice.amountExcludingTax),
    taxRate: text(invoice.taxRate),
    taxAmount: text(invoice.taxAmount),
    amountIncludingTax: text(invoice.amountIncludingTax),
    sgdRate: text(invoice.sgdRate),
    sgdTotal: text(invoice.sgdTotal),
    gstRegNo: text(invoice.gstRegNo),
    comment: text(invoice.comment),
    lines: items.map((item) => ({
      periodLabel: text(item.periodLabel), description: text(item.description),
      amount: text(item.amount), sgdRate: text(item.sgdRate),
    })),
    // 已开出的票面要以快照为准，避免客户改名后票面跟着变
    bankAccountName: text(invoice.bankAccountName), bankName: text(invoice.bankName), bankAccount: text(invoice.bankAccount),
    bankSwiftCode: text(invoice.bankSwiftCode), bankCode: text(invoice.bankCode), bankAddress: text(invoice.bankAddress),
    customerName: text(invoice.customerName),
    customerTaxNumber: text(invoice.customerTaxNumber),
    customerAddress: text(invoice.customerAddress),
    customerContact: text(invoice.customerContact),
    customerContactPhone: text(invoice.customerContactPhone),
    customerContactEmail: text(invoice.customerContactEmail),
    sellerName: text(invoice.sellerName),
    sellerCountry: text(invoice.sellerCountry),
    sellerAddress: text(invoice.sellerAddress),
    sellerTelephone: text(invoice.sellerTelephone),
    sellerContactName: text(invoice.sellerContactName),
    sellerFinanceEmail: text(invoice.sellerFinanceEmail),
  }, false);
}

export async function regenerateInvoiceFile(id: string, actor: InvoiceActor = {}) {
  const invoice = await getInvoice(id);
  if (!invoice) throw new Error("开票记录不存在");
  if (text(invoice.source) === "external") throw new Error("外部上传的发票没有票面可重新生成");
  const resolved = await resolveSnapshotInvoice(invoice);
  const renderInput = toRenderInput(resolved);
  const missing = collectMissingInvoiceFields(renderInput, resolved.template);
  if (missing.length) throw new Error(`开票资料不完整：${missing.join("、")}`);
  const html = renderInvoice(renderInput, { template: resolved.template });
  // 和开票一致：优先存 PDF，转不了再落 HTML
  const pdf = await renderInvoicePdf(html);
  const bytes = pdf ?? Buffer.from(html, "utf8");
  const fileType = pdf ? "application/pdf" : "text/html";
  const stored = await storeFile({
    context: { system: "invoice", period: text(invoice.period), invoiceNo: text(invoice.invoiceNo) },
    attachmentId: id,
    fileName: `${text(invoice.invoiceNo)}${pdf ? ".pdf" : ".html"}`,
    fileType,
    bytes,
    isInvoice: true,
  });
  const previousKey = text(invoice.storageKey);
  await executeRaw(
    `UPDATE ${INVOICE_TABLE} SET fileName = :fileName, fileType = :fileType, fileSize = :fileSize,
       fileProvider = :fileProvider, storageKey = :storageKey, fileContent = :fileContent,
       updatedByUserId = :actorId, updatedByName = :actorName WHERE id = :id`,
    {
      id, fileName: stored.fileName, fileType, fileSize: bytes.length,
      fileProvider: stored.provider, storageKey: stored.storageKey,
      fileContent: stored.provider === "db" ? toDataUrl(fileType, bytes) : null,
      actorId: text(actor.userId) || null, actorName: text(actor.name) || null,
    },
  );
  if (previousKey && previousKey !== stored.storageKey) {
    await deleteFileObject({ storageProvider: invoice.fileProvider, storageKey: previousKey }).catch(() => undefined);
  }
  /**
   * 把新票面同步到来源单据的附件位（对账行 / 月账单对账单）。
   * 补了签章或改了档案资料后重出票面时，如果不同步这一步，单据上挂的还是旧文件。
   */
  const linkTargets = new Set<string>();
  if (text(invoice.sourceId)) linkTargets.add(text(invoice.sourceId));
  for (const allocation of ((invoice.allocations ?? []) as Row[])) {
    if (text(allocation.sourceId)) linkTargets.add(text(allocation.sourceId));
  }
  for (const targetId of linkTargets) {
    await attachInvoiceFileToSource({
      invoiceId: id,
      sourceType: text(invoice.sourceType) || "cloud_row",
      sourceId: targetId,
      actor,
      fileName: stored.fileName,
      fileType,
      fileSize: bytes.length,
      provider: stored.provider,
      storageKey: stored.storageKey,
      dataUrl: stored.provider === "db" ? toDataUrl(fileType, bytes) : null,
    });
  }
  return getInvoice(id);
}

export async function deleteInvoice(id: string) {
  const invoice = await getInvoice(id);
  if (!invoice) throw new Error("开票记录不存在");
  if (text(invoice.status) === "issued") throw new Error("已开票的记录请先作废再删除");
  await executeRaw(`DELETE FROM ${INVOICE_ITEM_TABLE} WHERE invoiceId = :id`, { id });
  await executeRaw(`DELETE FROM merge_common_invoice_allocations WHERE invoiceId = :id`, { id });
  await executeRaw(`DELETE FROM ${INVOICE_TABLE} WHERE id = :id`, { id });
  const key = text(invoice.storageKey);
  if (key) await deleteFileObject({ storageProvider: invoice.fileProvider, storageKey: key }).catch(() => undefined);
  return true;
}

/** 号码规则说明，供前端提示用。 */
export function invoiceNoRule(period: string) {
  return `${INVOICE_NO_PREFIX}-${period || "YYYYMM"}-0001`;
}

export const INVOICE_DATE_PATTERN = DATE_PATTERN;
