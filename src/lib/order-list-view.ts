import type { OrderRouteMode } from "./order-routes";

export function getOrderListColumnKeys(mode: OrderRouteMode) {
  if (mode === "requests") {
    return [
      "id",
      "countryCode",
      "batchName",
      "status",
      "totalQuantity",
      "plannedDeliveryDate",
      "createdAt",
      "updatedAt",
      "actions",
    ];
  }

  return [
    "id",
    "requestNo",
    "batchName",
    "status",
    "currency",
    "totalQuantity",
    "purchaseTotalAmount",
    "createdAt",
    "updatedAt",
    "actions",
  ];
}

export function shouldShowPurchaseSourceGenerator(_mode: OrderRouteMode) {
  return false;
}
