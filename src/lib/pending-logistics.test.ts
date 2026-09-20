import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRows = vi.fn();
const execute = vi.fn();
const getFrappeDemandLogistics = vi.fn();
const loadRemoteShipmentTimelines = vi.fn();

vi.mock("./db", () => ({
  execute: (...args: unknown[]) => execute(...args),
  queryRows: (...args: unknown[]) => queryRows(...args),
}));

vi.mock("./frappe-demand-sync-service", () => ({
  getFrappeDemandLogistics: (...args: unknown[]) => getFrappeDemandLogistics(...args),
  loadRemoteShipmentTimelines: (...args: unknown[]) => loadRemoteShipmentTimelines(...args),
}));

const { synchronizeRemoteLogistics } = await import("./procurement-service");

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    remoteDemandOrderId: "DO-00028",
    remoteDatacenterId: "DC-006",
    remoteDeliveryLocationId: "DL-018",
    remoteRecipientListId: "DRL-032",
    datacenterName: "São Paulo DC",
    destinationAddress: "Rua A, 100, São Paulo, Brazil",
    recipientName: "Maria Silva",
    recipientPhone: "+55 11 99999-8888",
    remoteModifiedAt: "2026-09-10 15:30:00",
    snapshotJson: "{}",
    snapshotAt: "2026-09-10T15:31:00.000Z",
    ...overrides,
  };
}

function lookup(snapshots: Array<[string, unknown]>, errors: Array<[string, string]> = []) {
  return {
    snapshotsByRequestNo: new Map(snapshots),
    errorsByRequestNo: new Map(errors),
  };
}

beforeEach(() => {
  queryRows.mockReset();
  // 除显式排队的返回值外，其余查询（例如实例编码→物料映射）一律返回空表。
  queryRows.mockResolvedValue([]);
  execute.mockReset();
  getFrappeDemandLogistics.mockReset();
  loadRemoteShipmentTimelines.mockReset();
  loadRemoteShipmentTimelines.mockResolvedValue(new Map());
});

describe("filling pending shipment logistics", () => {
  it("刷新范围覆盖历史导入行，不只待补全行", async () => {
    queryRows.mockResolvedValueOnce([
      // legacy：历史上从 Excel 导入、从来没走过远端拉取的行。
      { shipmentId: "SHP-legacy", requestNo: "DO-00049", dcNameZh: "", snapshotDestinationAddress: null, snapshotRecipientName: null, snapshotRecipientPhone: null, transportMode: "空运" },
    ]);
    getFrappeDemandLogistics.mockResolvedValueOnce(lookup([["DO-00049", snapshot({ transportMode: "海运" })]]));
    execute.mockResolvedValue(undefined);

    const result = await synchronizeRemoteLogistics();

    expect(result.updated).toBe(1);
    const [sql, params] = execute.mock.calls[0];
    // 查询条件只排除 remote，pending 与 legacy 都在刷新范围内。
    const selectSql = String(queryRows.mock.calls[0][0]);
    expect(selectSql).toContain("<> :remoteStatus");
    expect(queryRows.mock.calls[0][1]).toEqual({ remoteStatus: "remote" });
    // 运输方式被远端纠正，来源改成 remote。
    expect(String(sql)).toContain("transportMode = :transportMode");
    expect(params).toMatchObject({ shipmentId: "SHP-legacy", transportMode: "海运", remoteLogisticsSourceStatus: "remote" });
    expect(result.changes).toContain("SHP-legacy 运输方式：空运 → 海运");
  });

  it("does nothing when there is no pending shipment", async () => {
    queryRows.mockResolvedValueOnce([]);

    const result = await synchronizeRemoteLogistics();

    expect(result).toEqual({ scanned: 0, updated: 0, skipped: 0, changes: [], errors: [] });
    expect(getFrappeDemandLogistics).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("writes the remote snapshot and clears the pending flag once the remote is back", async () => {
    queryRows.mockResolvedValueOnce([
      { shipmentId: "SHP-1", requestNo: "DO-00049", dcNameZh: null, snapshotDestinationAddress: "待补充", snapshotRecipientName: null, snapshotRecipientPhone: null },
    ]);
    getFrappeDemandLogistics.mockResolvedValueOnce(lookup([["DO-00049", snapshot()]]));
    execute.mockResolvedValue(undefined);

    const result = await synchronizeRemoteLogistics();

    expect(result.scanned).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(0);
    // 只回报"原本为空/待补充、这次被远端填上"的字段差异。
    expect(result.changes).toEqual([
      "SHP-1 机房：（空） → São Paulo DC",
      "SHP-1 收货地址：待补充 → Rua A, 100, São Paulo, Brazil",
      "SHP-1 收件人：（空） → Maria Silva",
      "SHP-1 收件电话：（空） → +55 11 99999-8888",
    ]);

    const [, params] = execute.mock.calls[0];
    expect(params).toMatchObject({
      shipmentId: "SHP-1",
      remoteLogisticsSourceStatus: "remote",
      remoteDatacenterId: "DC-006",
      snapshotDestinationAddress: "Rua A, 100, São Paulo, Brazil",
    });
  });

  it("keeps rows pending and reports the reason when the remote still fails", async () => {
    queryRows.mockResolvedValueOnce([
      { shipmentId: "SHP-1", requestNo: "DO-00049", dcNameZh: null, snapshotDestinationAddress: "待补充", snapshotRecipientName: null, snapshotRecipientPhone: null },
    ]);
    getFrappeDemandLogistics.mockResolvedValueOnce(lookup([], [["DO-00049", "读取远端 Demand Order 失败：fetch failed"]]));

    const result = await synchronizeRemoteLogistics();

    expect(result).toMatchObject({ scanned: 1, updated: 0, skipped: 1, changes: [] });
    expect(result.errors).toEqual(["需求单 DO-00049：读取远端 Demand Order 失败：fetch failed"]);
    expect(execute).not.toHaveBeenCalled();
  });

  it("reports a hard remote failure instead of throwing", async () => {
    queryRows.mockResolvedValueOnce([
      { shipmentId: "SHP-1", requestNo: "DO-00049", dcNameZh: null, snapshotDestinationAddress: "待补充", snapshotRecipientName: null, snapshotRecipientPhone: null },
    ]);
    getFrappeDemandLogistics.mockRejectedValueOnce(new Error("读取远端 Demand Order 失败：fetch failed"));

    const result = await synchronizeRemoteLogistics();

    expect(result).toMatchObject({ scanned: 1, updated: 0, skipped: 1, changes: [] });
    expect(result.errors).toEqual(["读取远端 Demand Order 失败：fetch failed"]);
  });
});
