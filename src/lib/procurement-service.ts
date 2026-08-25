import { execute, queryRows, type Row } from "./db";
import {
  buildAutoPurchaseOrderId,
  buildAutoPurchaseOrderNo,
  buildPurchaseDraft,
  buildShipmentDraft,
  normalizeRequestNos,
} from "./procurement-workflow";

type RequestItemRow = {
  id: string;
  requestNo?: string | null;
  requestType?: string | null;
};

type ShipmentLineRow = {
  purchaseOrderItemId: string;
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

export type ShipmentSyncResult = {
  shipments: Row[];
  created: number;
  updated: number;
};

export async function createPurchaseOrderFromRequest(requestNo: string, poNo?: string) {
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
    await markRequestAsPendingOrder(requestNo);
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
        (purchaseOrderId, poNo, requestNo, sourceRequestNos, status, currency, usdRate, paymentDate, releasedAt)
      VALUES
        (:purchaseOrderId, :poNo, :requestNo, :sourceRequestNos, :status, :currency, :usdRate, NULL, NULL)
    `,
    draft.order,
  );

  for (const item of draft.items) {
    await execute(
      `
        INSERT INTO purchaseorderitems
          (id, purchaseOrderId, poNo, requestNo, requestItemId, requestType, unitPrice, hardwareCoefficient, softwareCoefficient, totalCoefficient)
        VALUES
          (:id, :purchaseOrderId, :poNo, :requestNo, :requestItemId, :requestType, :unitPrice, :hardwareCoefficient, :softwareCoefficient, :totalCoefficient)
      `,
      item,
    );
  }

  await markRequestAsPendingOrder(requestNo);
  return draft.order;
}

export async function confirmPurchaseOrder(purchaseOrderIdOrPoNo: string) {
  const rows = await queryRows<PurchaseOrderRow>(
    "SELECT purchaseOrderId, poNo, requestNo, sourceRequestNos, status FROM purchaseorders WHERE purchaseOrderId = :id OR poNo = :id LIMIT 1",
    { id: purchaseOrderIdOrPoNo },
  );
  const order = rows[0];
  if (!order) {
    throw new Error("采购单不存在");
  }

  const purchaseOrderId = String(order.purchaseOrderId ?? purchaseOrderIdOrPoNo);

  await execute("UPDATE purchaseorders SET status = :status WHERE purchaseOrderId = :purchaseOrderId", {
    purchaseOrderId,
    status: "已确认",
  });

  await markPurchaseOrderRequestsAsOrdered(order);

  const result = await synchronizePurchaseOrderShipments(purchaseOrderId);
  return result.shipments;
}

/**
 * Synchronize shipment source fields from one purchase order without replacing logistics-entered fields.
 * Repeated calls update by purchase detail ID, so imports can safely be retried.
 */
export async function synchronizePurchaseOrderShipments(purchaseOrderIdOrPoNo: string): Promise<ShipmentSyncResult> {
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
    ? await queryRows<Row>(
        "SELECT shipmentId, poNo, purchaseOrderItemId, deviceCode FROM shipments WHERE purchaseOrderItemId IN (:itemIds) OR poNo = :poNo",
        { itemIds, poNo },
      )
    : [];
  const existingByItemId = new Map(
    existingRows
      .filter((row) => String(row.purchaseOrderItemId ?? "").trim())
      .map((row) => [String(row.purchaseOrderItemId), row]),
  );
  const existingByShipmentId = new Map(existingRows.map((row) => [String(row.shipmentId), row]));
  const existingByDeviceCode = new Map<string, Row[]>();
  for (const row of existingRows) {
    const key = String(row.deviceCode ?? "").trim();
    if (key) existingByDeviceCode.set(key, [...(existingByDeviceCode.get(key) ?? []), row]);
  }

  let created = 0;
  let updated = 0;
  for (const [index, shipment] of shipments.entries()) {
    const line = shipmentLines[index];
    const matchingByDevice = existingByDeviceCode.get(String(line.deviceCode ?? "").trim()) ?? [];
    // Older logistics rows may not have a purchase detail ID. Only reuse a PO/device match when unambiguous.
    const existing = existingByItemId.get(String(line.purchaseOrderItemId))
      ?? existingByShipmentId.get(String(shipment.shipmentId))
      ?? (matchingByDevice.length === 1 ? matchingByDevice[0] : undefined);

    if (existing) {
      await execute(
        `
          UPDATE shipments
          SET poNo = :poNo,
              batchName = :batchName,
              purchaseOrderItemId = :purchaseOrderItemId,
              deviceCode = :deviceCode,
              nameEn = :nameEn,
              supplierId = :supplierId,
              undertakingUnitId = :undertakingUnitId
          WHERE shipmentId = :shipmentId
        `,
        { ...shipment, shipmentId: existing.shipmentId },
      );
      updated += 1;
      continue;
    }

    await execute(
      `
        INSERT INTO shipments
          (shipmentId, poNo, batchName, purchaseOrderItemId, deviceCode, nameEn, supplierId, undertakingUnitId, destinationLocationId,
           recipientContactId, snapshotDestinationAddress, snapshotRecipientName,
           snapshotRecipientPhone, transportMode, isReceived)
        VALUES
          (:shipmentId, :poNo, :batchName, :purchaseOrderItemId, :deviceCode, :nameEn, :supplierId, :undertakingUnitId, :destinationLocationId,
           :recipientContactId, :snapshotDestinationAddress, :snapshotRecipientName,
           :snapshotRecipientPhone, :transportMode, :isReceived)
      `,
      shipment,
    );
    created += 1;
  }

  return { shipments, created, updated };
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
  for (const order of orders) {
    await markPurchaseOrderRequestsAsOrdered(order);
    const result = await synchronizePurchaseOrderShipments(order.purchaseOrderId);
    created += result.created;
    updated += result.updated;
  }
  return { orderCount: orders.length, created, updated };
}

async function markPurchaseOrderRequestsAsOrdered(order: Pick<PurchaseOrderRow, "requestNo" | "sourceRequestNos">) {
  const requestNos = normalizeRequestNos([String(order.sourceRequestNos ?? order.requestNo ?? "")])
    .split(",")
    .filter(Boolean);
  for (const requestNo of requestNos) {
    await execute("UPDATE requests SET status = :status WHERE requestNo = :requestNo", {
      requestNo,
      status: "已下单",
    });
  }
}

async function markRequestAsPendingOrder(requestNo: string) {
  await execute("UPDATE requests SET status = :status WHERE requestNo = :requestNo", {
    requestNo,
    status: "待下单",
  });
}
