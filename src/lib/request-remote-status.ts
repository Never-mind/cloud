/** 远端履约状态（Frappe Demand Order Item.status）与本地展示名的映射。 */
export const REQUEST_REMOTE_STATUS_OPTIONS = [
  { label: "采履下发供应商", value: "Issued to Supplier" },
  { label: "采履已确认", value: "Confirmed" },
  { label: "订单已承诺", value: "Committed" },
  { label: "已交单", value: "Handed Over" },
  { label: "已发货", value: "Shipped" },
  { label: "已到货", value: "Arrived" },
  { label: "已签收", value: "Received" },
  { label: "取消", value: "Cancelled" },
];

const LABELS = new Map(REQUEST_REMOTE_STATUS_OPTIONS.map((option) => [option.value.toLowerCase(), option.label]));

export function formatRequestRemoteStatus(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return LABELS.get(raw.toLowerCase()) ?? raw;
}
