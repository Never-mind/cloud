import { describe, expect, it } from "vitest";
import {
  pickReleaseTimeline,
  REMOTE_SHIPMENT_TIMELINE_FIELDS,
  SHIPMENT_TIMELINE_COLUMNS,
  type RemoteShipmentTimeline,
} from "./remote-shipment-timeline";

function release(releaseId: string, releaseName: string, materials: string[], fields: Record<string, string>) {
  return { releaseId, releaseName, materials, fields };
}

const single: RemoteShipmentTimeline = {
  releases: [release("2453213706594025483", "EDI-00054", ["MAT-00001"], { crd: "2026-02-01", deliveredAt: "2026-02-20" })],
};

const multi: RemoteShipmentTimeline = {
  releases: [
    release("2429742620847112194", "EDI-00043", ["MAT-00018", "MAT-00038"], { deliveredAt: "2026-03-02" }),
    release("2549108128588234769", "EDI-00057", ["MAT-00004"], { deliveredAt: "2026-02-27" }),
  ],
};

describe("物流时间按 Release 归属", () => {
  it("需求单只有一个 Release 时直接用它", () => {
    expect(pickReleaseTimeline(single, "MAT-00001")?.releaseId).toBe("2453213706594025483");
    // 物料对不上也退回唯一 Release，覆盖远端没维护物料的场景。
    expect(pickReleaseTimeline(single, "")?.releaseId).toBe("2453213706594025483");
    expect(pickReleaseTimeline(single, "MAT-99999")?.releaseId).toBe("2453213706594025483");
  });

  it("多 Release 时按物料精确定位，避免把别条明细的时间写进来", () => {
    expect(pickReleaseTimeline(multi, "MAT-00004")?.releaseId).toBe("2549108128588234769");
    expect(pickReleaseTimeline(multi, "mat-00018")?.releaseId).toBe("2429742620847112194");
    expect(pickReleaseTimeline(multi, "MAT-00018")?.fields.deliveredAt).toBe("2026-03-02");
    expect(pickReleaseTimeline(multi, "MAT-00004")?.fields.deliveredAt).toBe("2026-02-27");
  });

  it("多 Release 且物料定位不到时返回空，宁可留空也不写错", () => {
    expect(pickReleaseTimeline(multi, "MAT-99999")).toBeNull();
    expect(pickReleaseTimeline(multi, "")).toBeNull();
  });

  it("没有远端时间时不写任何值", () => {
    expect(pickReleaseTimeline(undefined, "MAT-00001")).toBeNull();
    expect(pickReleaseTimeline({ releases: [] }, "MAT-00001")).toBeNull();
  });
});

describe("物流时间字段映射表", () => {
  it("按业务确认的口径对应到本地列", () => {
    const mapping = Object.fromEntries(REMOTE_SHIPMENT_TIMELINE_FIELDS.map((field) => [field.local, `${field.source}.${field.remote}`]));
    expect(mapping).toEqual({
      crd: "demandItem.requested_delivery_date",
      supplierEtaAt: "release.estimated_delivery_date",
      apdAt: "shipment.actual_ready_at",
      pickupAt: "shipment.actual_shipped_at",
      departedAt: "shipment.actual_departed_at",
      arrivedAt: "shipment.actual_arrived_at",
      customsClearedAt: "shipment.customs_cleared_date",
      deliveredAt: "shipment.signed_date",
    });
  });

  it("列表列包含新增的供应商反馈ETA，且不重复", () => {
    const keys = SHIPMENT_TIMELINE_COLUMNS.map(([key]) => key);
    expect(keys).toContain("supplierEtaAt");
    expect(new Set(keys).size).toBe(keys.length);
  });
});
