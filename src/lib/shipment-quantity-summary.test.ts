import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  queryRows: vi.fn(), execute: vi.fn(), hasTableColumn: vi.fn().mockResolvedValue(false), INTERNAL_ID_COLUMN: "internalId",
}));
import { queryRows, execute } from "./db";
import { listEntityRows, listEntityFilterOptions, getEntityOrderBy } from "./crud";
import { getEntityConfig } from "./modules";

const config = getEntityConfig("shipments")!;
beforeEach(() => {
  vi.mocked(queryRows).mockReset();
  vi.mocked(execute).mockClear();
});

describe("shipment quantities", () => {
  it("exposes read-only quantity and totals with receipt/column filters, including historical ID matching", async () => {
    vi.mocked(queryRows)
      .mockResolvedValueOnce([{ total: 21, totalQuantity: "1050" }])
      .mockResolvedValueOnce([{ shipmentId: "S1", quantity: 20 }, { shipmentId: "S2", quantity: 30 }]);
    const result = await listEntityRows(config, new URLSearchParams({
      page: "2", pageSize: "10", knownTotal: "999", receiptStatus: "unreceived", "filter.batchName": "MX-1",
    }));
    expect(result).toMatchObject({ total: 21, totalQuantity: 1050, page: 2 });
    expect(result.rows.map((row) => "quantity" in row ? row.quantity : undefined)).toEqual([20, 30]);
    const [summarySql, summaryParams] = vi.mocked(queryRows).mock.calls[0];
    expect(summarySql).toContain("shipment.`deliveredAt` IS NULL");
    expect(summaryParams).toMatchObject({ columnFilter_batchName: ["MX-1"] });
    expect(summarySql).not.toContain("LIMIT :limit");
    for (const [sql] of vi.mocked(queryRows).mock.calls) {
      expect(sql).toContain("SELECT ri.quantity");
      expect(sql).toContain("poi.id = shipment.purchaseOrderItemId");
      expect(sql).toContain("SUBSTRING(poi.id, 5)");
      expect(sql).toContain("poi.poNo = shipment.poNo");
      expect(sql).toContain("ri.deviceCode = shipment.deviceCode");
      expect(sql).not.toContain("shipment.`quantity`");
    }
    expect(config.listFields.find((field) => field.key === "quantity")).toMatchObject({ label: "数量", type: "number" });
    expect(config.formFields.some((field) => field.key === "quantity")).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("uses the derived quantity for sorting and filter candidates", async () => {
    expect(getEntityOrderBy(config, "shipment", new URLSearchParams({ sortField: "quantity", sortOrder: "desc" })))
      .toContain("SELECT ri.quantity");
    vi.mocked(queryRows).mockResolvedValueOnce([{ value: 20, count: 2 }]);
    const result = await listEntityFilterOptions(config, new URLSearchParams({ field: "quantity", receiptStatus: "received" }));
    expect(result.options).toEqual([{ value: "20", count: 2 }]);
    expect(vi.mocked(queryRows).mock.calls[0][0]).toContain("SELECT ri.quantity");
    expect(vi.mocked(queryRows).mock.calls[0][0]).toContain("shipment.deliveredAt IS NOT NULL");
  });

  it("returns zero totals for an empty result", async () => {
    vi.mocked(queryRows).mockResolvedValueOnce([{ total: 0, totalQuantity: null }]).mockResolvedValueOnce([]);
    expect(await listEntityRows(config, new URLSearchParams())).toMatchObject({ rows: [], total: 0, totalQuantity: 0 });
  });
});
