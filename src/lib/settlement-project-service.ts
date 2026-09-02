import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import { execute, queryRows, type Row } from "./db";
import { normalizeDateOnlyValue } from "./date-only";
import type { OperationActor } from "./operation-actor";
import { appendTableInFilter, getTableSort, listSqlFilterOptions } from "./table-query";

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
  projectName: string | null;
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
  companyEntityId: string | null;
  invoiceEntityId: string | null;
  invoiceEntityType: "supplier" | "customer" | null;
  invoiceDate: string | null;
  invoiceNo: string | null;
  invoiceTotal: number;
  invoiceTaxExcludedTotal: number;
  taxRate: number;
  invoiceTaxAmount: number;
  currency: SettlementCurrency;
  exchangeRate: number;
  usdAmount: number;
  receivableDate: string | null;
  isPaid: boolean;
  isInvoiced: boolean;
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
  purchaseUnitPrice?: unknown;
  currency?: unknown;
  priceType?: unknown;
  taxRate?: unknown;
};

type ProjectQuotation = {
  id: string;
  quotationNo: string;
  projectName: string | null;
  customerId: string | null;
  customerName: string | null;
  contractingUnitId: string | null;
  contractingUnitName: string | null;
  sourcePoId: string | null;
  remark: string | null;
  currency: string | null;
  exchangeRateUsd: number | null;
  exchangeRateMxn: number | null;
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
  ddpTotalUsd: number | null;
  revenueUsd: number | null;
};

const PROJECT_COLUMNS = [
  "projectNo", "projectName", "remark", "exchangeRateUsd", "exchangeRateMxn",
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
            COALESCE(NULLIF(u.shortName, ''), NULLIF(u.entityName, ''), NULLIF(u.name, ''), NULLIF(p.contractingUnitName, ''), p.contractingUnitId, '') AS contractingUnitName
       FROM merge_po_settlement_projects p
       LEFT JOIN merge_common_customers c ON c.customerId = p.customerId
       LEFT JOIN merge_common_undertaking_units u
         ON u.undertakingUnitId = p.contractingUnitId
         OR u.undertakingUnitCode = p.contractingUnitId
         OR u.entityCode = p.contractingUnitId
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
    isInvoiced: Boolean(invoice.isInvoiced),
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
    `UPDATE merge_po_settlement_projects
        SET updatedByUserId = :userId, updatedByName = :userName
      WHERE id = :id`,
    { id: projectId, userId: actor.userId, userName: actor.displayName },
  );
}

async function recalculateProject(projectId: string, actor: OperationActor | null = null) {
  const project = await getProject(projectId);
  const quotationRows = await queryRows<Pick<ProjectQuotation, "exchangeRateUsd" | "exchangeRateMxn">>(
    "SELECT exchangeRateUsd, exchangeRateMxn FROM merge_po_quotations WHERE id = :quotationId LIMIT 1",
    { quotationId: project.quotationId },
  );
  const quotation = quotationRows[0];
  const quotationItems = await queryRows<Pick<ProjectQuotationItem, "id" | "ddpTotalUsd" | "revenueUsd">>(
    "SELECT id, ddpTotalUsd, revenueUsd FROM merge_po_quotation_items WHERE quotationId = :quotationId",
    { quotationId: project.quotationId },
  );
  const quotationItemsById = new Map(quotationItems.map((item) => [String(item.id), item]));
  const exchangeRateUsd = quotation ? numeric(quotation.exchangeRateUsd, project.exchangeRateUsd) : project.exchangeRateUsd;
  const exchangeRateMxn = quotation ? numeric(quotation.exchangeRateMxn, project.exchangeRateMxn) : project.exchangeRateMxn;
  if (exchangeRateUsd !== project.exchangeRateUsd || exchangeRateMxn !== project.exchangeRateMxn) {
    await execute(
      "UPDATE merge_po_settlement_projects SET exchangeRateUsd=:exchangeRateUsd, exchangeRateMxn=:exchangeRateMxn WHERE id=:id",
      { id: projectId, exchangeRateUsd, exchangeRateMxn },
    );
    project.exchangeRateUsd = exchangeRateUsd;
    project.exchangeRateMxn = exchangeRateMxn;
  }
  const items = (await queryRows<SettlementItem>("SELECT * FROM merge_po_settlement_items WHERE projectId = :projectId ORDER BY lineNo, createdAt, id", { projectId })).map(normalizeItem);
  const expenses = (await queryRows<SettlementExpense>("SELECT * FROM merge_po_settlement_expenses WHERE projectId = :projectId ORDER BY createdAt, id", { projectId })).map(normalizeExpense);
  const sales = (await queryRows<SettlementSale>("SELECT * FROM merge_po_settlement_sales WHERE projectId = :projectId ORDER BY receivedAt, createdAt, id", { projectId })).map(normalizeSale);

  for (const item of items) {
    const quotationItem = quotationItemsById.get(String(item.quotationItemId));
    if (quotationItem) {
      const quotedWarehouseCostUsd = quotationItem.ddpTotalUsd === null || quotationItem.ddpTotalUsd === undefined
        ? item.quotedWarehouseCostUsd
        : round(numeric(quotationItem.ddpTotalUsd));
      const quotedSalesRevenueUsd = quotationItem.revenueUsd === null || quotationItem.revenueUsd === undefined
        ? item.quotedSalesRevenueUsd
        : round(numeric(quotationItem.revenueUsd));
      if (item.quotedWarehouseCostUsd !== quotedWarehouseCostUsd || item.quotedSalesRevenueUsd !== quotedSalesRevenueUsd) {
        await execute(
          `UPDATE merge_po_settlement_items
              SET quotedWarehouseCostUsd=:quotedWarehouseCostUsd, quotedSalesRevenueUsd=:quotedSalesRevenueUsd
            WHERE id=:id AND projectId=:projectId`,
          { id: item.id, projectId, quotedWarehouseCostUsd, quotedSalesRevenueUsd },
        );
        item.quotedWarehouseCostUsd = quotedWarehouseCostUsd;
        item.quotedSalesRevenueUsd = quotedSalesRevenueUsd;
      }
    }
    const amounts = settlementAmounts({ amount: item.purchaseQty * item.purchaseUnitPrice, currency: item.currency, priceType: item.priceType, taxRate: item.taxRate }, project);
    if (round(item.purchasedCostUsd) !== amounts.taxExcludedUsd) {
      await execute("UPDATE merge_po_settlement_items SET purchasedCostUsd = :value WHERE id = :id", { id: item.id, value: amounts.taxExcludedUsd });
      item.purchasedCostUsd = amounts.taxExcludedUsd;
    }
  }
  for (const expense of expenses) {
    const costUsd = settlementAmounts(expense, project).taxExcludedUsd;
    if (round(expense.costUsd) !== costUsd) {
      await execute("UPDATE merge_po_settlement_expenses SET costUsd = :value WHERE id = :id", { id: expense.id, value: costUsd });
      expense.costUsd = costUsd;
    }
  }
  for (const sale of sales) {
    const amounts = settlementAmounts(sale, project);
    if (round(sale.receivedRevenueTaxIncludedUsd) !== amounts.taxIncludedUsd || round(sale.receivedRevenueUsd) !== amounts.taxExcludedUsd) {
      await execute(
        `UPDATE merge_po_settlement_sales
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
    `UPDATE merge_po_settlement_projects
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
    queryRows<SettlementItem>("SELECT * FROM merge_po_settlement_items WHERE projectId = :projectId ORDER BY createdAt, id", { projectId }),
    queryRows<SettlementExpense>("SELECT * FROM merge_po_settlement_expenses WHERE projectId = :projectId ORDER BY createdAt, id", { projectId }),
    queryRows<SettlementSale>("SELECT * FROM merge_po_settlement_sales WHERE projectId = :projectId ORDER BY receivedAt, createdAt, id", { projectId }),
    queryRows<SettlementInvoice>("SELECT * FROM merge_po_settlement_invoices WHERE projectId = :projectId ORDER BY invoiceDate, createdAt, id", { projectId }),
    queryRows<SettlementAttachment>("SELECT id, projectId, invoiceId, fileName, fileType, fileSize, description, uploadedByUserId, uploadedByName, uploadedAt, createdAt, updatedAt FROM merge_po_settlement_attachments WHERE projectId = :projectId ORDER BY uploadedAt DESC, id DESC", { projectId }),
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

const quotedPurchaseCostExpression = "CASE WHEN EXISTS (SELECT 1 FROM merge_po_quotation_items quoteItemExists WHERE quoteItemExists.quotationId = p.quotationId) THEN COALESCE((SELECT SUM(quoteItem.ddpTotalUsd) FROM merge_po_quotation_items quoteItem WHERE quoteItem.quotationId = p.quotationId), 0) ELSE p.quotedPurchaseCostUsd END";
const quotedSalesRevenueExpression = "CASE WHEN EXISTS (SELECT 1 FROM merge_po_quotation_items quoteItemExists WHERE quoteItemExists.quotationId = p.quotationId) THEN COALESCE((SELECT SUM(quoteItem.revenueUsd) FROM merge_po_quotation_items quoteItem WHERE quoteItem.quotationId = p.quotationId), 0) ELSE p.quotedSalesRevenueUsd END";

const settlementListExpressions: Record<string, string> = {
  projectNo: "p.projectNo",
  quotationNo: "p.quotationNo",
  projectName: "p.projectName",
  customerName: "COALESCE(NULLIF(p.customerName, ''), c.name)",
  contractingUnitName: "COALESCE(NULLIF(u.shortName, ''), NULLIF(u.entityName, ''), NULLIF(u.name, ''), NULLIF(p.contractingUnitName, ''), p.contractingUnitId, '')",
  status: "p.status",
  quotedPurchaseCostUsd: quotedPurchaseCostExpression,
  purchasedCostUsd: "p.purchasedCostUsd",
  quotedSalesRevenueUsd: quotedSalesRevenueExpression,
  receivedRevenueTaxIncludedUsd: "p.receivedRevenueTaxIncludedUsd",
  receivedRevenueUsd: "p.receivedRevenueUsd",
  grossProfitUsd: "p.grossProfitUsd",
  createdAt: "p.createdAt",
  updatedAt: "p.updatedAt",
};

const settlementListFrom = `merge_po_settlement_projects p
  LEFT JOIN merge_common_customers c ON c.customerId = p.customerId
  LEFT JOIN merge_common_undertaking_units u
    ON u.undertakingUnitId = p.contractingUnitId
    OR u.undertakingUnitCode = p.contractingUnitId
    OR u.entityCode = p.contractingUnitId`;

function settlementListConditions(params: URLSearchParams, values: Row) {
  const conditions = ["1 = 1"];
  const keyword = text(params.get("queryKeyword") ?? params.get("keyword"));
  const status = text(params.get("status"));
  if (keyword) {
    conditions.push("(p.projectNo LIKE :keyword OR p.quotationNo LIKE :keyword OR p.projectName LIKE :keyword OR COALESCE(NULLIF(p.customerName, ''), c.name) LIKE :keyword OR COALESCE(NULLIF(u.shortName, ''), NULLIF(u.entityName, ''), NULLIF(u.name, ''), NULLIF(p.contractingUnitName, ''), p.contractingUnitId, '') LIKE :keyword OR p.remark LIKE :keyword)");
    values.keyword = `%${keyword}%`;
  }
  if (SETTLEMENT_STATUSES.includes(status as SettlementProjectStatus)) {
    conditions.push("p.status = :status");
    values.status = status;
  }
  return conditions;
}

export async function listSettlementProjectFilterOptions(params: URLSearchParams) {
  const values: Row = {};
  const field = params.get("field");
  const optionKeyword = text(params.get("keyword")).toLowerCase();
  const queryParams = new URLSearchParams(params);
  if (field === "status") queryParams.delete("keyword");
  const result = await listSqlFilterOptions({
    from: settlementListFrom,
    expressions: settlementListExpressions,
    searchParams: queryParams,
    conditions: settlementListConditions(queryParams, values),
    params: values,
  });
  return {
    options: result.options
      .map((option) => field === "status" ? { ...option, label: settlementStatusLabel(option.value) } : option)
      .filter((option) => !optionKeyword || option.value.toLowerCase().includes(optionKeyword) || String((option as { label?: string }).label ?? "").toLowerCase().includes(optionKeyword)),
  };
}

export async function listSettlementProjects(params: URLSearchParams) {
  const { pageSize, requestedPage } = pageParams(params);
  const values: Row = {};
  const conditions = settlementListConditions(params, values);
  for (const [field, expression] of Object.entries(settlementListExpressions)) {
    appendTableInFilter(conditions, values, expression, field, params);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;
  const [{ total }] = await queryRows<{ total: number }>(
    `SELECT COUNT(DISTINCT p.id) AS total FROM ${settlementListFrom} ${where}`,
    values,
  );
  const normalizedTotal = numeric(total);
  const totalPages = Math.max(1, Math.ceil(normalizedTotal / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rows = await queryRows<SettlementProject>(
    `SELECT p.*, ${quotedPurchaseCostExpression} AS quotedPurchaseCostUsd,
            ${quotedSalesRevenueExpression} AS quotedSalesRevenueUsd,
            COALESCE(NULLIF(p.customerName, ''), c.name) AS customerName,
            COALESCE(NULLIF(u.shortName, ''), NULLIF(u.entityName, ''), NULLIF(u.name, ''), NULLIF(p.contractingUnitName, ''), p.contractingUnitId, '') AS contractingUnitName
       FROM ${settlementListFrom}
      ${where} ${getTableSort(params, settlementListExpressions) || "ORDER BY p.createdAt DESC, p.id DESC"} LIMIT :limit OFFSET :offset`,
    { ...values, limit: pageSize, offset: (page - 1) * pageSize },
  );
  return { items: rows.map(normalizeProject), total: normalizedTotal, page, pageSize, totalPages } satisfies SettlementPage<SettlementProject>;
}

export async function ensureSettlementProjectForQuotation(quotationId: string, actor: OperationActor | null = null) {
  const quotations = await queryRows<ProjectQuotation>(
    `SELECT q.id, q.quotationNo, q.projectName, q.customerId, c.name AS customerName,
            q.contractingUnitId,
            COALESCE(NULLIF(u.shortName, ''), NULLIF(u.entityName, ''), NULLIF(u.name, ''), q.contractingUnitId, '') AS contractingUnitName,
            q.sourcePoId, q.remark, q.currency, q.exchangeRateUsd, q.exchangeRateMxn, q.status
       FROM merge_po_quotations q
       LEFT JOIN merge_common_customers c ON c.customerId = q.customerId
       LEFT JOIN merge_common_undertaking_units u
         ON u.undertakingUnitId = q.contractingUnitId
         OR u.undertakingUnitCode = q.contractingUnitId
         OR u.entityCode = q.contractingUnitId
      WHERE q.id = :id OR q.quotationNo = :id LIMIT 1`,
    { id: quotationId },
  );
  const quotation = quotations[0];
  if (!quotation) throw new Error("报价单不存在");
  if (quotation.status !== "confirmed") throw new Error("只有已确认报价单才能生成项目结算");
  const existing = await queryRows<SettlementProject>("SELECT * FROM merge_po_settlement_projects WHERE quotationId = :quotationId LIMIT 1", { quotationId: quotation.id });
  if (existing[0]) {
    if (!text(existing[0].projectName) && text(quotation.projectName)) {
      await execute("UPDATE merge_po_settlement_projects SET projectName = :projectName WHERE id = :id", { id: existing[0].id, projectName: quotation.projectName });
    }
    return recalculateProject(existing[0].id);
  }

  const items = await queryRows<ProjectQuotationItem>(
    `SELECT qi.*, product.brand AS brand,
            COALESCE(NULLIF(product.suggestedPurchaseUnitPrice, 0), 0) AS purchaseUnitPrice,
            CASE WHEN product.id IS NOT NULL THEN 'CNY' ELSE COALESCE(NULLIF(qi.currency, ''), 'USD') END AS purchaseCurrency
       FROM merge_po_quotation_items qi
       LEFT JOIN merge_po_product_masters product ON product.id = qi.productMasterId
      WHERE qi.quotationId = :quotationId ORDER BY qi.lineNo, qi.id`,
    { quotationId: quotation.id },
  );
  const projectNoPrefix = `PJ-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  const existingNumbers = await queryRows<{ projectNo: string }>("SELECT projectNo FROM merge_po_settlement_projects WHERE projectNo LIKE :prefix", { prefix: `${projectNoPrefix}-%` });
  const used = new Set(existingNumbers.map((row) => row.projectNo));
  let sequence = 1;
  while (used.has(`${projectNoPrefix}-${String(sequence).padStart(4, "0")}`)) sequence += 1;
  const projectNo = `${projectNoPrefix}-${String(sequence).padStart(4, "0")}`;
  const projectId = randomUUID();
  const audit = actorFields(actor, "create");
  await execute(
    `INSERT INTO merge_po_settlement_projects
      (id, projectNo, quotationId, quotationNo, projectName, customerId, customerName, contractingUnitId, contractingUnitName, remark,
       exchangeRateUsd, exchangeRateMxn, quotedPurchaseCostUsd, quotedSalesRevenueUsd, status,
       createdByUserId, createdByName, updatedByUserId, updatedByName)
     VALUES
      (:id, :projectNo, :quotationId, :quotationNo, :projectName, :customerId, :customerName, :contractingUnitId, :contractingUnitName, :remark,
        :exchangeRateUsd, :exchangeRateMxn, 0, 0, 'purchasing', :createdByUserId, :createdByName, :updatedByUserId, :updatedByName)`,
    {
      id: projectId,
      projectNo,
      quotationId: quotation.id,
      quotationNo: quotation.quotationNo,
      projectName: quotation.projectName,
      customerId: quotation.customerId,
      customerName: quotation.customerName,
      contractingUnitId: quotation.contractingUnitId,
      contractingUnitName: quotation.contractingUnitName,
      remark: quotation.remark,
      exchangeRateUsd: numeric(quotation.exchangeRateUsd) || 1,
      exchangeRateMxn: numeric(quotation.exchangeRateMxn) || 1,
      createdByUserId: audit.createdByUserId ?? null,
      createdByName: audit.createdByName ?? null,
      updatedByUserId: audit.updatedByUserId ?? null,
      updatedByName: audit.updatedByName ?? null,
    },
  );
  for (const item of items) {
    const quantity = numeric(item.quantity);
    const quotedSalesRevenueUsd = item.revenueUsd === null || item.revenueUsd === undefined
      ? numeric(item.amount) || quantity * numeric(item.unitPrice)
      : numeric(item.revenueUsd);
    const quotedWarehouseCostUsd = item.ddpTotalUsd === null || item.ddpTotalUsd === undefined
      ? settlementAmounts({ amount: quantity * numeric(item.purchaseUnitPrice), currency: item.purchaseCurrency || "USD", priceType: "tax_excluded", taxRate: 0 }, { exchangeRateUsd: numeric(quotation.exchangeRateUsd) || 1, exchangeRateMxn: numeric(quotation.exchangeRateMxn) || 1 }).taxExcludedUsd
      : numeric(item.ddpTotalUsd);
    await execute(
      `INSERT INTO merge_po_settlement_items
        (id, projectId, quotationItemId, lineNo, productId, productCode, productName, brand, plannedQty, purchaseQty, purchaseUnitPrice,
         currency, priceType, taxRate, quotedWarehouseCostUsd, quotedSalesRevenueUsd, purchasedCostUsd, ordered)
       VALUES
        (:id, :projectId, :quotationItemId, :lineNo, :productId, :productCode, :productName, :brand, :plannedQty, 0, :purchaseUnitPrice,
         :currency, 'tax_excluded', 0, :quotedWarehouseCostUsd, :quotedSalesRevenueUsd, 0, 0)`,
      {
        id: randomUUID(), projectId, quotationItemId: item.id, lineNo: items.indexOf(item) + 1, productId: item.productSpecId || item.productModelId || item.productMasterId,
        productCode: item.productCode, productName: item.productName, brand: item.brand, plannedQty: quantity,
        purchaseUnitPrice: numeric(item.purchaseUnitPrice), currency: validCurrency(item.purchaseCurrency) ? item.purchaseCurrency : "USD",
        quotedWarehouseCostUsd, quotedSalesRevenueUsd,
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
  return { amount: numeric(input.amount ?? input.purchaseUnitPrice), currency, priceType, taxRate };
}

async function touchAndRecalculate(projectId: string, actor: OperationActor | null) {
  await updateProjectActor(projectId, actor);
  return getSettlementProjectDetail(projectId);
}

export async function orderSettlementItems(projectId: string, inputItems: Array<Record<string, unknown>>, actor: OperationActor | null) {
  const project = await getProject(projectId);
  assertPurchasingEditable(project);
  const items = await queryRows<SettlementItem>("SELECT * FROM merge_po_settlement_items WHERE projectId = :projectId", { projectId });
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const input of inputItems) {
    const itemId = text(input.itemId);
    const item = byId.get(itemId);
    if (!item || Boolean(item.ordered)) continue;
    const values = inputValues(input, { currency: "USD", priceType: "tax_excluded" });
    const purchaseQty = text(input.purchaseQty) === "" ? numeric(item.plannedQty) : numeric(input.purchaseQty);
    if (values.amount < 0 || purchaseQty <= 0) throw new Error("采购数量和单价必须有效");
    const amounts = settlementAmounts({ amount: Math.trunc(purchaseQty) * values.amount, currency: values.currency, priceType: values.priceType, taxRate: values.taxRate }, project);
    await execute(
      `UPDATE merge_po_settlement_items
          SET purchaseQty = :purchaseQty, purchaseUnitPrice = :purchaseUnitPrice, currency = :currency,
              priceType = :priceType, taxRate = :taxRate, purchasedCostUsd = :purchasedCostUsd,
              invoiceNo = :invoiceNo, ordered = 1, orderedAt = CURRENT_TIMESTAMP
        WHERE id = :id AND projectId = :projectId`,
      { id: itemId, projectId, purchaseQty: Math.trunc(purchaseQty), purchaseUnitPrice: values.amount, currency: values.currency, priceType: values.priceType, taxRate: values.taxRate, purchasedCostUsd: amounts.taxExcludedUsd, invoiceNo: text(input.invoiceNo) || null },
    );
  }
  return touchAndRecalculate(projectId, actor);
}

export async function updateSettlementItem(projectId: string, itemId: string, input: Record<string, unknown>, actor: OperationActor | null) {
  const project = await getProject(projectId);
  assertPurchasingEditable(project);
  const item = (await queryRows<SettlementItem>("SELECT * FROM merge_po_settlement_items WHERE id = :id AND projectId = :projectId LIMIT 1", { id: itemId, projectId }))[0];
  if (!item || !Boolean(item.ordered)) throw new Error("已采购明细不存在");
  const values = inputValues(input, { currency: validCurrency(item.currency) ? item.currency : "USD", priceType: validPriceType(item.priceType) ? item.priceType : "tax_excluded" });
  if (numeric(input.purchaseQty) <= 0 || values.amount < 0) throw new Error("采购数量和单价必须有效");
  const amounts = settlementAmounts({ amount: Math.trunc(numeric(input.purchaseQty)) * values.amount, currency: values.currency, priceType: values.priceType, taxRate: values.taxRate }, project);
  await execute(
    `UPDATE merge_po_settlement_items SET purchaseQty=:purchaseQty, purchaseUnitPrice=:purchaseUnitPrice, currency=:currency,
      priceType=:priceType, taxRate=:taxRate, purchasedCostUsd=:purchasedCostUsd, invoiceNo=:invoiceNo
      WHERE id=:id AND projectId=:projectId`,
    { id: itemId, projectId, purchaseQty: Math.trunc(numeric(input.purchaseQty)), purchaseUnitPrice: values.amount, currency: values.currency, priceType: values.priceType, taxRate: values.taxRate, purchasedCostUsd: amounts.taxExcludedUsd, invoiceNo: text(input.invoiceNo) || null },
  );
  return touchAndRecalculate(projectId, actor);
}

export async function returnSettlementItem(projectId: string, itemId: string, actor: OperationActor | null) {
  const project = await getProject(projectId);
  assertPurchasingEditable(project);
  await execute("UPDATE merge_po_settlement_items SET ordered=0, orderedAt=NULL, purchasedCostUsd=0 WHERE id=:id AND projectId=:projectId", { id: itemId, projectId });
  return touchAndRecalculate(projectId, actor);
}

export async function addSettlementExpense(projectId: string, input: Record<string, unknown>, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  const values = inputValues(input, { currency: "CNY", priceType: "tax_included" });
  const type = text(input.type) || "other";
  const amounts = settlementAmounts(values, project);
  await execute(
    `INSERT INTO merge_po_settlement_expenses (id,projectId,type,description,amount,currency,priceType,taxRate,costUsd,invoiceNo)
     VALUES (:id,:projectId,:type,:description,:amount,:currency,:priceType,:taxRate,:costUsd,:invoiceNo)`,
    { id: randomUUID(), projectId, type, description: text(input.description) || null, ...values, costUsd: amounts.taxExcludedUsd, invoiceNo: text(input.invoiceNo) || null },
  );
  return touchAndRecalculate(projectId, actor);
}

export async function updateSettlementExpense(projectId: string, expenseId: string, input: Record<string, unknown>, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  const expense = (await queryRows<SettlementExpense>("SELECT * FROM merge_po_settlement_expenses WHERE id=:id AND projectId=:projectId LIMIT 1", { id: expenseId, projectId }))[0];
  if (!expense) throw new Error("成本费用不存在");
  const values = inputValues(input, { currency: validCurrency(expense.currency) ? expense.currency : "CNY", priceType: validPriceType(expense.priceType) ? expense.priceType : "tax_included" });
  const amounts = settlementAmounts(values, project);
  await execute(
    `UPDATE merge_po_settlement_expenses SET type=:type,description=:description,amount=:amount,currency=:currency,priceType=:priceType,taxRate=:taxRate,costUsd=:costUsd,invoiceNo=:invoiceNo WHERE id=:id AND projectId=:projectId`,
    { id: expenseId, projectId, type: text(input.type) || "other", description: text(input.description) || null, ...values, costUsd: amounts.taxExcludedUsd, invoiceNo: text(input.invoiceNo) || null },
  );
  return touchAndRecalculate(projectId, actor);
}

export async function deleteSettlementExpense(projectId: string, expenseId: string, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  await execute("DELETE FROM merge_po_settlement_expenses WHERE id=:id AND projectId=:projectId", { id: expenseId, projectId });
  return touchAndRecalculate(projectId, actor);
}

export async function addSettlementSale(projectId: string, input: Record<string, unknown>, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  const values = inputValues(input, { currency: "USD", priceType: "tax_included" });
  const amounts = settlementAmounts(values, project);
  await execute(
    `INSERT INTO merge_po_settlement_sales (id,projectId,description,amount,currency,priceType,taxRate,receivedRevenueTaxIncludedUsd,receivedRevenueUsd,invoiceNo,receivedAt)
     VALUES (:id,:projectId,:description,:amount,:currency,:priceType,:taxRate,:includedUsd,:excludedUsd,:invoiceNo,:receivedAt)`,
    { id: randomUUID(), projectId, description: text(input.description) || null, ...values, includedUsd: amounts.taxIncludedUsd, excludedUsd: amounts.taxExcludedUsd, invoiceNo: text(input.invoiceNo) || null, receivedAt: text(input.receivedAt) || new Date().toISOString().slice(0, 10) },
  );
  return touchAndRecalculate(projectId, actor);
}

export async function updateSettlementSale(projectId: string, saleId: string, input: Record<string, unknown>, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  const sale = (await queryRows<SettlementSale>("SELECT * FROM merge_po_settlement_sales WHERE id=:id AND projectId=:projectId LIMIT 1", { id: saleId, projectId }))[0];
  if (!sale) throw new Error("销售收入不存在");
  const values = inputValues(input, { currency: validCurrency(sale.currency) ? sale.currency : "USD", priceType: validPriceType(sale.priceType) ? sale.priceType : "tax_included" });
  const amounts = settlementAmounts(values, project);
  await execute(
    `UPDATE merge_po_settlement_sales SET description=:description,amount=:amount,currency=:currency,priceType=:priceType,taxRate=:taxRate,receivedRevenueTaxIncludedUsd=:includedUsd,receivedRevenueUsd=:excludedUsd,invoiceNo=:invoiceNo,receivedAt=:receivedAt WHERE id=:id AND projectId=:projectId`,
    { id: saleId, projectId, description: text(input.description) || null, ...values, includedUsd: amounts.taxIncludedUsd, excludedUsd: amounts.taxExcludedUsd, invoiceNo: text(input.invoiceNo) || null, receivedAt: text(input.receivedAt) || null },
  );
  return touchAndRecalculate(projectId, actor);
}

export async function deleteSettlementSale(projectId: string, saleId: string, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  await execute("DELETE FROM merge_po_settlement_sales WHERE id=:id AND projectId=:projectId", { id: saleId, projectId });
  return touchAndRecalculate(projectId, actor);
}

async function invoiceValues(_projectId: string, input: Record<string, unknown>) {
  const type: SettlementInvoiceType = text(input.type) === "income" ? "income" : "cost";
  const currency: SettlementCurrency = validCurrency(input.currency) ? input.currency : "CNY";
  const invoiceTotal = numeric(input.invoiceTotal);
  const taxRate = Math.max(0, numeric(input.taxRate));
  const invoiceTaxExcludedTotal = round(invoiceTotal / (1 + taxRate / 100 || 1));
  const invoiceTaxAmount = round(invoiceTotal - invoiceTaxExcludedTotal);
  const exchangeRate = numeric(input.exchangeRate, 1) || 1;
  const usdAmount = round((type === "cost" ? -1 : 1) * invoiceTaxExcludedTotal / exchangeRate);
  const invoiceEntityType = text(input.invoiceEntityType) === "supplier" || text(input.invoiceEntityType) === "customer" ? text(input.invoiceEntityType) as "supplier" | "customer" : null;
  const accountPeriod = normalizeDateOnlyValue(input.accountPeriod);
  const accountingDate = normalizeDateOnlyValue(input.accountingDate);
  const invoiceDate = normalizeDateOnlyValue(input.invoiceDate);
  const receivableDate = normalizeDateOnlyValue(input.receivableDate);
  const companyEntityId = text(input.companyEntityId) || null;
  const invoiceEntityId = text(input.invoiceEntityId) || null;
  const [companyEntityName, invoiceEntityName] = await Promise.all([
    companyEntityId ? resolveSettlementPartnerName("undertaking", companyEntityId) : null,
    invoiceEntityId ? resolveSettlementPartnerName(invoiceEntityType === "customer" ? "customer" : invoiceEntityType === "supplier" ? "supplier" : "any", invoiceEntityId) : null,
  ]);
  return { type, accountPeriod, accountingDate, companyEntity: companyEntityName || text(input.companyEntity) || null, invoiceEntity: invoiceEntityName || text(input.invoiceEntity) || null, companyEntityId, invoiceEntityId, invoiceEntityType, invoiceDate, invoiceNo: text(input.invoiceNo) || null, invoiceTotal, invoiceTaxExcludedTotal, taxRate, invoiceTaxAmount, currency, exchangeRate, usdAmount, isPaid: input.isPaid ? 1 : 0, isInvoiced: input.isInvoiced ? 1 : 0, receivableDate };
}

async function resolveSettlementPartnerName(kind: "undertaking" | "supplier" | "customer" | "any", value: string) {
  const queries: Array<Promise<Row[]>> = [];
  if (kind === "undertaking") {
    queries.push(queryRows<Row>(
      `SELECT COALESCE(NULLIF(shortName, ''), NULLIF(entityName, ''), NULLIF(name, ''), NULLIF(undertakingUnitCode, '')) AS displayName
         FROM merge_common_undertaking_units
        WHERE undertakingUnitId = :value OR undertakingUnitCode = :value OR entityCode = :value
        LIMIT 1`,
      { value },
    ));
  } else if (kind === "supplier" || kind === "any") {
    queries.push(queryRows<Row>(
      `SELECT COALESCE(NULLIF(shortName, ''), NULLIF(nameCn, ''), NULLIF(nameEn, ''), NULLIF(supplierCode, '')) AS displayName
         FROM merge_common_suppliers
        WHERE supplierId = :value OR supplierCode = :value
        LIMIT 1`,
      { value },
    ));
  }
  if (kind === "customer" || kind === "any") {
    queries.push(queryRows<Row>(
      `SELECT COALESCE(NULLIF(shortName, ''), NULLIF(nameCn, ''), NULLIF(name, ''), NULLIF(customerCode, '')) AS displayName
         FROM merge_common_customers
        WHERE customerId = :value OR customerCode = :value
        LIMIT 1`,
      { value },
    ));
  }
  for (const query of queries) {
    const row = (await query)[0];
    if (row?.displayName) return text(row.displayName);
  }
  return "";
}

export async function addSettlementInvoice(projectId: string, input: Record<string, unknown>, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  const values = await invoiceValues(projectId, input);
  await execute(
    `INSERT INTO merge_po_settlement_invoices (id,projectId,type,accountPeriod,accountingDate,companyEntity,invoiceEntity,companyEntityId,invoiceEntityId,invoiceEntityType,invoiceDate,invoiceNo,invoiceTotal,invoiceTaxExcludedTotal,taxRate,invoiceTaxAmount,currency,exchangeRate,usdAmount,isPaid,isInvoiced,receivableDate)
     VALUES (:id,:projectId,:type,:accountPeriod,:accountingDate,:companyEntity,:invoiceEntity,:companyEntityId,:invoiceEntityId,:invoiceEntityType,:invoiceDate,:invoiceNo,:invoiceTotal,:invoiceTaxExcludedTotal,:taxRate,:invoiceTaxAmount,:currency,:exchangeRate,:usdAmount,:isPaid,:isInvoiced,:receivableDate)`,
    { id: randomUUID(), projectId, ...values },
  );
  return touchAndRecalculate(projectId, actor);
}

export async function updateSettlementInvoice(projectId: string, invoiceId: string, input: Record<string, unknown>, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  const invoice = (await queryRows<SettlementInvoice>("SELECT * FROM merge_po_settlement_invoices WHERE id=:id AND projectId=:projectId LIMIT 1", { id: invoiceId, projectId }))[0];
  if (!invoice) throw new Error("发票不存在");
  const values = await invoiceValues(projectId, input);
  await execute(
    `UPDATE merge_po_settlement_invoices SET type=:type,accountPeriod=:accountPeriod,accountingDate=:accountingDate,companyEntity=:companyEntity,invoiceEntity=:invoiceEntity,companyEntityId=:companyEntityId,invoiceEntityId=:invoiceEntityId,invoiceEntityType=:invoiceEntityType,invoiceDate=:invoiceDate,invoiceNo=:invoiceNo,invoiceTotal=:invoiceTotal,invoiceTaxExcludedTotal=:invoiceTaxExcludedTotal,taxRate=:taxRate,invoiceTaxAmount=:invoiceTaxAmount,currency=:currency,exchangeRate=:exchangeRate,usdAmount=:usdAmount,isPaid=:isPaid,isInvoiced=:isInvoiced,receivableDate=:receivableDate WHERE id=:id AND projectId=:projectId`,
    { id: invoiceId, projectId, ...values },
  );
  return touchAndRecalculate(projectId, actor);
}

export async function deleteSettlementInvoice(projectId: string, invoiceId: string, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  await execute("DELETE FROM merge_po_settlement_attachments WHERE invoiceId=:invoiceId AND projectId=:projectId", { invoiceId, projectId });
  await execute("DELETE FROM merge_po_settlement_invoices WHERE id=:id AND projectId=:projectId", { id: invoiceId, projectId });
  return touchAndRecalculate(projectId, actor);
}

export async function addSettlementAttachment(projectId: string, input: Record<string, unknown>, actor: OperationActor | null, invoiceId: string | null = null) {
  const project = await getProject(projectId); assertEditable(project);
  const fileName = text(input.fileName);
  const dataUrl = text(input.dataUrl);
  if (!fileName || !dataUrl) throw new Error("附件文件不能为空");
  if (invoiceId) {
    const invoice = (await queryRows("SELECT id FROM merge_po_settlement_invoices WHERE id=:invoiceId AND projectId=:projectId LIMIT 1", { invoiceId, projectId }))[0];
    if (!invoice) throw new Error("发票不存在");
  }
  await execute(
    `INSERT INTO merge_po_settlement_attachments (id,projectId,invoiceId,fileName,fileType,fileSize,dataUrl,description,uploadedByUserId,uploadedByName)
     VALUES (:id,:projectId,:invoiceId,:fileName,:fileType,:fileSize,:dataUrl,:description,:userId,:userName)`,
    { id: randomUUID(), projectId, invoiceId, fileName, fileType: text(input.fileType) || null, fileSize: Math.max(0, numeric(input.fileSize)), dataUrl, description: text(input.description) || null, userId: actor?.userId ?? null, userName: actor?.displayName ?? null },
  );
  return touchAndRecalculate(projectId, actor);
}

export async function deleteSettlementAttachment(projectId: string, attachmentId: string, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  await execute("DELETE FROM merge_po_settlement_attachments WHERE id=:id AND projectId=:projectId", { id: attachmentId, projectId });
  return touchAndRecalculate(projectId, actor);
}

export async function findSettlementAttachment(projectId: string, invoiceId: string | null, attachmentId: string) {
  const rows = await queryRows<SettlementAttachment>("SELECT * FROM merge_po_settlement_attachments WHERE id=:id AND projectId=:projectId LIMIT 1", { id: attachmentId, projectId });
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
  await execute(`UPDATE merge_po_settlement_projects SET ${assignments.join(", ")} WHERE id=:id`, { ...fields, ...(actor ? { updatedByUserId: actor.userId, updatedByName: actor.displayName } : {}) });
  return getSettlementProjectDetail(projectId);
}

export async function deleteSettlementProject(projectId: string, actor: OperationActor | null) {
  const project = await getProject(projectId); assertEditable(project);
  await execute("DELETE FROM merge_po_settlement_attachments WHERE projectId=:projectId", { projectId });
  await execute("DELETE FROM merge_po_settlement_invoices WHERE projectId=:projectId", { projectId });
  await execute("DELETE FROM merge_po_settlement_sales WHERE projectId=:projectId", { projectId });
  await execute("DELETE FROM merge_po_settlement_expenses WHERE projectId=:projectId", { projectId });
  await execute("DELETE FROM merge_po_settlement_items WHERE projectId=:projectId", { projectId });
  await execute("DELETE FROM merge_po_settlement_projects WHERE id=:projectId", { projectId });
  void actor;
}

function projectExportRow(project: SettlementProject) {
  return {
    项目单号: project.projectNo,
    报价单号: project.quotationNo,
    客户: project.customerName || "",
    承接单位: project.contractingUnitName || "",
    项目名称: project.projectName || project.remark || "",
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
    发票管理: detail.invoices.map((item) => ({ 类型: item.type === "income" ? "收入" : "成本", 账期: item.accountPeriod || "", 发票号: item.invoiceNo || "", 发票总额: item.invoiceTotal, 发票未税金额: item.invoiceTaxExcludedTotal, 税率: item.taxRate, 发票税额: item.invoiceTaxAmount, 币种: item.currency, 汇率: item.exchangeRate, "USD金额": item.usdAmount, 是否支付: item.isPaid ? "是" : "否", 是否开票: item.isInvoiced ? "是" : "否" })),
    附件管理: detail.attachments.map((item) => ({ 文件名: item.fileName, 类型: item.fileType || "", 大小: item.fileSize, 说明: item.description || "", 上传人: item.uploadedByName || "", 上传时间: item.uploadedAt })),
  });
}

const settlementItemImportFields = [
  ["明细ID", "系统明细ID，建议保留，用于精确匹配"],
  ["产品编码", "按产品编码匹配未采购明细"],
  ["产品名称", "仅供核对，导入时以系统明细为准"],
  ["品牌", "仅供核对，导入时以系统明细为准"],
  ["报价数量（系统）", "系统报价数量，导入时不会覆盖"],
  ["采购数量", "留空时默认使用报价数量"],
  ["采购币种", "支持 CNY、USD、MXN"],
  ["采购单价", "采购单价，可为0"],
  ["价格方式", "填写未税价或含税价"],
  ["税率（%）", "采购税率百分比"],
  ["发票号", "可选"],
] as const;

function settlementItemExportRow(item: SettlementItem) {
  return {
    明细ID: item.id,
    产品编码: item.productCode,
    产品名称: item.productName,
    品牌: item.brand || "",
    "报价数量（系统）": item.plannedQty,
    采购数量: item.purchaseQty || item.plannedQty,
    采购币种: item.currency,
    采购单价: item.purchaseUnitPrice,
    价格方式: item.priceType === "tax_included" ? "含税价" : "未税价",
    "税率（%）": item.taxRate,
    发票号: item.invoiceNo || "",
  };
}

function settlementWorkbook(sheetName: string, rows: Array<Record<string, unknown>>) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = Object.keys(rows[0] ?? {}).map((label) => ({ wch: Math.max(14, label.length + 6) }));
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export async function exportUnpurchasedSettlementItems(projectId: string) {
  const detail = await getSettlementProjectDetail(projectId);
  const rows = detail.unpurchasedItems.map(settlementItemExportRow);
  return settlementWorkbook("未采购商品", rows.length ? rows : [Object.fromEntries(settlementItemImportFields.map(([label]) => [label, ""]))]);
}

export function settlementItemsTemplate() {
  const headers = Object.fromEntries(settlementItemImportFields.map(([label]) => [label, ""]));
  const notes = Object.fromEntries(settlementItemImportFields.map(([label, note]) => [label, note]));
  return settlementWorkbook("未采购商品", [headers, notes]);
}

type SettlementItemImportFailure = { rowNumber: number; primaryKey: string; error: string };

export async function importUnpurchasedSettlementItems(projectId: string, sourceRows: Array<Record<string, unknown>>, actor: OperationActor | null) {
  const project = await getProject(projectId);
  assertPurchasingEditable(project);
  const items = await queryRows<SettlementItem>(
    "SELECT * FROM merge_po_settlement_items WHERE projectId = :projectId ORDER BY lineNo, createdAt, id",
    { projectId },
  );
  const byId = new Map(items.map((item) => [item.id, item]));
  const byCode = new Map<string, SettlementItem[]>();
  for (const item of items) {
    if (!item.ordered && text(item.productCode)) byCode.set(text(item.productCode), [...(byCode.get(text(item.productCode)) ?? []), item]);
  }

  const failed: SettlementItemImportFailure[] = [];
  let success = 0;
  for (const [index, source] of sourceRows.entries()) {
    const itemId = text(source["明细ID"] ?? source.itemId ?? source.id);
    const productCode = text(source["产品编码"] ?? source.productCode);
    const primaryKey = itemId || productCode;
    try {
      if (!primaryKey) throw new Error("明细ID和产品编码至少填写一个");
      const codeMatches = productCode ? (byCode.get(productCode) ?? []) : [];
      const target = itemId ? byId.get(itemId) : codeMatches.length === 1 ? codeMatches[0] : undefined;
      if (itemId && (!target || target.projectId !== projectId)) throw new Error("未找到对应的项目结算明细");
      if (target?.ordered) throw new Error("已采购明细不能通过未采购模板导入");
      if (!target && codeMatches.length > 1) throw new Error("该产品编码对应多条未采购明细，请保留明细ID");
      if (!target) throw new Error("未找到对应的未采购明细");

      const importedQuantity = source["采购数量"] ?? source.purchaseQty;
      const purchaseQty = String(importedQuantity ?? "").trim() === "" ? numeric(target.plannedQty) : numeric(importedQuantity);
      if (purchaseQty <= 0) throw new Error("采购数量必须大于0");
      const importedCurrency = text(source["采购币种"] ?? source.currency);
      const currency = importedCurrency || (validCurrency(target.currency) ? target.currency : "USD");
      if (!validCurrency(currency)) throw new Error("采购币种只能填写CNY、USD或MXN");
      const importedPriceType = text(source["价格方式"] ?? source.priceType);
      const priceType = !importedPriceType || importedPriceType === "未税价" || importedPriceType === "tax_excluded"
        ? "tax_excluded"
        : importedPriceType === "含税价" || importedPriceType === "tax_included" ? "tax_included" : "";
      if (!priceType) throw new Error("价格方式只能填写未税价或含税价");
      const importedPrice = source["采购单价"] ?? source.purchaseUnitPrice;
      const purchaseUnitPrice = String(importedPrice ?? "").trim() === "" ? numeric(target.purchaseUnitPrice) : numeric(importedPrice);
      if (purchaseUnitPrice < 0) throw new Error("采购单价不能小于0");
      const importedTaxRate = source["税率（%）"] ?? source.taxRate;
      const taxRate = String(importedTaxRate ?? "").trim() === "" ? numeric(target.taxRate) : numeric(importedTaxRate);
      if (taxRate < 0) throw new Error("税率不能小于0");
      const invoiceNo = String(source["发票号"] ?? source.invoiceNo ?? "").trim() || target.invoiceNo || null;
      await execute(
        `UPDATE merge_po_settlement_items
            SET purchaseQty=:purchaseQty, purchaseUnitPrice=:purchaseUnitPrice, currency=:currency,
                priceType=:priceType, taxRate=:taxRate, invoiceNo=:invoiceNo
          WHERE id=:id AND projectId=:projectId AND ordered=0`,
        { id: target.id, projectId, purchaseQty: Math.trunc(purchaseQty), purchaseUnitPrice, currency, priceType, taxRate, invoiceNo },
      );
      success += 1;
    } catch (error) {
      failed.push({ rowNumber: index + 2, primaryKey, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (success) await touchAndRecalculate(projectId, actor);
  return { total: sourceRows.length, success, failed };
}

export const settlementProjectWritableColumns = PROJECT_COLUMNS;
