import { afterEach, describe, expect, it } from "vitest";
import {
  describeRemoteChanges,
  hasEligibleStatus,
  isCancelledStatus,
  localRequestNo,
  nearestPlannedDeliveryDate,
  requestGroupType,
  requestItemType,
} from "./frappe-demand-sync-service";

describe("Frappe demand synchronization rules", () => {
  it("uses customer PO number as the local request number without a prefix", () => {
    expect(localRequestNo(" eSHWC2606039t4b ")).toBe("eSHWC2606039t4b");
  });

  it("derives line type from the mapped local instance-model type", () => {
    expect(requestItemType("Equipment")).toBe("整机");
    expect(requestItemType("Component")).toBe("备件");
  });

  it("marks an order containing both line types as mixed", () => {
    expect(requestGroupType(["整机", "备件"])).toBe("整机+备件");
    expect(requestGroupType(["整机", "整机"])).toBe("整机");
  });

  it("uses the valid requested delivery date nearest to today", () => {
    const now = new Date("2026-09-10T08:00:00+08:00");
    expect(nearestPlannedDeliveryDate(["2026-09-30", "2026-09-12", "invalid"], now)).toBe("2026-09-12");
  });

  it("lists the remote fields that changed since the previous snapshot", () => {
    const previous = JSON.stringify({
      quantity: 20, status: "Committed", supplierId: "BP-003", materialId: "MAT-00018",
      requestedDeliveryDate: "2026-03-28", modified: "2026-09-07 19:08:03",
      order: { customerPoNo: "eSHWC251217d81j", datacenterId: "DC-003", deliveryRecipientListId: "DRL-021", modified: "2026-09-07 19:08:03" },
    });
    const current = {
      quantity: 25, status: "Committed", supplierId: "BP-003", materialId: "MAT-00018",
      requestedDeliveryDate: "2026-04-10", modified: "2026-09-11 09:00:00",
      order: { customerPoNo: "eSHWC251217d81j", datacenterId: "DC-003", deliveryRecipientListId: "DRL-021", modified: "2026-09-07 19:08:03" },
    };
    expect(describeRemoteChanges(previous, current)).toEqual([
      { field: "quantity", label: "数量", from: "20", to: "25" },
      { field: "requestedDeliveryDate", label: "需求发货日期", from: "2026-03-28", to: "2026-04-10" },
    ]);
  });

  it("reports nothing when the previous snapshot is missing and ignores modified-only changes", () => {
    const current = {
      quantity: 20, status: "Committed", supplierId: "BP-003", materialId: "MAT-00018",
      requestedDeliveryDate: "2026-03-28", modified: "2026-09-11 09:00:00",
      order: { customerPoNo: "eSHWC251217d81j", datacenterId: "DC-003", deliveryRecipientListId: "DRL-021", modified: "2026-09-07 19:08:03" },
    };
    expect(describeRemoteChanges(null, current)).toEqual([]);
    const previous = JSON.stringify({ ...current, modified: "2026-09-07 19:08:03" });
    expect(describeRemoteChanges(previous, current)).toEqual([]);
  });
});

describe("远端状态同步范围（默认黑名单口径）", () => {
  const statusKeys = ["FRAPPE_DEMAND_SYNC_STATUSES", "FRAPPE_DEMAND_CANCELLED_STATUSES"] as const;
  const saved = statusKeys.map((key) => [key, process.env[key]] as const);

  afterEach(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function configure(values: Partial<Record<(typeof statusKeys)[number], string>>) {
    for (const key of statusKeys) delete process.env[key];
    Object.assign(process.env, values);
  }

  it("默认放开除取消以外的全部状态", () => {
    configure({});
    for (const status of ["Issued to Supplier", "Confirmed", "Committed", "Handed Over", "Shipped", "Arrived", "Received"]) {
      expect(hasEligibleStatus(status), status).toBe(true);
    }
    expect(hasEligibleStatus("Cancelled")).toBe(false);
  });

  it("远端以后新增的状态默认也在同步范围内，不需要改代码", () => {
    configure({});
    expect(hasEligibleStatus("Customs Cleared")).toBe(true);
  });

  it("状态为空按未知处理，不建档", () => {
    configure({});
    expect(hasEligibleStatus("")).toBe(false);
    expect(hasEligibleStatus("   ")).toBe(false);
  });

  it("显式配置 FRAPPE_DEMAND_SYNC_STATUSES 时按白名单收窄", () => {
    configure({ FRAPPE_DEMAND_SYNC_STATUSES: "Committed,Received" });
    expect(hasEligibleStatus("Committed")).toBe(true);
    expect(hasEligibleStatus("Received")).toBe(true);
    expect(hasEligibleStatus("Shipped")).toBe(false);
    expect(hasEligibleStatus("Customs Cleared")).toBe(false);
  });

  it("白名单配置为空白时按未配置处理，回到放开全部", () => {
    configure({ FRAPPE_DEMAND_SYNC_STATUSES: "  " });
    expect(hasEligibleStatus("Shipped")).toBe(true);
  });

  it("历史变量 FRAPPE_DEMAND_ELIGIBLE_STATUS 不再影响同步范围", () => {
    configure({});
    process.env.FRAPPE_DEMAND_ELIGIBLE_STATUS = "Committed";
    try {
      expect(hasEligibleStatus("Received")).toBe(true);
      expect(hasEligibleStatus("Shipped")).toBe(true);
    } finally {
      delete process.env.FRAPPE_DEMAND_ELIGIBLE_STATUS;
    }
  });

  it("取消状态可配置，默认只有 Cancelled", () => {
    configure({});
    expect(isCancelledStatus("Cancelled")).toBe(true);
    expect(isCancelledStatus("cancelled")).toBe(true);
    expect(isCancelledStatus("Received")).toBe(false);

    configure({ FRAPPE_DEMAND_CANCELLED_STATUSES: "Cancelled,Withdrawn" });
    expect(isCancelledStatus("Withdrawn")).toBe(true);
    expect(hasEligibleStatus("Withdrawn")).toBe(false);
  });
});
