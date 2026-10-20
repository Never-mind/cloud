import { describe, expect, it } from "vitest";
import { addDaysToDateOnly, normalizeDateOnlyValue } from "./date-only";

describe("date-only normalization", () => {
  it("keeps local date strings unchanged", () => {
    expect(normalizeDateOnlyValue("2026/06/01")).toBe("2026-06-01");
    expect(normalizeDateOnlyValue("2026-06-01")).toBe("2026-06-01");
  });

  it("converts a browser UTC serialization back to the China business date", () => {
    expect(normalizeDateOnlyValue("2026-05-31T16:00:00.000Z")).toBe("2026-06-01");
  });

  it("turns an empty optional date into null", () => {
    expect(normalizeDateOnlyValue("")).toBeNull();
  });

  it("adds days across month boundaries", () => {
    expect(addDaysToDateOnly("2026-08-17", 30)).toBe("2026-09-16");
    expect(addDaysToDateOnly("2026-12-20", 30)).toBe("2027-01-19");
    expect(addDaysToDateOnly("", 30)).toBe("");
  });
});
