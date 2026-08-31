import { randomUUID } from "crypto";
import { execute, queryRows, type Row } from "./db";
import { attachPartyCodes } from "./party-display";
import type { EntityConfig } from "./modules";
import { DEFAULT_PAGE_SIZE, getKnownTotal, normalizePageSize } from "./pagination";
import { requireRequestType } from "./request-type";
import { formatTableDateExpression, formatTableDateTimeExpression, getNaturalBatchSort, getTableFilterOptionsOrderBy } from "./table-query";
import { findProductByCode } from "./po-product-service";
import { normalizeDateOnlyValue } from "./date-only";

function quoteIdentifier(identifier: string) {
  return `\`${identifier.replace(/`/g, "``")}\``;
}

function appendImplicitFormFieldFilters(
  config: EntityConfig,
  searchParams: URLSearchParams,
  whereParts: string[],
  params: Row,
  fieldReference: (field: string) => string,
) {
  const configuredFilterKeys = new Set(config.filters.map((filter) => filter.key));
  for (const field of config.formFields) {
    if (configuredFilterKeys.has(field.key)) continue;
    const value = searchParams.get(field.key)?.trim();
    if (!value) continue;
    const parameterName = `fixed_${field.key.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    whereParts.push(`${fieldReference(field.key)} = :${parameterName}`);
    params[parameterName] = value;
  }
}

function getWritableFields(config: EntityConfig) {
  return config.formFields.map((field) => field.key);
}

function getInsertFields(config: EntityConfig) {
  return Array.from(new Set([config.primaryKey, ...getWritableFields(config)]));
}

const shipmentDisplayFields = new Set([
  "countryCode",
  "destinationAddress",
  "recipientName",
  "supplierName",
  "undertakingUnitName",
  "customerName",
]);
const partyCodeDisplayFields = new Set(["supplierCode", "undertakingUnitCode", "customerCode"]);
const partyNameDisplayFields = new Set(["supplierName", "undertakingUnitName", "customerName"]);
const partyDisplayFields = new Set([...partyCodeDisplayFields, ...partyNameDisplayFields]);
const derivedRequestTypeEntityKeys = new Set(["monthly-billing-writeoffs", "service-fee-snapshot-items"]);

function isShipmentDelivered(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function withShipmentReceiptStatus(config: EntityConfig, body: Row) {
  if (config.key !== "shipments") return body;
  return { ...body, isReceived: isShipmentDelivered(body.deliveredAt) };
}

async function normalizeEntityBody(config: EntityConfig, body: Row) {
  const nextBody = withQuotationPartyAliases(config, withShipmentReceiptStatus(config, body));
  const normalizedPoBody = normalizeCustomerPoBody(config, nextBody);
  const normalizedProductBody = await normalizeProductMasterCategory(config, normalizedPoBody);
  const normalizedQuotationBody = await normalizeQuotationItemProduct(config, normalizedProductBody);
  if (["requests", "request-items", "purchase-order-items"].includes(config.key)) {
    return normalizePurchasePrices(config, {
      ...normalizedQuotationBody,
      requestType: requireRequestType(nextBody.requestType ?? "整机"),
    });
  }
  return normalizePurchasePrices(config, normalizedQuotationBody);
}

function normalizeCustomerPoBody(config: EntityConfig, body: Row) {
  if (config.key === "customer-pos") {
    return {
      ...body,
      poDate: normalizeDateOnlyValue(body.poDate),
      deliveryDate: normalizeDateOnlyValue(body.deliveryDate),
    };
  }

  if (config.key === "customer-po-items") {
    return {
      ...body,
      targetUnitPrice: body.targetUnitPrice === null || body.targetUnitPrice === undefined || String(body.targetUnitPrice).trim() === ""
        ? 0
        : Number(body.targetUnitPrice),
      currency: String(body.currency ?? "").trim() || "USD",
      matchStatus: String(body.matchStatus ?? "").trim() || "unmatched",
    };
  }

  return body;
}

async function normalizeQuotationItemProduct(config: EntityConfig, body: Row) {
  if (config.key !== "quotation-items") return body;

  const productCode = String(body.productCode ?? "").trim();
  if (!productCode) return body;
  const product = await findProductByCode(productCode);
  if (!product) return body;

  return {
    ...body,
    productCode: product.productCode,
    productName: product.productName,
    brand: product.brand ?? null,
    productMasterId: product.productMasterId ?? null,
    productModelId: product.productModelId ?? null,
    productSpecId: product.productSpecId ?? null,
    tariffRate: product.tariffRate ?? 0,
    enableNom: body.enableNom ?? product.needNom ?? false,
  };
}

async function normalizeProductMasterCategory(config: EntityConfig, body: Row) {
  if (config.key !== "product-masters") return body;

  const category = String(body.category ?? "").trim();
  if (!category) return { ...body, hsCodeMx: null, tariffRate: 0, needNom: false };

  const rows = await queryRows<{ hsCode: string | null; taxRate: number | null; needNom: number | boolean | null }>(
    `SELECT hsCode, taxRate, needNom
       FROM merge_po_tariff_rates
      WHERE deviceType = :category
      ORDER BY updatedAt DESC, id ASC
      LIMIT 1`,
    { category },
  );
  const matched = rows[0];
  return {
    ...body,
    hsCodeMx: matched?.hsCode ?? null,
    tariffRate: Number(matched?.taxRate ?? 0),
    needNom: Number(matched?.needNom ?? 0) === 1,
  };
}

function withQuotationPartyAliases(config: EntityConfig, body: Row) {
  if (config.key !== "undertaking-units") return body;

  const code = firstNonBlank(body.entityCode, body.undertakingUnitCode);
  const name = firstNonBlank(body.entityName, body.name);
  return {
    ...body,
    entityCode: code,
    undertakingUnitCode: code,
    entityName: name,
    name,
  };
}

function firstNonBlank(...values: unknown[]) {
  return values.find((value) => value !== null && value !== undefined && String(value).trim() !== "") ?? null;
}

function normalizePurchasePrices(config: EntityConfig, nextBody: Row) {
  if (config.key !== "purchase-order-items") return nextBody;

  const taxExcludedUnitPrice = Number(nextBody.taxExcludedUnitPrice ?? nextBody.unitPrice ?? 0);
  const taxSurcharge = Number(nextBody.taxSurcharge ?? 0);
  return {
    ...nextBody,
    taxExcludedUnitPrice,
    taxSurcharge,
    unitPrice: taxExcludedUnitPrice + taxSurcharge,
  };
}

function withPrimaryKey(config: EntityConfig, body: Row) {
  if (body[config.primaryKey]) return body;
  return {
    ...body,
    // Product master, model, and specification IDs are CHAR(36); keep generated
    // IDs UUID-sized so generic create/import works for every entity family.
    [config.primaryKey]: randomUUID(),
  };
}

export async function listEntityRows(config: EntityConfig, searchParams: URLSearchParams) {
  const requestedPage = Math.max(1, Math.floor(Number(searchParams.get("page") ?? 1) || 1));
  const pageSize = normalizePageSize(Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE));
  const keyword = searchParams.get("keyword")?.trim();
  const table = quoteIdentifier(config.table);
  const shipmentAlias = config.key === "shipments" ? "shipment" : "";
  const tableSource = shipmentAlias ? `${table} AS ${shipmentAlias}` : table;
  const fieldReference = (field: string) => shipmentAlias ? `${shipmentAlias}.${quoteIdentifier(field)}` : quoteIdentifier(field);
  const fields = Array.from(new Set([
    ...[...config.listFields, ...config.formFields].map((field) => field.key),
    ...(financePartyEntityKeys.has(config.key) ? ["supplierId", "undertakingUnitId", "customerId"] : []),
  ]));
  const displayOnlyFields = config.key === "customer-pos"
    ? new Set(["undertakingUnitName", "customerName"])
    : config.key === "quotations"
      ? new Set(["contractingUnitName", "customerName"])
      : config.key === "history-quotations"
        ? new Set(["customerId"])
    : config.key === "request-items"
    ? partyDisplayFields
    : config.key === "purchase-orders"
      ? new Set(["requestType"])
      : config.key === "service-fee-snapshots"
        ? new Set(["receivingUnitCode", "payerCustomerCode", "undertakingUnitName", "customerName"])
        : derivedRequestTypeEntityKeys.has(config.key)
          ? new Set(["requestType", ...partyDisplayFields])
          : config.key === "shipments"
            ? new Set([...shipmentDisplayFields, "requestType"])
            : financePartyEntityKeys.has(config.key)
              ? partyDisplayFields
              : new Set<string>();
  const storageFields = fields.filter((field) => !displayOnlyFields.has(field));
  const fieldTypes = new Map(
    [...config.listFields, ...config.formFields].map((field) => [field.key, field.type]),
  );
  const selectedFields = storageFields
    .map((field) => {
      const reference = fieldReference(field);
      const type = fieldTypes.get(field);
      const displayReference = config.key === "quotation-items" && field === "brand"
        ? `(SELECT COALESCE(NULLIF(quotationItem.brand, ''), master.brand, '') FROM merge_po_quotation_items quotationItem LEFT JOIN merge_po_product_masters master ON master.id = quotationItem.productMasterId WHERE quotationItem.id = ${quoteIdentifier(config.table)}.${quoteIdentifier(config.primaryKey)} LIMIT 1)`
        : getPartyPrimaryContactExpression(config, field, reference) ?? reference;
      const selectedReference = type === "date"
        ? formatTableDateExpression(reference)
        : type === "datetime"
          ? formatTableDateTimeExpression(reference)
        : field === "countryCode"
          ? normalizeCountryExpression(reference)
          : displayReference;
      return `${selectedReference} AS ${quoteIdentifier(field)}`;
    })
    .concat(
      config.listFields
        .filter((field) => derivedRequestTypeEntityKeys.has(config.key) && field.key === "requestType")
        .map((field) => `${getEntityDisplayFieldExpression(config, field.key)} AS ${quoteIdentifier(field.key)}`),
    )
    .concat(config.key === "customer-pos"
      ? config.listFields
        .filter((field) => ["undertakingUnitName", "customerName"].includes(field.key))
        .map((field) => `${getEntityDisplayFieldExpression(config, field.key)} AS ${quoteIdentifier(field.key)}`)
      : [])
    .concat(config.key === "quotations"
      ? config.listFields
        .filter((field) => ["contractingUnitName", "customerName"].includes(field.key))
        .map((field) => `${getEntityDisplayFieldExpression(config, field.key)} AS ${quoteIdentifier(field.key)}`)
      : [])
    .concat(config.key === "history-quotations"
      ? config.listFields
        .filter((field) => field.key === "customerId")
        .map((field) => `${getEntityDisplayFieldExpression(config, field.key)} AS ${quoteIdentifier(field.key)}`)
      : [])
    .concat(config.key === "product-models"
        ? [
            "(SELECT COUNT(*) FROM `merge_po_product_specifications` productSpecification WHERE productSpecification.`modelId` = `merge_po_product_models`.`id` AND productSpecification.`mode` = 'fixed') AS `specCount`",
          ]
        : [])
    .concat(config.key === "purchase-orders"
      ? [`
          COALESCE((
            SELECT GROUP_CONCAT(DISTINCT COALESCE(NULLIF(poi.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(req.requestType, ''), '整机') ORDER BY COALESCE(NULLIF(poi.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(req.requestType, ''), '整机') SEPARATOR ' / ')
            FROM purchaseorderitems AS poi
            LEFT JOIN requestitems AS ri ON ri.id = poi.requestItemId
            LEFT JOIN requests AS req ON req.requestNo = COALESCE(poi.requestNo, ri.requestNo)
            WHERE poi.purchaseOrderId = purchaseorders.purchaseOrderId
          ), '整机') AS \`requestType\`
        `]
      : [])
    .join(", ");
  const whereParts: string[] = [];
  const params: Row = {};

  if (keyword) {
    const keywordFields = config.key === "product-masters"
      ? ["masterCode", "name", "nameEn", "specification", "brand", "category"]
      : config.key === "quotations"
        ? ["quotationNo", "projectName", "customerId", "contractingUnitId", "sourcePoNo", "remark"]
        : storageFields.slice(0, 5);
    const keywordExpressions = keywordFields.map((field) => `${fieldReference(field)} LIKE :keyword`);
    if (config.key === "quotations") {
      keywordExpressions.push(
        `${getEntityDisplayFieldExpression(config, "customerName")} LIKE :keyword`,
        `${getEntityDisplayFieldExpression(config, "contractingUnitName")} LIKE :keyword`,
      );
    }
    whereParts.push(`(${keywordExpressions.join(" OR ")})`);
    params.keyword = `%${keyword}%`;
  }

  for (const filter of config.filters) {
    if (filter.key === "keyword") continue;
    const value = searchParams.get(filter.key)?.trim();
    if (value) {
      if (config.key === "shipments" && filter.key === "receiptStatus") {
        if (value === "received") whereParts.push(`${fieldReference("deliveredAt")} IS NOT NULL`);
        if (value === "unreceived") whereParts.push(`${fieldReference("deliveredAt")} IS NULL`);
        continue;
      }
      if (config.key === "shipments" && filter.key === "countryCode") {
        whereParts.push(`
          EXISTS (
            SELECT 1
            FROM purchaseorderitems AS poi
            INNER JOIN requestitems AS ri ON ri.id = poi.requestItemId
            INNER JOIN requests AS req ON req.requestNo = ri.requestNo
            WHERE (
              poi.id = shipment.purchaseOrderItemId
              OR (
                NULLIF(shipment.poNo, '') IS NOT NULL
                AND NULLIF(shipment.deviceCode, '') IS NOT NULL
                AND poi.poNo = shipment.poNo
                AND ri.deviceCode = shipment.deviceCode
              )
            )
            AND UPPER(TRIM(SUBSTRING_INDEX(req.countryCode, '-', 1))) = UPPER(:countryCode)
          )
        `);
        params.countryCode = normalizeCountryCodeFilter(value);
        continue;
      }
      if (filter.key === "countryCode") {
        whereParts.push(`${getEntityFilterFieldExpression(config, filter.key, shipmentAlias)} = :${filter.key}`);
        params[filter.key] = normalizeCountryCodeFilter(value);
        continue;
      }
      if (filter.key === "requestType" && config.key === "purchase-orders") {
        whereParts.push(`
          EXISTS (
            SELECT 1
            FROM purchaseorderitems AS poi
            LEFT JOIN requestitems AS ri ON ri.id = poi.requestItemId
            LEFT JOIN requests AS req ON req.requestNo = COALESCE(poi.requestNo, ri.requestNo)
            WHERE poi.purchaseOrderId = purchaseorders.purchaseOrderId
              AND COALESCE(NULLIF(poi.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(req.requestType, ''), '整机') = :requestType
          )
        `);
        params.requestType = value;
        continue;
      }
      if (filter.key === "requestType" && derivedRequestTypeEntityKeys.has(config.key)) {
        const requestTypeExpression = getEntityDisplayFieldExpression(config, "requestType");
        if (requestTypeExpression) {
          whereParts.push(`${requestTypeExpression} = :requestType`);
          params.requestType = value;
        }
        continue;
      }
      if (filter.key === "requestType" && config.key === "shipments") {
        whereParts.push(`
          EXISTS (
            SELECT 1
            FROM purchaseorderitems AS poi
            LEFT JOIN requestitems AS ri ON ri.id = poi.requestItemId
            LEFT JOIN requests AS req ON req.requestNo = COALESCE(poi.requestNo, ri.requestNo)
            WHERE (
              poi.id = shipment.purchaseOrderItemId
              OR (
                NULLIF(shipment.poNo, '') IS NOT NULL
                AND NULLIF(shipment.deviceCode, '') IS NOT NULL
                AND poi.poNo = shipment.poNo
                AND ri.deviceCode = shipment.deviceCode
              )
            )
            AND COALESCE(NULLIF(poi.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(req.requestType, ''), '整机') = :requestType
          )
        `);
        params.requestType = value;
        continue;
      }
      whereParts.push(`${fieldReference(filter.key)} = :${filter.key}`);
      params[filter.key] = value;
    }
  }

  if (
    (config.key === "purchase-order-sn-items" || config.key === "purchase-order-plan-items") &&
    searchParams.get("purchaseOrderId")?.trim()
  ) {
    whereParts.push("`purchaseOrderId` = :purchaseOrderId");
    params.purchaseOrderId = searchParams.get("purchaseOrderId")!.trim();
  }

  if (config.key === "product-specifications" && searchParams.get("masterId")?.trim()) {
    whereParts.push("`modelId` IN (SELECT `id` FROM `merge_po_product_models` WHERE `masterId` = :productMasterId)");
    params.productMasterId = searchParams.get("masterId")!.trim();
  }

  appendImplicitFormFieldFilters(config, searchParams, whereParts, params, fieldReference);

  const filterableStorageFields = new Set(storageFields);
  for (const field of config.listFields) {
    const values = Array.from(new Set(searchParams.getAll(`filter.${field.key}`).map((value) => value.trim()).filter(Boolean)));
    if (!values.length) continue;
    const parameterName = `columnFilter_${field.key.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    const expression = filterableStorageFields.has(field.key)
      ? getEntityFilterFieldExpression(config, field.key, shipmentAlias)
      : getEntityDisplayFieldExpression(config, field.key, shipmentAlias);
    if (!expression) continue;
    whereParts.push(`${expression} IN (:${parameterName})`);
    params[parameterName] = values;
  }

  const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  const orderBy = getEntityOrderBy(config, shipmentAlias, searchParams);
  const knownTotal = getKnownTotal(searchParams);
  const normalizedTotal = knownTotal ?? Number((await queryRows<{ total: number }>(
    `SELECT COUNT(*) AS total FROM ${tableSource} ${where}`,
    params,
  ))[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(normalizedTotal / pageSize));
  const page = Math.min(requestedPage, totalPages);
  params.limit = pageSize;
  params.offset = (page - 1) * pageSize;
  const rows = await queryRows(
    `SELECT ${selectedFields} FROM ${tableSource} ${where} ${orderBy} LIMIT :limit OFFSET :offset`,
    params,
  );

  const normalizedRows = rows.map((row) => normalizeQuotationPartyRow(config, row));
  const enrichedRows = config.key === "shipments"
    ? await enrichShipmentRows(normalizedRows)
    : config.key === "service-fee-snapshots"
      ? await enrichServiceFeeSnapshotParties(normalizedRows)
    : await enrichFinancialPartyRows(config.key, normalizedRows);
  return {
    rows: enrichedRows,
    total: normalizedTotal,
    page,
    pageSize,
    totalPages,
  };
}

function normalizeQuotationPartyRow(config: EntityConfig, row: Row) {
  if (config.key !== "undertaking-units") return row;
  return {
    ...row,
    entityCode: firstNonBlank(row.entityCode, row.undertakingUnitCode),
    entityName: firstNonBlank(row.entityName, row.name),
  };
}

function getPartyPrimaryContactExpression(config: EntityConfig, field: string, fallback: string) {
  const relation = config.key === "suppliers"
    ? { table: "merge_common_supplier_contacts", ownerColumn: "supplierId", ownerReference: `${quoteIdentifier(config.table)}.supplierId` }
    : config.key === "customers"
      ? { table: "merge_common_customer_contacts", ownerColumn: "customerId", ownerReference: `${quoteIdentifier(config.table)}.customerId` }
      : config.key === "undertaking-units"
        ? { table: "merge_common_undertaking_unit_contacts", ownerColumn: "undertakingUnitId", ownerReference: `${quoteIdentifier(config.table)}.undertakingUnitId` }
        : null;
  const contactColumn = field === "contactName" ? "name" : field === "contactPhone" ? "phone" : field === "contactEmail" ? "email" : "";
  if (!relation || !contactColumn) return null;
  return `COALESCE((SELECT primaryContact.${quoteIdentifier(contactColumn)}
    FROM ${quoteIdentifier(relation.table)} AS primaryContact
    WHERE primaryContact.${quoteIdentifier(relation.ownerColumn)} = ${relation.ownerReference}
      AND primaryContact.isPrimary = 1
    ORDER BY primaryContact.updatedAt DESC
    LIMIT 1), ${fallback})`;
}

function normalizeCountryCodeFilter(value: string) {
  return value.split(/\s*-\s*/, 1)[0].trim();
}

export function getEntityOrderBy(config: EntityConfig, shipmentAlias = "shipment", searchParams?: URLSearchParams) {
  const requestedSortField = searchParams?.get("sortField")?.trim() ?? "";
  const requestedSortOrder = searchParams?.get("sortOrder") === "asc" ? "ASC" : searchParams?.get("sortOrder") === "desc" ? "DESC" : "";
  const sortableFields = new Set(config.listFields.map((field) => field.key));
  const fields = new Set([
    ...config.listFields.map((field) => field.key),
    ...config.formFields.map((field) => field.key),
  ]);
  if (requestedSortField && requestedSortOrder && sortableFields.has(requestedSortField) && fields.has(requestedSortField)) {
    const sortReference = getEntitySortReference(config, requestedSortField, shipmentAlias);
    if (sortReference) {
      const tieBreaker = config.primaryKey === requestedSortField ? "" : `${fieldReferenceForSort(config, config.primaryKey, shipmentAlias)} ASC`;
      return `ORDER BY ${requestedSortField === "batchName"
        ? getNaturalBatchSort(sortReference, requestedSortOrder, tieBreaker)
        : `${sortReference} ${requestedSortOrder}${tieBreaker ? `, ${tieBreaker}` : ""}`}`;
    }
  }
  if (config.key === "shipments") {
    const prefix = shipmentAlias ? `${shipmentAlias}.` : "";
    return `
      ORDER BY
        CASE WHEN TRIM(COALESCE(${prefix}\`batchName\`, '')) REGEXP '^[A-Za-z]+-[0-9]+$' THEN 0 ELSE 1 END,
        CAST(SUBSTRING_INDEX(TRIM(${prefix}\`batchName\`), '-', -1) AS UNSIGNED) DESC,
        UPPER(SUBSTRING_INDEX(TRIM(${prefix}\`batchName\`), '-', 1)) ASC,
        ${prefix}\`createdAt\` DESC
    `;
  }
  if (config.key === "request-items") {
    const batchName = `(
      SELECT requestSort.batchName
      FROM requests AS requestSort
      WHERE requestSort.requestNo = requestitems.requestNo
      LIMIT 1
    )`;
    return getBatchOrderBy(batchName, "requestitems.requestNo ASC, requestitems.id ASC");
  }
  if (config.key === "purchase-order-items") {
    const batchName = `(
      SELECT requestSort.batchName
      FROM requestitems AS requestItemSort
      LEFT JOIN requests AS requestSort ON requestSort.requestNo = requestItemSort.requestNo
      WHERE requestItemSort.id = purchaseorderitems.requestItemId
        OR (
          NULLIF(purchaseorderitems.requestNo, '') IS NOT NULL
          AND requestItemSort.requestNo = purchaseorderitems.requestNo
        )
      LIMIT 1
    )`;
    return getBatchOrderBy(batchName, "purchaseorderitems.poNo ASC, purchaseorderitems.id ASC");
  }
  if (config.key === "billing-ledgers") {
    return getBatchOrderBy(
      "billinginstanceledgers.`batchName`",
      "billinginstanceledgers.`countryCode` ASC, billinginstanceledgers.`requestNo` ASC, billinginstanceledgers.`ledgerId` ASC",
    );
  }
  return config.defaultSort ? `ORDER BY ${config.defaultSort}` : "";
}

function fieldReferenceForSort(config: EntityConfig, field: string, shipmentAlias: string) {
  return shipmentAlias && config.key === "shipments"
    ? `${shipmentAlias}.${quoteIdentifier(field)}`
    : quoteIdentifier(field);
}

function getEntitySortReference(config: EntityConfig, field: string, shipmentAlias: string) {
  const displayOnlyFields = config.key === "customer-pos"
    ? new Set(["undertakingUnitName", "customerName"])
    : config.key === "quotations"
      ? new Set(["contractingUnitName", "customerName"])
      : config.key === "history-quotations"
        ? new Set(["customerId"])
    : config.key === "shipments"
    ? shipmentDisplayFields
    : config.key === "service-fee-snapshots"
      ? new Set(["receivingUnitCode", "payerCustomerCode", "undertakingUnitName", "customerName"])
      : derivedRequestTypeEntityKeys.has(config.key)
        ? new Set(["requestType", ...partyDisplayFields])
      : config.key === "purchase-orders"
        ? new Set(["requestType"])
        : financePartyEntityKeys.has(config.key)
          ? partyDisplayFields
          : new Set<string>();
  if (displayOnlyFields.has(field)) {
    const displayExpression = getEntityDisplayFieldExpression(config, field, shipmentAlias);
    if (displayExpression) return displayExpression;
    if (config.key === "purchase-orders" && field === "requestType") {
      return `(SELECT GROUP_CONCAT(DISTINCT COALESCE(NULLIF(typeItem.requestType, ''), NULLIF(typeRequestItem.requestType, ''), NULLIF(typeRequest.requestType, ''), '整机') ORDER BY COALESCE(NULLIF(typeItem.requestType, ''), NULLIF(typeRequestItem.requestType, ''), NULLIF(typeRequest.requestType, ''), '整机') SEPARATOR ' / ') FROM purchaseorderitems typeItem LEFT JOIN requestitems typeRequestItem ON typeRequestItem.id = typeItem.requestItemId LEFT JOIN requests typeRequest ON typeRequest.requestNo = COALESCE(typeItem.requestNo, typeRequestItem.requestNo) WHERE typeItem.purchaseOrderId = purchaseorders.purchaseOrderId)`;
    }
    return null;
  }
  if (field === "countryCode") return getEntityFilterFieldExpression(config, field, shipmentAlias);
  return fieldReferenceForSort(config, field, shipmentAlias);
}

export async function listEntityFilterOptions(
  config: EntityConfig,
  searchParams: URLSearchParams,
) {
  const field = searchParams.get("field")?.trim() ?? "";
  const keyword = searchParams.get("keyword")?.trim() ?? "";
  const fieldConfig = config.listFields.find((item) => item.key === field);
  if (!fieldConfig) return { options: [] as Array<{ value: string; count: number }> };

  if (config.key === "purchase-orders" && field === "requestType") {
    const params: Row = {};
    const keywordClause = keyword ? "AND COALESCE(NULLIF(typeItem.requestType, ''), NULLIF(typeRequestItem.requestType, ''), NULLIF(typeRequest.requestType, ''), '整机') LIKE :optionKeyword" : "";
    if (keyword) params.optionKeyword = `%${keyword}%`;
    const rows = await queryRows<{ value: string; count: number }>(
      `
        SELECT value, COUNT(*) AS count
        FROM (
          SELECT purchase.purchaseOrderId,
            COALESCE(NULLIF(typeItem.requestType, ''), NULLIF(typeRequestItem.requestType, ''), NULLIF(typeRequest.requestType, ''), '整机') AS value
          FROM purchaseorders purchase
          LEFT JOIN purchaseorderitems typeItem ON typeItem.purchaseOrderId = purchase.purchaseOrderId
          LEFT JOIN requestitems typeRequestItem ON typeRequestItem.id = typeItem.requestItemId
          LEFT JOIN requests typeRequest ON typeRequest.requestNo = COALESCE(typeItem.requestNo, typeRequestItem.requestNo)
          WHERE 1 = 1 ${keywordClause}
          GROUP BY purchase.purchaseOrderId, value
        ) valuesList
        GROUP BY value
        ORDER BY value
        LIMIT 500
      `,
      params,
    );
    return { options: rows.map((row) => ({ value: String(row.value ?? ""), label: getFilterOptionLabel(String(row.value ?? ""), fieldConfig), count: Number(row.count ?? 0) })) };
  }

  const displayOnlyFields = config.key === "customer-pos"
    ? new Set(["undertakingUnitName", "customerName"])
    : config.key === "quotations"
      ? new Set(["contractingUnitName", "customerName"])
      : config.key === "history-quotations"
        ? new Set(["customerId"])
    : config.key === "shipments"
    ? shipmentDisplayFields
    : config.key === "service-fee-snapshots"
      ? new Set(["receivingUnitCode", "payerCustomerCode", "undertakingUnitName", "customerName"])
      : derivedRequestTypeEntityKeys.has(config.key)
        ? new Set(["requestType", ...partyDisplayFields])
      : financePartyEntityKeys.has(config.key)
        ? partyDisplayFields
        : new Set<string>();
  const shipmentAlias = config.key === "shipments" ? "shipment" : "";
  const table = quoteIdentifier(config.table);
  const tableSource = shipmentAlias ? `${table} AS ${shipmentAlias}` : table;
  const reference = displayOnlyFields.has(field)
    ? getEntityDisplayFieldExpression(config, field, shipmentAlias)
    : getEntityFilterFieldExpression(config, field, shipmentAlias);
  if (!reference) return { options: [] as Array<{ value: string; count: number }> };
  const params: Row = {};
  const whereParts = [`${reference} IS NOT NULL`, `TRIM(${reference}) <> ''`];
  if (keyword) {
    whereParts.push(`${reference} LIKE :optionKeyword`);
    params.optionKeyword = `%${keyword}%`;
  }
  for (const filter of config.filters) {
    if (filter.key === "keyword" || filter.key === field) continue;
    const value = searchParams.get(filter.key)?.trim();
    if (!value) continue;
    if (config.key === "shipments" && filter.key === "countryCode") {
      const countryExpression = getEntityDisplayFieldExpression(config, "countryCode", shipmentAlias);
      if (countryExpression) {
        whereParts.push(`${countryExpression} = UPPER(TRIM(SUBSTRING_INDEX(:option_countryCode, '-', 1)))`);
        params.option_countryCode = value;
      }
      continue;
    }
    if (config.key === "shipments" && filter.key === "receiptStatus") {
      whereParts.push(value === "received" ? `${shipmentAlias}.deliveredAt IS NOT NULL` : `${shipmentAlias}.deliveredAt IS NULL`);
      continue;
    }
    if (filter.key === "countryCode") {
      whereParts.push(`${getEntityFilterFieldExpression(config, filter.key, shipmentAlias)} = :option_${filter.key}`);
      params[`option_${filter.key}`] = normalizeCountryCodeFilter(value);
      continue;
    }
    if (!config.formFields.some((item) => item.key === filter.key)) continue;
    whereParts.push(`${shipmentAlias ? `${shipmentAlias}.` : ""}${quoteIdentifier(filter.key)} = :option_${filter.key}`);
    params[`option_${filter.key}`] = value;
  }
  appendImplicitFormFieldFilters(
    config,
    searchParams,
    whereParts,
    params,
    (candidate) => filterableFieldReference(config, candidate, shipmentAlias),
  );
  for (const candidate of config.listFields) {
    if (candidate.key === field) continue;
    const values = Array.from(new Set(searchParams.getAll(`filter.${candidate.key}`).map((value) => value.trim()).filter(Boolean)));
    if (!values.length) continue;
    const candidateReference = displayOnlyFields.has(candidate.key)
      ? getEntityDisplayFieldExpression(config, candidate.key, shipmentAlias)
      : getEntityFilterFieldExpression(config, candidate.key, shipmentAlias);
    if (!candidateReference) continue;
    const parameterName = `candidate_${candidate.key.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    whereParts.push(`${candidateReference} IN (:${parameterName})`);
    params[parameterName] = values;
  }
  const selectedValues = searchParams.getAll("selected").map((value) => value.trim()).filter(Boolean);
  if (selectedValues.length) {
    whereParts.push(`${reference} IN (:selectedValues)`);
    params.selectedValues = selectedValues;
  }
  const rows = await queryRows<{ value: string; count: number }>(
    `SELECT optionValues.value, COUNT(*) AS count
       FROM (SELECT ${reference} AS value FROM ${tableSource} WHERE ${whereParts.join(" AND ")}) AS optionValues
      GROUP BY optionValues.value
      ORDER BY ${getTableFilterOptionsOrderBy(field, "optionValues.value")}
      LIMIT 500`,
    params,
  );
  return { options: rows.map((row) => ({ value: String(row.value ?? ""), label: getFilterOptionLabel(String(row.value ?? ""), fieldConfig), count: Number(row.count ?? 0) })) };
}

function getFilterOptionLabel(value: string, field: EntityConfig["listFields"][number]) {
  return field.options?.find((option) => option.value === value)?.label;
}

function getEntityDisplayFieldExpression(config: EntityConfig, field: string, shipmentAlias = "") {
  const source = shipmentAlias ? `${shipmentAlias}.` : `${quoteIdentifier(config.table)}.`;
  const derivedRequestType = field === "requestType" ? getDerivedRequestTypeExpression(config, source) : "";
  if (derivedRequestType) return derivedRequestType;
  if (config.key === "customer-pos") {
    if (field === "undertakingUnitName") {
      return `(SELECT COALESCE(NULLIF(unit.shortName, ''), NULLIF(unit.entityName, ''), NULLIF(unit.name, ''), NULLIF(unit.undertakingUnitCode, ''), ${source}undertakingUnitId) FROM merge_common_undertaking_units unit WHERE unit.undertakingUnitId = ${source}undertakingUnitId OR unit.undertakingUnitCode = ${source}undertakingUnitId OR unit.entityCode = ${source}undertakingUnitId LIMIT 1)`;
    }
    if (field === "customerName") {
      return `(SELECT COALESCE(NULLIF(customer.shortName, ''), NULLIF(customer.nameCn, ''), NULLIF(customer.name, ''), NULLIF(customer.customerCode, ''), ${source}customerId) FROM merge_common_customers customer WHERE customer.customerId = ${source}customerId OR customer.customerCode = ${source}customerId LIMIT 1)`;
    }
  }
  if (config.key === "quotations") {
    if (field === "contractingUnitName") {
      return `(SELECT COALESCE(NULLIF(unit.shortName, ''), NULLIF(unit.entityName, ''), NULLIF(unit.name, ''), NULLIF(unit.undertakingUnitCode, ''), ${source}contractingUnitId) FROM merge_common_undertaking_units unit WHERE unit.undertakingUnitId = ${source}contractingUnitId OR unit.undertakingUnitCode = ${source}contractingUnitId OR unit.entityCode = ${source}contractingUnitId LIMIT 1)`;
    }
    if (field === "customerName") {
      return `(SELECT COALESCE(NULLIF(customer.shortName, ''), NULLIF(customer.nameCn, ''), NULLIF(customer.name, ''), NULLIF(customer.customerCode, ''), ${source}customerId) FROM merge_common_customers customer WHERE customer.customerId = ${source}customerId OR customer.customerCode = ${source}customerId LIMIT 1)`;
    }
  }
  if (config.key === "history-quotations" && field === "customerId") {
    return `(SELECT COALESCE(NULLIF(customer.shortName, ''), NULLIF(customer.nameCn, ''), NULLIF(customer.name, ''), NULLIF(customer.customerCode, ''), ${source}customerId) FROM merge_common_customers customer WHERE customer.customerId = ${source}customerId OR customer.customerCode = ${source}customerId LIMIT 1)`;
  }
  if (config.key === "service-fee-snapshots") {
    if (field === "undertakingUnitName") {
      return `(SELECT GROUP_CONCAT(DISTINCT COALESCE(NULLIF(unit.shortName, ''), NULLIF(unit.entityName, ''), NULLIF(unit.name, ''), NULLIF(unit.undertakingUnitCode, ''), NULLIF(snapshotItem.undertakingUnitId, '')) SEPARATOR ', ') FROM servicefeesnapshotitems snapshotItem LEFT JOIN merge_common_undertaking_units unit ON unit.undertakingUnitId = snapshotItem.undertakingUnitId OR unit.undertakingUnitCode = snapshotItem.undertakingUnitId OR unit.entityCode = snapshotItem.undertakingUnitId WHERE snapshotItem.snapshotNo = ${source}snapshotNo)`;
    }
    if (field === "customerName") {
      return `(SELECT GROUP_CONCAT(DISTINCT COALESCE(NULLIF(customer.shortName, ''), NULLIF(customer.nameCn, ''), NULLIF(customer.name, ''), NULLIF(customer.customerCode, ''), NULLIF(snapshotItem.customerId, '')) SEPARATOR ', ') FROM servicefeesnapshotitems snapshotItem LEFT JOIN merge_common_customers customer ON customer.customerId = snapshotItem.customerId OR customer.customerCode = snapshotItem.customerId WHERE snapshotItem.snapshotNo = ${source}snapshotNo)`;
    }
    if (field === "receivingUnitCode") {
      return `(SELECT COALESCE(NULLIF(unit.shortName, ''), NULLIF(unit.entityName, ''), NULLIF(unit.name, ''), unit.undertakingUnitCode) FROM merge_common_undertaking_units unit WHERE unit.undertakingUnitId = ${source}receivingUnitId OR unit.undertakingUnitCode = ${source}receivingUnitId OR unit.entityCode = ${source}receivingUnitId LIMIT 1)`;
    }
    if (field === "payerCustomerCode") {
      return `(SELECT COALESCE(NULLIF(customer.shortName, ''), NULLIF(customer.nameCn, ''), NULLIF(customer.name, ''), customer.customerCode) FROM merge_common_customers customer WHERE customer.customerId = ${source}payerCustomerId OR customer.customerCode = ${source}payerCustomerId LIMIT 1)`;
    }
  }
  if (config.key === "shipments") {
    if (field === "countryCode") {
      const linkedCountry = `(SELECT req.countryCode
        FROM purchaseorderitems poi
        LEFT JOIN requestitems ri ON ri.id = poi.requestItemId
        LEFT JOIN requests req ON req.requestNo = COALESCE(NULLIF(poi.requestNo, ''), ri.requestNo)
        WHERE (
          poi.id = shipment.purchaseOrderItemId
          OR (
            NULLIF(shipment.poNo, '') IS NOT NULL
            AND NULLIF(shipment.deviceCode, '') IS NOT NULL
            AND poi.poNo = shipment.poNo
            AND ri.deviceCode = shipment.deviceCode
          )
        )
        ORDER BY (poi.id = shipment.purchaseOrderItemId) DESC, poi.id DESC
        LIMIT 1)`;
      return `UPPER(TRIM(SUBSTRING_INDEX(${linkedCountry}, '-', 1)))`;
    }
    if (field === "dcNameZh") return `(SELECT dc.nameZh FROM datacenters dc WHERE dc.dcCode = shipment.dcCode LIMIT 1)`;
    if (field === "destinationAddress") return `(SELECT location.fullAddress FROM deliverylocations location WHERE location.locationId = shipment.destinationLocationId LIMIT 1)`;
    if (field === "recipientName") return `(SELECT contact.name FROM deliverycontacts contact WHERE contact.contactId = shipment.recipientContactId LIMIT 1)`;
    if (["supplierName", "undertakingUnitName", "customerName"].includes(field)) {
      const isSupplier = field === "supplierName";
      const isUndertakingUnit = field === "undertakingUnitName";
      const idField = isSupplier ? "supplierId" : isUndertakingUnit ? "undertakingUnitId" : "customerId";
      const tableName = isSupplier ? "merge_common_suppliers" : isUndertakingUnit ? "merge_common_undertaking_units" : "merge_common_customers";
      const idColumn = isSupplier ? "supplierId" : isUndertakingUnit ? "undertakingUnitId" : "customerId";
      const nameExpression = isSupplier
        ? "COALESCE(NULLIF(party.shortName, ''), NULLIF(party.nameCn, ''), party.supplierCode)"
        : isUndertakingUnit
          ? "COALESCE(NULLIF(party.shortName, ''), NULLIF(party.entityName, ''), NULLIF(party.name, ''), party.undertakingUnitCode)"
          : "COALESCE(NULLIF(party.shortName, ''), NULLIF(party.nameCn, ''), NULLIF(party.name, ''), party.customerCode)";
      const referenceExpression = isSupplier
        ? `party.${idColumn} = ri.${idField} OR party.supplierCode = ri.${idField}`
        : isUndertakingUnit
          ? `party.${idColumn} = ri.${idField} OR party.undertakingUnitCode = ri.${idField} OR party.entityCode = ri.${idField}`
          : `party.${idColumn} = ri.${idField} OR party.customerCode = ri.${idField}`;
      return `(SELECT ${nameExpression} FROM ${tableName} party INNER JOIN purchaseorderitems poi ON poi.poNo = shipment.poNo LEFT JOIN requestitems ri ON ri.id = poi.requestItemId WHERE (poi.id = shipment.purchaseOrderItemId OR (NULLIF(shipment.deviceCode, '') IS NOT NULL AND ri.deviceCode = shipment.deviceCode)) AND (${referenceExpression}) ORDER BY (poi.id = shipment.purchaseOrderItemId) DESC LIMIT 1)`;
    }
  }
  if (partyDisplayFields.has(field)) {
    const isSupplier = field === "supplierCode" || field === "supplierName";
    const isUndertakingUnit = field === "undertakingUnitCode" || field === "undertakingUnitName";
    const idField = isSupplier ? "supplierId" : isUndertakingUnit ? "undertakingUnitId" : "customerId";
    const tableName = isSupplier ? "merge_common_suppliers" : isUndertakingUnit ? "merge_common_undertaking_units" : "merge_common_customers";
    const nameExpression = isSupplier
      ? "COALESCE(NULLIF(party.shortName, ''), NULLIF(party.nameCn, ''), party.supplierCode)"
      : isUndertakingUnit
        ? "COALESCE(NULLIF(party.shortName, ''), NULLIF(party.entityName, ''), NULLIF(party.name, ''), party.undertakingUnitCode)"
        : "COALESCE(NULLIF(party.shortName, ''), NULLIF(party.nameCn, ''), NULLIF(party.name, ''), party.customerCode)";
    const referenceExpression = isSupplier
      ? `party.supplierId = ${source}${idField} OR party.supplierCode = ${source}${idField}`
      : isUndertakingUnit
        ? `party.undertakingUnitId = ${source}${idField} OR party.undertakingUnitCode = ${source}${idField} OR party.entityCode = ${source}${idField}`
        : `party.customerId = ${source}${idField} OR party.customerCode = ${source}${idField}`;
    return `(SELECT ${nameExpression} FROM ${tableName} party WHERE ${referenceExpression} LIMIT 1)`;
  }
  return "";
}

function getDerivedRequestTypeExpression(config: EntityConfig, source: string) {
  if (!derivedRequestTypeEntityKeys.has(config.key)) return "";

  if (config.key === "monthly-billing-writeoffs") {
    return `COALESCE(
      NULLIF((
        SELECT COALESCE(NULLIF(purchaseItem.requestType, ''), NULLIF(ledger.requestType, ''), NULLIF(requestItem.requestType, ''), NULLIF(requestMaster.requestType, ''), '')
        FROM billinginstanceledgers AS ledger
        LEFT JOIN purchaseorderitems AS purchaseItem ON purchaseItem.id = ledger.purchaseOrderItemId
        LEFT JOIN requestitems AS requestItem ON requestItem.id = purchaseItem.requestItemId
        LEFT JOIN requests AS requestMaster ON requestMaster.requestNo = COALESCE(NULLIF(purchaseItem.requestNo, ''), NULLIF(requestItem.requestNo, ''), ${source}requestNo)
        WHERE ledger.ledgerId = ${source}ledgerId
        LIMIT 1
      ), ''),
      NULLIF((
        SELECT fallback.requestType
        FROM requestitems AS fallback
        WHERE fallback.requestNo = ${source}requestNo
          AND fallback.deviceCode = ${source}deviceCode
        LIMIT 1
      ), ''),
      '整机'
    )`;
  }

  return `COALESCE(
    NULLIF((
      SELECT COALESCE(NULLIF(purchaseItem.requestType, ''), NULLIF(ledger.requestType, ''), NULLIF(requestItem.requestType, ''), NULLIF(requestMaster.requestType, ''), '')
      FROM monthlybillingwriteoffs AS monthlyBilling
      LEFT JOIN billinginstanceledgers AS ledger ON ledger.ledgerId = monthlyBilling.ledgerId
      LEFT JOIN purchaseorderitems AS purchaseItem ON purchaseItem.id = ledger.purchaseOrderItemId
      LEFT JOIN requestitems AS requestItem ON requestItem.id = purchaseItem.requestItemId
      LEFT JOIN requests AS requestMaster ON requestMaster.requestNo = COALESCE(NULLIF(purchaseItem.requestNo, ''), NULLIF(requestItem.requestNo, ''), monthlyBilling.requestNo)
      WHERE FIND_IN_SET(monthlyBilling.id, ${source}billingSourceIds) > 0
      LIMIT 1
    ), ''),
    NULLIF((
      SELECT COALESCE(NULLIF(monthlyPrepayment.requestType, ''), NULLIF(contractItem.requestType, ''), NULLIF(requestItem.requestType, ''), NULLIF(requestMaster.requestType, ''), '')
      FROM monthlyprepaymentwriteoffs AS monthlyPrepayment
      LEFT JOIN prepaymentcontractitems AS contractItem ON contractItem.id = monthlyPrepayment.contractLineId
      LEFT JOIN requestitems AS requestItem ON requestItem.id = contractItem.requestItemId
      LEFT JOIN requests AS requestMaster ON requestMaster.requestNo = COALESCE(NULLIF(monthlyPrepayment.requestNo, ''), NULLIF(requestItem.requestNo, ''))
      WHERE FIND_IN_SET(monthlyPrepayment.id, ${source}prepaymentSourceIds) > 0
      LIMIT 1
    ), ''),
    CASE WHEN ${source}lineType = 'fee' THEN '费用' ELSE '整机' END
  )`;
}

function filterableFieldReference(config: EntityConfig, field: string, shipmentAlias = "") {
  return shipmentAlias ? `${shipmentAlias}.${quoteIdentifier(field)}` : `${quoteIdentifier(config.table)}.${quoteIdentifier(field)}`;
}

function getEntityFilterFieldExpression(config: EntityConfig, field: string, shipmentAlias = "") {
  const reference = filterableFieldReference(config, field, shipmentAlias);
  const fieldConfig = config.listFields.find((item) => item.key === field);
  if (field === "countryCode") return normalizeCountryExpression(reference);
  return fieldConfig?.type === "date" || fieldConfig?.type === "datetime"
    ? formatTableDateExpression(reference)
    : reference;
}

function normalizeCountryExpression(reference: string) {
  return `UPPER(TRIM(SUBSTRING_INDEX(${reference}, '-', 1)))`;
}

function getBatchOrderBy(batchName: string, tieBreakers: string) {
  return `
    ORDER BY
      CASE WHEN TRIM(COALESCE(${batchName}, '')) REGEXP '^[A-Za-z]+-[0-9]+$' THEN 0 ELSE 1 END,
      CAST(SUBSTRING_INDEX(TRIM(COALESCE(${batchName}, '')), '-', -1) AS UNSIGNED) DESC,
      UPPER(SUBSTRING_INDEX(TRIM(COALESCE(${batchName}, '')), '-', 1)) ASC,
      ${tieBreakers}
  `;
}

const financePartyEntityKeys = new Set(["request-items", "billing-ledgers", "prepayment-contract-items", "monthly-billing-writeoffs", "monthly-prepayment-writeoffs", "service-fee-snapshot-items", "internal-service-fees"]);

async function enrichFinancialPartyRows(entityKey: string, rows: Row[]) {
  if (!financePartyEntityKeys.has(entityKey) || !rows.length) return rows;
  const requestNos = uniqueValues(rows, "requestNo");
  const requestItems = requestNos.length
    ? await queryRows<Row>(
      "SELECT requestNo, deviceCode, supplierId, undertakingUnitId, customerId FROM requestitems WHERE requestNo IN (:requestNos)",
      { requestNos },
    )
    : [];
  const partyByRequestDevice = new Map(
    requestItems.map((item) => [`${String(item.requestNo ?? "")}::${String(item.deviceCode ?? "")}`, item]),
  );
  const enrichedRows: Row[] = rows.map((row) => {
    const party = partyByRequestDevice.get(`${String(row.requestNo ?? "")}::${String(row.deviceCode ?? "")}`);
    return {
      ...row,
      supplierId: row.supplierId || party?.supplierId || "",
      undertakingUnitId: row.undertakingUnitId || party?.undertakingUnitId || "",
      customerId: row.customerId || party?.customerId || "",
    };
  });
  const attachedRows = await attachPartyCodes(enrichedRows);
  return attachedRows.map((row) => ({
    ...row,
    // Financial list columns are named after the stored code fields, but the
    // visible value should be the current short name. The original IDs remain
    // available on the row for links and downstream actions.
    supplierCode: row.supplierName ?? row.supplierCode,
    undertakingUnitCode: row.undertakingUnitName ?? row.undertakingUnitCode,
    customerCode: row.customerName ?? row.customerCode,
  }));
}

async function enrichServiceFeeSnapshotParties(rows: Row[]) {
  if (!rows.length) return rows;
  const receivingUnitIds = uniqueValues(rows, "receivingUnitId");
  const payerCustomerIds = uniqueValues(rows, "payerCustomerId");
  const [units, customers] = await Promise.all([
    receivingUnitIds.length
      ? queryRows("SELECT undertakingUnitId, undertakingUnitCode, shortName, entityName, name FROM merge_common_undertaking_units WHERE undertakingUnitId IN (:receivingUnitIds) OR undertakingUnitCode IN (:receivingUnitIds) OR entityCode IN (:receivingUnitIds)", { receivingUnitIds })
      : [],
    payerCustomerIds.length
      ? queryRows("SELECT customerId, customerCode, shortName, nameCn, name FROM merge_common_customers WHERE customerId IN (:payerCustomerIds) OR customerCode IN (:payerCustomerIds)", { payerCustomerIds })
      : [],
  ]);
  const unitCodeById = new Map<string, string>();
  for (const row of units) {
    const label = String(row.shortName ?? row.entityName ?? row.name ?? row.undertakingUnitCode ?? row.undertakingUnitId ?? "");
    for (const key of [row.undertakingUnitId, row.undertakingUnitCode, row.entityCode]) if (key) unitCodeById.set(String(key), label);
  }
  const customerCodeById = new Map<string, string>();
  for (const row of customers) {
    const label = String(row.shortName ?? row.nameCn ?? row.name ?? row.customerCode ?? row.customerId ?? "");
    for (const key of [row.customerId, row.customerCode]) if (key) customerCodeById.set(String(key), label);
  }
  return rows.map((row) => ({
    ...row,
    receivingUnitCode: unitCodeById.get(String(row.receivingUnitId ?? "")) ?? String(row.receivingUnitId ?? ""),
    payerCustomerCode: customerCodeById.get(String(row.payerCustomerId ?? "")) ?? String(row.payerCustomerId ?? ""),
  }));
}

export async function getEntityRow(config: EntityConfig, id: string) {
  const table = quoteIdentifier(config.table);
  const primaryKey = quoteIdentifier(config.primaryKey);
  const derivedRequestType = getEntityDisplayFieldExpression(config, "requestType");
  const detailDisplayFields = config.key === "quotations"
    ? ["contractingUnitName", "customerName"]
    : config.key === "history-quotations"
      ? ["customerId"]
      : [];
  const detailDisplayExpressions = detailDisplayFields
    .map((field) => getEntityDisplayFieldExpression(config, field))
    .filter(Boolean)
    .map((expression, index) => `${expression} AS ${quoteIdentifier(detailDisplayFields[index])}`)
    .join(", ");
  const extraFields = [derivedRequestType ? `${derivedRequestType} AS ${quoteIdentifier("requestType")}` : "", detailDisplayExpressions].filter(Boolean).join(", ");
  const rows = await queryRows(
    `SELECT *${extraFields ? `, ${extraFields}` : ""} FROM ${table} WHERE ${primaryKey} = :id LIMIT 1`,
    { id },
  );
  return rows[0] ? normalizeQuotationPartyRow(config, rows[0]) : null;
}

export async function createEntityRow(config: EntityConfig, body: Row) {
  const normalizedBody = await normalizeEntityBody(config, withPrimaryKey(config, body));
  const nextBody = await assignCustomerPoItemLineNo(config, normalizedBody);
  validateRequiredFields(config, nextBody);
  const fields = getInsertFields(config);
  const table = quoteIdentifier(config.table);
  const columns = fields.map(quoteIdentifier).join(", ");
  const values = fields.map((field) => `:${field}`).join(", ");
  const params = Object.fromEntries(fields.map((field) => [field, getPersistenceValue(config, field, nextBody[field])]));

  await clearOtherDefaultRelationRows(config, nextBody, String(nextBody[config.primaryKey] ?? ""));
  await execute(`INSERT INTO ${table} (${columns}) VALUES (${values})`, params);
  await syncPrimaryContact(config, nextBody);
  return getEntityRow(config, String(nextBody[config.primaryKey]));
}

export async function updateEntityRow(config: EntityConfig, id: string, body: Row) {
  const fields = getWritableFields(config).filter((field) => field !== config.primaryKey);
  const table = quoteIdentifier(config.table);
  const primaryKey = quoteIdentifier(config.primaryKey);
  const assignments = fields.map((field) => `${quoteIdentifier(field)} = :${field}`).join(", ");
  const previousRow = config.key === "customer-po-items" ? await getEntityRow(config, id) : null;
  const nextBody = await normalizeEntityBody(config, body);
  if (previousRow && config.key === "customer-po-items") {
    nextBody.lineNo = previousRow.lineNo;
  }
  validateRequiredFields(config, nextBody);
  const previousBody = config.key.endsWith("-contacts") ? await getEntityRow(config, id) : null;
  if (config.key === "requests") await assertRequestTypeCanChange(id, String(nextBody.requestType));
  const params = Object.fromEntries(fields.map((field) => [field, getPersistenceValue(config, field, nextBody[field])]));

  await clearOtherDefaultRelationRows(config, nextBody, id);
  await execute(`UPDATE ${table} SET ${assignments} WHERE ${primaryKey} = :id`, {
    ...params,
    id,
  });
  await syncPrimaryContact(config, nextBody);
  if (previousBody) await syncPrimaryContact(config, previousBody);
  return getEntityRow(config, id);
}

async function assignCustomerPoItemLineNo(config: EntityConfig, body: Row) {
  if (config.key !== "customer-po-items") return body;

  const poId = String(body.poId ?? "").trim();
  if (!poId) return body;
  const rows = await queryRows<{ maxLineNo: number | null }>(
    "SELECT COALESCE(MAX(lineNo), 0) AS maxLineNo FROM merge_po_customer_po_items WHERE poId = :poId",
    { poId },
  );
  return { ...body, lineNo: Number(rows[0]?.maxLineNo ?? 0) + 1 };
}

function validateRequiredFields(config: EntityConfig, body: Row) {
  const missing = config.formFields.find((field) => field.required && String(body[field.key] ?? "").trim() === "");
  if (missing) throw new Error(`请填写${missing.label}`);
}

function getPersistenceValue(config: EntityConfig, field: string, value: unknown) {
  if (config.key === "customer-po-items") {
    if (field === "targetUnitPrice") return value === null || value === undefined || String(value).trim() === "" ? 0 : Number(value);
    if (field === "currency") return String(value ?? "").trim() || "USD";
    if (field === "matchStatus") return String(value ?? "").trim() || "unmatched";
  }
  return value ?? null;
}

function getContactRelation(config: EntityConfig) {
  if (config.key === "supplier-contacts") return { relationTable: "merge_common_supplier_contacts", ownerField: "supplierId", ownerTable: "merge_common_suppliers", ownerIdField: "supplierId" };
  if (config.key === "customer-contacts") return { relationTable: "merge_common_customer_contacts", ownerField: "customerId", ownerTable: "merge_common_customers", ownerIdField: "customerId" };
  if (config.key === "undertaking-unit-contacts") return { relationTable: "merge_common_undertaking_unit_contacts", ownerField: "undertakingUnitId", ownerTable: "merge_common_undertaking_units", ownerIdField: "undertakingUnitId" };
  return null;
}

async function syncPrimaryContact(config: EntityConfig, body: Row) {
  const relation = getContactRelation(config);
  if (!relation) return;
  const ownerId = body[relation.ownerField];
  if (!ownerId) return;
  const contacts = await queryRows<Row>(
    `SELECT name, phone, email
       FROM ${quoteIdentifier(relation.relationTable)}
      WHERE ${quoteIdentifier(relation.ownerField)} = :ownerId
        AND isPrimary = 1
      ORDER BY updatedAt DESC
      LIMIT 1`,
    { ownerId },
  );
  const contact = contacts[0];
  await execute(
    `UPDATE ${quoteIdentifier(relation.ownerTable)}
        SET contactName = :contactName,
            contactPhone = :contactPhone,
            contactEmail = :contactEmail
      WHERE ${quoteIdentifier(relation.ownerIdField)} = :ownerId`,
    {
      ownerId,
      contactName: contact?.name ?? null,
      contactPhone: contact?.phone ?? null,
      contactEmail: contact?.email ?? null,
    },
  );
}

async function clearOtherDefaultRelationRows(config: EntityConfig, body: Row, currentId: string) {
  const defaultField = config.key.endsWith("-bank-accounts") ? "isDefault" : config.key.endsWith("-contacts") ? "isPrimary" : "";
  const ownerField = config.formFields.find((field) => field.key.endsWith("Id") && field.key !== config.primaryKey)?.key ?? "";
  if (!defaultField || !ownerField || !body[ownerField] || !body[defaultField]) return;

  await execute(
    `UPDATE ${quoteIdentifier(config.table)} SET ${quoteIdentifier(defaultField)} = 0 WHERE ${quoteIdentifier(ownerField)} = :ownerId AND ${quoteIdentifier(config.primaryKey)} <> :currentId`,
    { ownerId: body[ownerField], currentId },
  );
}

async function assertRequestTypeCanChange(requestNo: string, nextRequestType: string) {
  const current = await getEntityRow(getRequestConfig(), requestNo);
  if (!current || String(current.requestType ?? "整机") === nextRequestType) return;

  const rows = await queryRows<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM purchaseorderitems poi
      LEFT JOIN requestitems ri ON ri.id = poi.requestItemId
      WHERE COALESCE(NULLIF(poi.requestNo, ''), ri.requestNo) = :requestNo
    `,
    { requestNo },
  );
  if (Number(rows[0]?.count ?? 0) > 0) {
    throw new Error("该需求单已产生采购数据，不能直接修改整机/备件类型");
  }
}

function getRequestConfig(): EntityConfig {
  return {
    key: "requests",
    title: "需求单",
    table: "requests",
    primaryKey: "requestNo",
    navGroup: "客户需求",
    route: "/requests/orders",
    description: "",
    filters: [],
    listFields: [],
    formFields: [],
  };
}

export async function deleteEntityRow(config: EntityConfig, id: string) {
  const table = quoteIdentifier(config.table);
  const primaryKey = quoteIdentifier(config.primaryKey);
  const previousBody = config.key.endsWith("-contacts") ? await getEntityRow(config, id) : null;
  await execute(`DELETE FROM ${table} WHERE ${primaryKey} = :id`, { id });
  if (previousBody) await syncPrimaryContact(config, previousBody);
}

export async function replaceEntityRows(config: EntityConfig, rows: Row[]) {
  for (const row of rows) {
    await upsertEntityRow(config, row);
  }
}

export async function upsertEntityRow(config: EntityConfig, row: Row) {
  const existing = await getEntityRow(config, String(row[config.primaryKey]));
  if (existing) {
    await updateEntityRow(config, String(row[config.primaryKey]), row);
  } else {
    await createEntityRow(config, row);
  }
}

async function enrichShipmentRows(rows: Row[]): Promise<Row[]> {
  const dcCodes = uniqueValues(rows, "dcCode");
  const locationIds = uniqueValues(rows, "destinationLocationId");
  const contactIds = uniqueValues(rows, "recipientContactId");
  const poNos = uniqueValues(rows, "poNo");
  const deviceCodes = uniqueValues(rows, "deviceCode");
  const [datacenters, locations, contacts, purchaseOrders, purchaseLines, instanceModels] = await Promise.all([
    dcCodes.length ? queryRows("SELECT dcCode, nameZh FROM datacenters WHERE dcCode IN (:dcCodes)", { dcCodes }) : [],
    locationIds.length
      ? queryRows("SELECT locationId, fullAddress FROM deliverylocations WHERE locationId IN (:locationIds)", { locationIds })
      : [],
    contactIds.length ? queryRows("SELECT contactId, name FROM deliverycontacts WHERE contactId IN (:contactIds)", { contactIds }) : [],
    poNos.length ? queryRows("SELECT purchaseOrderId, poNo FROM purchaseorders WHERE poNo IN (:poNos)", { poNos }) : [],
    poNos.length
      ? queryRows("SELECT poi.id AS purchaseOrderItemId, poi.poNo, COALESCE(NULLIF(poi.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(req.requestType, ''), '整机') AS requestType, ri.deviceCode, ri.supplierId, ri.undertakingUnitId, ri.customerId, req.countryCode, req.batchName FROM purchaseorderitems poi LEFT JOIN requestitems ri ON ri.id = poi.requestItemId LEFT JOIN requests req ON req.requestNo = ri.requestNo WHERE poi.poNo IN (:poNos)", { poNos })
      : [],
    deviceCodes.length
      ? queryRows("SELECT deviceCode, nameEn FROM instancemodels WHERE deviceCode IN (:deviceCodes)", { deviceCodes })
      : [],
  ]);
  const datacenterByCode = new Map(datacenters.map((row) => [String(row.dcCode), row]));
  const locationById = new Map(locations.map((row) => [String(row.locationId), row]));
  const contactById = new Map(contacts.map((row) => [String(row.contactId), row]));
  const purchaseOrderByPoNo = new Map(purchaseOrders.map((row) => [String(row.poNo), row]));
  const instanceModelByDeviceCode = new Map(instanceModels.map((row) => [String(row.deviceCode), row]));
  const purchaseLineById = new Map(purchaseLines.map((row) => [String(row.purchaseOrderItemId), row]));
  const purchaseLineByPoDevice = new Map(purchaseLines.map((row) => [`${String(row.poNo)}::${String(row.deviceCode ?? "")}`, row]));
  const purchaseLinesByPoNo = new Map<string, Row[]>();
  for (const line of purchaseLines) {
    const poNo = String(line.poNo ?? "");
    purchaseLinesByPoNo.set(poNo, [...(purchaseLinesByPoNo.get(poNo) ?? []), line]);
  }

  const enriched = rows.map((row): Row => {
    const datacenter = datacenterByCode.get(String(row.dcCode ?? ""));
    const location = locationById.get(String(row.destinationLocationId ?? ""));
    const contact = contactById.get(String(row.recipientContactId ?? ""));
    const poNo = String(row.poNo ?? "");
    const matchingPoLines = purchaseLinesByPoNo.get(poNo) ?? [];
    const purchaseLine = purchaseLineById.get(String(row.purchaseOrderItemId ?? ""))
      ?? purchaseLineByPoDevice.get(`${poNo}::${String(row.deviceCode ?? "")}`)
      ?? (matchingPoLines.length === 1 ? matchingPoLines[0] : undefined);
    const instanceModel = instanceModelByDeviceCode.get(String(row.deviceCode ?? ""));
    return {
      ...row,
      // The logistics record keeps its original value, while the list and export always show the current model name.
      nameEn: instanceModel?.nameEn ?? row.nameEn,
      countryCode: purchaseLine?.countryCode ?? row.countryCode ?? "",
      batchName: purchaseLine?.batchName ?? row.batchName ?? "",
      requestType: purchaseLine?.requestType ?? row.requestType ?? "整机",
      dcNameZh: datacenter?.nameZh ?? row.dcNameZh ?? row.dcCode,
      destinationAddress: location?.fullAddress ?? row.snapshotDestinationAddress ?? row.destinationLocationId,
      recipientName: contact?.name ?? row.snapshotRecipientName ?? row.recipientContactId,
      purchaseOrderId: purchaseOrderByPoNo.get(String(row.poNo ?? ""))?.purchaseOrderId ?? null,
      supplierId: purchaseLine?.supplierId ?? row.supplierId ?? "",
      undertakingUnitId: purchaseLine?.undertakingUnitId ?? row.undertakingUnitId ?? "",
      customerId: purchaseLine?.customerId ?? row.customerId ?? "",
      isReceived: isShipmentDelivered(row.deliveredAt),
    };
  });
  return attachPartyCodes(enriched);
}

function uniqueValues(rows: Row[], key: string) {
  return Array.from(new Set(rows.map((row) => String(row[key] ?? "").trim()).filter(Boolean)));
}
