import { execute, queryRows, type Row } from "./db";
import { buildAutoPurchaseOrderNo, buildPurchaseDraft, buildShipmentDraft } from "./procurement-workflow";

type RequestItemRow = {
  id: string;
};

type ShipmentLineRow = {
  purchaseOrderItemId: string;
  deviceCode: string | null;
  nameEn: string | null;
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
    "SELECT poNo FROM purchaseorders WHERE requestNo = :requestNo LIMIT 1",
    { requestNo },
  );
  if (existing[0]?.poNo) {
    await markRequestAsPendingOrder(requestNo);
    return existing[0];
  }

  const nextPoNo = poNo?.trim() || buildAutoPurchaseOrderNo(requestNo);

  const details = await queryRows<RequestItemRow>(
    "SELECT id FROM requestitems WHERE requestNo = :requestNo ORDER BY id",
    { requestNo },
  );
  const draft = buildPurchaseDraft({ poNo: nextPoNo, requestNo, details });

  await execute(
    `
      INSERT INTO purchaseorders
        (poNo, requestNo, status, currency, usdRate, paymentDate, releasedAt)
      VALUES
        (:poNo, :requestNo, :status, :currency, :usdRate, NULL, NULL)
    `,
    draft.order,
  );

  for (const item of draft.items) {
    await execute(
      `
        INSERT INTO purchaseorderitems
          (id, poNo, requestItemId, unitPrice, hardwareCoefficient, softwareCoefficient, totalCoefficient)
        VALUES
          (:id, :poNo, :requestItemId, :unitPrice, :hardwareCoefficient, :softwareCoefficient, :totalCoefficient)
      `,
      item,
    );
  }

  await markRequestAsPendingOrder(requestNo);
  return draft.order;
}

export async function confirmPurchaseOrder(poNo: string) {
  const rows = await queryRows<Row>(
    "SELECT poNo, requestNo, status FROM purchaseorders WHERE poNo = :poNo LIMIT 1",
    { poNo },
  );
  const order = rows[0];
  if (!order) {
    throw new Error("采购单不存在");
  }

  await execute("UPDATE purchaseorders SET status = :status WHERE poNo = :poNo", {
    poNo,
    status: "已确认",
  });

  if (order.requestNo) {
    await execute("UPDATE requests SET status = :status WHERE requestNo = :requestNo", {
      requestNo: order.requestNo,
      status: "已下单",
    });
  }

  const shipmentLines = await queryRows<ShipmentLineRow>(
    `
      SELECT
        poi.id AS purchaseOrderItemId,
        ri.deviceCode AS deviceCode,
        im.nameEn AS nameEn
      FROM purchaseorderitems poi
      LEFT JOIN requestitems ri ON ri.id = poi.requestItemId
      LEFT JOIN instancemodels im ON im.deviceCode = ri.deviceCode
      WHERE poi.poNo = :poNo
      ORDER BY poi.id
    `,
    { poNo },
  );
  const shipments = buildShipmentDraft(poNo, shipmentLines);

  for (const shipment of shipments) {
    await execute(
      `
        INSERT INTO shipments
          (shipmentId, poNo, purchaseOrderItemId, deviceCode, nameEn, destinationLocationId,
           recipientContactId, snapshotDestinationAddress, snapshotRecipientName,
           snapshotRecipientPhone, transportMode, isReceived)
        VALUES
          (:shipmentId, :poNo, :purchaseOrderItemId, :deviceCode, :nameEn, :destinationLocationId,
           :recipientContactId, :snapshotDestinationAddress, :snapshotRecipientName,
           :snapshotRecipientPhone, :transportMode, :isReceived)
        ON DUPLICATE KEY UPDATE
          poNo = VALUES(poNo),
          purchaseOrderItemId = VALUES(purchaseOrderItemId),
          deviceCode = VALUES(deviceCode),
          nameEn = VALUES(nameEn)
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
