import { syncCostPaymentBatch } from "./cost-payment-sync-batch";

type SyncState = { timer?: ReturnType<typeof setTimeout>; stopped: boolean; stop: () => void };
const runtime = globalThis as typeof globalThis & { __costPaymentAutoSync?: SyncState };

export function costPaymentAutoSyncConfig() {
  const seconds = Number(process.env.FEISHU_PAYMENT_AUTO_SYNC_INTERVAL_SECONDS?.trim());
  return {
    enabled: process.env.NODE_ENV !== "test" && process.env.NEXT_PHASE !== "phase-production-build"
      && !/^(0|false|off)$/i.test(process.env.FEISHU_PAYMENT_AUTO_SYNC?.trim() || "")
      && Boolean(process.env.FEISHU_APP_ID?.trim()) && Boolean(process.env.FEISHU_APP_SECRET?.trim()),
    intervalSeconds: Number.isFinite(seconds) && seconds >= 60 ? Math.min(86_400, Math.floor(seconds)) : 60,
  };
}

/** Runs independently of open browser pages on long-lived Next servers. */
export function startCostPaymentAutoSync() {
  const config = costPaymentAutoSyncConfig();
  if (!config.enabled) return;
  if (runtime.__costPaymentAutoSync) return runtime.__costPaymentAutoSync.stop;
  const state: SyncState = { stopped: false, stop: () => {
    state.stopped = true;
    if (state.timer) clearTimeout(state.timer);
    if (runtime.__costPaymentAutoSync === state) delete runtime.__costPaymentAutoSync;
  } };
  runtime.__costPaymentAutoSync = state;
  let firstResult = true;
  const schedule = (delay: number) => {
    state.timer = setTimeout(() => { void tick(); }, delay);
    state.timer.unref?.();
  };
  const tick = async () => {
    try {
      const result = await syncCostPaymentBatch();
      if (firstResult || result.total || result.errors.length) {
        console.info("[payment-auto-sync]", JSON.stringify({ checked: result.total,
          updated: result.results.filter(item => item.changed).length, errors: result.errors, skipped: result.skipped }));
      }
      firstResult = false;
    } catch (error) {
      console.error("[payment-auto-sync] failed; will retry", error instanceof Error ? error.message : "Unknown error");
    } finally {
      // Slow requests finish before the next interval starts; stopping never reschedules a run.
      if (!state.stopped) schedule(config.intervalSeconds * 1000);
    }
  };
  console.info(`[payment-auto-sync] enabled; interval=${config.intervalSeconds}s; batch=30; firstRun=5s`);
  schedule(5_000);
  return state.stop;
}
