import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ batch: vi.fn() }));
vi.mock("./invoice-approval-sync-batch", () => ({ syncInvoiceApprovalBatch: mocks.batch }));
import { startInvoiceApprovalAutoSync } from "./invoice-approval-auto-sync";
let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("NEXT_PHASE", "");
  vi.stubEnv("FEISHU_APP_ID", "test"); vi.stubEnv("FEISHU_APP_SECRET", "test"); vi.stubEnv("FEISHU_INVOICE_AUTO_SYNC", "1");
  mocks.batch.mockResolvedValue({ checked: 1, updated: 0, errors: [] });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("automatic invoice returns", () => {
  it("starts once, polls after startup, and stops without keeping the process alive", async () => {
    stop = startInvoiceApprovalAutoSync();
    expect(startInvoiceApprovalAutoSync()).toBe(stop);
    await vi.advanceTimersByTimeAsync(4_999); expect(mocks.batch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(mocks.batch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000); expect(mocks.batch).toHaveBeenCalledTimes(2);
    stop?.(); await vi.advanceTimersByTimeAsync(120_000); expect(mocks.batch).toHaveBeenCalledTimes(2);
  });
  it.each([["NEXT_PHASE","phase-production-build"],["NODE_ENV","test"],["FEISHU_INVOICE_AUTO_SYNC","0"],["FEISHU_APP_ID",""],["FEISHU_APP_SECRET",""]])("does not sync when %s=%s", async (key, value) => {
    vi.stubEnv(key,value); stop = startInvoiceApprovalAutoSync();
    await vi.advanceTimersByTimeAsync(120_000); expect(mocks.batch).not.toHaveBeenCalled();
  });
  it("retries a failed run", async () => {
    mocks.batch.mockRejectedValueOnce(new Error("network unavailable")); stop = startInvoiceApprovalAutoSync();
    await vi.advanceTimersByTimeAsync(5_000); expect(console.error).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000); expect(mocks.batch).toHaveBeenCalledTimes(2);
  });
  it("does not overlap a slow run or restart after stopping mid-run", async () => {
    let complete!: (value: unknown) => void; mocks.batch.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    stop = startInvoiceApprovalAutoSync(); await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(180_000); expect(mocks.batch).toHaveBeenCalledTimes(1);
    stop?.(); complete({ checked: 1, updated: 0, errors: [] });
    await vi.advanceTimersByTimeAsync(180_000); expect(mocks.batch).toHaveBeenCalledTimes(1);
  });
});
