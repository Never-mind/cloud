/**
 * 远端物流时间节点 → 本地物流列的映射表。
 *
 * 时间来自三个远端实体，粒度不同：
 * - `demandItem`（Demand Order Item）：客户要求的时间，属于**需求明细**；
 * - `release`（EDI Order）：供应商承诺的时间，属于 **Release**；
 * - `shipment`（SL Shipment）：实际发生的时间，属于 Release 下的物流单。
 *
 * 因为一个需求单可以跨多个 Release、每个 Release 的时间不同，所以时间按
 * **Release** 落地：本地物流行记录自己的 `releaseId`，再从所属 Release 读时间。
 * 实测（2026-09-20）：163 个 Release 内 `requested_delivery_date` 全部一致，
 * 所以 CRD 在 Release 级也是良定义的。
 */

export type RemoteShipmentTimelineField = {
  /** 远端字段所在实体。 */
  source: "demandItem" | "release" | "shipment";
  /** 远端字段名。 */
  remote: string;
  /** 本地 `merge_power_shipments` 列名。 */
  local: string;
  /** 列表与差异提示上显示的中文名。 */
  label: string;
};

export const REMOTE_SHIPMENT_TIMELINE_FIELDS: RemoteShipmentTimelineField[] = [
  { source: "demandItem", remote: "requested_delivery_date", local: "crd", label: "CRD" },
  { source: "release", remote: "estimated_delivery_date", local: "supplierEtaAt", label: "供应商反馈ETA" },
  { source: "shipment", remote: "actual_ready_at", local: "apdAt", label: "APD交单" },
  { source: "shipment", remote: "actual_shipped_at", local: "pickupAt", label: "ASD提货" },
  { source: "shipment", remote: "actual_departed_at", local: "departedAt", label: "起飞/开船" },
  { source: "shipment", remote: "actual_arrived_at", local: "arrivedAt", label: "到港" },
  { source: "shipment", remote: "customs_cleared_date", local: "customsClearedAt", label: "清关完成" },
  { source: "shipment", remote: "signed_date", local: "deliveredAt", label: "派送" },
];

/** 远端各实体需要拉取的字段，去重后供加载器使用。 */
export function remoteFieldsFor(source: RemoteShipmentTimelineField["source"]) {
  return [...new Set(REMOTE_SHIPMENT_TIMELINE_FIELDS.filter((field) => field.source === source).map((field) => field.remote))];
}

/**
 * 本地物流的时间列（含运输方式），补齐、重新拉取与差异提示都按这张表处理。
 * 运输方式来自 Demand Order 而非时间节点，但同样只在远端给值时才覆盖。
 */
export const SHIPMENT_TIMELINE_COLUMNS: Array<[string, string]> = [
  ["transportMode", "运输方式"],
  ...REMOTE_SHIPMENT_TIMELINE_FIELDS.map((field) => [field.local, field.label] as [string, string]),
];

/**
 * 只由远端写入、本地没有默认值的列：新增物流行时要显式给 null，
 * 否则命名参数缺失会让 INSERT 报错。运输方式不在其中（草稿自带"待安排"）。
 */
export const REMOTE_ONLY_SHIPMENT_COLUMNS: string[] = [
  "releaseId",
  ...REMOTE_SHIPMENT_TIMELINE_FIELDS.map((field) => field.local),
];

/** 一个 Release 的时间快照。 */
export type RemoteReleaseTimeline = {
  releaseId: string;
  /** 远端 EDI Order 单号，便于排查。 */
  releaseName: string;
  /** 该 Release 覆盖的远端物料编码，用于把本地行定位到 Release。 */
  materials: string[];
  /** 本地列名 → 时间值。 */
  fields: Record<string, string>;
};

/** 一个需求单下的全部 Release 时间。 */
export type RemoteShipmentTimeline = {
  releases: RemoteReleaseTimeline[];
};

/**
 * 把本地物流行定位到所属 Release。
 *
 * 优先按物料编码匹配（同一需求单内同一物料在非取消状态下唯一，实测 0 重复）；
 * 只有物料匹配不到时，才在该需求单只有一个 Release 的情况下退回用它。
 * 多 Release 且物料对不上时返回 null，宁可留空也不把别条明细的时间写进来。
 */
export function pickReleaseTimeline(
  timeline: RemoteShipmentTimeline | undefined,
  material: string,
): RemoteReleaseTimeline | null {
  if (!timeline?.releases.length) return null;
  const code = material.trim().toUpperCase();
  if (code) {
    const matched = timeline.releases.filter((release) => release.materials.includes(code));
    if (matched.length === 1) return matched[0];
    if (matched.length > 1) return null;
  }
  return timeline.releases.length === 1 ? timeline.releases[0] : null;
}
