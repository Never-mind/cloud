import type { Row } from "./db";

/**
 * 远端物流时间节点 → 本地物流字段的映射表（**待接通，先保留接口**）。
 *
 * 远端的时间节点在另一个模块里，目前连不上，也还没有字段映射，所以这张表先空着。
 * 等确认远端字段名之后，把对应关系填进来即可自动生效：补齐待补全物流 / 重新拉取远端物流时
 * 会把这些字段一并写入，并且遵守"远端有值即以远端为准"，覆盖此前导入的值。
 *
 * 填写示例（remote 用远端真实字段名）：
 *   { remote: "ready_at", local: "crd", label: "CRD" },
 *   { remote: "handover_at", local: "apdAt", label: "APD交单" },
 *   { remote: "pickup_at", local: "pickupAt", label: "ASD提货" },
 *   { remote: "departed_at", local: "departedAt", label: "起飞/开船" },
 *   { remote: "arrived_at", local: "arrivedAt", label: "到港" },
 *   { remote: "customs_cleared_at", local: "customsClearedAt", label: "清关完成" },
 *   { remote: "delivered_at", local: "deliveredAt", label: "派送" },
 *   { remote: "transport_mode", local: "transportMode", label: "运输方式" },
 */
export const REMOTE_SHIPMENT_TIMELINE_FIELDS: Array<{ remote: string; local: string; label: string }> = [];

/** 本地物流的时间节点列，补齐写入与差异提示都按这张表处理。 */
export const SHIPMENT_TIMELINE_COLUMNS: Array<[string, string]> = [
  ["transportMode", "运输方式"],
  ["crd", "CRD"],
  ["apdAt", "APD交单"],
  ["pickupAt", "ASD提货"],
  ["departedAt", "起飞/开船"],
  ["arrivedAt", "到港"],
  ["customsClearedAt", "清关完成"],
  ["deliveredAt", "派送"],
];

/**
 * 读取远端物流时间节点（按需求单号）。
 *
 * 远端模块接通前始终返回空 Map，调用方按"没有远端时间节点"处理，
 * 因此补齐流程与提示都不需要改；接通后只要在这里按 REMOTE_SHIPMENT_TIMELINE_FIELDS 组装即可。
 */
export async function loadRemoteShipmentTimelines(requestNos: string[]): Promise<Map<string, Row>> {
  void requestNos;
  return new Map();
}
