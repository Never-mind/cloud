import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));
vi.mock("./db", () => ({ queryRowsRaw: db.query, queryRows: db.query, executeRaw: db.execute, execute: db.execute }));
import { listCloudRows, listCloudSupplierPayments } from "./cloud-service";
beforeEach(() => { vi.resetAllMocks(); db.query.mockResolvedValue([]); });

describe("cloud period totals", () => {
  it("filters rows, counts, collection summary and full-result profit totals identically", async () => {
    db.query.mockImplementation(async (sql: string) => sql.includes("UNION ALL") ? [
      { currency: "USD", settlementGrossProfit: "-123.4500" },
      { currency: "CNY", invoiceTotalAmount: 7000, settlementGrossProfit: null },
      { currency: "USD", collectionTotalAmount: 100, settlementGrossProfit: null },
    ] : []);
    const result = await listCloudRows(new URLSearchParams({ periodFrom: "2025-12", periodTo: "2026-05", page: "2", keyword: "客户" }));
    const calls = db.query.mock.calls.filter(([sql]) => sql.includes("FROM merge_cloud_rows") && !sql.includes("AS rowCount"));
    expect(calls.length).toBeGreaterThanOrEqual(6);
    for (const [sql, params] of calls) {
      expect(sql).toContain(">= :periodFrom");
      expect(sql).toContain("<= :periodTo");
      expect(params).toMatchObject({ periodFrom: "202512", periodTo: "202605", keyword: "%客户%" });
    }
    const [totalsSql] = calls.find(([sql]) => sql.includes("UNION ALL"))!;
    expect(totalsSql).toContain("ROUND(SUM(COALESCE(settlementGrossProfit, grossProfit, 0)), 4) AS settlementGrossProfit");
    expect(totalsSql).not.toContain("LIMIT :limit");
    expect(totalsSql).not.toContain("OFFSET :offset");
    expect(result.currencyTotals).toEqual([
      { currency: "CNY", invoiceTotalAmount: 7000 },
      { currency: "USD", settlementGrossProfit: "-123.4500", collectionTotalAmount: 100 },
    ]);
    expect(db.execute).not.toHaveBeenCalled();
  });
  it.each([listCloudRows, listCloudSupplierPayments])("limits table filter candidates to the selected months", async list => {
    await list(new URLSearchParams({ field: "period", periodFrom: "2026-01", periodTo: "2026-06" }));
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain(">= :periodFrom");
    expect(sql).toContain("<= :periodTo");
    expect(params).toMatchObject({ periodFrom: "202601", periodTo: "202606" });
  });
  it("filters supplier payment groups and their count", async () => {
    await listCloudSupplierPayments(new URLSearchParams({ periodFrom: "2025-12", periodTo: "2026-05", page: "2" }));
    expect(db.query.mock.calls).toHaveLength(2);
    for (const [sql, params] of db.query.mock.calls) {
      expect(sql).toContain(">= :periodFrom");
      expect(sql).toContain("<= :periodTo");
      expect(params).toMatchObject({ periodFrom: "202512", periodTo: "202605" });
    }
  });
});
