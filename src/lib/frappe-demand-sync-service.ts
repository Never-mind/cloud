import { createHash, randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { executeRaw, getDb, queryRowsRaw, type Row } from "./db";
import type { OperationActor } from "./operation-actor";

const SOURCE_SYSTEM = "frappe";
const MAPPING_TABLE = "merge_power_demand_sync_mappings";
const RUN_TABLE = "merge_power_demand_sync_runs";
const ITEM_TABLE = "merge_power_demand_sync_items";
const SYNC_LOCK_NAME = "suanli-frappe-demand-sync";
const DEFAULT_API_BASE_URL = "http://192.168.2.27:1337";
const DEFAULT_PAGE_SIZE = 200;

const sourceTypes = ["supplier", "material", "datacenter", "delivery_location", "delivery_recipient_list"] as const;
type SourceType = (typeof sourceTypes)[number];
const activeMappingSourceTypes = ["supplier", "material"] as const;
type MappingStatus = "pending" | "confirmed" | "conflict" | "ignored";

type RemoteDemandItem = {
  id: string;
  demandOrderId: string;
  materialId: string;
  supplierId: string;
  status: string;
  batchName: string;
  quantity: number;
  requestedDeliveryDate: string;
  modified: string;
};

type RemoteDemandOrder = {
  id: string;
  customerPoNo: string;
  datacenterId: string;
  deliveryRecipientListId: string;
  modified: string;
};

type RemoteSource = {
  type: SourceType;
  id: string;
  code: string;
  name: string;
  modified: string;
  data: Record<string, unknown>;
};

type RemoteSnapshot = {
  items: RemoteDemandItem[];
  orders: Map<string, RemoteDemandOrder>;
  sources: RemoteSource[];
};

type RemoteLogisticsDatacenter = {
  id: string;
  code: string;
  nameZh: string;
  nameEn: string;
  country: string;
  deliveryLocationId: string;
  modified: string;
};

type RemoteLogisticsLocation = {
  id: string;
  locationType: string;
  country: string;
  state: string;
  city: string;
  address: string;
  modified: string;
};

type RemoteLogisticsRecipient = {
  id: string;
  rawContact: string;
  rawPhone: string;
  recipientsSummary: string;
  status: string;
  modified: string;
};

export type FrappeDemandLogisticsSnapshot = {
  remoteDemandOrderId: string;
  remoteDatacenterId: string;
  remoteDeliveryLocationId: string;
  remoteRecipientListId: string;
  datacenterName: string;
  destinationAddress: string;
  recipientName: string;
  recipientPhone: string;
  remoteModifiedAt: string | null;
  snapshotJson: string;
  snapshotAt: string;
};

export type FrappeDemandLogisticsLookup = {
  snapshotsByRequestNo: Map<string, FrappeDemandLogisticsSnapshot>;
  errorsByRequestNo: Map<string, string>;
};

type LocalCandidate = { id: string; label: string; entityType: string; method: string };

type MappingRow = Row & {
  mappingId: string;
  sourceType: SourceType;
  sourceId: string;
  sourceCode: string | null;
  sourceName: string | null;
  sourceDataJson: string | null;
  status: MappingStatus;
  localEntityType: string | null;
  localEntityId: string | null;
  localDisplayName: string | null;
  undertakingUnitId: string | null;
  candidateJson: string | null;
  matchMethod: string | null;
};

export type FrappeDemandSyncTrigger = "manual" | "scheduled" | "script";

export type FrappeDemandSyncResult = {
  status: "created" | "skipped_existing" | "blocked" | "pending_change";
  sourceOrderId: string;
  localRequestNo: string | null;
  itemCount: number;
  reason: string;
};

export type FrappeDemandSyncSummary = {
  runId: string;
  triggerType: FrappeDemandSyncTrigger;
  status: "success" | "failed";
  dryRun: boolean;
  fetchedItems: number;
  eligibleItems: number;
  createdRequests: number;
  createdItems: number;
  skippedExisting: number;
  blockedItems: number;
  changedItems: number;
  errors: Array<{ sourceItemId: string; error: string }>;
  results: FrappeDemandSyncResult[];
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return text(value).toLocaleLowerCase();
}

function normalizedPhone(value: unknown) {
  return text(value).replace(/\D/g, "");
}

function firstValue(...values: unknown[]) {
  return values.find((value) => text(value)) ?? "";
}

function parseJson(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseCandidates(value: unknown): LocalCandidate[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is LocalCandidate => Boolean(item && typeof item === "object")) : [];
  } catch {
    return [];
  }
}

function getConfig() {
  const token = text(process.env.FRAPPE_DEMAND_API_TOKEN || process.env.MATERIAL_API_TOKEN);
  if (!token) throw new Error("未配置 Frappe API 密钥，无法读取远端需求数据");
  const configuredPageSize = Number(process.env.FRAPPE_DEMAND_SYNC_PAGE_SIZE ?? DEFAULT_PAGE_SIZE);
  const pageSize = Number.isFinite(configuredPageSize)
    ? Math.min(Math.max(Math.floor(configuredPageSize), 1), 500)
    : DEFAULT_PAGE_SIZE;
  const timeout = Number(process.env.FRAPPE_DEMAND_SYNC_TIMEOUT_MS ?? 30_000);
  return {
    token,
    baseUrl: text(process.env.FRAPPE_DEMAND_API_BASE_URL || process.env.MATERIAL_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, ""),
    pageSize,
    timeoutMs: Number.isFinite(timeout) ? Math.min(Math.max(timeout, 1_000), 120_000) : 30_000,
  };
}

async function fetchFrappeList(doctype: string, fields: string[]) {
  const config = getConfig();
  const rows: Array<Record<string, unknown>> = [];
  let offset = 0;
  while (true) {
    const params = new URLSearchParams({
      fields: JSON.stringify(fields),
      limit_start: String(offset),
      limit_page_length: String(config.pageSize),
      order_by: "modified asc,name asc",
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}/api/resource/${encodeURIComponent(doctype)}?${params}`, {
        headers: { Authorization: `token ${config.token}`, Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(`读取远端 ${doctype} 失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }
    const payload = await response.json().catch(() => ({})) as { data?: unknown; exception?: string; exc_type?: string };
    if (!response.ok) throw new Error(`读取远端 ${doctype} 失败（HTTP ${response.status}${text(payload.exception || payload.exc_type) ? `：${text(payload.exception || payload.exc_type)}` : ""}）`);
    if (!Array.isArray(payload.data)) throw new Error(`远端 ${doctype} 返回格式无效：缺少 data 数组`);
    const page = payload.data as Array<Record<string, unknown>>;
    rows.push(...page);
    if (page.length < config.pageSize) break;
    offset += config.pageSize;
  }
  return rows;
}

async function loadRemoteSnapshot(): Promise<RemoteSnapshot> {
  const [rawItems, rawOrders, rawSuppliers, rawMaterials, rawDatacenters, rawLocations, rawRecipients] = await Promise.all([
    fetchFrappeList("Demand Order Item", ["name", "demand_order", "material", "supplier", "status", "customer_batch_no", "quantity", "requested_delivery_date", "modified"]),
    fetchFrappeList("Demand Order", ["name", "customer_po_no", "datacenter", "delivery_recipient_list", "modified"]),
    fetchFrappeList("Business Partner", ["name", "partner_code", "partner_alias", "name_zh", "modified", "is_supplier"]),
    fetchFrappeList("Material", ["name", "customer_item_code", "customer_part_no", "material_code", "model", "name_zh", "material_type", "modified"]),
    fetchFrappeList("Datacenter", ["name", "datacenter_code", "name_zh", "name_en", "country", "delivery_location", "modified"]),
    fetchFrappeList("Delivery Location", ["name", "location_type", "country", "state", "city", "address", "modified"]),
    fetchFrappeList("Delivery Recipient List", ["name", "raw_contact", "raw_phone", "recipients_summary", "status", "modified"]),
  ]);

  const items = rawItems.map((row) => ({
    id: text(row.name), demandOrderId: text(row.demand_order), materialId: text(row.material), supplierId: text(row.supplier),
    status: text(row.status), batchName: text(row.customer_batch_no), quantity: Number(row.quantity ?? 0),
    requestedDeliveryDate: text(row.requested_delivery_date), modified: text(row.modified),
  })).filter((item) => item.id && item.demandOrderId);
  const orders = new Map(rawOrders.map((row) => {
    const item: RemoteDemandOrder = {
      id: text(row.name), customerPoNo: text(row.customer_po_no), datacenterId: text(row.datacenter),
      deliveryRecipientListId: text(row.delivery_recipient_list), modified: text(row.modified),
    };
    return [item.id, item] as const;
  }).filter(([id]) => id));
  const sources: RemoteSource[] = [
    ...rawSuppliers.filter((row) => Number(row.is_supplier ?? 0) === 1).map((row) => ({
      type: "supplier" as const, id: text(row.name), code: text(row.partner_code), name: text(firstValue(row.partner_alias, row.name_zh)), modified: text(row.modified),
      data: { partnerCode: text(row.partner_code), partnerAlias: text(row.partner_alias), nameZh: text(row.name_zh) },
    })),
    ...rawMaterials.map((row) => ({
      type: "material" as const, id: text(row.name), code: text(row.customer_item_code), name: text(firstValue(row.name_zh, row.model)), modified: text(row.modified),
      data: { customerItemCode: text(row.customer_item_code), customerPartNo: text(row.customer_part_no), materialCode: text(row.material_code), model: text(row.model), nameZh: text(row.name_zh), materialType: text(row.material_type) },
    })),
    ...rawDatacenters.map((row) => ({
      type: "datacenter" as const, id: text(row.name), code: text(row.datacenter_code), name: text(firstValue(row.name_zh, row.name_en)), modified: text(row.modified),
      data: { datacenterCode: text(row.datacenter_code), nameZh: text(row.name_zh), nameEn: text(row.name_en), country: text(row.country), deliveryLocationId: text(row.delivery_location) },
    })),
    ...rawLocations.map((row) => ({
      type: "delivery_location" as const, id: text(row.name), code: text(row.name), name: text(firstValue(row.address, row.city, row.state)), modified: text(row.modified),
      data: { locationType: text(row.location_type), country: text(row.country), state: text(row.state), city: text(row.city), address: text(row.address) },
    })),
    ...rawRecipients.map((row) => ({
      type: "delivery_recipient_list" as const, id: text(row.name), code: text(row.name), name: text(firstValue(row.recipients_summary, row.raw_contact)), modified: text(row.modified),
      data: { rawContact: text(row.raw_contact), rawPhone: text(row.raw_phone), recipientsSummary: text(row.recipients_summary), status: text(row.status) },
    })),
  ].filter((source) => source.id);
  return { items, orders, sources };
}

function uniqueText(values: unknown[]) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const item = text(value);
    const key = normalized(item);
    if (!item || seen.has(key)) return [];
    seen.add(key);
    return [item];
  });
}

function latestRemoteModifiedAt(...values: unknown[]) {
  const dates = values.map(text).filter(Boolean).sort();
  return dates.at(-1) ?? null;
}

function buildRemoteLogisticsSnapshot(
  order: RemoteDemandOrder,
  datacenter: RemoteLogisticsDatacenter,
  location: RemoteLogisticsLocation,
  recipient: RemoteLogisticsRecipient,
) : FrappeDemandLogisticsSnapshot {
  const sourceFetchedAt = new Date().toISOString();
  const snapshotAt = sourceFetchedAt.replace("T", " ").replace(/\.\d{3}Z$/, "");
  const datacenterName = text(firstValue(datacenter.nameZh, datacenter.nameEn, datacenter.code, datacenter.id));
  const destinationAddress = uniqueText([location.address, location.city, location.state, location.country || datacenter.country]).join(", ");
  const recipientName = text(firstValue(recipient.rawContact, recipient.recipientsSummary));
  const recipientPhone = text(recipient.rawPhone);
  const remoteModifiedAt = latestRemoteModifiedAt(order.modified, datacenter.modified, location.modified, recipient.modified);
  return {
    remoteDemandOrderId: order.id,
    remoteDatacenterId: datacenter.id,
    remoteDeliveryLocationId: location.id,
    remoteRecipientListId: recipient.id,
    datacenterName,
    destinationAddress,
    recipientName,
    recipientPhone,
    remoteModifiedAt,
    snapshotAt,
    snapshotJson: JSON.stringify({
      datacenter: {
        id: datacenter.id,
        code: datacenter.code,
        name: datacenterName,
        country: datacenter.country,
        modifiedAt: datacenter.modified || null,
      },
      deliveryLocation: {
        id: location.id,
        locationType: location.locationType,
        country: location.country,
        state: location.state,
        city: location.city,
        address: location.address,
        displayAddress: destinationAddress,
        modifiedAt: location.modified || null,
      },
      recipients: {
        id: recipient.id,
        names: recipientName,
        phones: recipientPhone,
        summary: recipient.recipientsSummary,
        status: recipient.status,
        modifiedAt: recipient.modified || null,
      },
      demandOrder: {
        id: order.id,
        customerPoNo: order.customerPoNo,
        modifiedAt: order.modified || null,
      },
      sourceFetchedAt,
    }),
  };
}

/**
 * Fetches only the logistics records required to create shipment snapshots.
 * Remote data remains authoritative; this deliberately does not use local
 * datacenter, delivery-location, or delivery-contact master data.
 */
export async function getFrappeDemandLogistics(requestNos: string[]): Promise<FrappeDemandLogisticsLookup> {
  const normalizedRequestNos = Array.from(new Set(requestNos.map(text).filter(Boolean)));
  const snapshotsByRequestNo = new Map<string, FrappeDemandLogisticsSnapshot>();
  const errorsByRequestNo = new Map<string, string>();
  if (!normalizedRequestNos.length) return { snapshotsByRequestNo, errorsByRequestNo };

  const [rawOrders, rawDatacenters, rawLocations, rawRecipients] = await Promise.all([
    fetchFrappeList("Demand Order", ["name", "customer_po_no", "datacenter", "delivery_recipient_list", "modified"]),
    fetchFrappeList("Datacenter", ["name", "datacenter_code", "name_zh", "name_en", "country", "delivery_location", "modified"]),
    fetchFrappeList("Delivery Location", ["name", "location_type", "country", "state", "city", "address", "modified"]),
    fetchFrappeList("Delivery Recipient List", ["name", "raw_contact", "raw_phone", "recipients_summary", "status", "modified"]),
  ]);

  const ordersByCustomerPo = new Map<string, RemoteDemandOrder[]>();
  for (const row of rawOrders) {
    const order: RemoteDemandOrder = {
      id: text(row.name),
      customerPoNo: text(row.customer_po_no),
      datacenterId: text(row.datacenter),
      deliveryRecipientListId: text(row.delivery_recipient_list),
      modified: text(row.modified),
    };
    if (!order.id || !order.customerPoNo) continue;
    const key = normalized(order.customerPoNo);
    ordersByCustomerPo.set(key, [...(ordersByCustomerPo.get(key) ?? []), order]);
  }
  const datacentersById = new Map(rawDatacenters.map((row) => {
    const item: RemoteLogisticsDatacenter = {
      id: text(row.name), code: text(row.datacenter_code), nameZh: text(row.name_zh), nameEn: text(row.name_en),
      country: text(row.country), deliveryLocationId: text(row.delivery_location), modified: text(row.modified),
    };
    return [item.id, item] as const;
  }).filter(([id]) => id));
  const locationsById = new Map(rawLocations.map((row) => {
    const item: RemoteLogisticsLocation = {
      id: text(row.name), locationType: text(row.location_type), country: text(row.country), state: text(row.state),
      city: text(row.city), address: text(row.address), modified: text(row.modified),
    };
    return [item.id, item] as const;
  }).filter(([id]) => id));
  const recipientsById = new Map(rawRecipients.map((row) => {
    const item: RemoteLogisticsRecipient = {
      id: text(row.name), rawContact: text(row.raw_contact), rawPhone: text(row.raw_phone),
      recipientsSummary: text(row.recipients_summary), status: text(row.status), modified: text(row.modified),
    };
    return [item.id, item] as const;
  }).filter(([id]) => id));

  for (const requestNo of normalizedRequestNos) {
    const matches = ordersByCustomerPo.get(normalized(requestNo)) ?? [];
    if (!matches.length) {
      errorsByRequestNo.set(requestNo, `远端未找到需求单号 ${requestNo}`);
      continue;
    }
    if (matches.length > 1) {
      errorsByRequestNo.set(requestNo, `远端需求单号 ${requestNo} 存在 ${matches.length} 条记录，无法确定物流信息`);
      continue;
    }
    const order = matches[0];
    const datacenter = datacentersById.get(order.datacenterId);
    if (!datacenter) {
      errorsByRequestNo.set(requestNo, `远端需求单 ${order.id} 未关联有效机房`);
      continue;
    }
    const location = locationsById.get(datacenter.deliveryLocationId);
    if (!location) {
      errorsByRequestNo.set(requestNo, `远端机房 ${datacenter.code || datacenter.id} 未关联有效交付地址`);
      continue;
    }
    const recipient = recipientsById.get(order.deliveryRecipientListId);
    if (!recipient) {
      errorsByRequestNo.set(requestNo, `远端需求单 ${order.id} 未关联有效收件人信息`);
      continue;
    }
    snapshotsByRequestNo.set(requestNo, buildRemoteLogisticsSnapshot(order, datacenter, location, recipient));
  }

  return { snapshotsByRequestNo, errorsByRequestNo };
}

function sourceTargetType(sourceType: SourceType) {
  return ({ supplier: "supplier", material: "instance_model", datacenter: "datacenter", delivery_location: "delivery_location", delivery_recipient_list: "delivery_contact" } as const)[sourceType];
}

function sourceTypeWhere(tab: string | null) {
  if (tab === "supplier") return "sourceType = 'supplier'";
  if (tab === "material") return "sourceType = 'material'";
  if (tab === "datacenter") return "sourceType = 'datacenter'";
  if (tab === "delivery_location") return "sourceType = 'delivery_location'";
  if (tab === "delivery_recipient_list") return "sourceType = 'delivery_recipient_list'";
  return "sourceType IN ('datacenter', 'delivery_location', 'delivery_recipient_list')";
}

function uniqueCandidates(candidates: LocalCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.entityType}:${candidate.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function chooseCandidates(rows: Row[], idField: string, entityType: string, label: (row: Row) => string, method: string) {
  return uniqueCandidates(rows.map((row) => ({ id: text(row[idField]), label: label(row), entityType, method })).filter((candidate) => candidate.id));
}

async function findCandidates(source: RemoteSource): Promise<LocalCandidate[]> {
  const data = source.data;
  if (source.type === "supplier") {
    const rows = await queryRowsRaw<Row>("SELECT supplierId, supplierCode, nameCn, shortName FROM merge_common_suppliers");
    const byCode = rows.filter((row) => normalized(row.supplierCode) === normalized(data.partnerCode));
    if (byCode.length) return chooseCandidates(byCode, "supplierId", "supplier", (row) => `${text(row.supplierCode)} - ${text(firstValue(row.shortName, row.nameCn))}`, "partner_code");
    const names = [source.name, data.nameZh, data.partnerAlias].map(normalized).filter(Boolean);
    return chooseCandidates(rows.filter((row) => names.includes(normalized(row.nameCn)) || names.includes(normalized(row.shortName))), "supplierId", "supplier", (row) => `${text(row.supplierCode)} - ${text(firstValue(row.shortName, row.nameCn))}`, "supplier_name");
  }
  if (source.type === "material") {
    const rows = await queryRowsRaw<Row>("SELECT deviceCode, modelCode, xxllCode, nameZh, nameEn FROM merge_power_instancemodels");
    const rules: Array<[unknown, (row: Row) => unknown, string]> = [
      [data.customerItemCode, (row) => row.deviceCode, "customer_item_code"],
      [data.customerPartNo, (row) => row.deviceCode, "customer_part_no"],
      [data.materialCode, (row) => row.xxllCode, "material_code"],
    ];
    for (const [needle, field, method] of rules) {
      if (!normalized(needle)) continue;
      const matches = rows.filter((row) => normalized(field(row)) === normalized(needle));
      if (matches.length) return chooseCandidates(matches, "deviceCode", "instance_model", (row) => `${text(row.deviceCode)} - ${text(firstValue(row.nameZh, row.modelCode, row.nameEn))}`, method);
    }
    return [];
  }
  if (source.type === "datacenter") {
    const rows = await queryRowsRaw<Row>("SELECT dcCode, nameZh, nameEn FROM merge_power_datacenters");
    const codes = [source.id, data.datacenterCode].map(normalized).filter(Boolean);
    const matches = rows.filter((row) => codes.includes(normalized(row.dcCode)) || normalized(row.nameZh) === normalized(source.name) || normalized(row.nameEn) === normalized(source.name));
    return chooseCandidates(matches, "dcCode", "datacenter", (row) => `${text(row.dcCode)} - ${text(firstValue(row.nameZh, row.nameEn))}`, "datacenter_code");
  }
  if (source.type === "delivery_location") {
    const rows = await queryRowsRaw<Row>("SELECT locationId, nameZh, nameEn, fullAddress FROM merge_power_deliverylocations");
    const address = normalized(data.address);
    const matches = rows.filter((row) => normalized(row.locationId) === normalized(source.id) || (address && [row.fullAddress, row.nameZh, row.nameEn].some((value) => normalized(value) === address)));
    return chooseCandidates(matches, "locationId", "delivery_location", (row) => `${text(row.locationId)} - ${text(firstValue(row.nameZh, row.fullAddress, row.nameEn))}`, "location_id");
  }
  const rows = await queryRowsRaw<Row>("SELECT contactId, locationId, name, phone, email FROM merge_power_deliverycontacts");
  const phones = text(data.rawPhone).split("/").map(normalizedPhone).filter(Boolean);
  const names = text(data.rawContact).split("/").map(normalized).filter(Boolean);
  const byPhone = phones.length ? rows.filter((row) => phones.includes(normalizedPhone(row.phone))) : [];
  const matches = byPhone.length ? byPhone : rows.filter((row) => names.includes(normalized(row.name)));
  return chooseCandidates(matches, "contactId", "delivery_contact", (row) => `${text(row.contactId)} - ${text(row.name)}${text(row.phone) ? ` (${text(row.phone)})` : ""}`, byPhone.length ? "contact_phone" : "contact_name");
}

async function saveSourceMapping(source: RemoteSource, actor: OperationActor | null) {
  const existing = (await queryRowsRaw<MappingRow>(
    `SELECT * FROM ${MAPPING_TABLE} WHERE sourceSystem = :sourceSystem AND sourceType = :sourceType AND sourceId = :sourceId LIMIT 1`,
    { sourceSystem: SOURCE_SYSTEM, sourceType: source.type, sourceId: source.id },
  ))[0];
  const candidates = await findCandidates(source);
  const automatic = candidates.length === 1 ? candidates[0] : null;
  const currentStatus = text(existing?.status) as MappingStatus;
  const preserveConfirmed = currentStatus === "confirmed" && text(existing?.localEntityId);
  const preserveIgnored = currentStatus === "ignored";
  const automaticConfirmed = Boolean(automatic);
  const status: MappingStatus = preserveConfirmed ? "confirmed" : preserveIgnored ? "ignored" : automaticConfirmed ? "confirmed" : candidates.length > 1 ? "conflict" : "pending";
  const values = {
    mappingId: existing?.mappingId ?? randomUUID(), sourceSystem: SOURCE_SYSTEM, sourceType: source.type, sourceId: source.id,
    sourceCode: source.code || null, sourceName: source.name || null, sourceModifiedAt: source.modified || null, sourceDataJson: JSON.stringify(source.data),
    status,
    localEntityType: preserveConfirmed ? existing.localEntityType : automatic?.entityType ?? null,
    localEntityId: preserveConfirmed ? existing.localEntityId : automatic?.id ?? null,
    localDisplayName: preserveConfirmed ? existing.localDisplayName : automatic?.label ?? null,
    undertakingUnitId: preserveConfirmed ? existing.undertakingUnitId : null,
    candidateJson: JSON.stringify(candidates), matchMethod: preserveConfirmed ? existing.matchMethod : automatic?.method ?? null,
    createdByUserId: existing?.createdByUserId ?? actor?.userId ?? null, createdByName: existing?.createdByName ?? actor?.displayName ?? null,
    updatedByUserId: actor?.userId ?? null, updatedByName: actor?.displayName ?? null,
  };
  if (existing) {
    await executeRaw(`UPDATE ${MAPPING_TABLE} SET sourceCode=:sourceCode, sourceName=:sourceName, sourceModifiedAt=:sourceModifiedAt, sourceDataJson=:sourceDataJson,
      status=:status, localEntityType=:localEntityType, localEntityId=:localEntityId, localDisplayName=:localDisplayName, undertakingUnitId=:undertakingUnitId,
      candidateJson=:candidateJson, matchMethod=:matchMethod, updatedByUserId=:updatedByUserId, updatedByName=:updatedByName WHERE mappingId=:mappingId`, values);
  } else {
    await executeRaw(`INSERT INTO ${MAPPING_TABLE}
      (mappingId,sourceSystem,sourceType,sourceId,sourceCode,sourceName,sourceModifiedAt,sourceDataJson,status,localEntityType,localEntityId,localDisplayName,undertakingUnitId,candidateJson,matchMethod,createdByUserId,createdByName,updatedByUserId,updatedByName)
      VALUES (:mappingId,:sourceSystem,:sourceType,:sourceId,:sourceCode,:sourceName,:sourceModifiedAt,:sourceDataJson,:status,:localEntityType,:localEntityId,:localDisplayName,:undertakingUnitId,:candidateJson,:matchMethod,:createdByUserId,:createdByName,:updatedByUserId,:updatedByName)`, values);
  }
}

export async function refreshFrappeDemandMappings(actor: OperationActor | null) {
  const snapshot = await loadRemoteSnapshot();
  await Promise.all(snapshot.sources.filter((source) => activeMappingSourceTypes.includes(source.type as (typeof activeMappingSourceTypes)[number])).map((source) => saveSourceMapping(source, actor)));
  return {
    demandItems: snapshot.items.length,
    demandOrders: snapshot.orders.size,
    sources: Object.fromEntries(activeMappingSourceTypes.map((sourceType) => [sourceType, snapshot.sources.filter((source) => source.type === sourceType).length])),
  };
}

export async function listFrappeDemandMappings(params: URLSearchParams) {
  const keyword = text(params.get("keyword"));
  const status = text(params.get("status"));
  const conditions = ["sourceSystem = 'frappe'", sourceTypeWhere(params.get("tab"))];
  const values: Row = {};
  if (keyword) {
    conditions.push("(sourceId LIKE :keyword OR sourceCode LIKE :keyword OR sourceName LIKE :keyword OR localDisplayName LIKE :keyword)");
    values.keyword = `%${keyword}%`;
  }
  if (["pending", "confirmed", "conflict", "ignored"].includes(status)) {
    conditions.push("status = :status");
    values.status = status;
  }
  const rows = await queryRowsRaw<MappingRow>(`SELECT * FROM ${MAPPING_TABLE} WHERE ${conditions.join(" AND ")} ORDER BY FIELD(status, 'conflict', 'pending', 'confirmed', 'ignored'), sourceType, sourceCode, sourceId`, values);
  return {
    items: rows.map((row) => ({ ...row, sourceData: parseJson(row.sourceDataJson), candidates: parseCandidates(row.candidateJson) })),
    total: rows.length,
  };
}

export async function getFrappeDemandMappingMasterData() {
  const [suppliers, instanceModels, datacenters, locations, contacts] = await Promise.all([
    queryRowsRaw<Row>("SELECT supplierId, supplierCode, nameCn, shortName FROM merge_common_suppliers ORDER BY supplierCode, supplierId"),
    queryRowsRaw<Row>("SELECT deviceCode, modelCode, nameZh, nameEn FROM merge_power_instancemodels ORDER BY deviceCode"),
    queryRowsRaw<Row>("SELECT dcCode, nameZh, nameEn FROM merge_power_datacenters ORDER BY dcCode"),
    queryRowsRaw<Row>("SELECT locationId, nameZh, nameEn, fullAddress FROM merge_power_deliverylocations ORDER BY locationId"),
    queryRowsRaw<Row>("SELECT contactId, locationId, name, phone, email FROM merge_power_deliverycontacts ORDER BY contactId"),
  ]);
  return { suppliers, instanceModels, datacenters, locations, contacts };
}

async function findTarget(sourceType: SourceType, localEntityId: string) {
  if (sourceType === "supplier") {
    const row = (await queryRowsRaw<Row>("SELECT supplierId, supplierCode, nameCn, shortName FROM merge_common_suppliers WHERE supplierId = :id LIMIT 1", { id: localEntityId }))[0];
    return row ? { type: "supplier", id: text(row.supplierId), label: `${text(row.supplierCode)} - ${text(firstValue(row.shortName, row.nameCn))}` } : null;
  }
  if (sourceType === "material") {
    const row = (await queryRowsRaw<Row>("SELECT deviceCode, modelCode, nameZh, nameEn FROM merge_power_instancemodels WHERE deviceCode = :id LIMIT 1", { id: localEntityId }))[0];
    return row ? { type: "instance_model", id: text(row.deviceCode), label: `${text(row.deviceCode)} - ${text(firstValue(row.nameZh, row.modelCode, row.nameEn))}` } : null;
  }
  if (sourceType === "datacenter") {
    const row = (await queryRowsRaw<Row>("SELECT dcCode, nameZh, nameEn FROM merge_power_datacenters WHERE dcCode = :id LIMIT 1", { id: localEntityId }))[0];
    return row ? { type: "datacenter", id: text(row.dcCode), label: `${text(row.dcCode)} - ${text(firstValue(row.nameZh, row.nameEn))}` } : null;
  }
  if (sourceType === "delivery_location") {
    const row = (await queryRowsRaw<Row>("SELECT locationId, nameZh, nameEn, fullAddress FROM merge_power_deliverylocations WHERE locationId = :id LIMIT 1", { id: localEntityId }))[0];
    return row ? { type: "delivery_location", id: text(row.locationId), label: `${text(row.locationId)} - ${text(firstValue(row.nameZh, row.fullAddress, row.nameEn))}` } : null;
  }
  const row = (await queryRowsRaw<Row>("SELECT contactId, name, phone FROM merge_power_deliverycontacts WHERE contactId = :id LIMIT 1", { id: localEntityId }))[0];
  return row ? { type: "delivery_contact", id: text(row.contactId), label: `${text(row.contactId)} - ${text(row.name)}${text(row.phone) ? ` (${text(row.phone)})` : ""}` } : null;
}

export async function updateFrappeDemandMapping(mappingId: string, body: Row, actor: OperationActor | null) {
  const mapping = (await queryRowsRaw<MappingRow>(`SELECT * FROM ${MAPPING_TABLE} WHERE mappingId = :mappingId AND sourceSystem = 'frappe' LIMIT 1`, { mappingId }))[0];
  if (!mapping) throw new Error("映射记录不存在");
  const requestedStatus = text(body.status) || "confirmed";
  if (!["confirmed", "ignored", "pending"].includes(requestedStatus)) throw new Error("映射状态无效");
  let target: { type: string; id: string; label: string } | null = null;
  if (requestedStatus === "confirmed") {
    const localEntityId = text(body.localEntityId);
    if (!localEntityId) throw new Error("请选择本地对应档案后再确认映射");
    target = await findTarget(mapping.sourceType, localEntityId);
    if (!target || target.type !== sourceTargetType(mapping.sourceType)) throw new Error("所选本地档案不存在或类型不匹配");
  }
  // Demand ownership is now configured by local country, not individual datacenter.
  const undertakingUnitId = mapping.undertakingUnitId;
  await executeRaw(`UPDATE ${MAPPING_TABLE} SET status=:status, localEntityType=:localEntityType, localEntityId=:localEntityId, localDisplayName=:localDisplayName,
    undertakingUnitId=:undertakingUnitId, matchMethod=:matchMethod, updatedByUserId=:updatedByUserId, updatedByName=:updatedByName WHERE mappingId=:mappingId`, {
    mappingId, status: requestedStatus, localEntityType: target?.type ?? null, localEntityId: target?.id ?? null, localDisplayName: target?.label ?? null,
    undertakingUnitId, matchMethod: requestedStatus === "confirmed" ? "manual" : null, updatedByUserId: actor?.userId ?? null, updatedByName: actor?.displayName ?? null,
  });
  return (await queryRowsRaw<MappingRow>(`SELECT * FROM ${MAPPING_TABLE} WHERE mappingId = :mappingId`, { mappingId }))[0] ?? null;
}

function sourceKey(type: SourceType, id: string) {
  return `${type}:${id}`;
}

function sourceHash(item: RemoteDemandItem, order: RemoteDemandOrder) {
  return createHash("sha256").update(JSON.stringify({
    item: { id: item.id, materialId: item.materialId, supplierId: item.supplierId, status: item.status, quantity: item.quantity, requestedDeliveryDate: item.requestedDeliveryDate, modified: item.modified },
    order: { id: order.id, customerPoNo: order.customerPoNo, datacenterId: order.datacenterId, deliveryRecipientListId: order.deliveryRecipientListId, modified: order.modified },
  })).digest("hex");
}

function hasEligibleStatus(status: string) {
  const allowed = text(process.env.FRAPPE_DEMAND_ELIGIBLE_STATUS || "Committed").split(",").map(normalized).filter(Boolean);
  return allowed.includes(normalized(status));
}

export function localRequestNo(customerPoNo: unknown) {
  return text(customerPoNo).slice(0, 128);
}

function requestItemType(instanceType: unknown) {
  return normalized(instanceType) === "equipment" ? "整机" : "备件";
}

export function requestGroupType(requestTypes: string[]) {
  const types = [...new Set(requestTypes.map(text).filter(Boolean))];
  return types.length > 1 ? "整机+备件" : (types[0] ?? "整机");
}

function validDate(value: unknown) {
  const date = text(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : { date, timestamp: parsed.getTime() };
}

export function nearestPlannedDeliveryDate(values: unknown[], now = new Date()) {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return values
    .map(validDate)
    .filter((value): value is { date: string; timestamp: number } => Boolean(value))
    .sort((left, right) => Math.abs(left.timestamp - today) - Math.abs(right.timestamp - today) || left.timestamp - right.timestamp)[0]?.date ?? null;
}

async function resolveSourceCountryCode(sourceCountry: string) {
  if (!sourceCountry) return "";
  const countries = await queryRowsRaw<Row>("SELECT code, nameZh, nameEn, nameLocal FROM merge_power_countries");
  const matches = countries.filter((country) => [country.code, country.nameZh, country.nameEn, country.nameLocal].some((value) => normalized(value) === normalized(sourceCountry)));
  return matches.length === 1 ? text(matches[0].code) : "";
}

async function resolveCountryCode(sourceDatacenter?: MappingRow) {
  // The Frappe datacenter is the source of truth.  Local datacenter/location
  // relations are retained only as a compatibility fallback for older records.
  const sourceCountry = text(parseJson(sourceDatacenter?.sourceDataJson).country);
  const sourceCountryCode = await resolveSourceCountryCode(sourceCountry);
  if (sourceCountryCode) return sourceCountryCode;

  const datacenterCode = text(sourceDatacenter?.localEntityId);
  if (!datacenterCode) return "";
  const datacenter = (await queryRowsRaw<Row>("SELECT locationId FROM merge_power_datacenters WHERE dcCode = :dcCode LIMIT 1", { dcCode: datacenterCode }))[0];
  const locationId = text(datacenter?.locationId);
  if (locationId) {
    const location = (await queryRowsRaw<Row>("SELECT countryCode FROM merge_power_deliverylocations WHERE locationId = :locationId LIMIT 1", { locationId }))[0];
    if (text(location?.countryCode)) return text(location?.countryCode);
  }
  return "";
}

type PreparedLine = {
  sourceItem: RemoteDemandItem;
  requestNo: string;
  requestItemId: string;
  deviceCode: string;
  requestType: string;
  supplierId: string;
  undertakingUnitId: string;
  customerId: string;
  countryCode: string;
  sourceHash: string;
};

async function loadFrappeMappings() {
  const rows = await queryRowsRaw<MappingRow>(`SELECT * FROM ${MAPPING_TABLE} WHERE sourceSystem = 'frappe'`);
  return new Map(rows.map((row) => [sourceKey(row.sourceType, row.sourceId), row]));
}

async function prepareLine(item: RemoteDemandItem, order: RemoteDemandOrder, mappings: Map<string, MappingRow>): Promise<PreparedLine | string> {
  const supplier = mappings.get(sourceKey("supplier", item.supplierId));
  const material = mappings.get(sourceKey("material", item.materialId));
  const datacenter = mappings.get(sourceKey("datacenter", order.datacenterId));
  const requestNo = localRequestNo(order.customerPoNo);
  if (!requestNo) return `需求主单 ${order.id} 缺少 customer_po_no，无法生成本地需求单号`;
  if (supplier?.status !== "confirmed" || !supplier.localEntityId) return `供应商 ${item.supplierId || "（空）"} 尚未确认映射`;
  if (material?.status !== "confirmed" || !material.localEntityId) return `物料 ${item.materialId || "（空）"} 尚未确认映射`;
  const model = (await queryRowsRaw<Row>("SELECT deviceCode, instanceType FROM merge_power_instancemodels WHERE deviceCode = :deviceCode LIMIT 1", { deviceCode: material.localEntityId }))[0];
  if (!model) return `本地实例型号 ${material.localEntityId} 不存在`;
  const countryCode = await resolveCountryCode(datacenter);
  if (!countryCode) return `远端机房 ${order.datacenterId || "（空）"} 的国家无法匹配本地国家管理`;
  const country = (await queryRowsRaw<Row>(`SELECT code, defaultUndertakingUnitId, defaultCustomerId FROM merge_power_countries WHERE code = :countryCode LIMIT 1`, { countryCode }))[0];
  const undertakingUnitId = text(country?.defaultUndertakingUnitId);
  const customerId = text(country?.defaultCustomerId);
  if (!undertakingUnitId || !customerId) return `国家 ${countryCode} 未维护默认承接单位或默认客户`;
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) return `需求数量必须大于 0`;
  return {
    sourceItem: item, requestNo, requestItemId: `F-${item.id}`.slice(0, 64), deviceCode: text(model.deviceCode), requestType: requestItemType(model.instanceType),
    supplierId: text(supplier.localEntityId), undertakingUnitId, customerId, countryCode, sourceHash: sourceHash(item, order),
  };
}

async function updateSyncRun(runId: string, values: Record<string, unknown>) {
  const assignments = Object.keys(values).map((key) => `\`${key}\` = :${key}`).join(", ");
  await executeRaw(`UPDATE ${RUN_TABLE} SET ${assignments}, updatedAt = CURRENT_TIMESTAMP WHERE syncRunId = :runId`, { ...values, runId });
}

async function persistBlockedItem(item: RemoteDemandItem, order: RemoteDemandOrder, hash: string, message: string) {
  await executeRaw(`INSERT INTO ${ITEM_TABLE} (sourceItemId,sourceOrderId,sourceModifiedAt,sourceHash,status,errorMessage)
    VALUES (:sourceItemId,:sourceOrderId,:sourceModifiedAt,:sourceHash,'blocked',:errorMessage)
    ON DUPLICATE KEY UPDATE sourceOrderId=VALUES(sourceOrderId), sourceModifiedAt=VALUES(sourceModifiedAt), sourceHash=VALUES(sourceHash), status='blocked', errorMessage=VALUES(errorMessage)`, {
    sourceItemId: item.id, sourceOrderId: order.id, sourceModifiedAt: item.modified || order.modified || null, sourceHash: hash, errorMessage: message.slice(0, 1000),
  });
}

async function requestExists(connection: PoolConnection, requestNo: string) {
  const [rows] = await connection.query<RowDataPacket[]>("SELECT requestNo FROM merge_power_requests WHERE requestNo = ? LIMIT 1", [requestNo]);
  return rows.length > 0;
}

async function persistSkippedExistingItems(connection: PoolConnection, order: RemoteDemandOrder, items: RemoteDemandItem[], requestNo: string) {
  const message = "本地需求单已存在，未覆盖";
  for (const item of items) {
    await connection.execute(
      `INSERT INTO ${ITEM_TABLE} (sourceItemId,sourceOrderId,localRequestNo,sourceModifiedAt,sourceHash,status,errorMessage)
       VALUES (?,?,?,?,?,'skipped_existing',?)
       ON DUPLICATE KEY UPDATE sourceOrderId=VALUES(sourceOrderId), localRequestNo=VALUES(localRequestNo), sourceModifiedAt=VALUES(sourceModifiedAt), sourceHash=VALUES(sourceHash), status='skipped_existing', errorMessage=VALUES(errorMessage)`,
      [item.id, order.id, requestNo, item.modified || order.modified || null, sourceHash(item, order), message],
    );
  }
}

async function createRequestGroup(connection: PoolConnection, order: RemoteDemandOrder, lines: PreparedLine[], actor: OperationActor | null) {
  const requestNo = lines[0].requestNo;
  if (await requestExists(connection, requestNo)) {
    await persistSkippedExistingItems(connection, order, lines.map((line) => line.sourceItem), requestNo);
    return "skipped_existing" as const;
  }
  const countryCodes = new Set(lines.map((line) => line.countryCode));
  const requestTypes = new Set(lines.map((line) => line.requestType));
  const plannedDate = nearestPlannedDeliveryDate(lines.map((line) => line.sourceItem.requestedDeliveryDate));
  await connection.execute(
    `INSERT INTO merge_power_requests (requestNo,countryCode,contractNo,batchName,requestType,status,plannedDeliveryDate,createdByUserId,createdByName,updatedByUserId,updatedByName)
     VALUES (?,?,?,?,?,'草稿',?,?,?,?,?)`,
    [requestNo, countryCodes.size === 1 ? lines[0].countryCode : null, requestNo, null, requestGroupType([...requestTypes]), plannedDate, actor?.userId ?? null, actor?.displayName ?? null, actor?.userId ?? null, actor?.displayName ?? null],
  );
  for (const line of lines) {
    await connection.execute(
      `INSERT INTO merge_power_requestitems (id,requestNo,deviceCode,requestType,supplierId,undertakingUnitId,customerId,requestedAt,quantity)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [line.requestItemId, requestNo, line.deviceCode, line.requestType, line.supplierId, line.undertakingUnitId, line.customerId, line.sourceItem.requestedDeliveryDate || null, line.sourceItem.quantity],
    );
    await connection.execute(
      `INSERT INTO ${ITEM_TABLE} (sourceItemId,sourceOrderId,localRequestNo,localRequestItemId,sourceModifiedAt,sourceHash,status,errorMessage)
       VALUES (?,?,?,?,?,?,'synced',NULL)
       ON DUPLICATE KEY UPDATE localRequestNo=VALUES(localRequestNo), localRequestItemId=VALUES(localRequestItemId), sourceModifiedAt=VALUES(sourceModifiedAt), sourceHash=VALUES(sourceHash), status='synced', errorMessage=NULL`,
      [line.sourceItem.id, order.id, requestNo, line.requestItemId, line.sourceItem.modified || order.modified || null, line.sourceHash],
    );
  }
  return "created" as const;
}

export async function runFrappeDemandSync({ triggerType = "manual", dryRun = false, actor = null }: { triggerType?: FrappeDemandSyncTrigger; dryRun?: boolean; actor?: OperationActor | null } = {}) {
  const runId = `FRAPPE-DEMAND-${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${randomUUID().slice(0, 8)}`;
  const connection = await getDb().getConnection();
  let locked = false;
  const summary: FrappeDemandSyncSummary = { runId, triggerType, status: "success", dryRun, fetchedItems: 0, eligibleItems: 0, createdRequests: 0, createdItems: 0, skippedExisting: 0, blockedItems: 0, changedItems: 0, errors: [], results: [] };
  try {
    const [lockRows] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK(?, 0) AS acquired", [SYNC_LOCK_NAME]);
    locked = Number(lockRows[0]?.acquired ?? 0) === 1;
    if (!locked) throw new Error("已有需求同步任务正在执行，请稍后再试");
    await connection.execute(`INSERT INTO ${RUN_TABLE} (syncRunId,triggerType,status,dryRun,startedAt) VALUES (?,?,'running',?,CURRENT_TIMESTAMP)`, [runId, triggerType, dryRun ? 1 : 0]);
    const snapshot = await loadRemoteSnapshot();
    await Promise.all(snapshot.sources.filter((source) => activeMappingSourceTypes.includes(source.type as (typeof activeMappingSourceTypes)[number])).map((source) => saveSourceMapping(source, actor)));
    summary.fetchedItems = snapshot.items.length;
    const mappings = await loadFrappeMappings();
    const existingRows = await queryRowsRaw<Row>(`SELECT sourceItemId, sourceHash, status FROM ${ITEM_TABLE}`);
    const existingById = new Map(existingRows.map((row) => [text(row.sourceItemId), row]));
    const groups = new Map<string, RemoteDemandItem[]>();
    for (const item of snapshot.items) {
      if (!hasEligibleStatus(item.status)) continue;
      summary.eligibleItems += 1;
      const group = groups.get(item.demandOrderId) ?? [];
      group.push(item);
      groups.set(item.demandOrderId, group);
    }
    for (const [orderId, items] of groups) {
      const order = snapshot.orders.get(orderId);
      if (!order) {
        const message = `需求主单 ${orderId} 不存在`;
        summary.results.push({ status: "blocked", sourceOrderId: orderId, localRequestNo: null, itemCount: items.length, reason: message });
        for (const item of items) {
          summary.blockedItems += 1;
          summary.errors.push({ sourceItemId: item.id, error: message });
          if (!dryRun) await persistBlockedItem(item, { id: orderId, customerPoNo: "", datacenterId: "", deliveryRecipientListId: "", modified: "" }, createHash("sha256").update(item.id).digest("hex"), message);
        }
        continue;
      }
      const requestNo = localRequestNo(order.customerPoNo);
      const hashes = items.map((item) => sourceHash(item, order));
      if (!requestNo) {
        const message = `需求主单 ${order.id} 缺少 customer_po_no，无法生成本地需求单号`;
        summary.results.push({ status: "blocked", sourceOrderId: order.id, localRequestNo: null, itemCount: items.length, reason: message });
        for (let index = 0; index < items.length; index += 1) {
          summary.blockedItems += 1;
          summary.errors.push({ sourceItemId: items[index].id, error: message });
          if (!dryRun) await persistBlockedItem(items[index], order, hashes[index], message);
        }
        continue;
      }
      if (await requestExists(connection, requestNo)) {
        const message = "本地需求单已存在，未覆盖";
        summary.skippedExisting += items.length;
        summary.results.push({ status: "skipped_existing", sourceOrderId: order.id, localRequestNo: requestNo, itemCount: items.length, reason: message });
        if (!dryRun) await persistSkippedExistingItems(connection, order, items, requestNo);
        continue;
      }
      const prepared = await Promise.all(items.map((item) => prepareLine(item, order, mappings)));
      const invalid = prepared.filter((line): line is string => typeof line === "string");
      const existing = items.map((item) => existingById.get(item.id)).filter(Boolean);
      if (existing.some((row) => ["synced", "skipped_existing", "pending_change"].includes(text(row?.status)))) {
        let hasChanges = false;
        for (let index = 0; index < items.length; index += 1) {
          const prior = existingById.get(items[index].id);
          if (prior && ["synced", "skipped_existing", "pending_change"].includes(text(prior.status)) && text(prior.sourceHash) === hashes[index]) summary.skippedExisting += 1;
          else {
            hasChanges = true;
            summary.changedItems += 1;
            const message = "远端需求已变化；本地需求单不自动覆盖，请人工核对";
            summary.errors.push({ sourceItemId: items[index].id, error: message });
            if (!dryRun) await executeRaw(`INSERT INTO ${ITEM_TABLE} (sourceItemId,sourceOrderId,localRequestNo,sourceModifiedAt,sourceHash,status,errorMessage)
              VALUES (:sourceItemId,:sourceOrderId,:localRequestNo,:sourceModifiedAt,:sourceHash,'pending_change',:errorMessage)
              ON DUPLICATE KEY UPDATE sourceOrderId=VALUES(sourceOrderId), localRequestNo=VALUES(localRequestNo), sourceModifiedAt=VALUES(sourceModifiedAt), sourceHash=VALUES(sourceHash), status='pending_change', errorMessage=VALUES(errorMessage)`, {
              sourceItemId: items[index].id, sourceOrderId: order.id, localRequestNo: requestNo, sourceModifiedAt: items[index].modified || order.modified || null, sourceHash: hashes[index], errorMessage: message,
            });
          }
        }
        summary.results.push({
          status: hasChanges ? "pending_change" : "skipped_existing",
          sourceOrderId: order.id,
          localRequestNo: requestNo,
          itemCount: items.length,
          reason: hasChanges ? "远端需求已变化；本地需求单不自动覆盖，请人工核对" : "远端需求此前已同步，本次不自动重新创建",
        });
        continue;
      }
      if (invalid.length) {
        const groupMessage = invalid[0];
        summary.results.push({ status: "blocked", sourceOrderId: order.id, localRequestNo: requestNo, itemCount: items.length, reason: groupMessage });
        for (let index = 0; index < items.length; index += 1) {
          const candidate = prepared[index];
          const message: string = typeof candidate === "string" ? candidate : "同一远端需求单存在未完成映射的明细，暂不部分创建";
          summary.blockedItems += 1;
          summary.errors.push({ sourceItemId: items[index].id, error: message });
          if (!dryRun) await persistBlockedItem(items[index], order, hashes[index], message);
        }
        continue;
      }
      const lines = prepared as PreparedLine[];
      if (dryRun) {
        summary.createdRequests += 1;
        summary.createdItems += lines.length;
        summary.results.push({ status: "created", sourceOrderId: order.id, localRequestNo: requestNo, itemCount: lines.length, reason: "试运行：映射完整，将创建草稿" });
        continue;
      }
      await connection.beginTransaction();
      try {
        const outcome = await createRequestGroup(connection, order, lines, actor);
        await connection.commit();
        if (outcome === "created") {
          summary.createdRequests += 1;
          summary.createdItems += lines.length;
          summary.results.push({ status: "created", sourceOrderId: order.id, localRequestNo: requestNo, itemCount: lines.length, reason: "已创建草稿" });
        } else {
          summary.skippedExisting += lines.length;
          summary.results.push({ status: "skipped_existing", sourceOrderId: order.id, localRequestNo: requestNo, itemCount: lines.length, reason: "本地需求单已存在，未覆盖" });
        }
      } catch (error) {
        await connection.rollback();
        const message = error instanceof Error ? error.message : String(error);
        summary.results.push({ status: "blocked", sourceOrderId: order.id, localRequestNo: requestNo, itemCount: items.length, reason: message });
        for (const item of items) {
          summary.blockedItems += 1;
          summary.errors.push({ sourceItemId: item.id, error: message });
          await persistBlockedItem(item, order, sourceHash(item, order), message);
        }
      }
    }
    await updateSyncRun(runId, { status: "success", fetchedItemCount: summary.fetchedItems, eligibleItemCount: summary.eligibleItems, createdRequestCount: summary.createdRequests, createdItemCount: summary.createdItems, skippedExistingCount: summary.skippedExisting, blockedItemCount: summary.blockedItems, changedItemCount: summary.changedItems, errorJson: JSON.stringify(summary.errors.slice(0, 200)), resultJson: JSON.stringify(summary.results.slice(0, 200)), finishedAt: new Date() });
    return summary;
  } catch (error) {
    summary.status = "failed";
    summary.errors.push({ sourceItemId: "", error: error instanceof Error ? error.message : String(error) });
    if (locked) {
      try { await updateSyncRun(runId, { status: "failed", errorJson: JSON.stringify(summary.errors), resultJson: JSON.stringify(summary.results.slice(0, 200)), finishedAt: new Date() }); } catch { /* retain the original error */ }
    }
    throw error;
  } finally {
    if (locked) await connection.query("SELECT RELEASE_LOCK(?)", [SYNC_LOCK_NAME]);
    connection.release();
  }
}

function parseSyncResults(value: unknown): FrappeDemandSyncResult[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): FrappeDemandSyncResult[] => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Record<string, unknown>;
      const status = text(candidate.status);
      if (!["created", "skipped_existing", "blocked", "pending_change"].includes(status)) return [];
      return [{
        status: status as FrappeDemandSyncResult["status"],
        sourceOrderId: text(candidate.sourceOrderId),
        localRequestNo: text(candidate.localRequestNo) || null,
        itemCount: Number(candidate.itemCount ?? 0),
        reason: text(candidate.reason),
      }];
    });
  } catch {
    return [];
  }
}

export async function listFrappeDemandSyncRuns() {
  const rows = await queryRowsRaw<Row>(`
    SELECT syncRunId, triggerType, status, dryRun, fetchedItemCount, eligibleItemCount,
           createdRequestCount, createdItemCount, skippedExistingCount, blockedItemCount,
           changedItemCount, resultJson, startedAt, finishedAt
      FROM ${RUN_TABLE}
     ORDER BY startedAt DESC
     LIMIT 20
  `);
  return {
    items: rows.map((row) => ({
      syncRunId: text(row.syncRunId),
      triggerType: text(row.triggerType),
      status: text(row.status),
      dryRun: Boolean(row.dryRun),
      fetchedItemCount: Number(row.fetchedItemCount ?? 0),
      eligibleItemCount: Number(row.eligibleItemCount ?? 0),
      createdRequestCount: Number(row.createdRequestCount ?? 0),
      createdItemCount: Number(row.createdItemCount ?? 0),
      skippedExistingCount: Number(row.skippedExistingCount ?? 0),
      blockedItemCount: Number(row.blockedItemCount ?? 0),
      changedItemCount: Number(row.changedItemCount ?? 0),
      startedAt: row.startedAt ?? null,
      finishedAt: row.finishedAt ?? null,
      results: parseSyncResults(row.resultJson),
    })),
  };
}

export const frappeDemandMappingTypes = activeMappingSourceTypes;
export { requestItemType, sourceHash };
