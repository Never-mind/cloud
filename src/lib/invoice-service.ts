import { randomUUID } from "node:crypto";
import { executeRaw, queryRowsRaw, type Row } from "./db";
import { deleteFileObject, readFile, storeFile } from "./file-storage-service";
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
  customerAddress?: string | null;
  customerContact?: string | null;
  customerContactEmail?: string | null;
  sellerName?: string | null;
  sellerCountry?: string | null;
  sellerAddress?: string | null;
  sellerTelephone?: string | null;
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
         COALESCE(NULLIF(uu.shortName, ''), NULLIF(uu.nameCn, ''), NULLIF(uu.nameEn, ''), i.sellerName) AS sellerDisplayName
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
      "(i.invoiceNo LIKE :keyword OR i.customerName LIKE :keyword OR i.customerDisplayName LIKE :keyword OR i.sourceNo LIKE :keyword OR i.sellerName LIKE :keyword)",
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
  return { ...rows[0], items } as Row & { items: Row[] };
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
  customerContactEmail: string;
  undertakingUnitId: string;
  sellerName: string;
  sellerCountry: string;
  sellerAddress: string;
  sellerTelephone: string;
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

/** 从档案取开票资料：客户抬头/地址/联系人 + 承接单位 + 默认银行账户。 */
export async function resolveInvoiceParties(input: { customerId?: string | null; undertakingUnitId?: string | null; bankAccountId?: string | null }): Promise<PartySnapshot> {
  const snapshot: PartySnapshot = {
    customerId: text(input.customerId), customerName: "", customerAddress: "", customerTaxNumber: "",
    customerContact: "", customerContactEmail: "",
    undertakingUnitId: text(input.undertakingUnitId), sellerName: "", sellerCountry: "", sellerAddress: "",
    sellerTelephone: "", sellerFinanceEmail: "",
    bankAccountId: "", bankAccountName: "", bankName: "", bankAccount: "", bankSwiftCode: "", bankCode: "", bankAddress: "",
    paymentTermDays: "", signatureImage: "",
  };

  if (snapshot.customerId) {
    const rows = await queryRowsRaw<Row>(
      `SELECT name, nameCn, nameEn, shortName, address, country, city, taxNumber, contactName, contactEmail
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
        `SELECT name, email FROM merge_common_customer_contacts WHERE customerId = :id ORDER BY isPrimary DESC, createdAt LIMIT 1`,
        { id: snapshot.customerId },
      );
      snapshot.customerContact = text(contacts[0]?.name) || text(row.contactName);
      snapshot.customerContactEmail = text(contacts[0]?.email) || text(row.contactEmail);
    }
  }

  if (snapshot.undertakingUnitId) {
    const rows = await queryRowsRaw<Row>(
      `SELECT nameCn, nameEn, name, country, address, registeredAddress, taxNumber, contactPhone, contactEmail, financeEmail, paymentTermDays, signatureImage
         FROM merge_common_undertaking_units WHERE undertakingUnitId = :id LIMIT 1`,
      { id: snapshot.undertakingUnitId },
    );
    const row = rows[0];
    if (row) {
      snapshot.sellerName = text(row.nameEn) || text(row.nameCn) || text(row.name);
      snapshot.sellerCountry = text(row.country);
      snapshot.sellerAddress = text(row.registeredAddress) || text(row.address);
      // 票面 CONTACT 区的电话/邮箱优先取「联系人」里设为主联系人那条，没维护再回落到档案字段
      const contacts = await queryRowsRaw<Row>(
        `SELECT name, phone, email FROM merge_common_undertaking_unit_contacts
          WHERE undertakingUnitId = :id ORDER BY isPrimary DESC, createdAt LIMIT 1`,
        { id: snapshot.undertakingUnitId },
      );
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
export async function buildInvoicePrefill(params: { sourceType: InvoiceSourceType; sourceId?: string | null }) {
  const sourceType = params.sourceType;
  const sourceId = text(params.sourceId);
  const prefill = emptyPrefill(sourceType, sourceId);
  let lines: InvoiceLineInput[] = [];

  if (sourceType === "cloud_row" && sourceId) {
    const rows = await queryRowsRaw<Row>(
      `SELECT id, period, account, customer, customerId, undertakingUnitId, invoicePayeeUndertakingUnitId, invoicePayerCustomerId,
              invoiceCurrency, invoiceNetAmount, invoiceTaxRate, invoiceTaxAmount, invoiceTotalAmount, invoiceDate, collectionCurrency,
              customerReceivable, customerTaxRate, customerReceivableTotalAmount, customerReceivableNetAmount, customerReceivableTaxAmount
         FROM merge_cloud_rows WHERE id = :id LIMIT 1`,
      { id: sourceId },
    );
    const row = rows[0];
    if (row) {
      const net = text(row.invoiceNetAmount) || text(row.customerReceivableNetAmount) || text(row.customerReceivable);
      const tax = text(row.invoiceTaxAmount) || text(row.customerReceivableTaxAmount);
      const total = text(row.invoiceTotalAmount) || text(row.customerReceivableTotalAmount) || net;
      Object.assign(prefill, {
        sourceType,
        sourceId,
        sourceNo: text(row.period) && text(row.account) ? `${text(row.period)} · ${text(row.account)}` : text(row.period),
        period: text(row.period),
        customerId: text(row.invoicePayerCustomerId) || text(row.customerId),
        undertakingUnitId: text(row.invoicePayeeUndertakingUnitId) || text(row.undertakingUnitId),
        currency: text(row.invoiceCurrency) || text(row.collectionCurrency) || "USD",
        // 金额统一给到 2 位小数，避免弹层里出现 6864.5772 这种 4 位小数的库值
        amountExcludingTax: decimalString(net),
        // 对账行存的是小数税率（0.08），界面统一显示百分数（8）
        taxRate: percentFromStoredRate(text(row.invoiceTaxRate) || text(row.customerTaxRate)),
        taxAmount: decimalString(tax),
        amountIncludingTax: decimalString(total || net),
        invoiceDate: isoDate(row.invoiceDate),
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
              invoiceAmountExcludingTax, invoiceVatRate, invoiceAmountIncludingTax, receivableDate
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
        invoiceDate: isoDate(row.receivableDate),
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
              i.invoiceTotal, i.invoiceTaxExcludedTotal, i.invoiceTaxAmount,
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
        undertakingUnitId: text(row.contractingUnitId),
        customerId: text(row.customerId),
        currency: text(row.currency) || "USD",
        amountExcludingTax: decimalString(row.invoiceTaxExcludedTotal),
        // 集采结算发票本身就是百分数（16 = 16%），直接用
        taxRate: decimalString(row.taxRate),
        taxAmount: decimalString(row.invoiceTaxAmount),
        amountIncludingTax: decimalString(total),
        invoiceDate: isoDate(row.invoiceDate) || isoDate(row.receivableDate),
      } satisfies Partial<InvoicePrefill>);
      lines = [{
        date: periodLabel(prefill.period),
        desc: `${text(row.projectName) || text(row.projectNo)} ${periodLabel(prefill.period)}`.trim(),
        cost: decimalString(total),
      }];
    }
  }

  const parties = await resolveInvoiceParties({
    customerId: text(prefill.customerId),
    undertakingUnitId: text(prefill.undertakingUnitId),
  });
  const period = text(prefill.period) || periodOf(isoDate(prefill.invoiceDate)) ;
  const invoiceDate = text(prefill.invoiceDate) || isoDate(new Date());
  const paymentTermDays = Number(parties.paymentTermDays) > 0 ? Number(parties.paymentTermDays) : 30;
  const merged = {
    ...prefill,
    ...parties,
    period,
    invoiceDate,
    paymentTermDays,
    dueDate: addDays(invoiceDate, paymentTermDays),
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
  return { ...merged, missing };
}

type ResolvedInvoice = {
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
  const value = text(override);
  return value || fallback;
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
  const period = text(input.period) || periodOf(isoDate(input.invoiceDate));
  const invoiceDate = isoDate(input.invoiceDate) || isoDate(new Date());
  const paymentTermDays = Number(input.paymentTermDays) > 0
    ? Number(input.paymentTermDays)
    : Number(parties.paymentTermDays) > 0 ? Number(parties.paymentTermDays) : 30;
  const lines = (input.lines ?? []).map((line) => ({
    periodLabel: text(line.periodLabel) || periodLabel(period),
    description: text(line.description),
    amount: decimalString(line.amount),
    sgdRate: text(line.sgdRate),
  })).filter((line) => line.description || Number(line.amount));
  const customer = {
    ...parties,
    customerName: pick(input.customerName, parties.customerName),
    customerAddress: pick(input.customerAddress, parties.customerAddress),
    customerContact: pick(input.customerContact, parties.customerContact),
    customerContactEmail: pick(input.customerContactEmail, parties.customerContactEmail),
  };
  const bank = {
    ...parties,
    sellerName: pick(input.sellerName, parties.sellerName),
    sellerCountry: pick(input.sellerCountry, parties.sellerCountry),
    sellerAddress: pick(input.sellerAddress, parties.sellerAddress),
    sellerTelephone: pick(input.sellerTelephone, parties.sellerTelephone),
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
    const exists = await queryRowsRaw<Row>(`SELECT id FROM ${INVOICE_TABLE} WHERE invoiceNo = :invoiceNo LIMIT 1`, { invoiceNo });
    if (exists.length) throw new Error(`发票号 ${invoiceNo} 已被占用，请换一个`);
  }
  return {
    invoiceNo,
    template: input.template === "sgd" ? "sgd" : "normal",
    customer,
    bank,
    invoiceDate,
    dueDate: isoDate(input.dueDate) || addDays(invoiceDate, paymentTermDays),
    paymentTermDays,
    currency: pick(input.currency, "USD").toUpperCase(),
    amountExcludingTax: decimalString(input.amountExcludingTax),
    taxRate: decimalString(input.taxRate),
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
    customerContactValue: resolved.customer.customerContact,
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
export async function saveInvoice(input: InvoiceDraftInput, actor: InvoiceActor = {}) {
  const source: InvoiceSource = input.sourceType === "manual" || input.file ? "external" : "generated";
  const resolved = await resolveInvoice(input, true);
  const id = randomUUID();

  let bytes: Buffer | null = null;
  let fileName = "";
  let fileType = "";
  if (source === "generated") {
    const renderInput = toRenderInput(resolved);
    const missing = collectMissingInvoiceFields(renderInput, resolved.template);
    if (missing.length) throw new Error(`开票资料不完整：${missing.join("、")}`);
    const html = renderInvoice(renderInput, { template: resolved.template });
    bytes = Buffer.from(html, "utf8");
    fileName = `${resolved.invoiceNo}.html`;
    // 用不带参数的 MIME：readFile 解析 data URL 时只认 `type;base64,`，写成 "text/html; charset=utf-8" 会解析失败
    fileType = "text/html";
  } else {
    if (!input.file?.bytes?.length) throw new Error("请先上传外部发票文件");
    bytes = input.file.bytes;
    fileName = input.file.fileName || `${resolved.invoiceNo}.pdf`;
    fileType = input.file.fileType || "application/octet-stream";
  }

  const period = text(input.period) || periodOf(resolved.invoiceDate);
  const stored = await storeFile({
    context: { system: "invoice", period, invoiceNo: resolved.invoiceNo },
    attachmentId: id,
    fileName,
    fileType,
    bytes,
    isInvoice: true,
  });

  await executeRaw(
    `INSERT INTO ${INVOICE_TABLE}
      (id, invoiceNo, source, template, status, sourceType, sourceId, sourceNo, period,
       customerId, customerName, customerAddress, customerTaxNumber, customerContact, customerContactEmail,
       undertakingUnitId, sellerName, sellerCountry, sellerAddress, sellerTelephone, sellerFinanceEmail,
       bankAccountId, bankAccountName, bankName, bankAccount, bankSwiftCode, bankCode, bankAddress,
       currency, exchangeRate, amountExcludingTax, taxRate, taxAmount, amountIncludingTax, sgdRate, sgdTotal, gstRegNo,
       invoiceDate, dueDate, paymentTermDays, comment, authImg,
       fileName, fileType, fileSize, fileProvider, storageKey, fileContent,
       issuedAt, issuedByUserId, issuedByName, remark, createdByUserId, createdByName, updatedByUserId, updatedByName)
     VALUES
      (:id, :invoiceNo, :source, :template, 'issued', :sourceType, :sourceId, :sourceNo, :period,
       :customerId, :customerName, :customerAddress, :customerTaxNumber, :customerContact, :customerContactEmail,
       :undertakingUnitId, :sellerName, :sellerCountry, :sellerAddress, :sellerTelephone, :sellerFinanceEmail,
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
      sourceType: text(input.sourceType) || "manual",
      sourceId: text(input.sourceId) || null,
      sourceNo: text(input.sourceNo) || null,
      period: period || null,
      customerId: resolved.customer.customerId || null,
      customerName: resolved.customer.customerName,
      customerAddress: resolved.customer.customerAddress,
      customerTaxNumber: resolved.customer.customerTaxNumber,
      customerContact: resolved.customer.customerContact,
      customerContactEmail: resolved.customer.customerContactEmail,
      undertakingUnitId: resolved.bank.undertakingUnitId || null,
      sellerName: resolved.bank.sellerName,
      sellerCountry: resolved.bank.sellerCountry,
      sellerAddress: resolved.bank.sellerAddress,
      sellerTelephone: resolved.bank.sellerTelephone,
      sellerFinanceEmail: resolved.bank.sellerFinanceEmail,
      bankAccountId: resolved.bank.bankAccountId || null,
      bankAccountName: resolved.bank.bankAccountName,
      bankName: resolved.bank.bankName,
      bankAccount: resolved.bank.bankAccount,
      bankSwiftCode: resolved.bank.bankSwiftCode,
      bankCode: resolved.bank.bankCode,
      bankAddress: resolved.bank.bankAddress,
      currency: resolved.currency,
      exchangeRate: decimalString(input.exchangeRate) || null,
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

  await backfillSource({ id, sourceType: text(input.sourceType), sourceId: text(input.sourceId), resolved, source });
  await attachInvoiceFileToSource({
    invoiceId: id,
    sourceType: text(input.sourceType),
    sourceId: text(input.sourceId),
    actor,
    fileName: stored.fileName,
    fileType,
    fileSize: bytes.length,
    provider: stored.provider,
    storageKey: stored.storageKey,
    dataUrl: stored.provider === "db" ? toDataUrl(fileType, bytes) : null,
  });
  return getInvoice(id);
}

/**
 * 把票面挂到来源单据的开票附件位。
 *
 * 目前只有华为云对账行有「客户开票附件」这个位置（`merge_cloud_attachments`，ownerType='invoice'）；
 * 月账单对账单等没有附件表，前端用开票记录里的文件直接查看。
 * OBS 上的文件按**引用**挂（复制 storageKey），不重复上传字节；数据库回落时复制 data URL。
 */
async function attachInvoiceFileToSource(params: {
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
}) {
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
    });
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

/** 回填来源账单：票号/币种/金额/开票日期 + 状态置已开票。 */
async function backfillSource(params: {
  id: string;
  sourceType: string;
  sourceId: string;
  resolved: ResolvedInvoice;
  source: InvoiceSource;
}) {
  const { id, sourceType, sourceId, resolved, source } = params;
  if (!sourceId) return;
  if (sourceType === "cloud_row") {
    await executeRaw(
      `UPDATE merge_cloud_rows
          SET invoiceNo = :invoiceNo, invoiceCurrency = :currency, invoiceNetAmount = :net,
              invoiceTaxRate = :taxRate, invoiceTaxAmount = :taxAmount, invoiceTotalAmount = :total,
              invoiceDate = :invoiceDate, collectionInvoice = 'issued', updatedAt = NOW()
        WHERE id = :sourceId`,
      {
        invoiceNo: resolved.invoiceNo, currency: resolved.currency,
        // 对账行存小数税率，开票界面是百分数，写回时换算
        net: resolved.amountExcludingTax || null, taxRate: rateToFraction(resolved.taxRate) || null,
        taxAmount: resolved.taxAmount || null, total: resolved.amountIncludingTax || null,
        invoiceDate: resolved.invoiceDate, sourceId,
      },
    );
    return;
  }
  if (sourceType === "billing_statement") {
    await executeRaw(
      `UPDATE merge_power_billingstatementsnapshots
          SET invoiceId = :id, invoiceNo = :invoiceNo, invoiceCurrency = :currency, invoiceNetAmount = :net,
              invoiceTaxRate = :taxRate, invoiceTaxAmount = :taxAmount, invoiceTotalAmount = :total,
              invoiceDate = :invoiceDate, invoiceStatus = 'issued', updatedAt = NOW()
        WHERE snapshotNo = :sourceId`,
      {
        id, invoiceNo: resolved.invoiceNo, currency: resolved.currency,
        net: resolved.amountExcludingTax || null, taxRate: rateToFraction(resolved.taxRate) || null,
        taxAmount: resolved.taxAmount || null, total: resolved.amountIncludingTax || null,
        invoiceDate: resolved.invoiceDate, sourceId,
      },
    );
    return;
  }
  if (sourceType === "service_fee") {
    await executeRaw(
      `UPDATE merge_power_servicefeesnapshots
          SET invoiceNo = :invoiceNo, invoiceCurrency = :currency, invoiceReceivingUnitId = :unitId,
              invoicePayerCustomerId = :customerId, invoiceAmountExcludingTax = :net, invoiceVatRate = :taxRate,
              invoiceAmountIncludingTax = :total, receivableDate = :invoiceDate, invoiceStatus = '已开票', updatedAt = NOW()
        WHERE snapshotNo = :sourceId`,
      {
        invoiceNo: resolved.invoiceNo, currency: resolved.currency,
        unitId: resolved.bank.undertakingUnitId || null, customerId: resolved.customer.customerId || null,
        net: resolved.amountExcludingTax || null, taxRate: rateToFraction(resolved.taxRate) || null,
        total: resolved.amountIncludingTax || null, invoiceDate: resolved.invoiceDate || null, sourceId,
      },
    );
    return;
  }
  if (sourceType === "settlement_invoice") {
    await executeRaw(
      `UPDATE merge_po_settlement_invoices
          SET invoiceNo = :invoiceNo, invoiceDate = :invoiceDate, isInvoiced = 1, updatedAt = NOW()
        WHERE id = :sourceId`,
      { invoiceNo: resolved.invoiceNo, invoiceDate: resolved.invoiceDate || null, sourceId },
    );
    return;
  }
  // 外部发票允许先存着待关联，暂不回填。
  if (source === "external") return;
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

  await executeRaw(
    `UPDATE ${INVOICE_TABLE} SET status = 'void', voidedAt = NOW(), voidReason = :reason,
       updatedByUserId = :actorId, updatedByName = :actorName WHERE id = :id`,
    { id, reason: text(reason) || null, actorId: text(actor.userId) || null, actorName: text(actor.name) || null },
  );
  const sourceType = text(row.sourceType);
  const sourceId = text(row.sourceId);
  // 摘掉挂在来源单据开票附件位上的那张票面（票面本身仍在开票记录里，作废后仍可下载审计）
  const attachmentId = text((await queryRowsRaw<Row>(
    `SELECT sourceAttachmentId FROM ${INVOICE_TABLE} WHERE id = :id`,
    { id },
  ))[0]?.sourceAttachmentId);
  if (attachmentId) {
    if (sourceType === "billing_statement" && sourceId) {
      const { deleteStatementAttachment } = await import("./billing-statement-attachment-service");
      await deleteStatementAttachment(sourceId, attachmentId).catch(() => undefined);
    } else {
      await executeRaw(
        `DELETE FROM merge_cloud_attachments WHERE id = :attachmentId AND ownerType = 'invoice'`,
        { attachmentId },
      );
    }
    await executeRaw(`UPDATE ${INVOICE_TABLE} SET sourceAttachmentId = NULL WHERE id = :id`, { id });
  }
  if (sourceType === "cloud_row" && sourceId) {
    await executeRaw(
      // 只在票号确实是这张作废票时清空，避免把人工填的其它票号擦掉
      `UPDATE merge_cloud_rows
          SET invoiceNo = IF(invoiceNo = :invoiceNo, NULL, invoiceNo), collectionInvoice = 'not_issued', updatedAt = NOW()
        WHERE id = :sourceId`,
      { sourceId, invoiceNo: text(row.invoiceNo) },
    );
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
  return getInvoice(id);
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
export async function regenerateInvoiceFile(id: string, actor: InvoiceActor = {}) {
  const invoice = await getInvoice(id);
  if (!invoice) throw new Error("开票记录不存在");
  if (text(invoice.source) === "external") throw new Error("外部上传的发票没有票面可重新生成");
  const items = (invoice.items ?? []) as Row[];
  const resolved = await resolveInvoice({
    template: text(invoice.template) === "sgd" ? "sgd" : "normal",
    invoiceNo: text(invoice.invoiceNo),
    customerId: text(invoice.customerId),
    undertakingUnitId: text(invoice.undertakingUnitId),
    bankAccountId: text(invoice.bankAccountId),
    invoiceDate: isoDate(invoice.invoiceDate),
    dueDate: isoDate(invoice.dueDate),
    paymentTermDays: Number(invoice.paymentTermDays) || 30,
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
    customerName: text(invoice.customerName),
    customerAddress: text(invoice.customerAddress),
    customerContact: text(invoice.customerContact),
    customerContactEmail: text(invoice.customerContactEmail),
    sellerName: text(invoice.sellerName),
    sellerCountry: text(invoice.sellerCountry),
    sellerAddress: text(invoice.sellerAddress),
    sellerTelephone: text(invoice.sellerTelephone),
    sellerFinanceEmail: text(invoice.sellerFinanceEmail),
  }, false);
  const renderInput = toRenderInput(resolved);
  const missing = collectMissingInvoiceFields(renderInput, resolved.template);
  if (missing.length) throw new Error(`开票资料不完整：${missing.join("、")}`);
  const html = renderInvoice(renderInput, { template: resolved.template });
  const bytes = Buffer.from(html, "utf8");
  const stored = await storeFile({
    context: { system: "invoice", period: text(invoice.period), invoiceNo: text(invoice.invoiceNo) },
    attachmentId: id,
    fileName: `${text(invoice.invoiceNo)}.html`,
    fileType: "text/html",
    bytes,
    isInvoice: true,
  });
  const previousKey = text(invoice.storageKey);
  await executeRaw(
    `UPDATE ${INVOICE_TABLE} SET fileName = :fileName, fileType = :fileType, fileSize = :fileSize,
       fileProvider = :fileProvider, storageKey = :storageKey, fileContent = :fileContent,
       updatedByUserId = :actorId, updatedByName = :actorName WHERE id = :id`,
    {
      id, fileName: stored.fileName, fileType: "text/html", fileSize: bytes.length,
      fileProvider: stored.provider, storageKey: stored.storageKey,
      fileContent: stored.provider === "db" ? toDataUrl("text/html; charset=utf-8", bytes) : null,
      actorId: text(actor.userId) || null, actorName: text(actor.name) || null,
    },
  );
  if (previousKey && previousKey !== stored.storageKey) {
    await deleteFileObject({ storageProvider: invoice.fileProvider, storageKey: previousKey }).catch(() => undefined);
  }
  return getInvoice(id);
}

export async function deleteInvoice(id: string) {
  const invoice = await getInvoice(id);
  if (!invoice) throw new Error("开票记录不存在");
  if (text(invoice.status) === "issued") throw new Error("已开票的记录请先作废再删除");
  await executeRaw(`DELETE FROM ${INVOICE_ITEM_TABLE} WHERE invoiceId = :id`, { id });
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
