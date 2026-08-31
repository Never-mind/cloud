import { describe, expect, it } from "vitest";
import { appendKnownTotal, getKnownNumber, getKnownTotal, PAGE_SIZE_OPTIONS, getPaginationState, normalizePageSize, paginateRows } from "./pagination";

describe("pagination", () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({ id: index + 1 }));

  it("returns rows for the requested page", () => {
    expect(paginateRows(rows, 2, 10).map((row) => row.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it("clamps page numbers to the available range", () => {
    expect(getPaginationState(25, 0, 10)).toMatchObject({ page: 1, totalPages: 3 });
    expect(getPaginationState(25, 9, 10)).toMatchObject({ page: 3, totalPages: 3 });
  });

  it("normalizes page sizes to configured options", () => {
    expect(PAGE_SIZE_OPTIONS).toEqual([10, 20, 50, 100]);
    expect(normalizePageSize(50)).toBe(50);
    expect(normalizePageSize(7)).toBe(20);
    expect(normalizePageSize(1000)).toBe(20);
  });

  it("reads and writes reusable totals without losing decimal summaries", () => {
    const params = new URLSearchParams();
    appendKnownTotal(params, 125.8);
    params.set("knownTotalAmount", "125.8");
    expect(getKnownTotal(params)).toBe(125);
    expect(getKnownNumber(params, "knownTotalAmount")).toBe(125.8);
    expect(getKnownTotal(new URLSearchParams())).toBeNull();
    expect(getKnownNumber(new URLSearchParams(), "knownTotalAmount")).toBeNull();
  });
});
