import { randomUUID } from "crypto";
import { execute, queryRows, type Row } from "./db";
import { attachPartyCodes } from "./party-display";
import type { EntityConfig } from "./modules";
import { DEFAULT_PAGE_SIZE, normalizePageSize } from "./pagination";
import { requireRequestType } from "./request-type";

function quoteIdentifier(identifier: string) {
  return `\`${identifier.replace(/`/g, "``")}\``;
}

function getWritableFields(config: EntityConfig) {
  return config.formFields.map((field) => field.key);
}

function getInsertFields(config: EntityConfig) {
  return Array.from(new Set([config.primaryKey, ...getWritableFields(config)]));
}

const shipmentDisplayFields = new Set(["countryCode", "destinationAddress", "recipientName", "supplierCode", "undertakingUnitCode", "customerCode"]);
const partyCodeDisplayFields = new Set(["supplierCode", "undertakingUnitCode", "customerCode"]);

function isShipmentDelivered(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function withShipmentReceiptStatus(config: EntityConfig, body: Row) {
  if (config.key !== "shipments") return body;
  return { ...body, isReceived: isShipmentDelivered(body.deliveredAt) };
}

function normalizeEntityBody(config: EntityConfig, body: Row) {
  const nextBody = withShipmentReceiptStatus(config, body);
  if (["requests", "request-items", "purchase-order-items"].includes(config.key)) {
    return normalizePurchasePrices(config, {
      ...nextBody,
      requestType: requireRequestType(nextBody.requestType ?? "整机"),
    });
  }
  return normalizePurchasePrices(config, nextBody);
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
    [config.primaryKey]: `${config.key}-${randomUUID()}`,
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
  const displayOnlyFields = config.key === "request-items"
    ? new Set(["customerCode"])
    : config.key === "purchase-orders"
      ? new Set(["requestType"])
      : config.key === "service-fee-snapshots"
        ? new Set(["receivingUnitCode", "payerCustomerCode"])
    : config.key === "shipments"
    ? new Set([...shipmentDisplayFields, "requestType"])
    : financePartyEntityKeys.has(config.key)
      ? partyCodeDisplayFields
      : new Set<string>();
  const storageFields = fields.filter((field) => !displayOnlyFields.has(field));
  const selectedFields = storageFields
    .map((field) => shipmentAlias ? `${fieldReference(field)} AS ${quoteIdentifier(field)}` : quoteIdentifier(field))
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
    const keywordFields = storageFields.slice(0, 5);
    whereParts.push(
      `(${keywordFields.map((field) => `${fieldReference(field)} LIKE :keyword`).join(" OR ")})`,
    );
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

  const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  const orderBy = getEntityOrderBy(config, shipmentAlias);
  const [{ total }] = await queryRows<{ total: number }>(
    `SELECT COUNT(*) AS total FROM ${tableSource} ${where}`,
    params,
  );
  const normalizedTotal = Number(total ?? 0);
  const totalPages = Math.max(1, Math.ceil(normalizedTotal / pageSize));
  const page = Math.min(requestedPage, totalPages);
  params.limit = pageSize;
  params.offset = (page - 1) * pageSize;
  const rows = await queryRows(
    `SELECT ${selectedFields} FROM ${tableSource} ${where} ${orderBy} LIMIT :limit OFFSET :offset`,
    params,
  );

  const enrichedRows = config.key === "shipments"
    ? await enrichShipmentRows(rows)
    : config.key === "service-fee-snapshots"
      ? await enrichServiceFeeSnapshotParties(rows)
    : await enrichFinancialPartyRows(config.key, rows);
  return {
    rows: enrichedRows,
    total: normalizedTotal,
    page,
    pageSize,
    totalPages,
  };
}

function normalizeCountryCodeFilter(value: string) {
  return value.split(/\s*-\s*/, 1)[0].trim();
}

export function getEntityOrderBy(config: EntityConfig, shipmentAlias = "shipment") {
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
  const enrichedRows = rows.map((row) => {
    const party = partyByRequestDevice.get(`${String(row.requestNo ?? "")}::${String(row.deviceCode ?? "")}`);
    return {
      ...row,
      supplierId: row.supplierId || party?.supplierId || "",
      undertakingUnitId: row.undertakingUnitId || party?.undertakingUnitId || "",
      customerId: row.customerId || party?.customerId || "",
    };
  });
  return attachPartyCodes(enrichedRows);
}

async function enrichServiceFeeSnapshotParties(rows: Row[]) {
  if (!rows.length) return rows;
  const receivingUnitIds = uniqueValues(rows, "receivingUnitId");
  const payerCustomerIds = uniqueValues(rows, "payerCustomerId");
  const [units, customers] = await Promise.all([
    receivingUnitIds.length
      ? queryRows("SELECT undertakingUnitId, undertakingUnitCode FROM undertakingunits WHERE undertakingUnitId IN (:receivingUnitIds)", { receivingUnitIds })
      : [],
    payerCustomerIds.length
      ? queryRows("SELECT customerId, customerCode FROM customers WHERE customerId IN (:payerCustomerIds)", { payerCustomerIds })
      : [],
  ]);
  const unitCodeById = new Map(units.map((row) => [String(row.undertakingUnitId), String(row.undertakingUnitCode ?? row.undertakingUnitId ?? "")]));
  const customerCodeById = new Map(customers.map((row) => [String(row.customerId), String(row.customerCode ?? row.customerId ?? "")]));
  return rows.map((row) => ({
    ...row,
    receivingUnitCode: unitCodeById.get(String(row.receivingUnitId ?? "")) ?? String(row.receivingUnitId ?? ""),
    payerCustomerCode: customerCodeById.get(String(row.payerCustomerId ?? "")) ?? String(row.payerCustomerId ?? ""),
  }));
}

export async function getEntityRow(config: EntityConfig, id: string) {
  const table = quoteIdentifier(config.table);
  const primaryKey = quoteIdentifier(config.primaryKey);
  const rows = await queryRows(`SELECT * FROM ${table} WHERE ${primaryKey} = :id LIMIT 1`, { id });
  return rows[0] ?? null;
}

export async function createEntityRow(config: EntityConfig, body: Row) {
  const nextBody = normalizeEntityBody(config, withPrimaryKey(config, body));
  const fields = getInsertFields(config);
  const table = quoteIdentifier(config.table);
  const columns = fields.map(quoteIdentifier).join(", ");
  const values = fields.map((field) => `:${field}`).join(", ");
  const params = Object.fromEntries(fields.map((field) => [field, nextBody[field] ?? null]));

  await execute(`INSERT INTO ${table} (${columns}) VALUES (${values})`, params);
  return getEntityRow(config, String(nextBody[config.primaryKey]));
}

export async function updateEntityRow(config: EntityConfig, id: string, body: Row) {
  const fields = getWritableFields(config).filter((field) => field !== config.primaryKey);
  const table = quoteIdentifier(config.table);
  const primaryKey = quoteIdentifier(config.primaryKey);
  const assignments = fields.map((field) => `${quoteIdentifier(field)} = :${field}`).join(", ");
  const nextBody = normalizeEntityBody(config, body);
  if (config.key === "requests") await assertRequestTypeCanChange(id, String(nextBody.requestType));
  const params = Object.fromEntries(fields.map((field) => [field, nextBody[field] ?? null]));

  await execute(`UPDATE ${table} SET ${assignments} WHERE ${primaryKey} = :id`, {
    ...params,
    id,
  });
  return getEntityRow(config, id);
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
  await execute(`DELETE FROM ${table} WHERE ${primaryKey} = :id`, { id });
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
