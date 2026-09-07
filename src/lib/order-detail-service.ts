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
      `
        SELECT
          purchaseItem.*,
          ${latestInstanceContractExpression("contractNo")} AS latestInstanceContractNo,
          ${latestInstanceContractExpression("dateSigned", true)} AS latestInstanceContractDateSigned,
          ${latestInstanceContractExpression("first24MonthPriceUSD")} AS latestInstanceContractFirst24PriceUSD,
          ${latestInstanceContractExpression("next36MonthPriceUSD")} AS latestInstanceContractNext36PriceUSD
        FROM purchaseorderitems AS purchaseItem
        LEFT JOIN requestitems AS requestItem ON requestItem.id = purchaseItem.requestItemId
        LEFT JOIN requests AS requestMaster ON requestMaster.requestNo = COALESCE(NULLIF(purchaseItem.requestNo, ''), requestItem.requestNo)
        WHERE purchaseItem.purchaseOrderId = :purchaseOrderId
        ORDER BY purchaseItem.id
      `,
      { purchaseOrderId },
    ),
    queryRows<Row>(
      `
        SELECT DISTINCT requestItem.*, requestMaster.countryCode
        FROM requestitems AS requestItem
        INNER JOIN purchaseorderitems AS purchaseItem ON purchaseItem.requestItemId = requestItem.id
        LEFT JOIN requests AS requestMaster ON requestMaster.requestNo = requestItem.requestNo
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

function latestInstanceContractExpression(column: string, date = false) {
  const select = date ? `DATE_FORMAT(contract.${column}, '%Y-%m-%d')` : `contract.${column}`;
  return `(SELECT ${select}
      FROM instancecontracts AS contract
     WHERE UPPER(TRIM(SUBSTRING_INDEX(contract.countryCode, '-', 1))) = UPPER(TRIM(SUBSTRING_INDEX(requestMaster.countryCode, '-', 1)))
       AND contract.deviceCode = requestItem.deviceCode
       AND (contract.first24MonthPriceUSD IS NOT NULL OR contract.next36MonthPriceUSD IS NOT NULL)
     ORDER BY contract.dateSigned DESC, contract.createdAt DESC, contract.contractNo DESC
     LIMIT 1)`;
}
