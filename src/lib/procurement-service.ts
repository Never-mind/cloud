import { execute, queryRows, type Row } from "./db";
import {
  buildAutoPurchaseOrderId,
  buildAutoPurchaseOrderNo,
  buildPurchaseDraft,
  buildShipmentDraft,
  normalizeRequestNos,
} from "./procurement-workflow";
import type { OperationActor } from "./operation-actor";
import {
  getFrappeDemandLogistics,
  loadRemoteShipmentTimelines,
  type FrappeDemandLogisticsSnapshot,
} from "./frappe-demand-sync-service";
import {
  pickReleaseTimeline,
  REMOTE_ONLY_SHIPMENT_COLUMNS,
  SHIPMENT_TIMELINE_COLUMNS,
  type RemoteShipmentTimeline,
} from "./remote-shipment-timeline";

type RequestItemRow = {
  id: string;
  requestNo?: string | null;
  requestType?: string | null;
};

type ShipmentLineRow = {
  purchaseOrderItemId: string;
  requestNo: string | null;
  batchName: string | null;
  deviceCode: string | null;
  nameEn: string | null;
  supplierId: string | null;
  undertakingUnitId: string | null;
};

type PurchaseOrderRow = Row & {
  purchaseOrderId: string;
  poNo: string;
  requestNo: string | null;
  sourceRequestNos: string | null;
  status: string | null;
};

type ShipmentSyncResult = {
  shipments: Row[];
  created: number;
  updated: number;
  remoteSnapshots: number;
  /** 本次未能取到远端快照、标记为待补全的物流条数。 */
  pending: number;
  /** 远端拉取失败的原因（tolerateRemoteFailure 为 true 时不再中断流程）。 */
  remoteErrors: string[];
};

type ExistingShipmentRow = Row & {
  shipmentId: string;
  poNo: string;
  purchaseOrderItemId: string | null;
  deviceCode: string | null;
  remoteLogisticsSourceStatus: string | null;
};

/**
 * 物流行 → 采购明细的关联条件。
 *
 * 采购明细 id 是 `POI-<purchaseOrderId>-<序号>`，而部分物流行（历史数据与按批次
 * 生成的数据）存的是 `POI-<poNo><purchaseOrderId>-<序号>`，多了一段 poNo 前缀，
 * 直接用 id 相等关联会全部对不上（实测 277/283 落空，导致误报"未关联需求单"）。
 * 所以再补一条"物流 id 以明细 id 去掉 `POI-` 前缀后的内容结尾"的后缀关联，
 * 两种格式都能命中。
 */
const SHIPMENT_TO_PO_ITEM_JOIN =
  "LEFT JOIN purchaseorderitems poi ON poi.id = s.purchaseOrderItemId" +
  " OR s.purchaseOrderItemId LIKE CONCAT('%', SUBSTRING(poi.id, 5))";

/** 远端快照可以直接覆盖的物流列（含 Release 时间与 releaseId）。 */
const REMOTE_WRITABLE_COLUMNS: string[] = [
  "dcCode",
  "dcNameZh",
  "destinationLocationId",
  "recipientContactId",
  "snapshotDestinationAddress",
  "snapshotRecipientName",
  "snapshotRecipientPhone",
  "remoteDemandOrderId",
  "remoteDatacenterId",
  "remoteDeliveryLocationId",
  "remoteRecipientListId",
  "remoteLogisticsSourceStatus",
  "remoteLogisticsModifiedAt",
  "logisticsSnapshotJson",
  "logisticsSnapshotAt",
  "transportMode",
  ...REMOTE_ONLY_SHIPMENT_COLUMNS,
];

export function shipmentRemoteLogisticsFields(snapshot: FrappeDemandLogisticsSnapshot): Row {
  return {
    // The original columns are retained only for history/import compatibility.
    // New logistics rows use the explicit remote fields below as the source IDs.
    dcCode: snapshot.remoteDatacenterId,
    dcNameZh: snapshot.datacenterName,
    destinationLocationId: snapshot.remoteDeliveryLocationId,
    recipientContactId: snapshot.remoteRecipientListId,
    snapshotDestinationAddress: snapshot.destinationAddress,
    snapshotRecipientName: snapshot.recipientName,
    snapshotRecipientPhone: snapshot.recipientPhone,
    // 远端没有维护运输方式时留空，避免把本地已有的值清成空串。
    ...(snapshot.transportMode ? { transportMode: snapshot.transportMode } : {}),
    remoteDemandOrderId: snapshot.remoteDemandOrderId,
    remoteDatacenterId: snapshot.remoteDatacenterId,
    remoteDeliveryLocationId: snapshot.remoteDeliveryLocationId,
    remoteRecipientListId: snapshot.remoteRecipientListId,
    remoteLogisticsSourceStatus: "remote",
    remoteLogisticsModifiedAt: snapshot.remoteModifiedAt,
    logisticsSnapshotJson: snapshot.snapshotJson,
    logisticsSnapshotAt: snapshot.snapshotAt,
  };
}

/**
 * 远端不可用时先生成物流单：远端字段留空，标记为 pending（待远端补全）。
 * 远端恢复后由「批量刷新远端物流」或「同步已确认采购订单」重新拉取并改回 remote。
 */
export function pendingShipmentRemoteLogisticsFields(): Row {
  return {
    dcCode: null,
    dcNameZh: null,
    remoteDemandOrderId: null,
    remoteDatacenterId: null,
    remoteDeliveryLocationId: null,
    remoteRecipientListId: null,
    remoteLogisticsSourceStatus: "pending",
    remoteLogisticsModifiedAt: null,
    logisticsSnapshotJson: null,
    logisticsSnapshotAt: null,
  };
}

/**
 * 本地实例编码 → 远端物料编码，走需求同步维护的实例型号映射。
 * 远端 DOI 用物料标识明细，物流行靠它把自己定位到所属 Release。
 */
async function loadRemoteMaterialByDeviceCode(deviceCodes: string[]) {
  const codes = [...new Set(deviceCodes.map((value) => value.trim()).filter(Boolean))];
  const map = new Map<string, string>();
  if (!codes.length) return map;
  const rows = await queryRows<Row>(
    `
      SELECT localEntityId, sourceCode, sourceId
        FROM merge_power_demand_sync_mappings
       WHERE sourceType = 'material' AND (localEntityId IN (:codes) OR sourceCode IN (:codes))
    `,
    { codes },
  );
  for (const row of rows) {
    const sourceId = String(row.sourceId ?? "").trim();
    if (!sourceId) continue;
    for (const candidate of [row.localEntityId, row.sourceCode]) {
      const key = String(candidate ?? "").trim();
      if (key) map.set(key, sourceId);
    }
  }
  return map;
}

/**
 * 取本地物流行所属 Release 的 `releaseId` 与时间节点。
 * 定位不到 Release（多 Release 且物料对不上）时返回空对象：宁可留空，
 * 也不把别的明细的时间写进来。
 */
function releaseTimelineFields(
  timeline: RemoteShipmentTimeline | undefined,
  materialByDeviceCode: Map<string, string>,
  deviceCode: unknown,
) {
  const material = materialByDeviceCode.get(String(deviceCode ?? "").trim()) ?? "";
  const release = pickReleaseTimeline(timeline, material);
  return release ? { releaseId: release.releaseId, ...release.fields } : {};
}

export async function createPurchaseOrderFromRequest(requestNo: string, poNo?: string, actor: OperationActor | null = null) {
  const requestRows = await queryRows<Row>(
    "SELECT requestNo FROM requests WHERE requestNo = :requestNo LIMIT 1",
    { requestNo },
  );
  if (!requestRows.length) {
    throw new Error("需求单不存在");
  }

  const existing = await queryRows<Row>(
    "SELECT purchaseOrderId, poNo FROM purchaseorders WHERE requestNo = :requestNo OR sourceRequestNos = :requestNo LIMIT 1",
    { requestNo },
  );
  if (existing[0]?.purchaseOrderId || existing[0]?.poNo) {
    await markRequestAsPendingOrder(requestNo, actor);
    return existing[0];
  }

  const purchaseOrderId = buildAutoPurchaseOrderId();
  const nextPoNo = poNo?.trim() || buildAutoPurchaseOrderNo(requestNo);

  const details = await queryRows<RequestItemRow>(
    "SELECT id, requestNo, requestType FROM requestitems WHERE requestNo = :requestNo ORDER BY id",
    { requestNo },
  );
  const draft = buildPurchaseDraft({
    purchaseOrderId,
    poNo: nextPoNo,
    requestNo,
    requestNos: [requestNo],
    details,
  });

  await execute(
    `
      INSERT INTO purchaseorders
        (purchaseOrderId, poNo, requestNo, sourceRequestNos, status, currency, usdRate, paymentDate, releasedAt,
         createdByUserId, createdByName, updatedByUserId, updatedByName)
      VALUES
        (:purchaseOrderId, :poNo, :requestNo, :sourceRequestNos, :status, :currency, :usdRate, NULL, NULL,
         :createdByUserId, :createdByName, :updatedByUserId, :updatedByName)
    `,
      { ...draft.order, createdByUserId: actor?.userId ?? null, createdByName: actor?.displayName ?? null, updatedByUserId: actor?.userId ?? null, updatedByName: actor?.displayName ?? null },
  );

  for (const item of draft.items) {
    await execute(
      `
        INSERT INTO purchaseorderitems
          (id, purchaseOrderId, poNo, requestNo, requestItemId, requestType, currency, unitPrice, hardwareCoefficient, softwareCoefficient, totalCoefficient)
        VALUES
          (:id, :purchaseOrderId, :poNo, :requestNo, :requestItemId, :requestType, :currency, :unitPrice, :hardwareCoefficient, :softwareCoefficient, :totalCoefficient)
      `,
      item,
    );
  }

  await markRequestAsPendingOrder(requestNo, actor);
  return draft.order;
}

export async function confirmPurchaseOrder(purchaseOrderIdOrPoNo: string, actor: OperationActor | null = null) {
  const rows = await queryRows<PurchaseOrderRow>(
    "SELECT purchaseOrderId, poNo, requestNo, sourceRequestNos, status FROM purchaseorders WHERE purchaseOrderId = :id OR poNo = :id LIMIT 1",
    { id: purchaseOrderIdOrPoNo },
  );
  const order = rows[0];
  if (!order) {
    throw new Error("采购单不存在");
  }

  const purchaseOrderId = String(order.purchaseOrderId ?? purchaseOrderIdOrPoNo);

  // 远端已取消的需求单不允许再确认采购订单，避免对已取消需求继续下单。
  const cancelledRequests = await queryRows<Row>(
    `SELECT DISTINCT req.requestNo
       FROM purchaseorderitems poi
       JOIN requests req ON req.requestNo = poi.requestNo
      WHERE poi.purchaseOrderId = :purchaseOrderId AND req.remoteStatus = 'Cancelled'`,
    { purchaseOrderId },
  );
  if (cancelledRequests.length) {
    throw new Error(`需求单 ${cancelledRequests.map((row: Row) => String(row.requestNo ?? "")).join("、")} 已被远端取消，请先处理后再确认采购订单`);
  }

  // 远端不稳定时不再阻断确认：物流单先生成，远端字段标记为 pending，
  // 等远端恢复后再用「批量刷新远端物流」拉回机房、收货地址与收件人。
  const result = await synchronizePurchaseOrderShipments(purchaseOrderId, { tolerateRemoteFailure: true });

  await execute(`UPDATE purchaseorders
    SET status = :status, confirmedByUserId = :confirmedByUserId, confirmedByName = :confirmedByName,
        updatedByUserId = :updatedByUserId, updatedByName = :updatedByName
    WHERE purchaseOrderId = :purchaseOrderId`, {
    purchaseOrderId,
    status: "已确认",
    confirmedByUserId: actor?.userId ?? null,
    confirmedByName: actor?.displayName ?? null,
    updatedByUserId: actor?.userId ?? null,
    updatedByName: actor?.displayName ?? null,
  });

  await markPurchaseOrderRequestsAsOrdered(order, actor);
  return result;
}

/**
 * Synchronize shipment source fields from one purchase order without replacing logistics-entered fields.
 * Repeated calls update by purchase detail ID, so imports can safely be retried.
 */
async function synchronizePurchaseOrderShipments(
  purchaseOrderIdOrPoNo: string,
  options: { tolerateRemoteFailure?: boolean } = {},
): Promise<ShipmentSyncResult> {
  const rows = await queryRows<PurchaseOrderRow>(
    "SELECT purchaseOrderId, poNo, requestNo, sourceRequestNos, status FROM purchaseorders WHERE purchaseOrderId = :id OR poNo = :id LIMIT 1",
    { id: purchaseOrderIdOrPoNo },
  );
  const order = rows[0];
  if (!order) throw new Error("采购单不存在");

  const purchaseOrderId = String(order.purchaseOrderId);
  const poNo = String(order.poNo);

  const shipmentLines = await queryRows<ShipmentLineRow>(
    `
      SELECT
        poi.id AS purchaseOrderItemId,
        COALESCE(NULLIF(poi.requestNo, ''), ri.requestNo) AS requestNo,
        req.batchName AS batchName,
        ri.deviceCode AS deviceCode,
        im.nameEn AS nameEn,
        ri.supplierId AS supplierId,
        ri.undertakingUnitId AS undertakingUnitId
      FROM purchaseorderitems poi
      LEFT JOIN requestitems ri ON ri.id = poi.requestItemId
      LEFT JOIN requests req ON req.requestNo = ri.requestNo
      LEFT JOIN instancemodels im ON im.deviceCode = ri.deviceCode
      WHERE poi.purchaseOrderId = :purchaseOrderId
      ORDER BY poi.id
    `,
    { purchaseOrderId },
  );
  const shipments = buildShipmentDraft(poNo, shipmentLines);
  const itemIds = shipmentLines.map((line) => line.purchaseOrderItemId).filter(Boolean);
  const existingRows = itemIds.length
    ? await queryRows<ExistingShipmentRow>(
        "SELECT shipmentId, poNo, purchaseOrderItemId, deviceCode, remoteLogisticsSourceStatus FROM shipments WHERE purchaseOrderItemId IN (:itemIds) OR poNo = :poNo",
        { itemIds, poNo },
      )
    : [];
  const existingByItemId = new Map(
    existingRows
      .filter((row) => String(row.purchaseOrderItemId ?? "").trim())
      .map((row) => [String(row.purchaseOrderItemId), row]),
  );
  const existingByShipmentId = new Map(existingRows.map((row) => [String(row.shipmentId), row]));
  const existingByDeviceCode = new Map<string, ExistingShipmentRow[]>();
  for (const row of existingRows) {
    const key = String(row.deviceCode ?? "").trim();
    if (key) existingByDeviceCode.set(key, [...(existingByDeviceCode.get(key) ?? []), row]);
  }

  const existingByLine = new Map<number, ExistingShipmentRow | undefined>();
  for (const [index, shipment] of shipments.entries()) {
    const line = shipmentLines[index];
    const matchingByDevice = existingByDeviceCode.get(String(line.deviceCode ?? "").trim()) ?? [];
    // Older logistics rows may not have a purchase detail ID. Only reuse a PO/device match when unambiguous.
    const existing = existingByItemId.get(String(line.purchaseOrderItemId))
      ?? existingByShipmentId.get(String(shipment.shipmentId))
      ?? (matchingByDevice.length === 1 ? matchingByDevice[0] : undefined);
    existingByLine.set(index, existing);
  }

  const remoteLines = shipmentLines.filter((_, index) => {
    const existing = existingByLine.get(index);
    return !existing || String(existing.remoteLogisticsSourceStatus ?? "").trim() !== "remote";
  });
  const remoteFieldsByItemId = new Map<string, Row>();
  const remoteErrors: string[] = [];
  if (remoteLines.length) {
    try {
      for (const [itemId, fields] of await loadRemoteShipmentFields(remoteLines)) {
        remoteFieldsByItemId.set(itemId, fields);
      }
    } catch (error) {
      if (!options.tolerateRemoteFailure) throw error;
      remoteErrors.push(error instanceof Error ? error.message : String(error));
    }
  }

  let created = 0;
  let updated = 0;
  let remoteSnapshots = 0;
  let pending = 0;
  const persistedShipments: Row[] = [];
  for (const [index, shipment] of shipments.entries()) {
    const line = shipmentLines[index];
    const existing = existingByLine.get(index);
    const remoteFields = remoteFieldsByItemId.get(String(line.purchaseOrderItemId));
    const pendingRemote = remoteLines.includes(line) && !remoteFields;
    // 远端专属列先补 null：定位不到 Release 时这些列要有确定值，避免参数缺失。
    const remoteOnlyDefaults = Object.fromEntries(REMOTE_ONLY_SHIPMENT_COLUMNS.map((key) => [key, null]));
    const nextShipment = {
      ...shipment,
      ...remoteOnlyDefaults,
      ...(remoteFields ?? (pendingRemote ? pendingShipmentRemoteLogisticsFields() : {})),
    };

    if (existing) {
      const remoteAssignments = remoteFields
        ? REMOTE_WRITABLE_COLUMNS
            .filter((key) => remoteFields[key] !== undefined)
            .map((key) => `, ${key} = :${key}`)
            .join("")
        : pendingRemote
          ? ", remoteLogisticsSourceStatus = :remoteLogisticsSourceStatus"
          : "";
      await execute(
        `
          UPDATE shipments
          SET poNo = :poNo,
              batchName = :batchName,
              purchaseOrderItemId = :purchaseOrderItemId,
              deviceCode = :deviceCode,
              nameEn = :nameEn,
              supplierId = :supplierId,
              undertakingUnitId = :undertakingUnitId${remoteAssignments}
          WHERE shipmentId = :shipmentId
        `,
        { ...nextShipment, shipmentId: existing.shipmentId },
      );
      updated += 1;
      if (remoteFields) remoteSnapshots += 1;
      if (pendingRemote) pending += 1;
      persistedShipments.push({ ...nextShipment, shipmentId: existing.shipmentId });
      continue;
    }

    await execute(
      `
        INSERT INTO shipments
          (shipmentId, poNo, batchName, purchaseOrderItemId, deviceCode, nameEn, supplierId, undertakingUnitId, dcCode, dcNameZh,
           destinationLocationId, recipientContactId, snapshotDestinationAddress, snapshotRecipientName, snapshotRecipientPhone,
           remoteDemandOrderId, remoteDatacenterId, remoteDeliveryLocationId, remoteRecipientListId, remoteLogisticsSourceStatus,
           remoteLogisticsModifiedAt, logisticsSnapshotJson, logisticsSnapshotAt, transportMode, releaseId,
           crd, supplierEtaAt, apdAt, pickupAt, departedAt, arrivedAt, customsClearedAt, deliveredAt, isReceived)
        VALUES
          (:shipmentId, :poNo, :batchName, :purchaseOrderItemId, :deviceCode, :nameEn, :supplierId, :undertakingUnitId, :dcCode, :dcNameZh,
           :destinationLocationId, :recipientContactId, :snapshotDestinationAddress, :snapshotRecipientName, :snapshotRecipientPhone,
           :remoteDemandOrderId, :remoteDatacenterId, :remoteDeliveryLocationId, :remoteRecipientListId, :remoteLogisticsSourceStatus,
           :remoteLogisticsModifiedAt, :logisticsSnapshotJson, :logisticsSnapshotAt, :transportMode, :releaseId,
           :crd, :supplierEtaAt, :apdAt, :pickupAt, :departedAt, :arrivedAt, :customsClearedAt, :deliveredAt, :isReceived)
      `,
      nextShipment,
    );
    created += 1;
    if (remoteFields) remoteSnapshots += 1;
    if (pendingRemote) pending += 1;
    persistedShipments.push(nextShipment);
  }

  return { shipments: persistedShipments, created, updated, remoteSnapshots, pending, remoteErrors };
}

async function loadRemoteShipmentFields(lines: ShipmentLineRow[]) {
  const requestNos = Array.from(new Set(lines.map((line) => String(line.requestNo ?? "").trim()).filter(Boolean)));
  const missingRequestNoLines = lines.filter((line) => !String(line.requestNo ?? "").trim());
  if (missingRequestNoLines.length) {
    throw new Error(`采购明细 ${missingRequestNoLines.map((line) => line.purchaseOrderItemId).join("、")} 未关联需求单，无法读取远端物流信息`);
  }
  if (!requestNos.length) return new Map<string, Row>();

  const lookup = await getFrappeDemandLogistics(requestNos);
  const errors = requestNos.flatMap((requestNo) => {
    const message = lookup.errorsByRequestNo.get(requestNo);
    return message ? [message] : [];
  });
  if (errors.length) throw new Error(`无法生成物流快照：${errors.join("；")}`);

  const timelineByRequestNo = await loadRemoteShipmentTimelines(requestNos);
  const materialByDeviceCode = await loadRemoteMaterialByDeviceCode(lines.map((line) => String(line.deviceCode ?? "")));

  // 按采购明细逐行返回：同一需求单跨多个 Release 时，每行的时间取自己所属 Release 的。
  const fieldsByItemId = new Map<string, Row>();
  for (const line of lines) {
    const requestNo = String(line.requestNo ?? "").trim();
    const snapshot = lookup.snapshotsByRequestNo.get(requestNo);
    if (!snapshot) continue;
    fieldsByItemId.set(String(line.purchaseOrderItemId), {
      ...shipmentRemoteLogisticsFields(snapshot),
      ...releaseTimelineFields(timelineByRequestNo.get(requestNo), materialByDeviceCode, line.deviceCode),
    });
  }
  return fieldsByItemId;
}

export async function refreshShipmentRemoteLogistics(shipmentId: string) {
  const rows = await queryRows<Row>(
    `
      SELECT s.shipmentId,
             COALESCE(NULLIF(poi.requestNo, ''), ri.requestNo) AS requestNo,
             s.deviceCode,
             s.dcNameZh, s.snapshotDestinationAddress, s.snapshotRecipientName, s.snapshotRecipientPhone,
             s.transportMode, s.crd, s.supplierEtaAt, s.apdAt, s.pickupAt, s.departedAt, s.arrivedAt, s.customsClearedAt, s.deliveredAt
        FROM shipments s
        ${SHIPMENT_TO_PO_ITEM_JOIN}
        LEFT JOIN requestitems ri ON ri.id = poi.requestItemId
       WHERE s.shipmentId = :shipmentId
       LIMIT 1
    `,
    { shipmentId },
  );
  const shipment = rows[0];
  if (!shipment) throw new Error("物流记录不存在");
  const requestNo = String(shipment.requestNo ?? "").trim();
  if (!requestNo) throw new Error("物流记录未关联需求单，无法重新读取远端物流信息");

  // 物资编码取自本行，才能定位到该明细所属 Release 的时间。
  const remoteFields = await loadRemoteShipmentFields([{
    purchaseOrderItemId: shipmentId,
    requestNo,
    batchName: null,
    deviceCode: shipment.deviceCode === null || shipment.deviceCode === undefined ? null : String(shipment.deviceCode),
    nameEn: null,
    supplierId: null,
    undertakingUnitId: null,
  }]);
  const fields = remoteFields.get(shipmentId);
  if (!fields) throw new Error("远端物流信息不存在");
  const changes = describeRemoteChanges(shipment, fields);
  await applyRemoteLogisticsFields(shipmentId, fields);
  return { shipmentId, ...fields, changes };
}

/** 远端快照里会覆盖本地展示的字段，用于生成"补齐前后差异"提示。 */
const REMOTE_DIFF_FIELDS: Array<[string, string]> = [
  ["dcNameZh", "机房"],
  ["snapshotDestinationAddress", "收货地址"],
  ["snapshotRecipientName", "收件人"],
  ["snapshotRecipientPhone", "收件电话"],
  ...SHIPMENT_TIMELINE_COLUMNS,
];

/** 差异提示里的展示值：DATE/DATETIME 列会被驱动返回 Date 对象，按本地日期显示。 */
function displayValue(value: unknown) {
  if (value instanceof Date) {
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return String(value ?? "").trim();
}

function describeRemoteChanges(current: Row, next: Row) {
  return REMOTE_DIFF_FIELDS.flatMap(([key, label]) => {
    const before = displayValue(current[key]);
    const after = displayValue(next[key]);
    if (!after || before === after) return [];
    return [`${label}：${before || "（空）"} → ${after}`];
  });
}

async function applyRemoteLogisticsFields(shipmentId: string, fields: Row) {
  // 时间节点（运输方式、CRD、供应商反馈ETA、APD 等）与 releaseId 只有远端真正给值时才写，
  // 避免把本地维护的值清空。
  const timelineAssignments = ["releaseId", ...SHIPMENT_TIMELINE_COLUMNS.map(([key]) => key)]
    .filter((key) => fields[key] !== undefined)
    .map((key) => `, ${key} = :${key}`)
    .join("");
  await execute(
    `
      UPDATE shipments
         SET dcCode = :dcCode,
             dcNameZh = :dcNameZh,
             destinationLocationId = :destinationLocationId,
             recipientContactId = :recipientContactId,
             snapshotDestinationAddress = :snapshotDestinationAddress,
             snapshotRecipientName = :snapshotRecipientName,
             snapshotRecipientPhone = :snapshotRecipientPhone,
             remoteDemandOrderId = :remoteDemandOrderId,
             remoteDatacenterId = :remoteDatacenterId,
             remoteDeliveryLocationId = :remoteDeliveryLocationId,
             remoteRecipientListId = :remoteRecipientListId,
             remoteLogisticsSourceStatus = :remoteLogisticsSourceStatus,
             remoteLogisticsModifiedAt = :remoteLogisticsModifiedAt,
             logisticsSnapshotJson = :logisticsSnapshotJson,
             logisticsSnapshotAt = :logisticsSnapshotAt${timelineAssignments}
       WHERE shipmentId = :shipmentId
    `,
    { shipmentId, ...fields },
  );
}

/**
 * 批量刷新远端物流：把**不是远端来源**的物流行（待补全 `pending` 与历史导入 `legacy`）
 * 按需求单号统一重拉远端快照与 Release 时间节点。
 *
 * 命中即写入机房/地址/收件人/运输方式/时间并把来源改回 `remote`；
 * 远端确实没有该需求单时保持原样并回报原因，不会把 legacy 改成 pending。
 */
export async function synchronizeRemoteLogistics() {
  const rows = await queryRows<Row>(
    `
      SELECT s.shipmentId,
             COALESCE(NULLIF(poi.requestNo, ''), ri.requestNo) AS requestNo,
             s.deviceCode,
             s.dcNameZh, s.snapshotDestinationAddress, s.snapshotRecipientName, s.snapshotRecipientPhone,
             s.transportMode, s.crd, s.supplierEtaAt, s.apdAt, s.pickupAt, s.departedAt, s.arrivedAt, s.customsClearedAt, s.deliveredAt
        FROM shipments s
        ${SHIPMENT_TO_PO_ITEM_JOIN}
        LEFT JOIN requestitems ri ON ri.id = poi.requestItemId
       WHERE s.remoteLogisticsSourceStatus IS NULL OR s.remoteLogisticsSourceStatus <> :remoteStatus
       ORDER BY s.shipmentId
    `,
    { remoteStatus: "remote" },
  );
  if (!rows.length) {
    return { scanned: 0, updated: 0, skipped: 0, changes: [] as string[], errors: [] as string[] };
  }

  const requestNos = Array.from(new Set(rows.map((row) => String(row.requestNo ?? "").trim()).filter(Boolean)));
  // 远端整体不可用时不要抛错：批量补齐是"尽力而为"，把结果如实回报给用户即可。
  let lookup;
  try {
    lookup = await getFrappeDemandLogistics(requestNos);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { scanned: rows.length, updated: 0, skipped: rows.length, changes: [] as string[], errors: [message] };
  }
  // 时间节点按 Release 取：每行用自己的实例编码定位到所属 Release，远端有值才覆盖。
  const timelineByRequestNo = await loadRemoteShipmentTimelines(requestNos);
  const materialByDeviceCode = await loadRemoteMaterialByDeviceCode(rows.map((row) => String(row.deviceCode ?? "")));
  const changes: string[] = [];
  const errors = requestNos.flatMap((requestNo) => {
    const message = lookup.errorsByRequestNo.get(requestNo);
    return message ? [`需求单 ${requestNo}：${message}`] : [];
  });

  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const shipmentId = String(row.shipmentId);
    const requestNo = String(row.requestNo ?? "").trim();
    if (!requestNo) {
      skipped += 1;
      errors.push(`物流 ${shipmentId} 未关联需求单，无法补全`);
      continue;
    }
    const snapshot = lookup.snapshotsByRequestNo.get(requestNo);
    if (!snapshot) {
      skipped += 1;
      continue;
    }
    const fields = {
      ...shipmentRemoteLogisticsFields(snapshot),
      ...releaseTimelineFields(timelineByRequestNo.get(requestNo), materialByDeviceCode, row.deviceCode),
    };
    for (const change of describeRemoteChanges(row, fields)) changes.push(`${shipmentId} ${change}`);
    await applyRemoteLogisticsFields(shipmentId, fields);
    updated += 1;
  }

  return { scanned: rows.length, updated, skipped, changes, errors };
}

export async function synchronizeConfirmedPurchaseOrderShipments(purchaseOrderIds?: string[]) {
  const orders = purchaseOrderIds?.length
    ? await queryRows<PurchaseOrderRow>(
        "SELECT purchaseOrderId, poNo, requestNo, sourceRequestNos, status FROM purchaseorders WHERE purchaseOrderId IN (:purchaseOrderIds) AND status = :status",
        { purchaseOrderIds, status: "已确认" },
      )
    : await queryRows<PurchaseOrderRow>(
        "SELECT purchaseOrderId, poNo, requestNo, sourceRequestNos, status FROM purchaseorders WHERE status = :status",
        { status: "已确认" },
      );

  let created = 0;
  let updated = 0;
  let remoteSnapshots = 0;
  let pending = 0;
  const errors: Array<{ purchaseOrderId: string; error: string }> = [];
  for (const order of orders) {
    try {
      const result = await synchronizePurchaseOrderShipments(order.purchaseOrderId, { tolerateRemoteFailure: true });
      await markPurchaseOrderRequestsAsOrdered(order);
      created += result.created;
      updated += result.updated;
      remoteSnapshots += result.remoteSnapshots;
      pending += result.pending;
      for (const message of result.remoteErrors) {
        errors.push({ purchaseOrderId: order.purchaseOrderId, error: message });
      }
    } catch (error) {
      errors.push({ purchaseOrderId: order.purchaseOrderId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { orderCount: orders.length, created, updated, remoteSnapshots, pending, errors };
}

async function markPurchaseOrderRequestsAsOrdered(order: Pick<PurchaseOrderRow, "requestNo" | "sourceRequestNos">, actor: OperationActor | null = null) {
  const requestNos = normalizeRequestNos([String(order.sourceRequestNos ?? order.requestNo ?? "")])
    .split(",")
    .filter(Boolean);
  for (const requestNo of requestNos) {
    const assignment = actor
      ? ", confirmedByUserId = :confirmedByUserId, confirmedByName = :confirmedByName, updatedByUserId = :updatedByUserId, updatedByName = :updatedByName"
      : "";
    await execute(`UPDATE requests SET status = :status${assignment} WHERE requestNo = :requestNo`, {
      requestNo,
      status: "已下单",
      ...(actor
        ? {
            confirmedByUserId: actor.userId,
            confirmedByName: actor.displayName,
            updatedByUserId: actor.userId,
            updatedByName: actor.displayName,
          }
        : {}),
    });
  }
}

async function markRequestAsPendingOrder(requestNo: string, actor: OperationActor | null = null) {
  const assignment = actor ? ", updatedByUserId = :updatedByUserId, updatedByName = :updatedByName" : "";
  await execute(`UPDATE requests SET status = :status${assignment} WHERE requestNo = :requestNo`, {
    requestNo,
    status: "待下单",
    ...(actor ? { updatedByUserId: actor.userId, updatedByName: actor.displayName } : {}),
  });
}
