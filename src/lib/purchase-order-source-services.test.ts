import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  queryRows: vi.fn(),
  execute: vi.fn(),
  queryRowsInTransaction: vi.fn(),
  executeInTransaction: vi.fn().mockResolvedValue({ affectedRows: 1 }),
  withTransaction: vi.fn(async (work) => work({})),
}));

import { queryRows, queryRowsInTransaction, executeInTransaction } from "./db";
import { listOrderRows, listOrderFilterOptions } from "./order-list-service";
import { getOrderDetail } from "./order-detail-service";
import { createPurchaseOrdersFromItems } from "./pending-purchase-service";

beforeEach(() => vi.clearAllMocks());

describe("purchase source list and detail", () => {
  it.each([false, true])("returns all sources for list/export (export=%s)", async (exportAll) => {
    vi.mocked(queryRows)
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{ draft: 1, confirmed: 0 }])
      .mockResolvedValueOnce([{ purchaseOrderId: "P1", poNo: "PO1", requestNo: "REQ-A", sourceRequestNos: null,
        totalQuantity: 5, purchaseTotalAmount: 100 }])
      .mockResolvedValueOnce([
        { poNo: "PO1", requestNo: "REQ-A" }, { poNo: "PO1", requestNo: "REQ-B" }, { poNo: "PO1", requestNo: "REQ-B" },
      ]);
    const result = await listOrderRows(new URLSearchParams({ mode: "purchase", export: exportAll ? "1" : "0", "filter.requestNo": "REQ-B" }));
    expect(result.rows[0]).toMatchObject({ requestNo: "REQ-A,REQ-B", sourceRequestNos: "REQ-A,REQ-B",
      totalQuantity: 5, purchaseTotalAmount: 100 });
    // The source filter must apply through EXISTS, not to the joined rows summed by the list.
    const [sql, params] = vi.mocked(queryRows).mock.calls[2];
    expect(sql).toContain("sourceItem.poNo = purchase.poNo");
    expect(sql).toContain("sourceRequestItem.requestNo) = :column_requestNo_0");
    expect(params).toMatchObject({ column_requestNo_0: "REQ-B" });
    expect(vi.mocked(queryRows).mock.calls[3][1]).toEqual({ poNos: ["PO1"] });
  });

  it("uses distinct orders for filter counts when a purchase contains several demands", async () => {
    vi.mocked(queryRows).mockResolvedValueOnce([{ value: "USD", count: 1 }]);
    const result = await listOrderFilterOptions(new URLSearchParams({ mode: "purchase", field: "currency", "filter.requestNo": "REQ-B" }));
    expect(result.options).toEqual([{ value: "USD", count: 1 }]);
    const [sql, params] = vi.mocked(queryRows).mock.calls[0];
    expect(sql).toContain("COUNT(DISTINCT identityKey)");
    expect(sql).toContain("sourceItem.poNo = purchase.poNo");
    expect(params).toMatchObject({ option_requestNo_0: "REQ-B" });
  });

  it("exposes full sources in detail without replacing the editable legacy key", async () => {
    vi.mocked(queryRows)
      .mockResolvedValueOnce([{ purchaseOrderId: "P1", poNo: "PO1", requestNo: "REQ-A", sourceRequestNos: "REQ-A" }])
      .mockResolvedValueOnce([{ id: "PI-A", requestNo: "REQ-A" }, { id: "PI-B", requestNo: null }])
      .mockResolvedValueOnce([{ id: "RI-A", requestNo: "REQ-A" }, { id: "RI-B", requestNo: "REQ-B" }])
      .mockResolvedValueOnce([]);
    const result = await getOrderDetail("purchase-orders", "P1");
    expect(result.master).toMatchObject({ requestNo: "REQ-A", sourceRequestNos: "REQ-A,REQ-B" });
  });
});

describe("combine pending items into purchase orders", () => {
  it("persists all selected demand numbers and each line's own source", async () => {
    vi.mocked(queryRowsInTransaction).mockResolvedValueOnce([
      { id: "RI-A", requestNo: "REQ-A" }, { id: "RI-B", requestNo: "REQ-B" }, { id: "RI-B2", requestNo: "REQ-B" },
    ]);
    const result = await createPurchaseOrdersFromItems({ requestItemIds: ["RI-A", "RI-B", "RI-B2"], poNo: "PO1" });
    expect(result).toMatchObject({ poNo: "PO1", itemCount: 3, appended: false });
    const writes = vi.mocked(executeInTransaction).mock.calls;
    expect(writes.find(([, sql]) => sql.includes("INSERT INTO purchaseorders"))?.[2])
      .toMatchObject({ requestNo: "REQ-A", sourceRequestNos: "REQ-A,REQ-B" });
    expect(writes.filter(([, sql]) => sql.includes("INSERT INTO purchaseorderitems")).map(([, , data]) => data?.requestNo))
      .toEqual(["REQ-A", "REQ-B", "REQ-B"]);
  });

  it("preserves all old sources while appending to a draft with incomplete metadata", async () => {
    vi.mocked(queryRowsInTransaction)
      .mockResolvedValueOnce([{ id: "RI-C", requestNo: "REQ-C" }, { id: "RI-B2", requestNo: "REQ-B" }])
      .mockResolvedValueOnce([{ purchaseOrderId: "P1", poNo: "PO1", status: "草稿", requestNo: "REQ-A", sourceRequestNos: null }])
      .mockResolvedValueOnce([{ id: "PI-A", requestNo: "REQ-A" }, { id: "PI-B", requestNo: "REQ-B" }]);
    const result = await createPurchaseOrdersFromItems({ requestItemIds: ["RI-C", "RI-B2"], targetPoNo: "PO1" });
    expect(result).toMatchObject({ poNo: "PO1", appended: true, itemCount: 2 });
    const update = vi.mocked(executeInTransaction).mock.calls.find(([, sql]) => sql.includes("UPDATE purchaseorders"));
    expect(update?.[2]).toEqual({ purchaseOrderId: "P1", sourceRequestNos: "REQ-A,REQ-B,REQ-C" });
  });
});
