import { describe, expect, it } from "vitest";
import { describeRemoteChanges, localRequestNo, nearestPlannedDeliveryDate, requestGroupType, requestItemType } from "./frappe-demand-sync-service";

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
