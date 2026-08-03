import { queryRows, type Row } from "./db";

export type OrderDetailType = "requests" | "purchase-orders";

export type OrderDetailData = {
  master: Row | null;
  details: Row[];
  requestItems: Row[];
  instanceModels: Row[];
};

export async function getOrderDetail(type: OrderDetailType, id: string): Promise<OrderDetailData> {
  if (type === "requests") return getRequestOrderDetail(id);
  return getPurchaseOrderDetail(id);
}

async function getRequestOrderDetail(requestNo: string): Promise<OrderDetailData> {
  const masterRows = await queryRows<Row>("SELECT * FROM requests WHERE requestNo = :requestNo LIMIT 1", { requestNo });
  const details = await queryRows<Row>(
    "SELECT * FROM requestitems WHERE requestNo = :requestNo ORDER BY id",
    { requestNo },
  );

  return { master: masterRows[0] ?? null, details, requestItems: details, instanceModels: [] };
}

async function getPurchaseOrderDetail(purchaseOrderId: string): Promise<OrderDetailData> {
  const masterRows = await queryRows<Row>(
    "SELECT * FROM purchaseorders WHERE purchaseOrderId = :purchaseOrderId LIMIT 1",
    { purchaseOrderId },
  );
  if (!masterRows[0]) return { master: null, details: [], requestItems: [], instanceModels: [] };

  const [details, requestItems, instanceModels] = await Promise.all([
    queryRows<Row>(
      "SELECT * FROM purchaseorderitems WHERE purchaseOrderId = :purchaseOrderId ORDER BY id",
      { purchaseOrderId },
    ),
    queryRows<Row>(
      `
        SELECT DISTINCT requestItem.*
        FROM requestitems AS requestItem
        INNER JOIN purchaseorderitems AS purchaseItem ON purchaseItem.requestItemId = requestItem.id
        WHERE purchaseItem.purchaseOrderId = :purchaseOrderId
        ORDER BY requestItem.id
      `,
      { purchaseOrderId },
    ),
    queryRows<Row>(
      `
        SELECT DISTINCT instanceModel.*
        FROM instancemodels AS instanceModel
        INNER JOIN requestitems AS requestItem ON requestItem.deviceCode = instanceModel.deviceCode
        INNER JOIN purchaseorderitems AS purchaseItem ON purchaseItem.requestItemId = requestItem.id
        WHERE purchaseItem.purchaseOrderId = :purchaseOrderId
        ORDER BY instanceModel.deviceCode
      `,
      { purchaseOrderId },
    ),
  ]);

  return { master: masterRows[0], details, requestItems, instanceModels };
}
