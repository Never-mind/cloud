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
};

type ShipmentLineRow = {
  purchaseOrderItemId: string;
  batchName: string | null;
  deviceCode: string | null;
  nameEn: string | null;
  supplierId: string | null;
  undertakingUnitId: string | null;
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
    "SELECT id, requestNo FROM requestitems WHERE requestNo = :requestNo ORDER BY id",
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
          (id, purchaseOrderId, poNo, requestNo, requestItemId, unitPrice, hardwareCoefficient, softwareCoefficient, totalCoefficient)
        VALUES
          (:id, :purchaseOrderId, :poNo, :requestNo, :requestItemId, :unitPrice, :hardwareCoefficient, :softwareCoefficient, :totalCoefficient)
      `,
      item,
    );
  }

  await markRequestAsPendingOrder(requestNo);
  return draft.order;
}

export async function confirmPurchaseOrder(purchaseOrderIdOrPoNo: string) {
  const rows = await queryRows<Row>(
    "SELECT purchaseOrderId, poNo, requestNo, sourceRequestNos, status FROM purchaseorders WHERE purchaseOrderId = :id OR poNo = :id LIMIT 1",
    { id: purchaseOrderIdOrPoNo },
  );
  const order = rows[0];
  if (!order) {
    throw new Error("采购单不存在");
  }

  const purchaseOrderId = String(order.purchaseOrderId ?? purchaseOrderIdOrPoNo);
  const poNo = String(order.poNo ?? purchaseOrderIdOrPoNo);

  await execute("UPDATE purchaseorders SET status = :status WHERE purchaseOrderId = :purchaseOrderId", {
    purchaseOrderId,
    status: "已确认",
  });

  const requestNos = normalizeRequestNos([String(order.sourceRequestNos ?? order.requestNo ?? "")])
    .split(",")
    .filter(Boolean);
  for (const requestNo of requestNos) {
    await execute("UPDATE requests SET status = :status WHERE requestNo = :requestNo", {
      requestNo,
      status: "已下单",
    });
  }

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

  for (const shipment of shipments) {
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
        ON DUPLICATE KEY UPDATE
          poNo = VALUES(poNo),
          batchName = VALUES(batchName),
          purchaseOrderItemId = VALUES(purchaseOrderItemId),
          deviceCode = VALUES(deviceCode),
          nameEn = VALUES(nameEn),
          supplierId = VALUES(supplierId),
          undertakingUnitId = VALUES(undertakingUnitId)
      `,
      shipment,
    );
  }

  return shipments;
}

async function markRequestAsPendingOrder(requestNo: string) {
  await execute("UPDATE requests SET status = :status WHERE requestNo = :requestNo", {
    requestNo,
    status: "待下单",
  });
}
