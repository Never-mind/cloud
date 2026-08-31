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
    `
      SELECT
        requestItem.*,
        COALESCE(NULLIF(supplier.shortName, ''), NULLIF(supplier.nameCn, ''), supplier.supplierCode, requestItem.supplierId) AS supplierDisplayName,
        COALESCE(NULLIF(undertakingUnit.shortName, ''), NULLIF(undertakingUnit.entityName, ''), NULLIF(undertakingUnit.name, ''), undertakingUnit.undertakingUnitCode, requestItem.undertakingUnitId) AS undertakingUnitDisplayName,
        COALESCE(NULLIF(customer.shortName, ''), NULLIF(customer.nameCn, ''), NULLIF(customer.name, ''), customer.customerCode, requestItem.customerId) AS customerDisplayName
      FROM requestitems AS requestItem
      LEFT JOIN merge_common_suppliers AS supplier
        ON supplier.supplierId = requestItem.supplierId OR supplier.supplierCode = requestItem.supplierId
      LEFT JOIN merge_common_undertaking_units AS undertakingUnit
        ON undertakingUnit.undertakingUnitId = requestItem.undertakingUnitId OR undertakingUnit.undertakingUnitCode = requestItem.undertakingUnitId
      LEFT JOIN merge_common_customers AS customer
        ON customer.customerId = requestItem.customerId OR customer.customerCode = requestItem.customerId
      WHERE requestItem.requestNo = :requestNo
      ORDER BY requestItem.id
    `,
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
