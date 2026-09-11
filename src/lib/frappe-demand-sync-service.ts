import { createHash, randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { executeRaw, getDb, queryRowsRaw, type Row } from "./db";
import type { OperationActor } from "./operation-actor";

const SOURCE_SYSTEM = "frappe";
const MAPPING_TABLE = "merge_power_demand_sync_mappings";
const RUN_TABLE = "merge_power_demand_sync_runs";
const ITEM_TABLE = "merge_power_demand_sync_items";
const REQUEST_TABLE = "merge_power_requests";
const SYNC_LOCK_NAME = "suanli-frappe-demand-sync";
const DEFAULT_API_BASE_URL = "http://192.168.2.27:1337";
const DEFAULT_PAGE_SIZE = 200;

// 需要人工维护映射的只有供应商与实例型号；远端机房、收货地址、收件人信息
// 在采购确认时直接取远端快照，不再走本地映射。
const sourceTypes = ["supplier", "material"] as const;
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
  /** 远端机房（含国家），用于解析需求单所属国家。 */
  datacenters: Map<string, RemoteLogisticsDatacenter>;
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
  const [rawItems, rawOrders, rawSuppliers, rawMaterials, rawDatacenters] = await Promise.all([
    fetchFrappeList("Demand Order Item", ["name", "demand_order", "material", "supplier", "status", "customer_batch_no", "quantity", "requested_delivery_date", "modified"]),
    fetchFrappeList("Demand Order", ["name", "customer_po_no", "datacenter", "delivery_recipient_list", "modified"]),
    fetchFrappeList("Business Partner", ["name", "partner_code", "partner_alias", "name_zh", "modified", "is_supplier"]),
    fetchFrappeList("Material", ["name", "customer_item_code", "customer_part_no", "material_code", "model", "name_zh", "material_type", "modified"]),
    fetchFrappeList("Datacenter", ["name", "datacenter_code", "name_zh", "name_en", "country", "delivery_location", "modified"]),
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
  const datacenters = new Map(rawDatacenters.map((row) => {
    const datacenter: RemoteLogisticsDatacenter = {
      id: text(row.name), code: text(row.datacenter_code), nameZh: text(row.name_zh), nameEn: text(row.name_en),
      country: text(row.country), deliveryLocationId: text(row.delivery_location), modified: text(row.modified),
    };
    return [datacenter.id, datacenter] as const;
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
  ].filter((source) => source.id);
  return { items, orders, sources, datacenters };
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
  return ({ supplier: "supplier", material: "instance_model" } as const)[sourceType];
}

/**
 * 确认过的映射必须仍指向存在的本地档案：本地档案可能被删除（例如设备编码不符合 06/99
 * 约束被清理），此时映射必须作废并重新匹配，否则会一直显示"已确认"并让需求同步被挡住。
 */
async function localEntityExists(sourceType: SourceType, localEntityId: string) {
  if (!localEntityId) return false;
  if (sourceType === "material") {
    const rows = await queryRowsRaw<Row>("SELECT deviceCode FROM merge_power_instancemodels WHERE deviceCode = :id LIMIT 1", { id: localEntityId });
    return rows.length > 0;
  }
  if (sourceType === "supplier") {
    const rows = await queryRowsRaw<Row>("SELECT supplierId FROM merge_common_suppliers WHERE supplierId = :id LIMIT 1", { id: localEntityId });
    return rows.length > 0;
  }
  return true;
}

/** 本地档案已被删除的映射行（用于列表标识与筛选）。 */
const MAPPING_LOCAL_MISSING_SQL = `(localEntityId IS NOT NULL AND (
    (sourceType = 'material' AND NOT EXISTS (SELECT 1 FROM merge_power_instancemodels im WHERE im.deviceCode = localEntityId))
    OR (sourceType = 'supplier' AND NOT EXISTS (SELECT 1 FROM merge_common_suppliers s WHERE s.supplierId = localEntityId))
  ))`;
const MAPPING_LOCAL_ENTITY_SELECT = `CASE WHEN ${MAPPING_LOCAL_MISSING_SQL} THEN 0 WHEN localEntityId IS NOT NULL THEN 1 ELSE NULL END AS localEntityExists`;

function sourceTypeWhere(tab: string | null) {
  return tab === "material" ? "sourceType = 'material'" : "sourceType = 'supplier'";
}

/** 远端物料类型保存在 sourceDataJson.materialType，用于实例/物料映射的分类筛选。 */
const MAPPING_MATERIAL_TYPE_SQL = "UPPER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(sourceDataJson, '$.materialType')), ''))";
const MAPPING_MATERIAL_TYPES = ["EQUIPMENT", "COMPONENT", "MATERIAL"] as const;

function pageParams(params: URLSearchParams) {
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? 20) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
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
  return [];
}

async function saveSourceMapping(source: RemoteSource, actor: OperationActor | null) {
  const existing = (await queryRowsRaw<MappingRow>(
    `SELECT * FROM ${MAPPING_TABLE} WHERE sourceSystem = :sourceSystem AND sourceType = :sourceType AND sourceId = :sourceId LIMIT 1`,
    { sourceSystem: SOURCE_SYSTEM, sourceType: source.type, sourceId: source.id },
  ))[0];
  const candidates = await findCandidates(source);
  const automatic = candidates.length === 1 ? candidates[0] : null;
  const currentStatus = text(existing?.status) as MappingStatus;
  const currentLocalEntityId = text(existing?.localEntityId);
  // 本地档案被删除后不能再沿用确认状态，否则映射会一直显示"已确认"却指向不存在的档案。
  const preserveConfirmed = currentStatus === "confirmed" && Boolean(currentLocalEntityId)
    && await localEntityExists(source.type, currentLocalEntityId);
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
  const materialType = text(params.get("materialType")).toUpperCase();
  const baseConditions = ["sourceSystem = 'frappe'"];
  const values: Row = {};
  const localEntity = text(params.get("localEntity"));
  if (localEntity === "missing") baseConditions.push(MAPPING_LOCAL_MISSING_SQL);
  if (localEntity === "exists") baseConditions.push(`NOT ${MAPPING_LOCAL_MISSING_SQL} AND localEntityId IS NOT NULL`);
  if (keyword) {
    baseConditions.push("(sourceId LIKE :keyword OR sourceCode LIKE :keyword OR sourceName LIKE :keyword OR localDisplayName LIKE :keyword)");
    values.keyword = `%${keyword}%`;
  }
  if (["pending", "confirmed", "conflict", "ignored"].includes(status)) {
    baseConditions.push("status = :status");
    values.status = status;
  }
  const baseWhere = baseConditions.join(" AND ");
  const conditions = [...baseConditions, sourceTypeWhere(params.get("tab"))];
  if ((MAPPING_MATERIAL_TYPES as readonly string[]).includes(materialType)) {
    conditions.push(`${MAPPING_MATERIAL_TYPE_SQL} = :materialType`);
    values.materialType = materialType;
  }
  const where = conditions.join(" AND ");
  const { page, pageSize, offset } = pageParams(params);
  const [countRows, rows, sourceTypeRows, materialTypeRows] = await Promise.all([
    queryRowsRaw<{ total: number }>(`SELECT COUNT(*) AS total FROM ${MAPPING_TABLE} WHERE ${where}`, values),
    queryRowsRaw<MappingRow>(
      `SELECT *, ${MAPPING_LOCAL_ENTITY_SELECT} FROM ${MAPPING_TABLE} WHERE ${where}
        ORDER BY FIELD(status, 'conflict', 'pending', 'confirmed', 'ignored'), sourceType, sourceCode, sourceId
        LIMIT :limit OFFSET :offset`,
      { ...values, limit: pageSize, offset },
    ),
    // 分类计数沿用关键字/状态筛选，便于标签上直接显示各分类数量。
    queryRowsRaw<{ sourceType: string; total: number }>(
      `SELECT sourceType, COUNT(*) AS total FROM ${MAPPING_TABLE} WHERE ${baseWhere} GROUP BY sourceType`,
      values,
    ),
    queryRowsRaw<{ materialType: string; total: number }>(
      `SELECT ${MAPPING_MATERIAL_TYPE_SQL} AS materialType, COUNT(*) AS total
         FROM ${MAPPING_TABLE} WHERE ${baseWhere} AND sourceType = 'material' GROUP BY materialType`,
      values,
    ),
  ]);
  return {
    items: rows.map((row) => ({
      ...row,
      sourceData: parseJson(row.sourceDataJson),
      candidates: parseCandidates(row.candidateJson),
      localEntityExists: row.localEntityExists === null || row.localEntityExists === undefined ? null : Number(row.localEntityExists) === 1,
    })),
    total: Number(countRows[0]?.total ?? 0),
    page,
    pageSize,
    counts: Object.fromEntries(sourceTypeRows.map((row) => [row.sourceType, Number(row.total ?? 0)])),
    materialTypeCounts: Object.fromEntries(materialTypeRows.map((row) => [row.materialType || "unknown", Number(row.total ?? 0)])),
  };
}

export async function getFrappeDemandMappingMasterData() {
  // 机房 / 收货地址 / 收件人映射已废弃：同步只用供应商与实例型号映射，
  // 远端机房、地址、收件人信息在采购确认时直接取远端快照。
  const [suppliers, instanceModels] = await Promise.all([
    queryRowsRaw<Row>("SELECT supplierId, supplierCode, nameCn, shortName FROM merge_common_suppliers ORDER BY supplierCode, supplierId"),
    queryRowsRaw<Row>("SELECT deviceCode, modelCode, nameZh, nameEn FROM merge_power_instancemodels ORDER BY deviceCode"),
  ]);
  return { suppliers, instanceModels };
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
  return null;
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

/** 可建档状态：远端履约流程里除取消以外的全部状态。 */
const DEFAULT_SYNC_STATUSES = ["Issued to Supplier", "Confirmed", "Committed", "Handed Over", "Shipped", "Arrived", "Received"];
const DEFAULT_CANCELLED_STATUSES = ["Cancelled"];

function statusList(value: string | undefined, fallback: readonly string[]) {
  const configured = text(value).split(",").map(normalized).filter(Boolean);
  return configured.length ? configured : fallback.map(normalized);
}

/** 需要创建本地需求单草稿的远端状态。 */
function hasEligibleStatus(status: string) {
  // 兼容旧配置名 FRAPPE_DEMAND_ELIGIBLE_STATUS，未配置时默认放开除取消外的全部状态。
  const configured = process.env.FRAPPE_DEMAND_SYNC_STATUSES || process.env.FRAPPE_DEMAND_ELIGIBLE_STATUS;
  return statusList(configured, DEFAULT_SYNC_STATUSES).includes(normalized(status));
}

/** 取消状态：写入台账但不建档，也不计入待处理。 */
function isCancelledStatus(status: string) {
  return statusList(process.env.FRAPPE_DEMAND_CANCELLED_STATUSES, DEFAULT_CANCELLED_STATUSES).includes(normalized(status));
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

/**
 * 国家直接取远端机房维护的 country，不再依赖本地机房 / 收货地址映射。
 * 远端机房是唯一来源，本地机房与交付地址档案仅用于历史追溯。
 */
async function resolveCountryCode(datacenter?: RemoteLogisticsDatacenter) {
  return resolveSourceCountryCode(text(datacenter?.country));
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

async function prepareLine(
  item: RemoteDemandItem,
  order: RemoteDemandOrder,
  mappings: Map<string, MappingRow>,
  datacenters: Map<string, RemoteLogisticsDatacenter>,
): Promise<PreparedLine | string> {
  const supplier = mappings.get(sourceKey("supplier", item.supplierId));
  const material = mappings.get(sourceKey("material", item.materialId));
  const requestNo = localRequestNo(order.customerPoNo);
  if (!requestNo) return `需求主单 ${order.id} 缺少 customer_po_no，无法生成本地需求单号`;
  if (supplier?.status !== "confirmed" || !supplier.localEntityId) return `供应商 ${item.supplierId || "（空）"} 尚未确认映射`;
  if (material?.status !== "confirmed" || !material.localEntityId) return `物料 ${item.materialId || "（空）"} 尚未确认映射`;
  const model = (await queryRowsRaw<Row>("SELECT deviceCode, instanceType FROM merge_power_instancemodels WHERE deviceCode = :deviceCode LIMIT 1", { deviceCode: material.localEntityId }))[0];
  if (!model) return `本地实例型号 ${material.localEntityId} 不存在`;
  const countryCode = await resolveCountryCode(datacenters.get(order.datacenterId));
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

/** 台账里已经"处理过"的状态：这些明细再次出现时不再自动创建。 */
const TRACKED_ITEM_STATUSES = ["synced", "skipped_existing", "pending_change"] as const;

/** 远端明细快照，用于下一次同步做字段级 diff。 */
function itemSnapshot(item: RemoteDemandItem, order: RemoteDemandOrder) {
  return {
    quantity: item.quantity,
    status: item.status,
    supplierId: item.supplierId,
    materialId: item.materialId,
    requestedDeliveryDate: item.requestedDeliveryDate,
    modified: item.modified,
    order: {
      customerPoNo: order.customerPoNo,
      datacenterId: order.datacenterId,
      deliveryRecipientListId: order.deliveryRecipientListId,
      modified: order.modified,
    },
  };
}

const CHANGE_FIELD_LABELS: Record<string, string> = {
  quantity: "数量",
  status: "状态",
  supplierId: "供应商",
  materialId: "物料",
  requestedDeliveryDate: "需求发货日期",
  "order.customerPoNo": "客户PO号",
  "order.datacenterId": "机房",
  "order.deliveryRecipientListId": "收件人清单",
};

export type RemoteDemandChange = { field: string; label: string; from: string; to: string };

/** 对比台账里的上次快照与本次远端内容，列出发生变化的字段。 */
export function describeRemoteChanges(previousJson: unknown, current: ReturnType<typeof itemSnapshot>): RemoteDemandChange[] {
  const previous = parseJson(previousJson);
  if (!Object.keys(previous).length) return [];
  const flatten = (value: Record<string, unknown>) => {
    const order = (value.order ?? {}) as Record<string, unknown>;
    return {
      quantity: text(value.quantity),
      status: text(value.status),
      supplierId: text(value.supplierId),
      materialId: text(value.materialId),
      requestedDeliveryDate: text(value.requestedDeliveryDate),
      "order.customerPoNo": text(order.customerPoNo),
      "order.datacenterId": text(order.datacenterId),
      "order.deliveryRecipientListId": text(order.deliveryRecipientListId),
    } as Record<string, string>;
  };
  const before = flatten(previous);
  const after = flatten(current as unknown as Record<string, unknown>);
  return Object.keys(after)
    .filter((key) => before[key] !== after[key])
    .map((key) => ({ field: key, label: CHANGE_FIELD_LABELS[key] ?? key, from: before[key], to: after[key] }));
}

/** 写入/更新一条台账记录。preserveBaseline=true 时保留上次的比对基线（用于"远端已变更待核对"）。 */
async function persistLedgerItem(
  connection: PoolConnection,
  options: {
    item: RemoteDemandItem;
    order: RemoteDemandOrder;
    localRequestNo: string | null;
    localRequestItemId?: string | null;
    status: string;
    errorMessage?: string | null;
    changeJson?: RemoteDemandChange[] | null;
    preserveBaseline?: boolean;
  },
) {
  const { item, order } = options;
  const baselineAssignments = options.preserveBaseline
    ? ""
    : ", sourceModifiedAt=VALUES(sourceModifiedAt), sourceHash=VALUES(sourceHash), sourceDataJson=VALUES(sourceDataJson)";
  await connection.execute(
    `INSERT INTO ${ITEM_TABLE}
       (sourceItemId,sourceOrderId,localRequestNo,localRequestItemId,sourceModifiedAt,sourceHash,status,errorMessage,sourceDataJson,changeJson)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE sourceOrderId=VALUES(sourceOrderId), localRequestNo=VALUES(localRequestNo),
       localRequestItemId=VALUES(localRequestItemId), status=VALUES(status), errorMessage=VALUES(errorMessage),
       changeJson=VALUES(changeJson)${baselineAssignments}`,
    [
      item.id, order.id, options.localRequestNo, options.localRequestItemId ?? null,
      item.modified || order.modified || null, sourceHash(item, order),
      options.status, options.errorMessage ? options.errorMessage.slice(0, 1000) : null,
      JSON.stringify(itemSnapshot(item, order)),
      options.changeJson && options.changeJson.length ? JSON.stringify(options.changeJson) : null,
    ],
  );
}

async function persistBlockedItem(item: RemoteDemandItem, order: RemoteDemandOrder, _hash: string, message: string) {
  const connection = await getDb().getConnection();
  try {
    await persistLedgerItem(connection, { item, order, localRequestNo: null, status: "blocked", errorMessage: message });
  } finally {
    connection.release();
  }
}

async function requestExists(connection: PoolConnection, requestNo: string) {
  const [rows] = await connection.query<RowDataPacket[]>("SELECT requestNo FROM merge_power_requests WHERE requestNo = ? LIMIT 1", [requestNo]);
  return rows.length > 0;
}

async function persistSkippedExistingItems(connection: PoolConnection, order: RemoteDemandOrder, items: RemoteDemandItem[], requestNo: string) {
  const message = "本地需求单已存在，未覆盖";
  for (const item of items) {
    // 跳过一律保留变更基线：基线只在"建档/重新拉取"时更新，
    // 否则"远端已变更"的提示会被下一次跳过静默清掉。
    await persistLedgerItem(connection, {
      item, order, localRequestNo: requestNo, status: "skipped_existing",
      errorMessage: message, preserveBaseline: true,
    });
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
    // 远端履约状态回写到本地需求单（仅更新已存在的单，试运行不写）。
    if (!dryRun) await persistRequestRemoteStatus(snapshot);
    summary.fetchedItems = snapshot.items.length;
    const mappings = await loadFrappeMappings();
    const existingRows = await queryRowsRaw<Row>(`SELECT sourceItemId, sourceHash, status, sourceDataJson FROM ${ITEM_TABLE}`);
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
      const localExists = await requestExists(connection, requestNo);
      // 变更检测：无论本地需求单是否还在，都对台账已跟踪的明细逐条比对内容，
      // 保证"客户改了需求"一定有提示（包括没有被删除的本地单据）。
      const changedItems: Array<{ item: RemoteDemandItem; changes: RemoteDemandChange[] }> = [];
      for (let index = 0; index < items.length; index += 1) {
        const prior = existingById.get(items[index].id);
        if (!prior) continue;
        // reset：人工触发重新拉取留下的标记，等待本次按远端重建，不参与变更比对。
        if (text(prior.status) === "reset") continue;
        const tracked = (TRACKED_ITEM_STATUSES as readonly string[]).includes(text(prior.status));
        if (tracked && text(prior.sourceHash) === hashes[index]) continue;
        changedItems.push({ item: items[index], changes: describeRemoteChanges(prior.sourceDataJson, itemSnapshot(items[index], order)) });
      }
      if (changedItems.length) {
        summary.changedItems += changedItems.length;
        for (const entry of changedItems) {
          const detail = entry.changes.length
            ? `远端需求已变化：${entry.changes.map((change) => `${change.label} ${change.from || "空"} → ${change.to || "空"}`).join("；")}`
            : "远端需求已变化";
          const message = `${detail}；本地需求单不自动覆盖，请人工核对`;
          summary.errors.push({ sourceItemId: entry.item.id, error: message });
          if (!dryRun) {
            await persistLedgerItem(connection, {
              item: entry.item, order, localRequestNo: requestNo, status: "pending_change",
              errorMessage: message, changeJson: entry.changes, preserveBaseline: true,
            });
          }
        }
        summary.results.push({
          status: "pending_change", sourceOrderId: order.id, localRequestNo: requestNo, itemCount: items.length,
          reason: `远端需求已变化（${changedItems.length} 条明细）；${localExists ? "本地需求单已存在，未覆盖" : "本地需求单不存在，未自动重建"}，请人工核对`,
        });
        continue;
      }

      if (localExists) {
        const message = "本地需求单已存在，未覆盖";
        summary.skippedExisting += items.length;
        summary.results.push({ status: "skipped_existing", sourceOrderId: order.id, localRequestNo: requestNo, itemCount: items.length, reason: message });
        if (!dryRun) await persistSkippedExistingItems(connection, order, items, requestNo);
        continue;
      }

      const trackedItems = items.filter((item) => {
        const prior = existingById.get(item.id);
        return prior && (TRACKED_ITEM_STATUSES as readonly string[]).includes(text(prior.status));
      });
      if (trackedItems.length) {
        const message = "远端需求此前已同步，本次不自动重新创建";
        summary.skippedExisting += trackedItems.length;
        summary.results.push({ status: "skipped_existing", sourceOrderId: order.id, localRequestNo: requestNo, itemCount: items.length, reason: message });
        if (!dryRun) await persistSkippedExistingItems(connection, order, trackedItems, requestNo);
        continue;
      }

      const prepared = await Promise.all(items.map((item) => prepareLine(item, order, mappings, snapshot.datacenters)));
      const invalid = prepared.filter((line): line is string => typeof line === "string");
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
    // 状态已不在可同步范围的明细：只对台账里已跟踪过的明细更新轨迹，
    // 避免给"从未进入同步范围"的明细凭空建记录。
    // 取消明细：写入台账保留轨迹，但绝不建档，也不计入待处理/变更。
    if (!dryRun) {
      for (const item of snapshot.items) {
        if (!isCancelledStatus(item.status)) continue;
        const order = snapshot.orders.get(item.demandOrderId);
        if (!order) continue;
        const prior = existingById.get(item.id);
        if (text(prior?.status) === "cancelled" && text(prior?.sourceHash) === sourceHash(item, order)) continue;
        await persistLedgerItem(connection, {
          item, order,
          localRequestNo: text(prior?.localRequestNo) || localRequestNo(order.customerPoNo) || null,
          status: "cancelled",
          errorMessage: `远端状态为 ${item.status}，不创建本地需求单`,
        });
      }
    }
    if (!dryRun) {
      for (const item of snapshot.items) {
        if (hasEligibleStatus(item.status)) continue;
        if (isCancelledStatus(item.status)) continue;
        const prior = existingById.get(item.id);
        if (!prior) continue;
        const order = snapshot.orders.get(item.demandOrderId);
        if (!order) continue;
        if (text(prior.status) === "out_of_scope" && text(prior.sourceHash) === sourceHash(item, order)) continue;
        await persistLedgerItem(connection, {
          item, order, localRequestNo: text(prior.localRequestNo) || null, status: "out_of_scope",
          errorMessage: `远端明细状态为 ${item.status || "（空）"}，不在可同步范围内`,
        });
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

/**
 * 未处理数量汇总，用于标签上的红色徽标：
 * 映射 = 待处理(pending) + 冲突(conflict)；台账 = 存在待核对(pending_change)或被阻断(blocked)明细的需求单。
 */
export async function getFrappeDemandSyncUnhandledSummary() {
  const [mappingRows, ledgerRows] = await Promise.all([
    queryRowsRaw<{ sourceType: string; total: number }>(
      `SELECT sourceType, COUNT(*) AS total FROM ${MAPPING_TABLE}
        WHERE sourceSystem = :sourceSystem AND status IN ('pending', 'conflict')
        GROUP BY sourceType`,
      { sourceSystem: SOURCE_SYSTEM },
    ),
    queryRowsRaw<{ total: number }>(
      `SELECT COUNT(*) AS total FROM (
         SELECT i.sourceOrderId FROM ${ITEM_TABLE} i
          GROUP BY i.sourceOrderId
         HAVING SUM(i.status IN ('pending_change', 'blocked')) > 0
       ) unhandledOrders`,
    ),
  ]);
  return {
    mappings: Object.fromEntries(mappingRows.map((row) => [text(row.sourceType), Number(row.total ?? 0)])),
    ledger: Number(ledgerRows[0]?.total ?? 0),
  };
}

/** 远端履约状态的生命周期顺序：主单状态取"所有未取消明细中最靠前（最慢）的那条"。 */
const REMOTE_STATUS_ORDER = ["Issued to Supplier", "Confirmed", "Committed", "Handed Over", "Shipped", "Arrived", "Received"];

/**
 * 把远端明细状态按需求单聚合写入本地需求单（只更新已存在的本地单）。
 * 内容未变化时不写库，避免每次同步都把需求单的更新时间刷掉。
 */
async function persistRequestRemoteStatus(snapshot: RemoteSnapshot) {
  const rankOf = (status: string) => {
    const index = REMOTE_STATUS_ORDER.findIndex((value) => normalized(value) === normalized(status));
    return index < 0 ? REMOTE_STATUS_ORDER.length : index;
  };
  const byOrder = new Map<string, RemoteDemandItem[]>();
  for (const item of snapshot.items) {
    byOrder.set(item.demandOrderId, [...(byOrder.get(item.demandOrderId) ?? []), item]);
  }
  let updated = 0;
  for (const [orderId, items] of byOrder) {
    const order = snapshot.orders.get(orderId);
    if (!order) continue;
    const requestNo = localRequestNo(order.customerPoNo);
    if (!requestNo) continue;
    const active = items.filter((item) => !isCancelledStatus(item.status));
    const cancelledCount = items.length - active.length;
    const remoteStatus = active.length
      ? active.map((item) => item.status).sort((left, right) => rankOf(left) - rankOf(right))[0]
      : items[0].status;
    // 远端整单取消：草稿/待下单且未被下游引用的本地需求单自动取消，并登记取消来源。
    if (isCancelledStatus(remoteStatus)) {
      const local = (await queryRowsRaw<Row>("SELECT status FROM " + REQUEST_TABLE + " WHERE requestNo = :requestNo LIMIT 1", { requestNo }))[0];
      if (!local || text(local.status) === "已取消") continue;
      const usage = (await queryRowsRaw<Row>(
        `SELECT
           (SELECT COUNT(*) FROM merge_power_billinginstanceledgers WHERE requestNo = :requestNo) AS ledgerRows,
           (SELECT COUNT(*) FROM merge_power_prepaymentcontractitems WHERE requestNo = :requestNo) AS prepayRows,
           (SELECT COUNT(*) FROM merge_power_purchaseorderitems poi
              JOIN merge_power_purchaseorders po ON po.purchaseOrderId = poi.purchaseOrderId
             WHERE poi.requestNo = :requestNo AND po.status LIKE '%确认%') AS confirmedPoItems`,
        { requestNo },
      ))[0];
      const inUse = Number(usage?.ledgerRows ?? 0) > 0 || Number(usage?.prepayRows ?? 0) > 0 || Number(usage?.confirmedPoItems ?? 0) > 0;
      const cancellable = ["草稿", "待下单"].includes(text(local.status)) && !inUse;
      if (cancellable) {
        await executeRaw(
          `UPDATE ${REQUEST_TABLE}
              SET status = '已取消', cancelReason = 'remote_cancelled', cancelledAt = CURRENT_TIMESTAMP,
                  cancelledByName = '系统同步（远端取消）', remoteStatus = :remoteStatus,
                  remoteStatusUpdatedAt = CURRENT_TIMESTAMP, remoteCancelledItemCount = :cancelledCount
            WHERE requestNo = :requestNo`,
          { remoteStatus, cancelledCount, requestNo },
        );
      } else {
        await executeRaw(
          `UPDATE ${REQUEST_TABLE}
              SET remoteStatus = :remoteStatus, remoteStatusUpdatedAt = CURRENT_TIMESTAMP, remoteCancelledItemCount = :cancelledCount
            WHERE requestNo = :requestNo`,
          { remoteStatus, cancelledCount, requestNo },
        );
      }
      updated += 1;
      continue;
    }
    const result = await executeRaw(
      `UPDATE ${REQUEST_TABLE}
          SET remoteStatus = :remoteStatus, remoteStatusUpdatedAt = CURRENT_TIMESTAMP, remoteCancelledItemCount = :cancelledCount
        WHERE requestNo = :requestNo
          AND (COALESCE(remoteStatus, '') <> COALESCE(:remoteStatus, '') OR remoteCancelledItemCount <> :cancelledCount)`,
      { remoteStatus, cancelledCount, requestNo },
    ) as { affectedRows?: number };
    if (Number(result?.affectedRows ?? 0) > 0) updated += 1;
  }
  return { updated };
}

function parseChanges(value: unknown): RemoteDemandChange[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed.filter((item) => item && typeof item === "object") as RemoteDemandChange[]) : [];
  } catch {
    return [];
  }
}

/**
 * 同步台账：按远端需求单聚合，标出本地需求单是否还存在、远端是否已变更，
 * 用于回答"哪些单曾拉取过、后来被删了"以及"远端改了什么"。
 */
export async function listFrappeDemandSyncLedger(params: URLSearchParams) {
  const keyword = text(params.get("keyword"));
  const category = text(params.get("category"));
  const { page, pageSize, offset } = pageParams(params);
  const values: Row = { limit: pageSize, offset };
  const conditions: string[] = [];
  if (keyword) {
    conditions.push("(i.sourceOrderId LIKE :keyword OR i.localRequestNo LIKE :keyword)");
    values.keyword = `%${keyword}%`;
  }
  const having: string[] = [];
  if (category === "unhandled") having.push("SUM(i.status IN ('pending_change', 'blocked')) > 0");
  if (category === "local_exists") having.push("MAX(r.requestNo IS NOT NULL) = 1");
  if (category === "local_deleted") having.push("MAX(r.requestNo IS NOT NULL) = 0");
  if (category === "remote_changed") having.push("SUM(i.status = 'pending_change') > 0");
  if (category === "out_of_scope") having.push("SUM(i.status = 'out_of_scope') > 0");
  const from = `
    FROM ${ITEM_TABLE} i
    LEFT JOIN merge_power_requests r ON r.requestNo = i.localRequestNo
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    GROUP BY i.sourceOrderId
    ${having.length ? `HAVING ${having.join(" AND ")}` : ""}`;
  const [countRows, rows] = await Promise.all([
    queryRowsRaw<{ total: number }>(`SELECT COUNT(*) AS total FROM (SELECT i.sourceOrderId ${from}) groupedOrders`, values),
    queryRowsRaw<Row>(
      `SELECT i.sourceOrderId,
              MAX(i.localRequestNo) AS localRequestNo,
              COUNT(*) AS itemCount,
              SUM(i.status = 'pending_change') AS changedCount,
              SUM(i.status = 'out_of_scope') AS outOfScopeCount,
              SUM(i.status = 'blocked') AS blockedCount,
              MAX(r.requestNo IS NOT NULL) AS localExists,
              MAX(i.updatedAt) AS lastSyncedAt
       ${from}
       ORDER BY (SUM(i.status IN ('pending_change', 'blocked')) > 0) DESC, lastSyncedAt DESC
       LIMIT :limit OFFSET :offset`,
      values,
    ),
  ]);
  const unhandledRows = await queryRowsRaw<{ total: number }>(
    `SELECT COUNT(*) AS total FROM (
       SELECT i.sourceOrderId FROM ${ITEM_TABLE} i
        GROUP BY i.sourceOrderId
       HAVING SUM(i.status IN ('pending_change', 'blocked')) > 0
     ) unhandledOrders`,
  );
  return {
    items: rows.map((row) => ({
      sourceOrderId: text(row.sourceOrderId),
      localRequestNo: row.localRequestNo ? text(row.localRequestNo) : null,
      itemCount: Number(row.itemCount ?? 0),
      changedCount: Number(row.changedCount ?? 0),
      outOfScopeCount: Number(row.outOfScopeCount ?? 0),
      blockedCount: Number(row.blockedCount ?? 0),
      localExists: Number(row.localExists ?? 0) === 1,
      lastSyncedAt: row.lastSyncedAt ?? null,
    })),
    total: Number(countRows[0]?.total ?? 0),
    unhandledTotal: Number(unhandledRows[0]?.total ?? 0),
    page,
    pageSize,
  };
}

/** 某张需求单在台账里的逐条明细（含远端变更 diff）。 */
export async function listFrappeDemandSyncLedgerItems(sourceOrderId: string) {
  const rows = await queryRowsRaw<Row>(
    `SELECT i.sourceItemId, i.localRequestNo, i.localRequestItemId, i.status, i.errorMessage, i.changeJson,
            i.updatedAt, i.sourceDataJson, (r.requestNo IS NOT NULL) AS localRequestExists
       FROM ${ITEM_TABLE} i
       LEFT JOIN merge_power_requests r ON r.requestNo = i.localRequestNo
      WHERE i.sourceOrderId = :sourceOrderId
      ORDER BY i.sourceItemId`,
    { sourceOrderId: text(sourceOrderId) },
  );
  return {
    items: rows.map((row) => ({
      sourceItemId: text(row.sourceItemId),
      status: text(row.status),
      errorMessage: row.errorMessage ? text(row.errorMessage) : null,
      localRequestNo: row.localRequestNo ? text(row.localRequestNo) : null,
      localRequestItemId: row.localRequestItemId ? text(row.localRequestItemId) : null,
      localRequestExists: Number(row.localRequestExists ?? 0) === 1,
      updatedAt: row.updatedAt ?? null,
      changes: parseChanges(row.changeJson),
      remote: parseJson(row.sourceDataJson),
    })),
  };
}

/**
 * 人工触发重新拉取：把选中需求单的台账标记为 reset，使其回到"未同步"状态，
 * 再跑一次同步按远端重新创建草稿（已存在、映射不完整、状态不在范围的情况不会被重建）。
 */
export async function rebuildFrappeDemandOrders(sourceOrderIds: readonly string[], actor: OperationActor | null) {
  return rebuildOrders(sourceOrderIds, actor);
}

/**
 * 人工确认"远端变更我已核对"：把该需求单所有 pending_change 明细的比对基线刷新为当前远端内容，
 * 并清除变更提示（否则提示会一直挂着，只能靠重新拉取消除）。
 */
export async function acceptFrappeDemandChanges(sourceOrderId: string) {
  const id = text(sourceOrderId);
  if (!id) throw new Error("请指定需求单");
  const priorRows = await queryRowsRaw<Row>(
    `SELECT sourceItemId FROM ${ITEM_TABLE} WHERE sourceOrderId = :id AND status = 'pending_change'`,
    { id },
  );
  if (!priorRows.length) return { accepted: 0 };
  const snapshot = await loadRemoteSnapshot();
  const order = snapshot.orders.get(id);
  if (!order) throw new Error(`远端需求单 ${id} 不存在`);
  const itemsById = new Map(snapshot.items.map((item) => [item.id, item]));
  const connection = await getDb().getConnection();
  let accepted = 0;
  try {
    for (const row of priorRows) {
      const item = itemsById.get(text(row.sourceItemId));
      if (!item) continue;
      await persistLedgerItem(connection, {
        item, order,
        localRequestNo: localRequestNo(order.customerPoNo) || null,
        status: "skipped_existing",
        errorMessage: "人工核对后接受远端内容",
      });
      accepted += 1;
    }
  } finally {
    connection.release();
  }
  return { accepted };
}

async function rebuildOrders(sourceOrderIds: readonly string[], actor: OperationActor | null) {
  const ids = Array.from(new Set(sourceOrderIds.map(text).filter(Boolean)));
  if (!ids.length) throw new Error("请至少选择一张需求单");
  if (ids.length > 100) throw new Error("单次最多重新拉取 100 张需求单");
  // 注意：executeRaw 走预处理语句，命名占位符传数组不会被展开成 IN 列表，这里逐条更新。
  for (const sourceOrderId of ids) {
    await executeRaw(
      `UPDATE ${ITEM_TABLE} SET status = 'reset', errorMessage = '人工触发重新拉取', changeJson = NULL WHERE sourceOrderId = :sourceOrderId`,
      { sourceOrderId },
    );
  }
  const summary = await runFrappeDemandSync({ triggerType: "manual", actor });
  return {
    requested: ids,
    results: summary.results.filter((result) => ids.includes(result.sourceOrderId)),
    summary: {
      runId: summary.runId, createdRequests: summary.createdRequests, createdItems: summary.createdItems,
      blockedItems: summary.blockedItems, skippedExisting: summary.skippedExisting, changedItems: summary.changedItems,
    },
  };
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
