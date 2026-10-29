import { resolveFrappeEndpoint } from "./frappe-config";
import { runFrappeDemandSync } from "./frappe-demand-sync-service";
import type { OperationActor } from "./operation-actor";

type SyncResult = Awaited<ReturnType<typeof runFrappeDemandSync>> | undefined;
type SyncState = { running?: Promise<SyncResult>; timer?: ReturnType<typeof setTimeout>; stop?: () => void };
const runtime = globalThis as typeof globalThis & { __frappeDemandAutoSync?: SyncState };
const disabled = (value: string | undefined) => /^(0|false|off)$/i.test(value?.trim() || "");
function seconds(value: string | undefined, fallback: number) {
  const number = Number(value?.trim());
  return Number.isFinite(number) && number >= 60 ? Math.min(86400, Math.floor(number)) : fallback;
}
export function frappeDemandAutoSyncConfig() {
  let configured = false;
  try { resolveFrappeEndpoint("需求数据"); configured = true; } catch { /* Unconfigured deployments keep manual setup available. */ }
  return {
    enabled: configured && process.env.NODE_ENV !== "test" && process.env.NEXT_PHASE !== "phase-production-build" && !disabled(process.env.FRAPPE_DEMAND_AUTO_SYNC),
    intervalSeconds: seconds(process.env.FRAPPE_DEMAND_AUTO_SYNC_INTERVAL_SECONDS, 1800),
    loginEnabled: !disabled(process.env.FRAPPE_DEMAND_SYNC_ON_LOGIN),
    loginCooldownSeconds: seconds(process.env.FRAPPE_DEMAND_LOGIN_SYNC_COOLDOWN_SECONDS, 300),
  };
}

export async function triggerFrappeDemandAutoSync(trigger: "scheduled" | "login", actor: OperationActor | null = null): Promise<SyncResult> {
  const config = frappeDemandAutoSyncConfig();
  if (!config.enabled || (trigger === "login" && !config.loginEnabled)) return;
  const state = runtime.__frappeDemandAutoSync ??= {};
  if (state.running) return state.running;
  const task = (async () => {
    try {
      const result = await runFrappeDemandSync({ triggerType: trigger, actor,
        minimumIntervalSeconds: trigger === "login" ? config.loginCooldownSeconds : config.intervalSeconds });
      if (!result.skipped) console.info("[frappe-demand-auto-sync]", JSON.stringify({ trigger, runId: result.runId, createdRequests: result.createdRequests,
        createdItems: result.createdItems, skippedExisting: result.skippedExisting, blockedItems: result.blockedItems, changedItems: result.changedItems }));
      return result;
    } catch (error) {
      console.error("[frappe-demand-auto-sync] failed; will retry", error instanceof Error ? error.message : "Unknown error");
    }
  })();
  state.running = task;
  try { return await task; } finally { if (state.running === task) state.running = undefined; }
}

export function startFrappeDemandAutoSync() {
  const config = frappeDemandAutoSyncConfig();
  if (!config.enabled) return;
  const state = runtime.__frappeDemandAutoSync ??= {};
  if (state.stop) return state.stop;
  let stopped = false;
  const stop = () => {
    stopped = true;
    if (state.timer) clearTimeout(state.timer);
    state.timer = undefined;
    state.stop = undefined;
  };
  state.stop = stop;
  const schedule = (delay: number) => {
    state.timer = setTimeout(() => { void tick(); }, delay);
    state.timer.unref?.();
  };
  const tick = async () => {
    const result = await triggerFrappeDemandAutoSync("scheduled");
    if (!stopped) schedule(result?.retryAfterMs ?? config.intervalSeconds * 1000);
  };
  console.info(`[frappe-demand-auto-sync] enabled; interval=${config.intervalSeconds}s; login=${config.loginEnabled}; loginCooldown=${config.loginCooldownSeconds}s; firstRun=5s`);
  schedule(5000);
  return stop;
}
