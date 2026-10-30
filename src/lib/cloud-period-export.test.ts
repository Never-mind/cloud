import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db", () => ({ queryRowsRaw: db.query }));
vi.mock("./cloud-service", () => ({ CLOUD_COLLECTION_PAID_SQL: "(collected = 1)", resolveCloudRowsDisplayNames: async (rows: unknown[]) => rows }));
import { GET } from "../app/api/cloud/rows/export/route";
beforeEach(() => { vi.resetAllMocks(); db.query.mockResolvedValue([{ period: "202605", customer: "测试客户", settlementGrossProfit: -12.5 }]); });
describe("cloud export month range", () => {
  it.each(["", "&view=collection&collectionStatus=open"])("applies bounds to export %s", async view => {
    const response = await GET(new NextRequest("http://local/api/cloud/rows/export?periodFrom=2025-12&periodTo=2026-05" + view));
    expect(response.status).toBe(200);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain(">= :periodFrom");
    expect(sql).toContain("<= :periodTo");
    expect(params).toMatchObject({ periodFrom: "202512", periodTo: "202605" });
    const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()));
    expect(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])).toHaveLength(1);
  });
  it("returns a clear validation error before querying", async () => {
    const response = await GET(new NextRequest("http://local/api/cloud/rows/export?periodFrom=2026-06&periodTo=2026-05"));
    expect(response.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});
