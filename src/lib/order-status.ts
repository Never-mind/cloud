import type { OrderRouteMode } from "./order-routes";

export type OrderStatusTab = "draft" | "confirmed";

export function isConfirmedOrderStatus(mode: OrderRouteMode, status: unknown) {
  const value = String(status ?? "");
  if (mode === "requests") {
    return value === "待下单" || value === "已下单" || value.includes("寰呬笅") || value.includes("宸蹭笅");
  }

  return value === "已确认" || value.includes("确认") || value.includes("纭") || value.includes("茬");
}

export function countOrderStatusTabs<T extends { status?: unknown }>(mode: OrderRouteMode, rows: T[]) {
  return {
    draft: rows.filter((row) => !isConfirmedOrderStatus(mode, row.status)).length,
    confirmed: rows.filter((row) => isConfirmedOrderStatus(mode, row.status)).length,
  };
}
