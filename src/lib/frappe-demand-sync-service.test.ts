import { describe, expect, it } from "vitest";
import { localRequestNo, nearestPlannedDeliveryDate, requestGroupType, requestItemType } from "./frappe-demand-sync-service";

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
});
