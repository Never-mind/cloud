import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ batch: vi.fn() }));
vi.mock("./cost-payment-sync-batch", () => ({ syncCostPaymentBatch: mocks.batch }));
import { costPaymentAutoSyncConfig, startCostPaymentAutoSync } from "./cost-payment-auto-sync";
let stop: (() => void) | undefined;
const result = { total: 0, results: [], errors: [], skipped: false };
beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks();
  for (const [key, value] of Object.entries({ NODE_ENV: "production", NEXT_PHASE: "", FEISHU_APP_ID: "test",
    FEISHU_APP_SECRET: "test", FEISHU_PAYMENT_AUTO_SYNC: "", FEISHU_PAYMENT_AUTO_SYNC_INTERVAL_SECONDS: "" })) vi.stubEnv(key, value);
  mocks.batch.mockResolvedValue(result);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("automatic payment approval synchronization", () => {
  it("starts once and polls every minute without a browser request", async () => {
    stop = startCostPaymentAutoSync();
    expect(startCostPaymentAutoSync()).toBe(stop);
    await vi.advanceTimersByTimeAsync(4999); expect(mocks.batch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(mocks.batch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000); expect(mocks.batch).toHaveBeenCalledTimes(2);
    stop?.(); await vi.advanceTimersByTimeAsync(120000); expect(mocks.batch).toHaveBeenCalledTimes(2);
  });
  it("honors a configurable five-minute interval", async () => {
    vi.stubEnv("FEISHU_PAYMENT_AUTO_SYNC_INTERVAL_SECONDS", "300");
    stop = startCostPaymentAutoSync(); await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(299999); expect(mocks.batch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(mocks.batch).toHaveBeenCalledTimes(2);
  });
  it.each([["",60],["bad",60],["-1",60],["30",60],["Infinity",60],["300.9",300],["999999",86400]])("validates interval %s", (value, expected) => {
    vi.stubEnv("FEISHU_PAYMENT_AUTO_SYNC_INTERVAL_SECONDS", String(value));
    expect(costPaymentAutoSyncConfig().intervalSeconds).toBe(expected);
  });
  it.each([["NODE_ENV","test"],["NEXT_PHASE","phase-production-build"],["FEISHU_PAYMENT_AUTO_SYNC","0"],
    ["FEISHU_PAYMENT_AUTO_SYNC"," false "],["FEISHU_APP_ID",""],["FEISHU_APP_SECRET",""]])("does not run with %s=%s", async (key, value) => {
    vi.stubEnv(key, value); stop = startCostPaymentAutoSync();
    await vi.advanceTimersByTimeAsync(120000); expect(mocks.batch).not.toHaveBeenCalled();
  });
  it("retries a failed run after the interval", async () => {
    mocks.batch.mockRejectedValueOnce(new Error("remote unavailable"));
    stop = startCostPaymentAutoSync(); await vi.advanceTimersByTimeAsync(5000);
    expect(console.error).toHaveBeenCalledWith("[payment-auto-sync] failed; will retry", "remote unavailable");
    await vi.advanceTimersByTimeAsync(60000); expect(mocks.batch).toHaveBeenCalledTimes(2);
  });
  it("waits for a slow run before starting the next interval", async () => {
    let complete!: (value: typeof result) => void;
    mocks.batch.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    stop = startCostPaymentAutoSync(); await vi.advanceTimersByTimeAsync(185000);
    expect(mocks.batch).toHaveBeenCalledTimes(1); complete(result);
    await vi.advanceTimersByTimeAsync(59999); expect(mocks.batch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(mocks.batch).toHaveBeenCalledTimes(2);
  });
  it("does not restart after stopping during an active request", async () => {
    let complete!: (value: typeof result) => void;
    mocks.batch.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    stop = startCostPaymentAutoSync(); await vi.advanceTimersByTimeAsync(5000); stop?.();
    complete(result); await vi.advanceTimersByTimeAsync(180000); expect(mocks.batch).toHaveBeenCalledTimes(1);
  });
});
