export type OrderRouteMode = "requests" | "purchase";

export function getOrderCreateRoute(mode: OrderRouteMode) {
  return mode === "requests" ? "/requests/orders/new" : "/purchase/orders/new";
}

export function getOrderDetailRoute(mode: OrderRouteMode, id: string) {
  const encodedId = encodeURIComponent(id);
  return mode === "requests"
    ? `/requests/orders/${encodedId}`
    : `/purchase/orders/${encodedId}`;
}
