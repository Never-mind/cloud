import { randomUUID } from "crypto";
import { execute, queryRows, type Row } from "./db";
import { attachPartyCodes } from "./party-display";
import type { EntityConfig } from "./modules";

function quoteIdentifier(identifier: string) {
  return `\`${identifier.replace(/`/g, "``")}\``;
}

function getWritableFields(config: EntityConfig) {
  return config.formFields.map((field) => field.key);
}

function getInsertFields(config: EntityConfig) {
  return Array.from(new Set([config.primaryKey, ...getWritableFields(config)]));
}

const shipmentDisplayFields = new Set(["destinationAddress", "recipientName", "supplierCode", "undertakingUnitCode"]);
const partyCodeDisplayFields = new Set(["supplierCode", "undertakingUnitCode"]);

function isShipmentDelivered(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function withShipmentReceiptStatus(config: EntityConfig, body: Row) {
  if (config.key !== "shipments") return body;
  return { ...body, isReceived: isShipmentDelivered(body.deliveredAt) };
}

function normalizeEntityBody(config: EntityConfig, body: Row) {
  const nextBody = withShipmentReceiptStatus(config, body);
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
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
  const keyword = searchParams.get("keyword")?.trim();
  const fields = Array.from(new Set([...config.listFields, ...config.formFields].map((field) => field.key)));
  const displayOnlyFields = config.key === "shipments"
    ? shipmentDisplayFields
    : financePartyEntityKeys.has(config.key)
      ? partyCodeDisplayFields
      : new Set<string>();
  const storageFields = fields.filter((field) => !displayOnlyFields.has(field));
  const selectedFields = storageFields.map(quoteIdentifier).join(", ");
  const whereParts: string[] = [];
  const params: Row = { limit: pageSize, offset: (page - 1) * pageSize };

  if (keyword) {
    const keywordFields = storageFields.slice(0, 5);
    whereParts.push(
      `(${keywordFields.map((field) => `${quoteIdentifier(field)} LIKE :keyword`).join(" OR ")})`,
    );
    params.keyword = `%${keyword}%`;
  }

  for (const filter of config.filters) {
    if (filter.key === "keyword") continue;
    const value = searchParams.get(filter.key)?.trim();
    if (value) {
      if (config.key === "shipments" && filter.key === "receiptStatus") {
        if (value === "received") whereParts.push("`deliveredAt` IS NOT NULL");
        if (value === "unreceived") whereParts.push("`deliveredAt` IS NULL");
        continue;
      }
      whereParts.push(`${quoteIdentifier(filter.key)} = :${filter.key}`);
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
  const orderBy = config.defaultSort ? `ORDER BY ${config.defaultSort}` : "";
  const table = quoteIdentifier(config.table);
  const [{ total }] = await queryRows<{ total: number }>(
    `SELECT COUNT(*) AS total FROM ${table} ${where}`,
    params,
  );
  const rows = await queryRows(
    `SELECT ${selectedFields} FROM ${table} ${where} ${orderBy} LIMIT :limit OFFSET :offset`,
    params,
  );

  const enrichedRows = config.key === "shipments"
    ? await enrichShipmentRows(rows)
    : await enrichFinancialPartyRows(config.key, rows);
  return {
    rows: enrichedRows,
    total,
    page,
    pageSize,
  };
}

const financePartyEntityKeys = new Set(["billing-ledgers", "prepayment-contract-items", "monthly-billing-writeoffs", "monthly-prepayment-writeoffs", "service-fee-snapshot-items"]);

async function enrichFinancialPartyRows(entityKey: string, rows: Row[]) {
  if (!financePartyEntityKeys.has(entityKey) || !rows.length) return rows;
  const requestNos = uniqueValues(rows, "requestNo");
  const requestItems = requestNos.length
    ? await queryRows<Row>(
      "SELECT requestNo, deviceCode, supplierId, undertakingUnitId FROM requestitems WHERE requestNo IN (:requestNos)",
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
    };
  });
  return attachPartyCodes(enrichedRows);
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
  const params = Object.fromEntries(fields.map((field) => [field, nextBody[field] ?? null]));

  await execute(`UPDATE ${table} SET ${assignments} WHERE ${primaryKey} = :id`, {
    ...params,
    id,
  });
  return getEntityRow(config, id);
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
      ? queryRows("SELECT poi.id AS purchaseOrderItemId, poi.poNo, ri.deviceCode, ri.supplierId, ri.undertakingUnitId FROM purchaseorderitems poi LEFT JOIN requestitems ri ON ri.id = poi.requestItemId WHERE poi.poNo IN (:poNos)", { poNos })
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
      dcNameZh: datacenter?.nameZh ?? row.dcNameZh ?? row.dcCode,
      destinationAddress: location?.fullAddress ?? row.snapshotDestinationAddress ?? row.destinationLocationId,
      recipientName: contact?.name ?? row.snapshotRecipientName ?? row.recipientContactId,
      purchaseOrderId: purchaseOrderByPoNo.get(String(row.poNo ?? ""))?.purchaseOrderId ?? null,
      supplierId: purchaseLine?.supplierId ?? row.supplierId ?? "",
      undertakingUnitId: purchaseLine?.undertakingUnitId ?? row.undertakingUnitId ?? "",
      isReceived: isShipmentDelivered(row.deliveredAt),
    };
  });
  return attachPartyCodes(enriched);
}

function uniqueValues(rows: Row[], key: string) {
  return Array.from(new Set(rows.map((row) => String(row[key] ?? "").trim()).filter(Boolean)));
}
