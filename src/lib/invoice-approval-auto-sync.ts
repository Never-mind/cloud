import { syncInvoiceApprovalBatch } from "./invoice-approval-sync-batch";

type SyncState = { timer?: ReturnType<typeof setTimeout>; stopped: boolean; stop: () => void };
const runtime = globalThis as typeof globalThis & { __invoiceApprovalAutoSync?: SyncState };
const INTERVAL_MS = 60_000;

/** Long-lived next start/dev servers: synchronize returns and register valid approved invoices. */
export function startInvoiceApprovalAutoSync() {
  if (process.env.NODE_ENV === "test" || process.env.NEXT_PHASE === "phase-production-build"
    || /^(0|false|off)$/i.test(process.env.FEISHU_INVOICE_AUTO_SYNC?.trim() || "")
    || !process.env.FEISHU_APP_ID?.trim() || !process.env.FEISHU_APP_SECRET?.trim()) return;
  if (runtime.__invoiceApprovalAutoSync) return runtime.__invoiceApprovalAutoSync.stop;
  const state: SyncState = { stopped: false, stop: () => {
    state.stopped = true;
    if (state.timer) clearTimeout(state.timer);
    if (runtime.__invoiceApprovalAutoSync === state) delete runtime.__invoiceApprovalAutoSync;
  } };
  runtime.__invoiceApprovalAutoSync = state;
  const schedule = (delay: number) => {
    state.timer = setTimeout(() => { void tick(); }, delay);
    state.timer.unref?.();
  };
  const tick = async () => {
    try {
      const result = await syncInvoiceApprovalBatch();
      if (result.checked || result.errors.length) console.info("[invoice-auto-sync]", JSON.stringify(result));
    } catch (error) {
      console.error("[invoice-auto-sync] failed; will retry", error instanceof Error ? error.message : "Unknown error");
    } finally {
      // Schedule after completion so a slow download cannot create overlapping runs.
      if (!state.stopped) schedule(INTERVAL_MS);
    }
  };
  console.info("[invoice-auto-sync] enabled; interval=60s; firstRun=5s");
  schedule(5_000);
  return state.stop;
}
