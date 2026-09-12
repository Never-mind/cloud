import { execute, queryRows, type Row } from "./db";
import {
  buildAutoPurchaseOrderId,
  buildAutoPurchaseOrderNo,
  buildPurchaseDraft,
  buildShipmentDraft,
  normalizeRequestNos,
} from "./procurement-workflow";
import type { OperationActor } from "./operation-actor";
import { getFrappeDemandLogistics, type FrappeDemandLogisticsSnapshot } from "./frappe-demand-sync-service";

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
};

type ExistingShipmentRow = Row & {
  shipmentId: string;
  poNo: string;
  purchaseOrderItemId: string | null;
  deviceCode: string | null;
  remoteLogisticsSourceStatus: string | null;
};

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

  // Pull and validate the immutable remote logistics snapshot before changing
  // the purchase order status. A remote lookup failure therefore leaves the
  // purchase order in draft instead of creating a confirmed order with blanks.
  const result = await synchronizePurchaseOrderShipments(purchaseOrderId);

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
  return result.shipments;
}

/**
 * Synchronize shipment source fields from one purchase order without replacing logistics-entered fields.
 * Repeated calls update by purchase detail ID, so imports can safely be retried.
 */
async function synchronizePurchaseOrderShipments(purchaseOrderIdOrPoNo: string): Promise<ShipmentSyncResult> {
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
  const remoteFieldsByRequestNo = await loadRemoteShipmentFields(remoteLines);

  let created = 0;
  let updated = 0;
  let remoteSnapshots = 0;
  const persistedShipments: Row[] = [];
  for (const [index, shipment] of shipments.entries()) {
    const line = shipmentLines[index];
    const existing = existingByLine.get(index);
    const remoteFields = remoteFieldsByRequestNo.get(String(line.requestNo ?? "").trim());
    const nextShipment = { ...shipment, ...(remoteFields ?? {}) };

    if (existing) {
      const remoteAssignments = remoteFields
        ? `, dcCode = :dcCode,
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
              logisticsSnapshotAt = :logisticsSnapshotAt`
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
      persistedShipments.push({ ...nextShipment, shipmentId: existing.shipmentId });
      continue;
    }

    await execute(
      `
        INSERT INTO shipments
          (shipmentId, poNo, batchName, purchaseOrderItemId, deviceCode, nameEn, supplierId, undertakingUnitId, dcCode, dcNameZh,
           destinationLocationId, recipientContactId, snapshotDestinationAddress, snapshotRecipientName, snapshotRecipientPhone,
           remoteDemandOrderId, remoteDatacenterId, remoteDeliveryLocationId, remoteRecipientListId, remoteLogisticsSourceStatus,
           remoteLogisticsModifiedAt, logisticsSnapshotJson, logisticsSnapshotAt, transportMode, isReceived)
        VALUES
          (:shipmentId, :poNo, :batchName, :purchaseOrderItemId, :deviceCode, :nameEn, :supplierId, :undertakingUnitId, :dcCode, :dcNameZh,
           :destinationLocationId, :recipientContactId, :snapshotDestinationAddress, :snapshotRecipientName, :snapshotRecipientPhone,
           :remoteDemandOrderId, :remoteDatacenterId, :remoteDeliveryLocationId, :remoteRecipientListId, :remoteLogisticsSourceStatus,
           :remoteLogisticsModifiedAt, :logisticsSnapshotJson, :logisticsSnapshotAt, :transportMode, :isReceived)
      `,
      nextShipment,
    );
    created += 1;
    remoteSnapshots += 1;
    persistedShipments.push(nextShipment);
  }

  return { shipments: persistedShipments, created, updated, remoteSnapshots };
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

  return new Map(
    requestNos.flatMap((requestNo) => {
      const snapshot = lookup.snapshotsByRequestNo.get(requestNo);
      return snapshot ? [[requestNo, shipmentRemoteLogisticsFields(snapshot)] as const] : [];
    }),
  );
}

export async function refreshShipmentRemoteLogistics(shipmentId: string) {
  const rows = await queryRows<Row>(
    `
      SELECT s.shipmentId,
             COALESCE(NULLIF(poi.requestNo, ''), ri.requestNo) AS requestNo
        FROM shipments s
        LEFT JOIN purchaseorderitems poi ON poi.id = s.purchaseOrderItemId
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

  const remoteFields = await loadRemoteShipmentFields([{ purchaseOrderItemId: shipmentId, requestNo, batchName: null, deviceCode: null, nameEn: null, supplierId: null, undertakingUnitId: null }]);
  const fields = remoteFields.get(requestNo);
  if (!fields) throw new Error("远端物流信息不存在");
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
             logisticsSnapshotAt = :logisticsSnapshotAt
       WHERE shipmentId = :shipmentId
    `,
    { shipmentId, ...fields },
  );
  return { shipmentId, ...fields };
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
  const errors: Array<{ purchaseOrderId: string; error: string }> = [];
  for (const order of orders) {
    try {
      const result = await synchronizePurchaseOrderShipments(order.purchaseOrderId);
      await markPurchaseOrderRequestsAsOrdered(order);
      created += result.created;
      updated += result.updated;
      remoteSnapshots += result.remoteSnapshots;
    } catch (error) {
      errors.push({ purchaseOrderId: order.purchaseOrderId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { orderCount: orders.length, created, updated, remoteSnapshots, errors };
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
