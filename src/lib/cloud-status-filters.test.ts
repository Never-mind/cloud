import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));
vi.mock("./db", () => ({ queryRowsRaw: db.query, queryRows: db.query, executeRaw: db.execute, execute: db.execute }));
import { listCloudRows } from "./cloud-service";
beforeEach(() => { vi.resetAllMocks(); db.query.mockResolvedValue([]); });

describe("cloud ledger status filters", () => {
  it.each([ ["status", "已确认", "confirmed = 1"], ["collectionInvoice", "未开票", "collectionInvoice = 'issued'"], ["collected", "已收款", "collected = 1"] ])("searches readable %s candidates without searching company names for the status", async (field, keyword, expression) => {
    db.query.mockResolvedValue([{ value: keyword, count: 2 }]);
    const result = await listCloudRows(new URLSearchParams({ field, keyword, period: "2026-10" }));
    expect(result).toEqual({ options: [{ value: keyword, count: 2 }] });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain(expression);
    expect(sql).toContain("LIKE :tableOptionKeyword");
    expect(sql).not.toContain("customer LIKE :keyword");
    expect(params).toMatchObject({ tableOptionKeyword: `%${keyword}%`, period: "202610" });
    expect(db.execute).not.toHaveBeenCalled();
  });
  it("keeps page search and other status selections while searching one status column", async () => {
    await listCloudRows(new URLSearchParams({ field: "collected", keyword: "未收款", listKeyword: "示例客户", "filter.status": "已确认", "filter.collectionInvoice": "已开票", "filter.collected": "已收款" }));
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("customer LIKE :keyword");
    expect(params).toMatchObject({ keyword: "%示例客户%", tableOptionKeyword: "%未收款%", tableOptionFilter_status: ["已确认"], tableOptionFilter_collectionInvoice: ["已开票"] });
    expect(params).not.toHaveProperty("tableOptionFilter_collected");
  });
  it("applies all three status filters to paginated rows, counts and monetary totals", async () => {
    await listCloudRows(new URLSearchParams({ "filter.status": "已确认", "filter.collectionInvoice": "未开票", "filter.collected": "未收款", sortField: "status", sortOrder: "asc", page: "2" }));
    const calls = db.query.mock.calls.filter(([sql]) => sql.startsWith("SELECT * FROM merge_cloud_rows") || sql.startsWith("SELECT COUNT(*) AS total FROM merge_cloud_rows") || sql.includes("UNION ALL"));
    expect(calls).toHaveLength(3);
    for (const [sql, params] of calls) {
      expect(params).toMatchObject({ cloudFilter_status: ["已确认"], cloudFilter_collectionInvoice: ["未开票"], cloudFilter_collected: ["未收款"] });
      expect(sql).toContain("CASE WHEN confirmed = 1 THEN '已确认' ELSE '未确认' END IN (:cloudFilter_status)");
      expect(sql).toContain("CASE WHEN collectionInvoice = 'issued' THEN '已开票' ELSE '未开票' END IN (:cloudFilter_collectionInvoice)");
      expect(sql).toContain("CASE WHEN collected = 1 THEN '已收款' ELSE '未收款' END IN (:cloudFilter_collected)");
    }
    expect(calls.find(([sql]) => sql.startsWith("SELECT *"))?.[0]).toContain("ORDER BY CASE WHEN confirmed = 1 THEN '已确认' ELSE '未确认' END ASC");
  });
});
