import { createHash, randomUUID } from "node:crypto";

type RecordValue = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "").trim();
export function demandSnapshot(value: unknown): RecordValue {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as RecordValue;
  try { const parsed = JSON.parse(text(value)); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
}

export function newRemoteRequestItemId() {
  // Local identity must survive remote database resets and reused DOI numbers.
  return `F-${randomUUID()}`;
}

export function demandSourceFingerprint(baseUrl: string) {
  return createHash("sha256").update(baseUrl.trim().replace(/\/+$/, "")).digest("hex");
}

export type DemandBinding = { sourceFingerprint: string; sourceOrderId: string; sourceItemId: string; requestNo: string };

/** Old ledgers may have a new requestNo but an old snapshot or a link to another order. */
export function sameDemandBinding(prior: RecordValue, current: DemandBinding) {
  const snapshot = demandSnapshot(prior.sourceDataJson);
  const binding = demandSnapshot(snapshot.sourceBinding);
  const order = demandSnapshot(snapshot.order);
  const comparisons: Array<[unknown, string]> = [
    [prior.sourceItemId, current.sourceItemId], [prior.sourceOrderId, current.sourceOrderId],
    [prior.localRequestNo, current.requestNo], [prior.linkedRequestNo, current.requestNo],
    [order.customerPoNo, current.requestNo], [binding.sourceFingerprint, current.sourceFingerprint],
    [binding.sourceOrderId, current.sourceOrderId], [binding.sourceItemId, current.sourceItemId],
    [binding.requestNo, current.requestNo],
  ];
  return comparisons.every(([before, after]) => !text(before) || text(before) === after);
}

/** Older successful creates wrote the new hash/link but accidentally kept the previous PO snapshot. */
export function canRefreshLegacyDemandBaseline(prior: RecordValue, current: DemandBinding, currentHash: string) {
  const snapshot = demandSnapshot(prior.sourceDataJson);
  return !snapshot.sourceBinding && ["synced", "skipped_existing"].includes(text(prior.status))
    && text(prior.sourceHash) === currentHash
    && text(prior.sourceItemId) === current.sourceItemId && text(prior.sourceOrderId) === current.sourceOrderId
    && text(prior.localRequestNo) === current.requestNo && text(prior.linkedRequestNo) === current.requestNo;
}

/** The ledger shows the active remote item; retain previous bindings in its JSON history. */
export function snapshotWithBindingHistory(prior: RecordValue | undefined, current: RecordValue, binding: DemandBinding) {
  const old = demandSnapshot(prior?.sourceDataJson);
  const history: unknown[] = Array.isArray(old.bindingHistory) ? [...old.bindingHistory] : [];
  if (prior && !sameDemandBinding(prior, binding)) {
    const { bindingHistory: _history, ...snapshot } = old;
    history.push({ sourceItemId: prior.sourceItemId, sourceOrderId: prior.sourceOrderId,
      localRequestNo: prior.localRequestNo, localRequestItemId: prior.localRequestItemId,
      linkedRequestNo: prior.linkedRequestNo, status: prior.status, sourceHash: prior.sourceHash,
      snapshot, archivedAt: new Date().toISOString() });
  }
  return { ...current, sourceBinding: binding, ...(history.length ? { bindingHistory: history } : {}) };
}
