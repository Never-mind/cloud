import { describe, expect, it } from "vitest";
import { demandSourceFingerprint, newRemoteRequestItemId, sameDemandBinding, snapshotWithBindingHistory } from "./frappe-demand-identity";

const binding = { sourceFingerprint: demandSourceFingerprint("https://frappe.example/"), sourceOrderId: "DO-00003", sourceItemId: "DOI-00003", requestNo: "new-PO" };
describe("remote demand identity", () => {
  it("allocates short unique local IDs independent of recycled remote numbers", () => {
    const ids = Array.from({ length: 1000 }, () => newRemoteRequestItemId());
    expect(new Set(ids).size).toBe(1000);
    expect(ids.every((id) => /^F-[\da-f-]{36}$/.test(id) && id.length <= 64)).toBe(true);
    expect(ids).not.toContain("F-DOI-00003");
  });
  it("accepts matching legacy ledgers but rejects stale snapshot and actual linked owner", () => {
    expect(sameDemandBinding({ sourceItemId: binding.sourceItemId, localRequestNo: binding.requestNo }, binding)).toBe(true);
    for (const prior of [
      { localRequestNo: "old-PO" }, { linkedRequestNo: "old-PO" }, { sourceOrderId: "DO-old" },
      { sourceDataJson: JSON.stringify({ order: { customerPoNo: "old-PO" } }) },
      { sourceDataJson: { sourceBinding: { ...binding, sourceFingerprint: "other-source" } } },
    ]) expect(sameDemandBinding(prior, binding)).toBe(false);
  });
  it("archives the previous snapshot and linkage exactly once when rebinding", () => {
    const prior = { localRequestNo: "old-PO", localRequestItemId: "F-DOI-00003", sourceDataJson: { quantity: 8, order: { customerPoNo: "old-PO" } } };
    const current = { quantity: 16, order: { customerPoNo: "new-PO" } };
    const next = snapshotWithBindingHistory(prior, current, binding);
    expect(next).toMatchObject({ quantity: 16, sourceBinding: binding, bindingHistory: [{ localRequestNo: "old-PO", localRequestItemId: "F-DOI-00003", snapshot: prior.sourceDataJson }] });
    expect(snapshotWithBindingHistory({ localRequestNo: "new-PO", sourceDataJson: next }, current, binding)).toEqual(next);
  });
});
