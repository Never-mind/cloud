import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRows = vi.fn();
const execute = vi.fn();
const getFrappeDemandLogistics = vi.fn();

vi.mock("./db", () => ({
  execute: (...args: unknown[]) => execute(...args),
  queryRows: (...args: unknown[]) => queryRows(...args),
}));

vi.mock("./frappe-demand-sync-service", () => ({
  getFrappeDemandLogistics: (...args: unknown[]) => getFrappeDemandLogistics(...args),
}));

const { synchronizePendingRemoteLogistics } = await import("./procurement-service");

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
  execute.mockReset();
  getFrappeDemandLogistics.mockReset();
});

describe("filling pending shipment logistics", () => {
  it("does nothing when there is no pending shipment", async () => {
    queryRows.mockResolvedValueOnce([]);

    const result = await synchronizePendingRemoteLogistics();

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

    const result = await synchronizePendingRemoteLogistics();

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

    const result = await synchronizePendingRemoteLogistics();

    expect(result).toMatchObject({ scanned: 1, updated: 0, skipped: 1, changes: [] });
    expect(result.errors).toEqual(["需求单 DO-00049：读取远端 Demand Order 失败：fetch failed"]);
    expect(execute).not.toHaveBeenCalled();
  });

  it("reports a hard remote failure instead of throwing", async () => {
    queryRows.mockResolvedValueOnce([
      { shipmentId: "SHP-1", requestNo: "DO-00049", dcNameZh: null, snapshotDestinationAddress: "待补充", snapshotRecipientName: null, snapshotRecipientPhone: null },
    ]);
    getFrappeDemandLogistics.mockRejectedValueOnce(new Error("读取远端 Demand Order 失败：fetch failed"));

    const result = await synchronizePendingRemoteLogistics();

    expect(result).toMatchObject({ scanned: 1, updated: 0, skipped: 1, changes: [] });
    expect(result.errors).toEqual(["读取远端 Demand Order 失败：fetch failed"]);
  });
});
