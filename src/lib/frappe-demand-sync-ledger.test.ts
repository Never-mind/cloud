import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, executeRaw, queryRowsRaw, connection } = vi.hoisted(() => {
  const connection = {
    execute: vi.fn(),
    query: vi.fn().mockResolvedValue([[]]),
    release: vi.fn(),
  };
  return {
    execute: vi.fn(),
    executeRaw: vi.fn(),
    queryRowsRaw: vi.fn().mockResolvedValue([]),
    connection,
  };
});

vi.mock("./db", () => ({
  execute,
  executeRaw,
  queryRowsRaw,
  getDb: () => ({ getConnection: async () => connection }),
}));

import { persistBlockedItem, persistLedgerItem } from "./frappe-demand-sync-service";

const item = {
  id: "DOI-00001",
  demandOrderId: "DO-00001",
  materialId: "MAT-00098",
  supplierId: "BP-003",
  status: "Committed",
  batchName: "SLS0001H",
  quantity: 6,
  requestedDeliveryDate: "2026-09-01",
  modified: "2026-09-01 10:00:00",
};

const order = {
  id: "DO-00001",
  customerPoNo: "eSHWC26082489en",
  datacenterId: "DC-002",
  deliveryRecipientListId: "DRL-005",
  transportMode: "Air",
  modified: "2026-09-01 10:00:00",
};

describe("需求同步台账：写入不能丢本地需求单号", () => {
  beforeEach(() => {
    connection.execute.mockReset().mockResolvedValue([{}]);
  });

  it("upsert 用 COALESCE，新值为 null 时保留台账里已有的本地单号", async () => {
    await persistLedgerItem(connection as never, {
      item,
      order,
      localRequestNo: null,
      status: "blocked",
      errorMessage: "物料 MAT-00098 尚未确认映射",
      reasonCode: "blocked_mapping",
    });

    const sql = String(connection.execute.mock.calls[0][0]);
    expect(sql).toContain("localRequestNo=COALESCE(VALUES(localRequestNo), localRequestNo)");
  });

  it("阻断登记也会带上由远端 customer_po_no 推出的本地需求单号", async () => {
    await persistBlockedItem(item, order, "hash", "物料 MAT-00098 尚未确认映射");

    const params = connection.execute.mock.calls[0][1] as unknown[];
    // 第 3 个参数是 localRequestNo
    expect(params[2]).toBe("eSHWC26082489en");
    expect(params[6]).toBe("blocked");
  });
});
