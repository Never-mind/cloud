import { describe, expect, it } from "vitest";
import { appendCloudPeriodConditions, CloudPeriodFilterError, getCloudPeriodRangeError } from "./cloud-period-filter";

function filter(input: Record<string, string>) {
  const conditions: string[] = [];
  const values: Record<string, unknown> = {};
  appendCloudPeriodConditions(new URLSearchParams(input), conditions, values);
  return { conditions, values };
}
describe("cloud month range", () => {
  it("includes both endpoints across a year boundary", () => {
    const result = filter({ periodFrom: "2025-12", periodTo: "2026-05" });
    expect(result.values).toEqual({ periodFrom: "202512", periodTo: "202605" });
    expect(result.conditions[0]).toContain(">= :periodFrom");
    expect(result.conditions[1]).toContain("<= :periodTo");
  });
  it.each(["2026-05", "202605", "2026/05"])("keeps legacy single-month %s requests", period => {
    expect(filter({ period }).values).toEqual({ period: "202605" });
  });
  it("supports one month, open bounds and clearing", () => {
    expect(filter({ periodFrom: "2026-05", periodTo: "2026-05" }).conditions).toHaveLength(2);
    expect(filter({ periodFrom: "2026-05" }).values).toEqual({ periodFrom: "202605" });
    expect(filter({ periodTo: "2026-05" }).values).toEqual({ periodTo: "202605" });
    expect(filter({ periodFrom: "", periodTo: "" })).toEqual({ conditions: [], values: {} });
  });
  it("lets a range replace an old single-month query", () => {
    expect(filter({ period: "2025-01", periodFrom: "2026-01" }).values).toEqual({ periodFrom: "202601" });
  });
  it.each(["2026-00", "2026-13", "2026-1", "2026-05-01", "not-a-month"])("rejects invalid %s", periodFrom => {
    expect(() => filter({ periodFrom })).toThrow(CloudPeriodFilterError);
    expect(getCloudPeriodRangeError(periodFrom, "")).toContain("格式");
  });
  it("rejects reversed bounds", () => {
    expect(() => filter({ periodFrom: "2026-06", periodTo: "2026-05" })).toThrow("开始账期不能晚于结束账期");
    expect(getCloudPeriodRangeError("2026-06", "2026-05")).toBe("开始账期不能晚于结束账期");
    expect(getCloudPeriodRangeError("2026-05", "2026-05")).toBe("");
  });
});
