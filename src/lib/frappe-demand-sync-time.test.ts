import { beforeEach, describe, expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db", () => ({ queryRowsRaw: query }));
import { listFrappeDemandSyncRuns, listFrappeDemandSyncLedger, listFrappeDemandSyncLedgerItems } from "./frappe-demand-sync-service";
beforeEach(() => query.mockReset().mockResolvedValue([]));

describe("sync API avoids server-local DATETIME decoding", () => {
  it("returns started/finished times with explicit Beijing offsets and keeps unfinished null", async () => {
    query.mockResolvedValue([{ syncRunId: "run", startedAt: "2026-11-05T18:13:51+08:00", finishedAt: null }]);
    const { items } = await listFrappeDemandSyncRuns();
    expect(items[0]).toMatchObject({ startedAt: "2026-11-05T18:13:51+08:00", finishedAt: null });
    expect(query.mock.calls[0][0]).toContain("CONCAT(DATE_FORMAT(startedAt, '%Y-%m-%dT%H:%i:%s'), '+08:00')");
    expect(query.mock.calls[0][0]).toContain("CONCAT(DATE_FORMAT(finishedAt, '%Y-%m-%dT%H:%i:%s'), '+08:00')");
  });
  it("gives ledger summary and detail timestamps the same timezone contract", async () => {
    await listFrappeDemandSyncLedger(new URLSearchParams());
    await listFrappeDemandSyncLedgerItems("DO-00003");
    const sql = query.mock.calls.map(([sql]) => sql).join("\n");
    expect(sql).toContain("CONCAT(DATE_FORMAT(MAX(i.updatedAt), '%Y-%m-%dT%H:%i:%s'), '+08:00') AS lastSyncedAt");
    expect(sql).toContain("CONCAT(DATE_FORMAT(i.updatedAt, '%Y-%m-%dT%H:%i:%s'), '+08:00') AS updatedAt");
  });
});
