import { execute, queryRows, type Row } from "./db";

export async function findProductByCode(productCode: string) {
  const code = productCode.trim();
  if (!code) return null;

  const masterRows = await queryRows<Row>(
    `SELECT
       id AS productMasterId,
       masterCode AS productCode,
       name AS productName,
       nameEn,
       specification,
       brand,
       category,
       unit,
       suggestedPurchaseUnitPrice,
       'CNY' AS purchaseCurrency,
       NULL AS productModelId,
       NULL AS productSpecId
     FROM po_product_masters
    WHERE masterCode = :productCode
      AND status = 'active'
    LIMIT 1`,
    { productCode: code },
  );
  if (masterRows[0]) return masterRows[0];

  const rows = await queryRows<Row>(
    `SELECT
       specification.id AS productSpecId,
       specification.specProductCode AS productCode,
       specification.specCode,
       specification.specKey,
       specification.specName,
       COALESCE(NULLIF(specification.suggestedPurchaseUnitPrice, 0), NULLIF(model.suggestedPurchaseUnitPrice, 0), 0) AS suggestedPurchaseUnitPrice,
       model.id AS productModelId,
       model.modelCode,
       model.brand,
       model.model,
       master.id AS productMasterId,
       master.masterCode,
       master.name AS productName,
       master.nameEn,
       master.category,
       master.unit
     FROM po_product_specifications specification
     INNER JOIN po_product_models model ON model.id = specification.modelId
     INNER JOIN po_product_masters master ON master.id = model.masterId
     WHERE specification.specProductCode = :productCode
       AND specification.status = 'active'
       AND model.status = 'active'
       AND master.status = 'active'
     LIMIT 1`,
    { productCode: code },
  );
  return rows[0] ?? null;
}

export async function matchCustomerPoItems(poId: string) {
  const items = await queryRows<Row>(
    `SELECT item.id, item.matchedProductCode, item.customerSku, item.customerProductName, item.customerSpec, po.customerId
       FROM po_customer_po_items item
       INNER JOIN po_customer_pos po ON po.id = item.poId
      WHERE item.poId = :poId
      ORDER BY item.lineNo ASC, item.id ASC`,
    { poId },
  );
  const customerIds = Array.from(new Set(items.map((item) => String(item.customerId ?? "").trim()).filter(Boolean)));
  const aliases = customerIds.length
    ? await queryRows<Row>(
        `SELECT customerId, customerSku, customerProductName, customerSpec, productCode
           FROM po_customer_product_aliases
          WHERE customerId IN (:customerIds)`,
        { customerIds },
      )
    : [];
  for (const item of items) {
    if (String(item.matchedProductCode ?? "").trim()) continue;
    const customerId = String(item.customerId ?? "").trim();
    const sku = String(item.customerSku ?? "").trim();
    const name = String(item.customerProductName ?? "").trim();
    const specification = String(item.customerSpec ?? "").trim();
    const alias = aliases.find((candidate) => {
      if (String(candidate.customerId ?? "") !== customerId) return false;
      if (sku) return String(candidate.customerSku ?? "").trim() === sku;
      return String(candidate.customerProductName ?? "").trim() === name
        && (!specification || String(candidate.customerSpec ?? "").trim() === specification);
    });
    if (alias) item.matchedProductCode = alias.productCode;
  }
  const codes = Array.from(new Set(
    items.map((item) => String(item.matchedProductCode ?? "").trim()).filter(Boolean),
  ));
  if (!codes.length) return { total: items.length, matched: 0, unmatched: items.length };

  const masterProducts = await queryRows<Row>(
    `SELECT
       id AS productMasterId,
       masterCode AS productCode,
       name AS productName,
       nameEn,
       specification,
       brand,
       category,
       unit,
       suggestedPurchaseUnitPrice,
       'CNY' AS purchaseCurrency,
       NULL AS productModelId,
       NULL AS productSpecId
     FROM po_product_masters
    WHERE masterCode IN (:codes)
      AND status = 'active'`,
    { codes },
  );
  const masterCodes = new Set(masterProducts.map((product) => String(product.productCode ?? "")));
  const legacyCodes = codes.filter((code) => !masterCodes.has(code));
  const legacyProducts = legacyCodes.length ? (await queryRows<Row>(
    `SELECT
      specification.specProductCode AS productCode,
      specification.id AS productSpecId,
      COALESCE(NULLIF(specification.suggestedPurchaseUnitPrice, 0), NULLIF(model.suggestedPurchaseUnitPrice, 0), 0) AS suggestedPurchaseUnitPrice,
      model.id AS productModelId,
      master.id AS productMasterId,
      master.name AS productName
     FROM po_product_specifications specification
     INNER JOIN po_product_models model ON model.id = specification.modelId
     INNER JOIN po_product_masters master ON master.id = model.masterId
     WHERE specification.specProductCode IN (:codes)
       AND specification.status = 'active'
       AND model.status = 'active'
       AND master.status = 'active'`,
    { codes: legacyCodes },
  )) ?? [] : [];
  const products = [...masterProducts, ...legacyProducts];
  const productByCode = new Map(products.map((product) => [String(product.productCode), product]));
  let matched = 0;
  for (const item of items) {
    const code = String(item.matchedProductCode ?? "").trim();
    if (!code) continue;
    const product = productByCode.get(code);
    if (product) {
      await execute(
        `UPDATE po_customer_po_items
            SET productMasterId = :productMasterId,
                productModelId = :productModelId,
                productSpecId = :productSpecId,
                matchedProductCode = :productCode,
                matchStatus = 'matched'
          WHERE id = :id AND poId = :poId`,
        { ...product, id: item.id, poId },
      );
      matched += 1;
    } else {
      await execute(
        `UPDATE po_customer_po_items
            SET productMasterId = NULL,
                productModelId = NULL,
                productSpecId = NULL,
                matchStatus = 'unmatched'
          WHERE id = :id AND poId = :poId`,
        { id: item.id, poId },
      );
    }
  }
  return { total: items.length, matched, unmatched: items.length - matched };
}
