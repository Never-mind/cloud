import { randomUUID } from "node:crypto";
import { execute, queryRows, type Row } from "./db";
import type { OperationActor } from "./operation-actor";
import { ensureSettlementProjectForQuotation } from "./settlement-project-service";
import { calculateQuotation, type QuotationCalculationInput, type QuotationCalculationParams, type QuotationProductSnapshot } from "./quotation-calculator";

type CustomerPoRow = {
  id: string;
  poNo: string;
  projectName: string | null;
  undertakingUnitId: string | null;
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
  projectName: string | null;
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
  purchaseUnitPrice: number | null;
};

type QuotationSummaryRow = {
  id: string;
  quotationNo: string;
  totalAmount: number | null;
  totalProfit: number | null;
};

const DEFAULT_QUOTATION_PARAMS: QuotationCalculationParams = {
  exchangeRateUsd: 6.82,
  exchangeRateMxn: 0.06,
  capitalCostRate: 6,
  accountPeriod: 2,
  badDebtRate: 1,
  customsFeeRate: 0.8,
  vatOverseas: 16,
  markupRate: 20,
  seaFreightRate: 3200,
  airFreightRate: 100,
  nomFee: 700,
  customsMiscFee: 0,
  lastMileFee: 0,
  storageOperationFee: 0,
  implementationFee: 0,
};

function buildQuotationNo(poNo: string) {
  const normalized = poNo.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `QUO-${normalized}`;
}

function roundAmount(value: number) {
  return Number(value.toFixed(4));
}

export async function recalculateQuotationSummary(quotationIdOrNo: string, actor: OperationActor | null = null) {
  const quotations = await queryRows<Row>(
    `SELECT * FROM po_quotations
      WHERE id = :quotationId OR quotationNo = :quotationId
      LIMIT 1`,
    { quotationId: quotationIdOrNo },
  );
  const quotation = quotations[0];
  if (!quotation) throw new Error("报价单不存在");
  const items = await queryRows<Row>(
    `SELECT item.*, master.masterCode AS masterProductCode, master.name AS masterProductName,
            master.brand AS masterBrand, master.specification AS masterSpecification,
            master.unit AS masterUnit, master.suggestedPurchaseUnitPrice AS masterPurchasePrice,
            master.length AS masterLength, master.width AS masterWidth, master.height AS masterHeight,
            master.grossWeight AS masterGrossWeight, master.tariffRate AS masterTariffRate,
            master.needNom AS masterNeedNom
       FROM po_quotation_items item
       LEFT JOIN po_product_masters master ON master.id = item.productMasterId
      WHERE item.quotationId = :quotationId
      ORDER BY item.lineNo ASC, item.id ASC`,
    { quotationId: quotation.id },
  );
  const calculation = calculateQuotation(toQuotationParams(quotation), items.map(toCalculationInput));
  for (const item of calculation.items) {
    await updateCalculatedQuotationItem(item);
  }
  const actorFields = actor ? {
    updatedByUserId: actor.userId,
    updatedByName: actor.displayName,
  } : {};
  await execute(
    `UPDATE po_quotations
        SET publicFeeTotal = :publicFeeTotal,
            totalCifUsd = :totalCifUsd,
            totalDdpUsd = :totalDdpUsd,
            totalRevenueUsd = :totalRevenueUsd,
            totalAmount = :totalAmount,
            totalProfitUsd = :totalProfitUsd,
            totalProfit = :totalProfit,
            grossMarginRate = :grossMarginRate
            ${actor ? ", updatedByUserId = :updatedByUserId, updatedByName = :updatedByName" : ""}
      WHERE id = :id`,
    {
      id: quotation.id,
      publicFeeTotal: calculation.publicFeeTotal,
      totalCifUsd: calculation.totalCifUsd,
      totalDdpUsd: calculation.totalDdpUsd,
      totalRevenueUsd: calculation.totalRevenueUsd,
      totalAmount: calculation.totalRevenueUsd,
      totalProfitUsd: calculation.totalProfitUsd,
      totalProfit: calculation.totalProfitUsd,
      grossMarginRate: calculation.grossMarginRate,
      ...actorFields,
    },
  );
  return {
    quotationId: String(quotation.id),
    quotationNo: String(quotation.quotationNo ?? ""),
    totalAmount: calculation.totalRevenueUsd,
    totalProfit: calculation.totalProfitUsd,
    grossMarginRate: calculation.grossMarginRate,
    totalCifUsd: calculation.totalCifUsd,
    totalDdpUsd: calculation.totalDdpUsd,
    totalRevenueUsd: calculation.totalRevenueUsd,
  };
}

export async function createQuotationFromCustomerPo(poId: string, actor: OperationActor | null = null) {
  const [pos] = await Promise.all([
    queryRows<CustomerPoRow>(
      `SELECT id, poNo, projectName, undertakingUnitId, customerId, currency
         FROM po_customer_pos
        WHERE id = :poId OR poNo = :poId
        LIMIT 1`,
      { poId },
    ),
  ]);
  const customerPo = pos[0];
  if (!customerPo) throw new Error("客户PO不存在");
  const existing = await queryRows<QuotationRow>(
    `SELECT id, quotationNo, customerId, contractingUnitId, sourcePoId, sourcePoNo, currency, totalAmount, totalProfit, grossMarginRate, status
       FROM po_quotations
      WHERE sourcePoId = :sourcePoId OR sourcePoNo = :sourcePoNo
      LIMIT 1`,
    { sourcePoId: customerPo.id, sourcePoNo: customerPo.poNo },
  );
  if (existing[0]) return { quotationId: existing[0].id, quotationNo: existing[0].quotationNo, sourcePoId: customerPo.id, sourcePoNo: customerPo.poNo, itemCount: 0, existing: true };

  const items = await queryRows<Row>(
    `SELECT * FROM po_customer_po_items WHERE poId = :poId ORDER BY lineNo ASC, id ASC`,
    { poId: customerPo.id },
  );
  if (!items.length) throw new Error("客户PO没有明细");
  if (items.some((item) => String(item.matchStatus ?? "") !== "matched" || !String(item.productMasterId ?? "").trim())) {
    throw new Error("客户PO明细尚未完成产品主档匹配");
  }

  const productMasterIds = uniqueNonBlank(items.map((item) => item.productMasterId));
  const productCodes = uniqueNonBlank(items.map((item) => item.matchedProductCode));
  const products = await queryRows<Row>(
    `SELECT id AS productMasterId, masterCode AS productCode, name AS productName, brand,
            specification, category, unit, suggestedPurchaseUnitPrice, length, width,
            height, grossWeight, tariffRate, needNom
       FROM po_product_masters
      WHERE status = 'active'
        AND (id IN (:productMasterIds) OR masterCode IN (:productCodes))`,
    {
      productMasterIds: productMasterIds.length ? productMasterIds : ["__none__"],
      productCodes: productCodes.length ? productCodes : ["__none__"],
    },
  );
  const productById = new Map(products.map((product) => [String(product.productMasterId ?? ""), product] as const));
  const productByCode = new Map(products.map((product) => [String(product.productCode ?? ""), product] as const));
  const resolvedProducts = items.map((item) => productById.get(String(item.productMasterId ?? "")) ?? productByCode.get(String(item.matchedProductCode ?? "")));
  if (resolvedProducts.some((product) => !product)) throw new Error("客户PO明细对应的产品主档不存在或已停用");

  const histories = productCodes.length
    ? await queryRows<HistoryQuotationRow>(
        `SELECT productCode, customerPrice, currency
           FROM po_history_quotations
          WHERE customerId = :customerId
            AND productCode IN (:productCodes)
            AND (quotationDate < CURRENT_DATE OR (quotationDate = CURRENT_DATE AND createdAt < CURRENT_TIMESTAMP))
          ORDER BY quotationDate DESC, createdAt DESC`,
        { customerId: customerPo.customerId, productCodes },
      )
    : [];
  const historyByProductCode = new Map<string, HistoryQuotationRow>();
  histories.forEach((history) => {
    const code = String(history.productCode ?? "").trim();
    if (code && !historyByProductCode.has(code)) historyByProductCode.set(code, history);
  });
  const calculation = calculateQuotation(
    DEFAULT_QUOTATION_PARAMS,
    items.map((item, index) => ({
      id: randomUUID(),
      lineNo: index + 1,
      productCode: String(item.matchedProductCode ?? "").trim(),
      productName: String(item.customerProductName ?? "").trim(),
      brand: String(resolvedProducts[index]?.brand ?? "").trim(),
      productMasterId: item.productMasterId as string,
      productModelId: item.productModelId as string,
      productSpecId: item.productSpecId as string,
      quantity: Number(item.quantity ?? 0),
      purchaseCurrency: "CNY",
      purchaseUnitPrice: Number(resolvedProducts[index]?.suggestedPurchaseUnitPrice ?? 0),
      currency: "USD",
      transportType: "sea",
      isCustomsClearance: true,
      enableNom: Boolean(Number(resolvedProducts[index]?.needNom ?? 0)),
      historicalDdpQuoteUsd: historyByProductCode.get(String(item.matchedProductCode ?? "").trim())?.customerPrice ?? null,
      remark: String(item.customerSpec ?? ""),
      product: toProductSnapshot(resolvedProducts[index]),
    })),
  );
  const quotationId = randomUUID();
  const quotationNo = buildQuotationNo(customerPo.poNo);
  const quotationParams = { ...DEFAULT_QUOTATION_PARAMS, ...calculation };
  await execute(
    `INSERT INTO po_quotations
      (id, quotationNo, projectName, customerId, contractingUnitId, sourcePoId, sourcePoNo, currency,
       exchangeRateUsd, exchangeRateMxn, capitalCostRate, accountPeriod, badDebtRate,
       customsFeeRate, vatOverseas, markupRate, seaFreightRate, airFreightRate, nomFee,
       customsMiscFee, lastMileFee, storageOperationFee, implementationFee, publicFeeTotal,
       totalCifUsd, totalDdpUsd, totalRevenueUsd, totalProfitUsd, totalAmount, totalProfit,
       grossMarginRate, status, createdByUserId, createdByName, updatedByUserId, updatedByName)
     VALUES
      (:id, :quotationNo, :projectName, :customerId, :contractingUnitId, :sourcePoId, :sourcePoNo, :currency,
       :exchangeRateUsd, :exchangeRateMxn, :capitalCostRate, :accountPeriod, :badDebtRate,
       :customsFeeRate, :vatOverseas, :markupRate, :seaFreightRate, :airFreightRate, :nomFee,
       :customsMiscFee, :lastMileFee, :storageOperationFee, :implementationFee, :publicFeeTotal,
       :totalCifUsd, :totalDdpUsd, :totalRevenueUsd, :totalProfitUsd, :totalAmount, :totalProfit,
       :grossMarginRate, :status, :createdByUserId, :createdByName, :updatedByUserId, :updatedByName)`,
    {
      id: quotationId,
      quotationNo,
      projectName: customerPo.projectName,
      customerId: customerPo.customerId,
      contractingUnitId: customerPo.undertakingUnitId,
      sourcePoId: customerPo.id,
      sourcePoNo: customerPo.poNo,
      currency: "USD",
      ...quotationParams,
      totalProfitUsd: calculation.totalProfitUsd,
      totalAmount: calculation.totalRevenueUsd,
      totalProfit: calculation.totalProfitUsd,
      status: "draft",
      createdByUserId: actor?.userId ?? null,
      createdByName: actor?.displayName ?? null,
      updatedByUserId: actor?.userId ?? null,
      updatedByName: actor?.displayName ?? null,
    },
  );
  for (const item of calculation.items) {
    await execute(
      `INSERT INTO po_quotation_items
        (id, quotationId, lineNo, productCode, productName, brand, productMasterId, productModelId,
         productSpecId, quantity, unitPrice, amount, currency, purchaseCurrency, purchaseUnitPrice,
         purchaseTotalOriginal, purchaseTotalUsd, transportType, isCustomsClearance, firstMileFreightUsd,
         cifUsd, tariffRate, tariffUsd, capitalCostUsd, customsFeeUsd, nomFeeUsd, publicFeeAllocationUsd,
         ddpTotalUsd, ddpUnitPriceUsd, ddpQuoteUnitUsd, revenueUsd, operatingProfitUsd, grossMarginRate,
         markupRate, enableNom, historicalDdpQuoteUsd, remark)
       VALUES
        (:id, :quotationId, :lineNo, :productCode, :productName, :brand, :productMasterId, :productModelId,
         :productSpecId, :quantity, :unitPrice, :amount, :currency, :purchaseCurrency, :purchaseUnitPrice,
         :purchaseTotalOriginal, :purchaseTotalUsd, :transportType, :isCustomsClearance, :firstMileFreightUsd,
         :cifUsd, :tariffRate, :tariffUsd, :capitalCostUsd, :customsFeeUsd, :nomFeeUsd, :publicFeeAllocationUsd,
         :ddpTotalUsd, :ddpUnitPriceUsd, :ddpQuoteUnitUsd, :revenueUsd, :operatingProfitUsd, :grossMarginRate,
         :markupRate, :enableNom, :historicalDdpQuoteUsd, :remark)`,
      { ...toStoredQuotationItem(item as unknown as Row), quotationId },
    );
  }
  return { quotationId, quotationNo, sourcePoId: customerPo.id, sourcePoNo: customerPo.poNo, itemCount: calculation.items.length };
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

function toQuotationParams(row: Row): QuotationCalculationParams {
  return Object.fromEntries(Object.keys(DEFAULT_QUOTATION_PARAMS).map((key) => [key, row[key] ?? DEFAULT_QUOTATION_PARAMS[key as keyof QuotationCalculationParams]])) as QuotationCalculationParams;
}

function toCalculationInput(row: Row): QuotationCalculationInput {
  return {
    id: String(row.id ?? ""),
    lineNo: Number(row.lineNo ?? 0),
    productCode: String(row.productCode ?? row.masterProductCode ?? ""),
    productName: String(row.productName ?? ""),
    brand: String(row.brand ?? ""),
    productMasterId: row.productMasterId as string | null,
    productModelId: row.productModelId as string | null,
    productSpecId: row.productSpecId as string | null,
    quantity: Number(row.purchaseQty ?? row.quantity ?? 0),
    purchaseCurrency: String(row.purchaseCurrency ?? row.currency ?? "CNY"),
    purchaseUnitPrice: Number(row.purchaseUnitPrice ?? row.targetUnitPrice ?? 0),
    currency: String(row.currency ?? "USD"),
    transportType: String(row.transportType ?? "sea"),
    isCustomsClearance: row.isCustomsClearance as number | boolean | null,
    enableNom: row.enableNom as number | boolean | null,
    ddpQuoteUnitUsd: row.ddpQuoteUnitUsd as number | null,
    markupRate: row.markupRate as number | null,
    historicalDdpQuoteUsd: row.historicalDdpQuoteUsd as number | null,
    remark: row.remark as string | null,
    product: toProductSnapshot(row),
  };
}

function toProductSnapshot(row: Row | undefined): QuotationProductSnapshot {
  return {
    productMasterId: row?.productMasterId as string | null,
    productCode: firstNonBlank(row?.masterProductCode, row?.productCode),
    productName: firstNonBlank(row?.masterProductName, row?.productName),
    brand: firstNonBlank(row?.masterBrand, row?.brand),
    specification: firstNonBlank(row?.masterSpecification, row?.specification),
    category: String(row?.category ?? ""),
    unit: firstNonBlank(row?.masterUnit, row?.unit),
    suggestedPurchaseUnitPrice: Number(row?.suggestedPurchaseUnitPrice ?? row?.masterPurchasePrice ?? 0),
    length: Number(row?.length ?? row?.masterLength ?? 0),
    width: Number(row?.width ?? row?.masterWidth ?? 0),
    height: Number(row?.height ?? row?.masterHeight ?? 0),
    grossWeight: Number(row?.grossWeight ?? row?.masterGrossWeight ?? 0),
    tariffRate: Number(row?.tariffRate ?? row?.masterTariffRate ?? 0),
    needNom: (row?.needNom ?? row?.masterNeedNom ?? false) as number | boolean,
  };
}

function toStoredQuotationItem(item: Row) {
  return {
    id: item.id,
    lineNo: item.lineNo,
    productCode: item.productCode,
    productName: item.productName,
    brand: item.brand,
    productMasterId: item.productMasterId ?? null,
    productModelId: item.productModelId ?? null,
    productSpecId: item.productSpecId ?? null,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    amount: item.amount,
    currency: item.currency,
    purchaseCurrency: item.purchaseCurrency,
    purchaseUnitPrice: item.purchaseUnitPrice,
    purchaseTotalOriginal: item.purchaseTotalOriginal,
    purchaseTotalUsd: item.purchaseTotalUsd,
    transportType: item.transportType,
    isCustomsClearance: item.isCustomsClearance,
    firstMileFreightUsd: item.firstMileFreightUsd,
    cifUsd: item.cifUsd,
    tariffRate: item.tariffRate,
    tariffUsd: item.tariffUsd,
    capitalCostUsd: item.capitalCostUsd,
    customsFeeUsd: item.customsFeeUsd,
    nomFeeUsd: item.nomFeeUsd,
    publicFeeAllocationUsd: item.publicFeeAllocationUsd,
    ddpTotalUsd: item.ddpTotalUsd,
    ddpUnitPriceUsd: item.ddpUnitPriceUsd,
    ddpQuoteUnitUsd: item.ddpQuoteUnitUsd,
    revenueUsd: item.revenueUsd,
    operatingProfitUsd: item.operatingProfitUsd,
    grossMarginRate: item.grossMarginRate,
    markupRate: item.markupRate,
    enableNom: item.enableNom,
    historicalDdpQuoteUsd: item.historicalDdpQuoteUsd ?? null,
    remark: item.remark ?? null,
  };
}

async function updateCalculatedQuotationItem(item: Row) {
  await execute(
    `UPDATE po_quotation_items
        SET productCode = :productCode,
            productName = :productName,
            brand = :brand,
            quantity = :quantity,
            unitPrice = :unitPrice,
            amount = :amount,
            currency = :currency,
            purchaseCurrency = :purchaseCurrency,
            purchaseUnitPrice = :purchaseUnitPrice,
            purchaseTotalOriginal = :purchaseTotalOriginal,
            purchaseTotalUsd = :purchaseTotalUsd,
            transportType = :transportType,
            isCustomsClearance = :isCustomsClearance,
            firstMileFreightUsd = :firstMileFreightUsd,
            cifUsd = :cifUsd,
            tariffRate = :tariffRate,
            tariffUsd = :tariffUsd,
            capitalCostUsd = :capitalCostUsd,
            customsFeeUsd = :customsFeeUsd,
            nomFeeUsd = :nomFeeUsd,
            publicFeeAllocationUsd = :publicFeeAllocationUsd,
            ddpTotalUsd = :ddpTotalUsd,
            ddpUnitPriceUsd = :ddpUnitPriceUsd,
            ddpQuoteUnitUsd = :ddpQuoteUnitUsd,
            revenueUsd = :revenueUsd,
            operatingProfitUsd = :operatingProfitUsd,
            grossMarginRate = :grossMarginRate,
            markupRate = :markupRate,
            enableNom = :enableNom,
            historicalDdpQuoteUsd = :historicalDdpQuoteUsd
      WHERE id = :id`,
    item as unknown as Row,
  );
}

function uniqueNonBlank(values: unknown[]) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function firstNonBlank(...values: unknown[]) {
  return values.map((value) => String(value ?? "").trim()).find(Boolean) ?? "";
}
