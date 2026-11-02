import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ queryRows: vi.fn() }));
import { queryRows } from "./db";
import { listOrderRows } from "./order-list-service";

beforeEach(() => vi.mocked(queryRows).mockReset());

describe("order quantity totals", () => {
  it.each(["requests", "purchase"])("returns the full filtered total independently of the %s page", async (mode) => {
    vi.mocked(queryRows)
      .mockResolvedValueOnce([{ total: 21, totalQuantity: "1050" }])
      .mockResolvedValueOnce([{ draft: 21, confirmed: 0 }])
      .mockResolvedValueOnce([{ requestNo: "R1", poNo: "P1", totalQuantity: 50 }])
      .mockResolvedValueOnce([]);
    const result = await listOrderRows(new URLSearchParams({ mode, page: "3", pageSize: "10", countryCode: "MX", keyword: "example" }));
    expect(result).toMatchObject({ total: 21, totalQuantity: 1050, page: 3, totalPages: 3 });
    expect(result.rows.reduce((sum, row) => sum + Number(row.totalQuantity), 0)).toBe(50);
    const [summarySql, params] = vi.mocked(queryRows).mock.calls[0];
    expect(summarySql).not.toContain("LIMIT :limit");
    expect(summarySql).toContain("AS totalQuantity");
    expect(params).toMatchObject({ keyword: "%example%", countryCode: mode === "purchase" ? ["MX"] : "MX" });
    expect(vi.mocked(queryRows).mock.calls[2][0]).toContain("LIMIT :limit OFFSET :offset");
  });

  it("applies purchase-progress HAVING to the request summary and reads quantities before purchase joins", async () => {
    vi.mocked(queryRows)
      .mockResolvedValueOnce([{ total: 2, totalQuantity: 50 }])
      .mockResolvedValueOnce([{ draft: 0, confirmed: 2 }])
      .mockResolvedValueOnce([{ requestNo: "R1", totalQuantity: 20 }, { requestNo: "R2", totalQuantity: 30 }]);
    const result = await listOrderRows(new URLSearchParams({ mode: "requests", statusTab: "confirmed", "filter.orderProgress": "部分下单" }));
    expect(result.totalQuantity).toBe(50);
    for (const index of [0, 2]) {
      const [sql, params] = vi.mocked(queryRows).mock.calls[index];
      expect(sql).toContain("HAVING");
      expect(sql).toContain("SUM(quantityItem.quantity)");
      expect(sql).not.toContain("SUM(ri.quantity)");
      expect(params).toMatchObject({ having_orderProgress: ["部分下单"] });
    }
  });

  it.each(["requests", "purchase"])("returns zero for an empty %s result", async (mode) => {
    vi.mocked(queryRows)
      .mockResolvedValueOnce([{ total: 0, totalQuantity: null }])
      .mockResolvedValueOnce([{ draft: 0, confirmed: 0 }])
      .mockResolvedValueOnce([]);
    const result = await listOrderRows(new URLSearchParams({ mode }));
    expect(result).toMatchObject({ rows: [], total: 0, totalQuantity: 0 });
  });
});
