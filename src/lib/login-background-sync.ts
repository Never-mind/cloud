import { after } from "next/server";
import { frappeDemandAutoSyncConfig, triggerFrappeDemandAutoSync } from "./frappe-demand-auto-sync";
import type { OperationActor } from "./operation-actor";

/** Login must succeed independently of the remote system, and failed logins never call this. */
export function scheduleLoginBackgroundSync(actor: OperationActor | null) {
  const config = frappeDemandAutoSyncConfig();
  if (!config.enabled || !config.loginEnabled) return;
  try {
    after(async () => { await triggerFrappeDemandAutoSync("login", actor); });
  } catch (error) {
    console.error("[frappe-demand-auto-sync] could not schedule login sync", error instanceof Error ? error.message : "Unknown error");
  }
}
