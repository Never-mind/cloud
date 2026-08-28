import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import { execute, queryRows, type Row } from "./db";
import type { OperationActor } from "./operation-actor";

export const SETTLEMENT_CURRENCIES = ["CNY", "USD", "MXN"] as const;
export type SettlementCurrency = (typeof SETTLEMENT_CURRENCIES)[number];
export const SETTLEMENT_PRICE_TYPES = ["tax_included", "tax_excluded"] as const;
export type SettlementPriceType = (typeof SETTLEMENT_PRICE_TYPES)[number];
export const SETTLEMENT_STATUSES = ["purchasing", "procurement_completed", "accepting", "closed"] as const;
export type SettlementProjectStatus = (typeof SETTLEMENT_STATUSES)[number];
export type SettlementExpenseType = "first_mile_freight" | "customs_fee" | "labor_fee" | "equipment_service_fee" | "other";
export type SettlementInvoiceType = "income" | "cost";

export type SettlementProject = {
  id: string;
  projectNo: string;
  quotationId: string;
  quotationNo: string;
  customerId: string | null;
  customerName: string | null;
  contractingUnitId: string | null;
  contractingUnitName: string | null;
  remark: string | null;
  exchangeRateUsd: number;
  exchangeRateMxn: number;
  quotedPurchaseCostUsd: number;
  purchasedCostUsd: number;
  quotedSalesRevenueUsd: number;
  receivedRevenueTaxIncludedUsd: number;
  receivedRevenueUsd: number;
  grossProfitUsd: number;
  status: SettlementProjectStatus;
  procurementCompletedAt: string | null;
  acceptanceStartedAt: string | null;
  closedAt: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  updatedByUserId: string | null;
  updatedByName: string | null;
  confirmedByUserId: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SettlementItem = {
  id: string;
  projectId: string;
  quotationItemId: string;
  productId: string | null;
  productCode: string;
  productName: string;
  brand: string | null;
  plannedQty: number;
  purchaseQty: number;
  purchaseUnitPrice: number;
  currency: SettlementCurrency;
  priceType: SettlementPriceType;
  taxRate: number;
  quotedWarehouseCostUsd: number;
  quotedSalesRevenueUsd: number;
  purchasedCostUsd: number;
  invoiceNo: string | null;
  ordered: boolean;
  orderedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SettlementExpense = {
  id: string;
  projectId: string;
  type: SettlementExpenseType;
  description: string | null;
  amount: number;
  currency: SettlementCurrency;
  priceType: SettlementPriceType;
  taxRate: number;
  costUsd: number;
  invoiceNo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SettlementSale = {
  id: string;
  projectId: string;
  description: string | null;
  amount: number;
  currency: SettlementCurrency;
  priceType: SettlementPriceType;
  taxRate: number;
  receivedRevenueTaxIncludedUsd: number;
  receivedRevenueUsd: number;
  invoiceNo: string | null;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SettlementInvoice = {
  id: string;
  projectId: string;
  type: SettlementInvoiceType;
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
  currency: SettlementCurrency;
  exchangeRate: number;
  usdAmount: number;
  isPaid: boolean;
  attachments?: SettlementAttachment[];
  createdAt: string;
  updatedAt: string;
};

export type SettlementAttachment = {
  id: string;
  projectId: string;
  invoiceId: string | null;
  fileName: string;
  fileType: string | null;
  fileSize: number;
  dataUrl?: string;
  description: string | null;
  uploadedByUserId: string | null;
  uploadedByName: string | null;
  uploadedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type SettlementDetail = {
  project: SettlementProject;
  items: SettlementItem[];
  unpurchasedItems: SettlementItem[];
  purchasedItems: SettlementItem[];
  expenses: SettlementExpense[];
  sales: SettlementSale[];
  invoices: SettlementInvoice[];
  attachments: SettlementAttachment[];
};

export type SettlementPage<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type SettlementInput = {
  amount?: unknown;
  currency?: unknown;
  priceType?: unknown;
  taxRate?: unknown;
};

type ProjectQuotation = {
  id: string;
  quotationNo: string;
  customerId: string | null;
  customerName: string | null;
  contractingUnitId: string | null;
  contractingUnitName: string | null;
  sourcePoId: string | null;
  remark: string | null;
  currency: string | null;
  status: string | null;
};

type ProjectQuotationItem = {
  id: string;
  productCode: string;
  productName: string;
  productMasterId: string | null;
  productModelId: string | null;
  productSpecId: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  currency: string | null;
  brand: string | null;
  purchaseCurrency: string | null;
  purchaseUnitPrice: number | null;
};

const PROJECT_COLUMNS = [
  "projectNo", "remark", "exchangeRateUsd", "exchangeRateMxn",
] as const;

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function validCurrency(value: unknown): value is SettlementCurrency {
  return SETTLEMENT_CURRENCIES.includes(String(value) as SettlementCurrency);
}

function validPriceType(value: unknown): value is SettlementPriceType {
  return SETTLEMENT_PRICE_TYPES.includes(String(value) as SettlementPriceType);
}

export function normalizeSettlementStatus(value: unknown): SettlementProjectStatus {
  if (value === "open") return "purchasing";
  if (value === "completed") return "closed";
  return SETTLEMENT_STATUSES.includes(String(value) as SettlementProjectStatus)
    ? value as SettlementProjectStatus
    : "purchasing";
}

export function settlementStatusLabel(value: unknown) {
  return {
    purchasing: "采购中",
    procurement_completed: "采购完成",
    accepting: "验收中",
    closed: "已完结",
  }[normalizeSettlementStatus(value)];
}

function pageParams(params: URLSearchParams) {
  const pageSize = Math.min(100, Math.max(1, Math.floor(numeric(params.get("pageSize"), 20))));
  const requestedPage = Math.max(1, Math.floor(numeric(params.get("page"), 1)));
  return { pageSize, requestedPage };
}

function convertToUsd(amount: number, currency: string, project: Pick<SettlementProject, "exchangeRateUsd" | "exchangeRateMxn">) {
  if (currency === "USD") return amount;
  if (currency === "MXN") return project.exchangeRateMxn ? amount * project.exchangeRateMxn : 0;
  return project.exchangeRateUsd ? amount / project.exchangeRateUsd : 0;
}

export function settlementAmounts(input: SettlementInput, project: Pick<SettlementProject, "exchangeRateUsd" | "exchangeRateMxn">) {
  const amount = numeric(input.amount);
  const taxRate = numeric(input.taxRate) / 100;
  const included = String(input.priceType) === "tax_included" ? amount : amount * (1 + taxRate);
  const excluded = String(input.priceType) === "tax_included" ? (1 + taxRate ? amount / (1 + taxRate) : 0) : amount;
  return {
    taxIncludedUsd: round(convertToUsd(included, text(input.currency) || "USD", project)),
    taxExcludedUsd: round(convertToUsd(excluded, text(input.currency) || "USD", project)),
  };
}

async function getProject(projectId: string) {
  const rows = await queryRows<SettlementProject>(
    `SELECT p.*, COALESCE(NULLIF(p.customerName, ''), c.name) AS customerName,
            COALESCE(NULLIF(p.contractingUnitName, ''), u.name) AS contractingUnitName
       FROM po_settlement_projects p
       LEFT JOIN common_customers c ON c.customerId = p.customerId
       LEFT JOIN common_undertaking_units u ON u.undertakingUnitId = p.contractingUnitId
      WHERE p.id = :id LIMIT 1`,
    { id: projectId },
  );
  const project = rows[0];
  if (!project) throw new Error("项目结算不存在");
  return normalizeProject(project);
}

function normalizeProject(project: SettlementProject): SettlementProject {
  return {
    ...project,
    status: normalizeSettlementStatus(project.status),
    exchangeRateUsd: numeric(project.exchangeRateUsd, 1),
    exchangeRateMxn: numeric(project.exchangeRateMxn, 1),
    quotedPurchaseCostUsd: numeric(project.quotedPurchaseCostUsd),
    purchasedCostUsd: numeric(project.purchasedCostUsd),
    quotedSalesRevenueUsd: numeric(project.quotedSalesRevenueUsd),
    receivedRevenueTaxIncludedUsd: numeric(project.receivedRevenueTaxIncludedUsd),
    receivedRevenueUsd: numeric(project.receivedRevenueUsd),
    grossProfitUsd: numeric(project.grossProfitUsd),
  };
}

function normalizeItem(item: SettlementItem): SettlementItem {
  return {
    ...item,
    ordered: Boolean(item.ordered),
    plannedQty: numeric(item.plannedQty),
    purchaseQty: numeric(item.purchaseQty),
    purchaseUnitPrice: numeric(item.purchaseUnitPrice),
    taxRate: numeric(item.taxRate),
    quotedWarehouseCostUsd: numeric(item.quotedWarehouseCostUsd),
    quotedSalesRevenueUsd: numeric(item.quotedSalesRevenueUsd),
    purchasedCostUsd: numeric(item.purchasedCostUsd),
  };
}

function normalizeExpense(expense: SettlementExpense): SettlementExpense {
  return { ...expense, amount: numeric(expense.amount), taxRate: numeric(expense.taxRate), costUsd: numeric(expense.costUsd) };
}

function normalizeSale(sale: SettlementSale): SettlementSale {
  return {
    ...sale,
    amount: numeric(sale.amount),
    taxRate: numeric(sale.taxRate),
    receivedRevenueTaxIncludedUsd: numeric(sale.receivedRevenueTaxIncludedUsd),
    receivedRevenueUsd: numeric(sale.receivedRevenueUsd),
  };
}

function normalizeInvoice(invoice: SettlementInvoice): SettlementInvoice {
  return {
    ...invoice,
    isPaid: Boolean(invoice.isPaid),
    invoiceTotal: numeric(invoice.invoiceTotal),
    invoiceTaxExcludedTotal: numeric(invoice.invoiceTaxExcludedTotal),
    taxRate: numeric(invoice.taxRate),
    invoiceTaxAmount: numeric(invoice.invoiceTaxAmount),
    exchangeRate: numeric(invoice.exchangeRate, 1),
    usdAmount: numeric(invoice.usdAmount),
  };
}

function normalizeAttachment(attachment: SettlementAttachment): SettlementAttachment {
  return { ...attachment, fileSize: numeric(attachment.fileSize) };
}

function actorFields(actor: OperationActor | null, mode: "create" | "update" | "confirm") {
  if (!actor) return {};
  return mode === "create"
    ? { createdByUserId: actor.userId, createdByName: actor.displayName, updatedByUserId: actor.userId, updatedByName: actor.displayName }
    : mode === "confirm"
      ? { confirmedByUserId: actor.userId, confirmedByName: actor.displayName, confirmedAt: new Date() }
      : { updatedByUserId: actor.userId, updatedByName: actor.displayName };
}

async function updateProjectActor(projectId: string, actor: OperationActor | null) {
  if (!actor) return;
  await execute(
    `UPDATE po_settlement_projects
        SET updatedByUserId = :userId, updatedByName = :userName
      WHERE id = :id`,
    { id: projectId, userId: actor.userId, userName: actor.displayName },
  );
}

async function recalculateProject(projectId: string, actor: OperationActor | null = null) {
  const project = await getProject(projectId);
  const items = (await queryRows<SettlementItem>("SELECT * FROM po_settlement_items WHERE projectId = :projectId ORDER BY lineNo, createdAt, id", { projectId })).map(normalizeItem);
  const expenses = (await queryRows<SettlementExpense>("SELECT * FROM po_settlement_expenses WHERE projectId = :projectId ORDER BY createdAt, id", { projectId })).map(normalizeExpense);
  const sales = (await queryRows<SettlementSale>("SELECT * FROM po_settlement_sales WHERE projectId = :projectId ORDER BY receivedAt, createdAt, id", { projectId })).map(normalizeSale);

  for (const item of items) {
    const amounts = settlementAmounts({ amount: item.purchaseQty * item.purchaseUnitPrice, currency: item.currency, priceType: item.priceType, taxRate: item.taxRate }, project);
    if (round(item.purchasedCostUsd) !== amounts.taxExcludedUsd) {
      await execute("UPDATE po_settlement_items SET purchasedCostUsd = :value WHERE id = :id", { id: item.id, value: amounts.taxExcludedUsd });
      item.purchasedCostUsd = amounts.taxExcludedUsd;
    }
  }
  for (const expense of expenses) {
    const costUsd = settlementAmounts(expense, project).taxExcludedUsd;
    if (round(expense.costUsd) !== costUsd) {
      await execute("UPDATE po_settlement_expenses SET costUsd = :value WHERE id = :id", { id: expense.id, value: costUsd });
      expense.costUsd = costUsd;
    }
  }
  for (const sale of sales) {
    const amounts = settlementAmounts(sale, project);
    if (round(sale.receivedRevenueTaxIncludedUsd) !== amounts.taxIncludedUsd || round(sale.receivedRevenueUsd) !== amounts.taxExcludedUsd) {
      await execute(
        `UPDATE po_settlement_sales
            SET receivedRevenueTaxIncludedUsd = :includedUsd, receivedRevenueUsd = :excludedUsd
          WHERE id = :id`,
        { id: sale.id, includedUsd: amounts.taxIncludedUsd, excludedUsd: amounts.taxExcludedUsd },
      );
      sale.receivedRevenueTaxIncludedUsd = amounts.taxIncludedUsd;
      sale.receivedRevenueUsd = amounts.taxExcludedUsd;
    }
  }

  const quotedPurchaseCostUsd = round(items.reduce((sum, item) => sum + item.quotedWarehouseCostUsd, 0));
  const purchasedCostUsd = round(items.filter((item) => item.ordered).reduce((sum, item) => sum + item.purchasedCostUsd, 0) + expenses.reduce((sum, item) => sum + item.costUsd, 0));
  const quotedSalesRevenueUsd = round(items.reduce((sum, item) => sum + item.quotedSalesRevenueUsd, 0));
  const receivedRevenueTaxIncludedUsd = round(sales.reduce((sum, item) => sum + item.receivedRevenueTaxIncludedUsd, 0));
  const receivedRevenueUsd = round(sales.reduce((sum, item) => sum + item.receivedRevenueUsd, 0));
  const status = project.status === "accepting" || project.status === "closed"
    ? project.status
    : items.length > 0 && items.every((item) => item.ordered) ? "procurement_completed" : "purchasing";
  const statusFields: Row = { status };
  if (status === "procurement_completed" && !project.procurementCompletedAt) statusFields.procurementCompletedAt = new Date();
  await execute(
    `UPDATE po_settlement_projects
        SET quotedPurchaseCostUsd = :quotedPurchaseCostUsd,
            purchasedCostUsd = :purchasedCostUsd,
            quotedSalesRevenueUsd = :quotedSalesRevenueUsd,
            receivedRevenueTaxIncludedUsd = :receivedRevenueTaxIncludedUsd,
            receivedRevenueUsd = :receivedRevenueUsd,
            grossProfitUsd = :grossProfitUsd,
            status = :status
            ${statusFields.procurementCompletedAt ? ", procurementCompletedAt = :procurementCompletedAt" : ""}
            ${actor ? ", updatedByUserId = :updatedByUserId, updatedByName = :updatedByName" : ""}
      WHERE id = :id`,
    {
      id: projectId,
      quotedPurchaseCostUsd,
      purchasedCostUsd,
      quotedSalesRevenueUsd,
      receivedRevenueTaxIncludedUsd,
      receivedRevenueUsd,
      grossProfitUsd: round(receivedRevenueUsd - purchasedCostUsd),
      ...statusFields,
      ...(actor ? { updatedByUserId: actor.userId, updatedByName: actor.displayName } : {}),
    },
  );
  return getProject(projectId);
}

async function detailRows(projectId: string) {
  const [items, expenses, sales, invoices, attachments] = await Promise.all([
    queryRows<SettlementItem>("SELECT * FROM po_settlement_items WHERE projectId = :projectId ORDER BY createdAt, id", { projectId }),
    queryRows<SettlementExpense>("SELECT * FROM po_settlement_expenses WHERE projectId = :projectId ORDER BY createdAt, id", { projectId }),
    queryRows<SettlementSale>("SELECT * FROM po_settlement_sales WHERE projectId = :projectId ORDER BY receivedAt, createdAt, id", { projectId }),
    queryRows<SettlementInvoice>("SELECT * FROM po_settlement_invoices WHERE projectId = :projectId ORDER BY invoiceDate, createdAt, id", { projectId }),
    queryRows<SettlementAttachment>("SELECT id, projectId, invoiceId, fileName, fileType, fileSize, description, uploadedByUserId, uploadedByName, uploadedAt, createdAt, updatedAt FROM po_settlement_attachments WHERE projectId = :projectId ORDER BY uploadedAt DESC, id DESC", { projectId }),
  ]);
  const normalizedAttachments = attachments.map(normalizeAttachment);
  const attachmentsByInvoice = new Map<string, SettlementAttachment[]>();
  for (const attachment of normalizedAttachments) {
    if (!attachment.invoiceId) continue;
    const list = attachmentsByInvoice.get(attachment.invoiceId) ?? [];
    list.push(attachment);
    attachmentsByInvoice.set(attachment.invoiceId, list);
  }
  return {
    items: items.map(normalizeItem),
    expenses: expenses.map(normalizeExpense),
    sales: sales.map(normalizeSale),
    invoices: invoices.map((invoice) => ({ ...normalizeInvoice(invoice), attachments: attachmentsByInvoice.get(invoice.id) ?? [] })),
    attachments: normalizedAttachments,
  };
}

export async function getSettlementProjectDetail(projectId: string): Promise<SettlementDetail> {
  const project = await recalculateProject(projectId);
  const rows = await detailRows(projectId);
  return {
    project,
    ...rows,
    unpurchasedItems: rows.items.filter((item) => !item.ordered),
    purchasedItems: rows.items.filter((item) => item.ordered),
  };
}

export async function listSettlementProjects(params: URLSearchParams) {
  const { pageSize, requestedPage } = pageParams(params);
  const conditions = ["1 = 1"];
  const values: Row = {};
  const keyword = text(params.get("keyword"));
  const status = text(params.get("status"));
  if (keyword) {
    conditions.push("(p.projectNo LIKE :keyword OR p.quotationNo LIKE :keyword OR p.customerName LIKE :keyword OR c.name LIKE :keyword OR p.remark LIKE :keyword)");
    values.keyword = `%${keyword}%`;
  }
  if (SETTLEMENT_STATUSES.includes(status as SettlementProjectStatus)) {
    conditions.push("p.status = :status");
    values.status = status;
  }
  const where = `WHERE ${conditions.join(" AND ")}`;
  const [{ total }] = await queryRows<{ total: number }>(
    `SELECT COUNT(*) AS total FROM po_settlement_projects p LEFT JOIN common_customers c ON c.customerId = p.customerId ${where}`,
    values,
  );
  const normalizedTotal = numeric(total);
  const totalPages = Math.max(1, Math.ceil(normalizedTotal / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rows = await queryRows<SettlementProject>(
    `SELECT p.*, COALESCE(NULLIF(p.customerName, ''), c.name) AS customerName,
            COALESCE(NULLIF(p.contractingUnitName, ''), u.name) AS contractingUnitName
       FROM po_settlement_projects p
       LEFT JOIN common_customers c ON c.customerId = p.customerId
       LEFT JOIN common_undertaking_units u ON u.undertakingUnitId = p.contractingUnitId
      ${where} ORDER BY p.createdAt DESC, p.id DESC LIMIT :limit OFFSET :offset`,
    { ...values, limit: pageSize, offset: (page - 1) * pageSize },
  );
  return { items: rows.map(normalizeProject), total: normalizedTotal, page, pageSize, totalPages } satisfies SettlementPage<SettlementProject>;
}

export async function ensureSettlementProjectForQuotation(quotationId: string, actor: OperationActor | null = null) {
  const quotations = await queryRows<ProjectQuotation>(
    `SELECT q.id, q.quotationNo, q.customerId, c.name AS customerName,
            q.contractingUnitId, u.name AS contractingUnitName, q.sourcePoId, q.remark, q.currency, q.status
       FROM po_quotations q
       LEFT JOIN common_customers c ON c.customerId = q.customerId
       LEFT JOIN common_undertaking_units u ON u.undertakingUnitId = q.contractingUnitId
      WHERE q.id = :id OR q.quotationNo = :id LIMIT 1`,
    { id: quotationId },
  );
  const quotation = quotations[0];
  if (!quotation) throw new Error("报价单不存在");
  if (quotation.status !== "confirmed") throw new Error("只有已确认报价单才能生成项目结算");
  const existing = await queryRows<SettlementProject>("SELECT * FROM po_settlement_projects WHERE quotationId = :quotationId LIMIT 1", { quotationId: quotation.id });
  if (existing[0]) return recalculateProject(existing[0].id);

  const items = await queryRows<ProjectQuotationItem>(
    `SELECT qi.*, pm.brand,
            ps.purchaseCurrency, COALESCE(NULLIF(ps.suggestedPurchaseUnitPrice, 0), NULLIF(pm2.suggestedPurchaseUnitPrice, 0), 0) AS purchaseUnitPrice
       FROM po_quotation_items qi
       LEFT JOIN po_product_models pm ON pm.id = qi.productModelId
       LEFT JOIN po_product_specifications ps ON ps.id = qi.productSpecId
       LEFT JOIN po_product_models pm2 ON pm2.id = qi.productModelId
      WHERE qi.quotationId = :quotationId ORDER BY qi.lineNo, qi.id`,
    { quotationId: quotation.id },
  );
  const projectNoPrefix = `PJ-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  const existingNumbers = await queryRows<{ projectNo: string }>("SELECT projectNo FROM po_settlement_projects WHERE projectNo LIKE :prefix", { prefix: `${projectNoPrefix}-%` });
  const used = new Set(existingNumbers.map((row) => row.projectNo));
  let sequence = 1;
  while (used.has(`${projectNoPrefix}-${String(sequence).padStart(4, "0")}`)) sequence += 1;
  const projectNo = `${projectNoPrefix}-${String(sequence).padStart(4, "0")}`;
  const projectId = randomUUID();
  const audit = actorFields(actor, "create");
  await execute(
    `INSERT INTO po_settlement_projects
      (id, projectNo, quotationId, quotationNo, customerId, customerName, contractingUnitId, contractingUnitName, remark,
       exchangeRateUsd, exchangeRateMxn, quotedPurchaseCostUsd, quotedSalesRevenueUsd, status,
       createdByUserId, createdByName, updatedByUserId, updatedByName)
     VALUES
      (:id, :projectNo, :quotationId, :quotationNo, :customerId, :customerName, :contractingUnitId, :contractingUnitName, :remark,
       1, 1, 0, 0, 'purchasing', :createdByUserId, :createdByName, :updatedByUserId, :updatedByName)`,
    {
      id: projectId,
      projectNo,
      quotationId: quotation.id,
      quotationNo: quotation.quotationNo,
      customerId: quotation.customerId,
      customerName: quotation.customerName,
      contractingUnitId: quotation.contractingUnitId,
      contractingUnitName: quotation.contractingUnitName,
      remark: quotation.remark,
      createdByUserId: audit.createdByUserId ?? null,
      createdByName: audit.createdByName ?? null,
      updatedByUserId: audit.updatedByUserId ?? null,
      updatedByName: audit.updatedByName ?? null,
    },
  );
  for (const item of items) {
    const quantity = numeric(item.quantity);
    const quotationAmounts = settlementAmounts({ amount: numeric(item.amount) || quantity * numeric(item.unitPrice), currency: item.currency || quotation.currency || "USD", priceType: "tax_excluded", taxRate: 0 }, { exchangeRateUsd: 1, exchangeRateMxn: 1 });
    const costAmounts = settlementAmounts({ amount: quantity * numeric(item.purchaseUnitPrice), currency: item.purchaseCurrency || "USD", priceType: "tax_excluded", taxRate: 0 }, { exchangeRateUsd: 1, exchangeRateMxn: 1 });
    await execute(
      `INSERT INTO po_settlement_items
        (id, projectId, quotationItemId, lineNo, productId, productCode, productName, brand, plannedQty, purchaseQty, purchaseUnitPrice,
         currency, priceType, taxRate, quotedWarehouseCostUsd, quotedSalesRevenueUsd, purchasedCostUsd, ordered)
       VALUES
        (:id, :projectId, :quotationItemId, :lineNo, :productId, :productCode, :productName, :brand, :plannedQty, 0, :purchaseUnitPrice,
         :currency, 'tax_excluded', 0, :quotedWarehouseCostUsd, :quotedSalesRevenueUsd, 0, 0)`,
      {
        id: randomUUID(), projectId, quotationItemId: item.id, lineNo: items.indexOf(item) + 1, productId: item.productSpecId || item.productModelId || item.productMasterId,
        productCode: item.productCode, productName: item.productName, brand: item.brand, plannedQty: quantity,
        purchaseUnitPrice: numeric(item.purchaseUnitPrice), currency: validCurrency(item.purchaseCurrency) ? item.purchaseCurrency : "USD",
        quotedWarehouseCostUsd: costAmounts.taxExcludedUsd, quotedSalesRevenueUsd: quotationAmounts.taxExcludedUsd,
      },
    );
  }
  return recalculateProject(projectId);
}

function assertEditable(project: SettlementProject) {
  if (project.status === "closed") throw new Error("已完结项目不能修改");
}

function assertPurchasingEditable(project: SettlementProject) {
  assertEditable(project);
  if (project.status !== "purchasing" && project.status !== "procurement_completed") throw new Error("只有采购阶段可以修改采购明细");
}

function inputValues(input: SettlementInput, defaults: { currency: SettlementCurrency; priceType: SettlementPriceType }) {
  const currency = validCurrency(input.currency) ? input.currency : defaults.currency;
  const priceType = validPriceType(input.priceType) ? input.priceType : defaults.priceType;
  const taxRate = Math.max(0, numeric(input.taxRate));
  return { amount: numeric(input.amount), currency, priceType, taxRate };
}

async function touchAndRecalculate(projectId: string, actor: OperationActor | null) {
  await updateProjectActor(projectId, actor);
  return getSettlementProjectDetail(projectId);
}

export async function orderSettlementItems(projectId: string, inputItems: Array<Record<string, unknown>>, actor: OperationActor | null) {
  const project = await getProject(projectId);
  assertPurchasingEditable(project);
  const items = await queryRows<SettlementItem>("SELECT * FROM po_settlement_items WHERE projectId = :projectId", { projectId });
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const input of inputItems) {
    const itemId = text(input.itemId);
    const item = byId.get(itemId);
    if (!item || Boolean(item.ordered)) continue;
    const values = inputValues(input, { currency: "USD", priceType: "tax_excluded" });
    if (values.amount < 0 || numeric(input.purchaseQty) <= 0) throw new Error("采购数量和单价必须有效");
    const amounts = settlementAmounts({ amount: Math.trunc(numeric(input.purchaseQty)) * values.amount, currency: values.currency, priceType: values.priceType, taxRate: values.taxRate }, project);
    await execute(
      `UPDATE po_settlement_items
          SET purchaseQty = :purchaseQty, purchaseUnitPrice = :purchaseUnitPrice, currency = :currency,
              priceType = :priceType, taxRate = :taxRate, purchasedCostUsd = :purchasedCostUsd,
              invoiceNo = :invoiceNo, ordered = 1, orderedAt = CURRENT_TIMESTAMP
        WHERE id = :id AND projectId = :projectId`,
      { id: itemId, projectId, purchaseQty: Math.trunc(numeric(input.purchaseQty)), purchaseUnitPrice: values.amount, currency: values.currency, priceType: values.priceType, taxRate: values.taxRate, purchasedCostUsd: amounts.taxExcludedUsd, invoiceNo: text(input.invoiceNo) || null },
    );
  }
  return touchAndRecalculate(projectId, actor);
}

export async function updateSettlementItem(projectId: string, itemId: string, input: Record<string, unknown>, actor: OperationActor | null) {
  const project = await getProject(projectId);
  assertPurchasingEditable(project);
  const item = (await queryRows<SettlementItem>("SELECT * FROM po_settlement_items WHERE id = :id AND projectId = :projectId LIMIT 1", { id: itemId, projectId }))[0];
  if (!item || !Boolean(item.ordered)) throw new Error("已采购明细不存在");
  const values = inputValues(input, { currency: validCurrency(item.currency) ? item.currency : "USD", priceType: validPriceType(item.priceType) ? item.priceType : "tax_excluded" });
  if (numeric(input.purchaseQty) <= 0 || values.amount < 0) throw new Error("采购数量和单价必须有效");
  const amounts = settlementAmounts({ amount: Math.trunc(numeric(input.purchaseQty)) * values.amount, currency: values.currency, priceType: values.priceType, taxRate: values.taxRate }, project);
  await execute(
    `UPDATE po_settlement_items SET purchaseQty=:purchaseQty, purchaseUnitPrice=:purchaseUnitPrice, currency=:currency,
      priceType=:priceType, taxRate=:taxRate, purchasedCostUsd=:purchasedCostUsd, invoiceNo=:invoiceNo
      WHERE id=:id AND projectId=:projectId`,
    { id: itemId, projectId, purchaseQty: Math.trunc(numeric(input.purchaseQty)), purchaseUnitPrice: values.amount, currency: values.currency, priceType: values.priceType, taxRate: values.taxRate, purchasedCostUsd: amounts.taxExcludedUsd, invoiceNo: text(input.invoiceNo) || null },
  );
  return touchAndRecalculate(projectId, actor);
}

export async function returnSettlementItem(projectId: string, itemId: string, actor: OperationActor | null) {
  const project = await getProject(projectId);
  assertPurchasingEditable(project);
  await execute("UPDATE po_settlement_items SET ordered=0, orderedAt=NULL, purchasedCostUsd=0 WHERE id=:id AND projectId=:projectId", { id: itemId, projectId });
  return touchAndRecalculate(projectId, actor);
}

export async function addSettlementExpense(projectId: string, input: Record<string, unknown>, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  const values = inputValues(input, { currency: "CNY", priceType: "tax_included" });
  const type = text(input.type) || "other";
  const amounts = settlementAmounts(values, project);
  await execute(
    `INSERT INTO po_settlement_expenses (id,projectId,type,description,amount,currency,priceType,taxRate,costUsd,invoiceNo)
     VALUES (:id,:projectId,:type,:description,:amount,:currency,:priceType,:taxRate,:costUsd,:invoiceNo)`,
    { id: randomUUID(), projectId, type, description: text(input.description) || null, ...values, costUsd: amounts.taxExcludedUsd, invoiceNo: text(input.invoiceNo) || null },
  );
  return touchAndRecalculate(projectId, actor);
}

export async function updateSettlementExpense(projectId: string, expenseId: string, input: Record<string, unknown>, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  const expense = (await queryRows<SettlementExpense>("SELECT * FROM po_settlement_expenses WHERE id=:id AND projectId=:projectId LIMIT 1", { id: expenseId, projectId }))[0];
  if (!expense) throw new Error("成本费用不存在");
  const values = inputValues(input, { currency: validCurrency(expense.currency) ? expense.currency : "CNY", priceType: validPriceType(expense.priceType) ? expense.priceType : "tax_included" });
  const amounts = settlementAmounts(values, project);
  await execute(
    `UPDATE po_settlement_expenses SET type=:type,description=:description,amount=:amount,currency=:currency,priceType=:priceType,taxRate=:taxRate,costUsd=:costUsd,invoiceNo=:invoiceNo WHERE id=:id AND projectId=:projectId`,
    { id: expenseId, projectId, type: text(input.type) || "other", description: text(input.description) || null, ...values, costUsd: amounts.taxExcludedUsd, invoiceNo: text(input.invoiceNo) || null },
  );
  return touchAndRecalculate(projectId, actor);
}

export async function deleteSettlementExpense(projectId: string, expenseId: string, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  await execute("DELETE FROM po_settlement_expenses WHERE id=:id AND projectId=:projectId", { id: expenseId, projectId });
  return touchAndRecalculate(projectId, actor);
}

export async function addSettlementSale(projectId: string, input: Record<string, unknown>, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  const values = inputValues(input, { currency: "USD", priceType: "tax_included" });
  const amounts = settlementAmounts(values, project);
  await execute(
    `INSERT INTO po_settlement_sales (id,projectId,description,amount,currency,priceType,taxRate,receivedRevenueTaxIncludedUsd,receivedRevenueUsd,invoiceNo,receivedAt)
     VALUES (:id,:projectId,:description,:amount,:currency,:priceType,:taxRate,:includedUsd,:excludedUsd,:invoiceNo,:receivedAt)`,
    { id: randomUUID(), projectId, description: text(input.description) || null, ...values, includedUsd: amounts.taxIncludedUsd, excludedUsd: amounts.taxExcludedUsd, invoiceNo: text(input.invoiceNo) || null, receivedAt: text(input.receivedAt) || new Date().toISOString().slice(0, 10) },
  );
  return touchAndRecalculate(projectId, actor);
}

export async function updateSettlementSale(projectId: string, saleId: string, input: Record<string, unknown>, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  const sale = (await queryRows<SettlementSale>("SELECT * FROM po_settlement_sales WHERE id=:id AND projectId=:projectId LIMIT 1", { id: saleId, projectId }))[0];
  if (!sale) throw new Error("销售收入不存在");
  const values = inputValues(input, { currency: validCurrency(sale.currency) ? sale.currency : "USD", priceType: validPriceType(sale.priceType) ? sale.priceType : "tax_included" });
  const amounts = settlementAmounts(values, project);
  await execute(
    `UPDATE po_settlement_sales SET description=:description,amount=:amount,currency=:currency,priceType=:priceType,taxRate=:taxRate,receivedRevenueTaxIncludedUsd=:includedUsd,receivedRevenueUsd=:excludedUsd,invoiceNo=:invoiceNo,receivedAt=:receivedAt WHERE id=:id AND projectId=:projectId`,
    { id: saleId, projectId, description: text(input.description) || null, ...values, includedUsd: amounts.taxIncludedUsd, excludedUsd: amounts.taxExcludedUsd, invoiceNo: text(input.invoiceNo) || null, receivedAt: text(input.receivedAt) || null },
  );
  return touchAndRecalculate(projectId, actor);
}

export async function deleteSettlementSale(projectId: string, saleId: string, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  await execute("DELETE FROM po_settlement_sales WHERE id=:id AND projectId=:projectId", { id: saleId, projectId });
  return touchAndRecalculate(projectId, actor);
}

function invoiceValues(projectId: string, input: Record<string, unknown>) {
  const type: SettlementInvoiceType = text(input.type) === "income" ? "income" : "cost";
  const currency: SettlementCurrency = validCurrency(input.currency) ? input.currency : "CNY";
  const invoiceTotal = numeric(input.invoiceTotal);
  const taxRate = Math.max(0, numeric(input.taxRate));
  const invoiceTaxExcludedTotal = round(invoiceTotal / (1 + taxRate / 100 || 1));
  const invoiceTaxAmount = round(invoiceTotal - invoiceTaxExcludedTotal);
  const exchangeRate = numeric(input.exchangeRate, 1) || 1;
  const usdAmount = round((type === "cost" ? -1 : 1) * invoiceTaxExcludedTotal / exchangeRate);
  return { type, accountPeriod: text(input.accountPeriod) || null, accountingDate: text(input.accountingDate) || null, companyEntity: text(input.companyEntity) || null, invoiceEntity: text(input.invoiceEntity) || null, invoiceDate: text(input.invoiceDate) || null, invoiceNo: text(input.invoiceNo) || null, invoiceTotal, invoiceTaxExcludedTotal, taxRate, invoiceTaxAmount, currency, exchangeRate, usdAmount, isPaid: input.isPaid ? 1 : 0 };
}

export async function addSettlementInvoice(projectId: string, input: Record<string, unknown>, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  const values = invoiceValues(projectId, input);
  await execute(
    `INSERT INTO po_settlement_invoices (id,projectId,type,accountPeriod,accountingDate,companyEntity,invoiceEntity,invoiceDate,invoiceNo,invoiceTotal,invoiceTaxExcludedTotal,taxRate,invoiceTaxAmount,currency,exchangeRate,usdAmount,isPaid)
     VALUES (:id,:projectId,:type,:accountPeriod,:accountingDate,:companyEntity,:invoiceEntity,:invoiceDate,:invoiceNo,:invoiceTotal,:invoiceTaxExcludedTotal,:taxRate,:invoiceTaxAmount,:currency,:exchangeRate,:usdAmount,:isPaid)`,
    { id: randomUUID(), projectId, ...values },
  );
  return touchAndRecalculate(projectId, actor);
}

export async function updateSettlementInvoice(projectId: string, invoiceId: string, input: Record<string, unknown>, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  const invoice = (await queryRows<SettlementInvoice>("SELECT * FROM po_settlement_invoices WHERE id=:id AND projectId=:projectId LIMIT 1", { id: invoiceId, projectId }))[0];
  if (!invoice) throw new Error("发票不存在");
  const values = invoiceValues(projectId, input);
  await execute(
    `UPDATE po_settlement_invoices SET type=:type,accountPeriod=:accountPeriod,accountingDate=:accountingDate,companyEntity=:companyEntity,invoiceEntity=:invoiceEntity,invoiceDate=:invoiceDate,invoiceNo=:invoiceNo,invoiceTotal=:invoiceTotal,invoiceTaxExcludedTotal=:invoiceTaxExcludedTotal,taxRate=:taxRate,invoiceTaxAmount=:invoiceTaxAmount,currency=:currency,exchangeRate=:exchangeRate,usdAmount=:usdAmount,isPaid=:isPaid WHERE id=:id AND projectId=:projectId`,
    { id: invoiceId, projectId, ...values },
  );
  return touchAndRecalculate(projectId, actor);
}

export async function deleteSettlementInvoice(projectId: string, invoiceId: string, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  await execute("DELETE FROM po_settlement_attachments WHERE invoiceId=:invoiceId AND projectId=:projectId", { invoiceId, projectId });
  await execute("DELETE FROM po_settlement_invoices WHERE id=:id AND projectId=:projectId", { id: invoiceId, projectId });
  return touchAndRecalculate(projectId, actor);
}

export async function addSettlementAttachment(projectId: string, input: Record<string, unknown>, actor: OperationActor | null, invoiceId: string | null = null) {
  const project = await getProject(projectId); assertEditable(project);
  const fileName = text(input.fileName);
  const dataUrl = text(input.dataUrl);
  if (!fileName || !dataUrl) throw new Error("附件文件不能为空");
  if (invoiceId) {
    const invoice = (await queryRows("SELECT id FROM po_settlement_invoices WHERE id=:invoiceId AND projectId=:projectId LIMIT 1", { invoiceId, projectId }))[0];
    if (!invoice) throw new Error("发票不存在");
  }
  await execute(
    `INSERT INTO po_settlement_attachments (id,projectId,invoiceId,fileName,fileType,fileSize,dataUrl,description,uploadedByUserId,uploadedByName)
     VALUES (:id,:projectId,:invoiceId,:fileName,:fileType,:fileSize,:dataUrl,:description,:userId,:userName)`,
    { id: randomUUID(), projectId, invoiceId, fileName, fileType: text(input.fileType) || null, fileSize: Math.max(0, numeric(input.fileSize)), dataUrl, description: text(input.description) || null, userId: actor?.userId ?? null, userName: actor?.displayName ?? null },
  );
  return touchAndRecalculate(projectId, actor);
}

export async function deleteSettlementAttachment(projectId: string, attachmentId: string, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  await execute("DELETE FROM po_settlement_attachments WHERE id=:id AND projectId=:projectId", { id: attachmentId, projectId });
  return touchAndRecalculate(projectId, actor);
}

export async function findSettlementAttachment(projectId: string, invoiceId: string | null, attachmentId: string) {
  const rows = await queryRows<SettlementAttachment>("SELECT * FROM po_settlement_attachments WHERE id=:id AND projectId=:projectId LIMIT 1", { id: attachmentId, projectId });
  const attachment = rows[0];
  if (!attachment || (invoiceId && attachment.invoiceId !== invoiceId)) throw new Error("附件不存在");
  return { ...normalizeAttachment(attachment), dataUrl: attachment.dataUrl || "" };
}

export async function changeSettlementStatus(projectId: string, nextStatus: SettlementProjectStatus, actor: OperationActor | null) {
  const project = await getProject(projectId);
  const status = normalizeSettlementStatus(nextStatus);
  if (status === project.status) return getSettlementProjectDetail(projectId);
  if (project.status === "purchasing") {
    if (status !== "procurement_completed") throw new Error("当前状态只能进入采购完成");
    const detail = await getSettlementProjectDetail(projectId);
    if (!detail.items.length || detail.items.some((item) => !item.ordered)) throw new Error("所有采购明细完成后才能进入采购完成");
  } else if (project.status === "procurement_completed") {
    if (status !== "accepting") throw new Error("当前状态只能进入验收中");
  } else if (project.status === "accepting") {
    if (status !== "closed") throw new Error("当前状态只能进入已完结");
  } else {
    throw new Error("项目结算状态流转不合法");
  }
  const fields: Row = { id: projectId, status };
  const assignments = ["status = :status"];
  if (status === "procurement_completed") { assignments.push("procurementCompletedAt = CURRENT_TIMESTAMP"); }
  if (status === "accepting") { assignments.push("acceptanceStartedAt = CURRENT_TIMESTAMP"); }
  if (status === "closed") { assignments.push("closedAt = CURRENT_TIMESTAMP"); Object.assign(fields, actorFields(actor, "confirm")); assignments.push("confirmedByUserId=:confirmedByUserId", "confirmedByName=:confirmedByName", "confirmedAt=:confirmedAt"); }
  if (actor) assignments.push("updatedByUserId=:updatedByUserId", "updatedByName=:updatedByName");
  await execute(`UPDATE po_settlement_projects SET ${assignments.join(", ")} WHERE id=:id`, { ...fields, ...(actor ? { updatedByUserId: actor.userId, updatedByName: actor.displayName } : {}) });
  return getSettlementProjectDetail(projectId);
}

export async function deleteSettlementProject(projectId: string, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  await execute("DELETE FROM po_settlement_attachments WHERE projectId=:projectId", { projectId });
  await execute("DELETE FROM po_settlement_invoices WHERE projectId=:projectId", { projectId });
  await execute("DELETE FROM po_settlement_sales WHERE projectId=:projectId", { projectId });
  await execute("DELETE FROM po_settlement_expenses WHERE projectId=:projectId", { projectId });
  await execute("DELETE FROM po_settlement_items WHERE projectId=:projectId", { projectId });
  await execute("DELETE FROM po_settlement_projects WHERE id=:projectId", { projectId });
  void actor;
}

function projectExportRow(project: SettlementProject) {
  return {
    项目单号: project.projectNo,
    报价单号: project.quotationNo,
    客户: project.customerName || "",
    承接单位: project.contractingUnitName || "",
    项目名称: project.remark || "",
    "采购成本（未税 USD）": project.quotedPurchaseCostUsd,
    "已采购成本（未税 USD）": project.purchasedCostUsd,
    "销售收入（未税 USD）": project.quotedSalesRevenueUsd,
    "已销售收入（含税 USD）": project.receivedRevenueTaxIncludedUsd,
    "已销售收入（未税 USD）": project.receivedRevenueUsd,
    "项目毛利（未税 USD）": project.grossProfitUsd,
    状态: settlementStatusLabel(project.status),
    创建人: project.createdByName || "",
    修改人: project.updatedByName || "",
    确认人: project.confirmedByName || "",
  };
}

function workbookBuffer(sheets: Record<string, Array<Record<string, unknown>>>) {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export async function exportSettlementProjects(params: URLSearchParams) {
  const result = await listSettlementProjects(new URLSearchParams({ ...Object.fromEntries(params.entries()), page: "1", pageSize: "100" }));
  return workbookBuffer({ 项目结算: result.items.map(projectExportRow) });
}

export async function exportSettlementProject(projectId: string) {
  const detail = await getSettlementProjectDetail(projectId);
  return workbookBuffer({
    项目结算: [projectExportRow(detail.project)],
    采购明细: detail.items.map((item) => ({ 产品编码: item.productCode, 产品名称: item.productName, 品牌: item.brand || "", 计划数量: item.plannedQty, 采购数量: item.purchaseQty, 采购单价: item.purchaseUnitPrice, 币种: item.currency, 价格方式: item.priceType === "tax_included" ? "含税价" : "未税价", 税率: item.taxRate, "已采购成本（未税 USD）": item.purchasedCostUsd, 发票号: item.invoiceNo || "" })),
    其他成本费用: detail.expenses.map((item) => ({ 类型: item.type, 说明: item.description || "", 金额: item.amount, 币种: item.currency, 价格方式: item.priceType === "tax_included" ? "含税价" : "未税价", 税率: item.taxRate, "成本（未税 USD）": item.costUsd, 发票号: item.invoiceNo || "" })),
    销售收入: detail.sales.map((item) => ({ 说明: item.description || "", 金额: item.amount, 币种: item.currency, 价格方式: item.priceType === "tax_included" ? "含税价" : "未税价", 税率: item.taxRate, "收入（含税 USD）": item.receivedRevenueTaxIncludedUsd, "收入（未税 USD）": item.receivedRevenueUsd, 收款日期: item.receivedAt || "", 发票号: item.invoiceNo || "" })),
    发票管理: detail.invoices.map((item) => ({ 类型: item.type === "income" ? "收入" : "成本", 账期: item.accountPeriod || "", 发票号: item.invoiceNo || "", 发票总额: item.invoiceTotal, 发票未税金额: item.invoiceTaxExcludedTotal, 税率: item.taxRate, 发票税额: item.invoiceTaxAmount, 币种: item.currency, 汇率: item.exchangeRate, "USD金额": item.usdAmount, 是否支付: item.isPaid ? "是" : "否" })),
    附件管理: detail.attachments.map((item) => ({ 文件名: item.fileName, 类型: item.fileType || "", 大小: item.fileSize, 说明: item.description || "", 上传人: item.uploadedByName || "", 上传时间: item.uploadedAt })),
  });
}

export const settlementProjectWritableColumns = PROJECT_COLUMNS;
