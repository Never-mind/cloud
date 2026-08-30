import { randomUUID } from "node:crypto";
import { execute, queryRows, type Row } from "./db";
import type { OperationActor } from "./operation-actor";
import { ensureSettlementProjectForQuotation } from "./settlement-project-service";

type CustomerPoRow = {
  id: string;
  poNo: string;
  customerId: string | null;
  currency: string | null;
};

type CustomerPoItemRow = {
  id: string;
  poId: string;
  lineNo: number;
  customerProductName: string | null;
  customerSpec: string | null;
  quantity: number | null;
  targetUnitPrice: number | null;
  currency: string | null;
  matchedProductCode: string | null;
  productMasterId: string | null;
  productModelId: string | null;
  productSpecId: string | null;
  matchStatus: string | null;
};

type QuotationRow = {
  id: string;
  quotationNo: string;
  customerId: string | null;
  contractingUnitId: string | null;
  sourcePoId: string | null;
  sourcePoNo: string | null;
  currency: string | null;
  totalAmount: number | null;
  totalProfit: number | null;
  grossMarginRate: number | null;
  status: string | null;
};

type HistoryQuotationRow = {
  productCode: string | null;
  customerPrice: number | null;
  currency: string | null;
};

type ProductCostRow = {
  productMasterId: string | null;
  productSpecId: string | null;
  purchaseUnitPrice: number | null;
};

type QuotationSummaryRow = {
  id: string;
  quotationNo: string;
  totalAmount: number | null;
  totalProfit: number | null;
};

function buildQuotationNo(poNo: string) {
  const normalized = poNo.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `QUO-${normalized}`;
}

function roundAmount(value: number) {
  return Number(value.toFixed(4));
}

export async function recalculateQuotationSummary(quotationIdOrNo: string, actor: OperationActor | null = null) {
  const quotations = await queryRows<QuotationSummaryRow>(
    `SELECT id, quotationNo, totalAmount, totalProfit
       FROM po_quotations
      WHERE id = :quotationId
         OR quotationNo = :quotationId
      LIMIT 1`,
    { quotationId: quotationIdOrNo },
  );
  const quotation = quotations[0];
  if (!quotation) throw new Error("报价单不存在");

  const [summary] = await queryRows<{ totalAmount: number | null; totalProfit: number | null }>(
    `SELECT
       COALESCE(SUM(COALESCE(item.amount, COALESCE(item.quantity, 0) * COALESCE(item.unitPrice, 0))), 0) AS totalAmount,
       COALESCE(SUM((COALESCE(item.unitPrice, 0) - COALESCE(cost.purchaseUnitPrice, 0)) * COALESCE(item.quantity, 0)), 0) AS totalProfit
     FROM po_quotation_items item
     LEFT JOIN (
       SELECT
         product.id AS productMasterId,
         NULL AS productSpecId,
         product.suggestedPurchaseUnitPrice AS purchaseUnitPrice
       FROM po_product_masters product
       WHERE product.status = 'active'
       UNION ALL
       SELECT
         master.id AS productMasterId,
         specification.id AS productSpecId,
         COALESCE(NULLIF(specification.suggestedPurchaseUnitPrice, 0), NULLIF(model.suggestedPurchaseUnitPrice, 0), 0) AS purchaseUnitPrice
       FROM po_product_specifications specification
       INNER JOIN po_product_models model ON model.id = specification.modelId
       WHERE specification.status = 'active'
         AND model.status = 'active'
     ) cost ON (cost.productMasterId = item.productMasterId AND cost.productSpecId IS NULL)
          OR cost.productSpecId = item.productSpecId
     WHERE item.quotationId = :quotationId`,
    { quotationId: quotation.id },
  );

  const totalAmount = roundAmount(Number(summary?.totalAmount ?? 0));
  const totalProfit = roundAmount(Number(summary?.totalProfit ?? 0));
  const grossMarginRate = totalAmount ? roundAmount(totalProfit / totalAmount) : 0;
  const actorFields = actor ? {
    updatedByUserId: actor.userId,
    updatedByName: actor.displayName,
  } : {};

  await execute(
    `UPDATE po_quotations
        SET totalAmount = :totalAmount,
            totalProfit = :totalProfit,
            grossMarginRate = :grossMarginRate
            ${actor ? ", updatedByUserId = :updatedByUserId, updatedByName = :updatedByName" : ""}
      WHERE id = :id`,
    {
      id: quotation.id,
      totalAmount,
      totalProfit,
      grossMarginRate,
      ...actorFields,
    },
  );

  return {
    quotationId: quotation.id,
    quotationNo: quotation.quotationNo,
    totalAmount,
    totalProfit,
    grossMarginRate,
  };
}

export async function createQuotationFromCustomerPo(poId: string, actor: OperationActor | null = null) {
  const pos = await queryRows<CustomerPoRow>(
    `SELECT id, poNo, customerId, currency
       FROM po_customer_pos
      WHERE id = :poId
         OR poNo = :poId
      LIMIT 1`,
    { poId },
  );
  const customerPo = pos[0];
  if (!customerPo) throw new Error("客户PO不存在");

  const existing = await queryRows<QuotationRow>(
    `SELECT id, quotationNo, customerId, contractingUnitId, sourcePoId, sourcePoNo, currency, totalAmount, totalProfit, grossMarginRate, status
       FROM po_quotations
      WHERE sourcePoId = :sourcePoId
         OR sourcePoNo = :sourcePoNo
      LIMIT 1`,
    { sourcePoId: customerPo.id, sourcePoNo: customerPo.poNo },
  );
  if (existing[0]) {
    return { quotationId: existing[0].id, quotationNo: existing[0].quotationNo, sourcePoId: customerPo.id, sourcePoNo: customerPo.poNo, itemCount: 0, existing: true };
  }

  const items = await queryRows<CustomerPoItemRow>(
    `SELECT id, poId, lineNo, customerProductName, customerSpec, quantity, targetUnitPrice, currency,
            matchedProductCode, productMasterId, productModelId, productSpecId, matchStatus
       FROM po_customer_po_items
      WHERE poId = :poId
      ORDER BY lineNo ASC, id ASC`,
    { poId: customerPo.id },
  );
  if (!items.length) throw new Error("客户PO没有明细");
  if (items.some((item) => String(item.matchStatus ?? "") !== "matched" || (!String(item.productMasterId ?? "").trim() && !String(item.productSpecId ?? "").trim()))) {
    throw new Error("客户PO明细尚未完成产品主档匹配");
  }

  const productCodes = Array.from(new Set(items.map((item) => String(item.matchedProductCode ?? "").trim()).filter(Boolean)));
  const histories = productCodes.length
    ? await queryRows<HistoryQuotationRow>(
        `SELECT productCode, customerPrice, currency
           FROM po_history_quotations
          WHERE customerId = :customerId
            AND productCode IN (:productCodes)
          ORDER BY quotationDate DESC, createdAt DESC`,
        { customerId: customerPo.customerId, productCodes },
      )
    : [];
  const historyByProductCode = new Map<string, HistoryQuotationRow>();
  for (const history of histories) {
    const code = String(history.productCode ?? "").trim();
    if (code && !historyByProductCode.has(code)) {
      historyByProductCode.set(code, history);
    }
  }

  const productMasterIds = Array.from(new Set(items.map((item) => String(item.productMasterId ?? "").trim()).filter(Boolean)));
  const productSpecIds = Array.from(new Set(items.map((item) => String(item.productSpecId ?? "").trim()).filter(Boolean)));
  const productCosts = productMasterIds.length || productSpecIds.length
    ? await queryRows<ProductCostRow>(
        `SELECT
           master.id AS productMasterId,
           NULL AS productSpecId,
           master.suggestedPurchaseUnitPrice AS purchaseUnitPrice
         FROM po_product_masters master
         WHERE master.id IN (:productMasterIds)
           AND master.status = 'active'
         UNION ALL
         SELECT
           model.masterId AS productMasterId,
           specification.id AS productSpecId,
           COALESCE(NULLIF(specification.suggestedPurchaseUnitPrice, 0), NULLIF(model.suggestedPurchaseUnitPrice, 0), 0) AS purchaseUnitPrice
         FROM po_product_specifications specification
         INNER JOIN po_product_models model ON model.id = specification.modelId
         WHERE specification.id IN (:productSpecIds)
           AND specification.status = 'active'
           AND model.status = 'active'`,
        {
          productMasterIds: productMasterIds.length ? productMasterIds : ["__none__"],
          productSpecIds: productSpecIds.length ? productSpecIds : ["__none__"],
        },
      )
    : [];
  const productCostBySpecId = new Map(
    productCosts.flatMap((row) => {
      const keys = [row.productSpecId, row.productMasterId].filter((value): value is string => Boolean(value));
      return keys.map((key) => [String(key), Number(row.purchaseUnitPrice ?? 0)] as const);
    }),
  );

  const quotationId = randomUUID();
  const quotationNo = buildQuotationNo(customerPo.poNo);
  const quotationCurrency = customerPo.currency ?? items[0]?.currency ?? "USD";

  const quotationItems = items.map((item, index) => {
    const quantity = Number(item.quantity ?? 0);
    const history = historyByProductCode.get(String(item.matchedProductCode ?? "").trim());
    const unitPrice = Number(history?.customerPrice ?? item.targetUnitPrice ?? 0);
    const amount = roundAmount(quantity * unitPrice);
    return {
      id: randomUUID(),
      quotationId,
      lineNo: index + 1,
      productCode: String(item.matchedProductCode ?? "").trim(),
      productName: String(item.customerProductName ?? "").trim(),
      productMasterId: item.productMasterId,
      productModelId: item.productModelId,
      productSpecId: item.productSpecId,
      quantity,
      unitPrice,
      amount,
      currency: history?.currency ?? item.currency ?? quotationCurrency,
      remark: item.customerSpec ?? null,
    };
  });

  const totalAmount = roundAmount(quotationItems.reduce((total, item) => total + item.amount, 0));
  const totalProfit = roundAmount(
    quotationItems.reduce((total, item) => {
      const purchaseUnitPrice = productCostBySpecId.get(String(item.productSpecId ?? item.productMasterId ?? "")) ?? 0;
      return total + (Number(item.unitPrice ?? 0) - purchaseUnitPrice) * Number(item.quantity ?? 0);
    }, 0),
  );
  const grossMarginRate = totalAmount ? roundAmount(totalProfit / totalAmount) : 0;

  await execute(
    `INSERT INTO po_quotations
      (id, quotationNo, customerId, contractingUnitId, sourcePoId, sourcePoNo, currency, totalAmount, totalProfit, grossMarginRate, status,
       createdByUserId, createdByName, updatedByUserId, updatedByName)
     VALUES
      (:id, :quotationNo, :customerId, :contractingUnitId, :sourcePoId, :sourcePoNo, :currency, :totalAmount, :totalProfit, :grossMarginRate, :status,
       :createdByUserId, :createdByName, :updatedByUserId, :updatedByName)`,
    {
      id: quotationId,
      quotationNo,
      customerId: customerPo.customerId,
      contractingUnitId: null,
      sourcePoId: customerPo.id,
      sourcePoNo: customerPo.poNo,
      currency: quotationCurrency,
      totalAmount,
      totalProfit,
      grossMarginRate,
      status: "draft",
      createdByUserId: actor?.userId ?? null,
      createdByName: actor?.displayName ?? null,
      updatedByUserId: actor?.userId ?? null,
      updatedByName: actor?.displayName ?? null,
    },
  );

  for (const item of quotationItems) {
    await execute(
      `INSERT INTO po_quotation_items
        (id, quotationId, lineNo, productCode, productName, productMasterId, productModelId, productSpecId, quantity, unitPrice, amount, currency, remark)
       VALUES
        (:id, :quotationId, :lineNo, :productCode, :productName, :productMasterId, :productModelId, :productSpecId, :quantity, :unitPrice, :amount, :currency, :remark)`,
      item,
    );
  }

  return { quotationId, quotationNo, sourcePoId: customerPo.id, sourcePoNo: customerPo.poNo, itemCount: quotationItems.length };
}

export async function confirmQuotation(quotationIdOrNo: string, actor: OperationActor | null = null) {
  const rows = await queryRows<QuotationRow>(
    `SELECT id, quotationNo, customerId, contractingUnitId, sourcePoId, sourcePoNo, currency, totalAmount, totalProfit, grossMarginRate, status
       FROM po_quotations
      WHERE id = :id OR quotationNo = :id
      LIMIT 1`,
    { id: quotationIdOrNo },
  );
  const quotation = rows[0];
  if (!quotation) throw new Error("报价单不存在");
  if (String(quotation.status ?? "") === "confirmed") {
    await ensureSettlementProjectForQuotation(quotation.id, actor);
    return { quotationId: quotation.id, quotationNo: quotation.quotationNo, itemCount: 0, confirmed: true };
  }

  await execute(
    `UPDATE po_quotations
        SET status = 'confirmed',
            confirmedByUserId = :confirmedByUserId,
            confirmedByName = :confirmedByName,
            confirmedAt = NOW(),
            updatedByUserId = :updatedByUserId,
            updatedByName = :updatedByName
      WHERE id = :id`,
    {
      id: quotation.id,
      confirmedByUserId: actor?.userId ?? null,
      confirmedByName: actor?.displayName ?? null,
      updatedByUserId: actor?.userId ?? null,
      updatedByName: actor?.displayName ?? null,
    },
  );

  const items = await queryRows<Row>(
    `SELECT id, quotationId, lineNo, productCode, productName, productMasterId, productModelId, productSpecId, quantity, unitPrice, amount, currency, remark
       FROM po_quotation_items
      WHERE quotationId = :quotationId
      ORDER BY lineNo ASC, id ASC`,
    { quotationId: quotation.id },
  );
  const quotationDate = new Date().toISOString().slice(0, 10);
  for (const item of items) {
    await execute(
      `INSERT INTO po_history_quotations
        (id, quotationId, quotationDate, customerId, productCode, productName, productMasterId, productModelId, productSpecId, customerPrice, currency, remark)
       VALUES
        (:id, :quotationId, :quotationDate, :customerId, :productCode, :productName, :productMasterId, :productModelId, :productSpecId, :customerPrice, :currency, :remark)`,
      {
        id: randomUUID(),
        quotationId: quotation.id,
        quotationDate,
        customerId: quotation.customerId,
        productCode: String(item.productCode ?? ""),
        productName: String(item.productName ?? ""),
        productMasterId: item.productMasterId,
        productModelId: item.productModelId,
        productSpecId: item.productSpecId,
        customerPrice: item.unitPrice ?? 0,
        currency: item.currency ?? quotation.currency ?? "USD",
        remark: item.remark ?? null,
      },
    );
  }

  await ensureSettlementProjectForQuotation(quotation.id, actor);

  return { quotationId: quotation.id, quotationNo: quotation.quotationNo, itemCount: items.length };
}
