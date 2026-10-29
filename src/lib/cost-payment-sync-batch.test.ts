import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn(), end: vi.fn(), sync: vi.fn() }));
vi.mock("mysql2/promise", () => ({ createConnection: mocks.connect }));
vi.mock("./db", () => ({ buildDbConfig: () => ({ host: "test-host", database: "test-db", user: "test-user", port: 3306 }) }));
vi.mock("./cost-payment-approval-service", () => ({ syncCostPaymentApprovals: mocks.sync }));
import { syncCostPaymentBatch } from "./cost-payment-sync-batch";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.connect.mockResolvedValue({ query: mocks.query, end: mocks.end });
  mocks.query.mockResolvedValue([[{ acquired: 1 }]]);
  mocks.sync.mockResolvedValue({ total: 1, results: [{ instanceCode: "one", status: "approved", changed: true }], errors: [] });
});
describe("payment polling shared lock", () => {
  it("uses a separate connection and selects due records under the lock", async () => {
    expect(await syncCostPaymentBatch()).toMatchObject({ total: 1, skipped: false });
    expect(mocks.sync).toHaveBeenCalledWith(30, true);
    expect(mocks.query.mock.invocationCallOrder[0]).toBeLessThan(mocks.sync.mock.invocationCallOrder[0]);
    expect(mocks.query).toHaveBeenLastCalledWith("SELECT RELEASE_LOCK(?)", [expect.stringMatching(/^cost-payment-sync:/)]);
    expect(mocks.end).toHaveBeenCalledOnce();
  });
  it("skips another page or server while its batch is running", async () => {
    mocks.query.mockResolvedValueOnce([[{ acquired: 0 }]]);
    expect(await syncCostPaymentBatch()).toEqual({ total: 0, results: [], errors: [], skipped: true });
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.end).toHaveBeenCalledOnce();
  });
  it("closes the connection even when acquiring the lock fails", async () => {
    mocks.query.mockRejectedValueOnce(new Error("lock failed"));
    await expect(syncCostPaymentBatch()).rejects.toThrow("lock failed");
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.end).toHaveBeenCalledOnce();
  });
  it("releases the lock after a failed batch so a later attempt can retry", async () => {
    mocks.sync.mockRejectedValueOnce(new Error("batch failed"));
    await expect(syncCostPaymentBatch()).rejects.toThrow("batch failed");
    expect(mocks.query).toHaveBeenLastCalledWith("SELECT RELEASE_LOCK(?)", expect.any(Array));
    expect(mocks.end).toHaveBeenCalledOnce();
    expect(await syncCostPaymentBatch()).toMatchObject({ total: 1, skipped: false });
  });
  it("still closes the lock connection if releasing the lock fails", async () => {
    mocks.query.mockResolvedValueOnce([[{ acquired: 1 }]]).mockRejectedValueOnce(new Error("release failed"));
    await expect(syncCostPaymentBatch()).rejects.toThrow("release failed");
    expect(mocks.end).toHaveBeenCalledOnce();
  });
});
