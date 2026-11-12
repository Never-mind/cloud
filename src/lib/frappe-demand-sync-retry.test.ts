import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), raw: vi.fn(), write: vi.fn(), fetch: vi.fn(),
  beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), end: vi.fn(), release: vi.fn() }));
vi.mock("mysql2/promise", () => ({ createConnection: async () => mock }));
vi.mock("./db", () => ({ buildDbConfig: () => ({ database: "test" }), getDb: () => ({ getConnection: async () => mock }), queryRowsRaw: mock.raw, executeRaw: mock.write }));
import { rebuildFrappeDemandOrders, runFrappeDemandSync, sourceHash } from "./frappe-demand-sync-service";

type Row = Record<string, any>;
let ledger: Map<string, Row>;
let orders: Set<string>;
let localItems: Row[];
const remoteItems = [1, 2, 3].map((n) => ({ name: `DOI-0000${n}`, demand_order: `DO-0000${n}`, material: "MAT-00041", supplier: "BP-003", status: "Committed", quantity: 16, requested_delivery_date: "2026-12-30", modified: "2026-10-28 10:00:00" }));
const remoteOrders = [1, 2, 3].map((n) => ({ name: `DO-0000${n}`, customer_po_no: `new-PO-${n}`, datacenter: "DC-011", modified: "2026-10-28 10:00:00" }));
const mappings = [
  { mappingId: "supplier", sourceType: "supplier", sourceId: "BP-003", status: "confirmed", localEntityId: "supplier-id" },
  { mappingId: "material", sourceType: "material", sourceId: "MAT-00041", status: "confirmed", localEntityId: "06114834" },
];
function baseline(n: number) {
  return { quantity: 16, status: "Committed", supplierId: "BP-003", materialId: "MAT-00041", requestedDeliveryDate: "2026-12-30", modified: "2026-10-28 10:00:00", order: { customerPoNo: `new-PO-${n}`, datacenterId: "DC-011", deliveryRecipientListId: "", modified: "2026-10-28 10:00:00" } };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("FRAPPE_API_TOKEN", "test-token"); vi.stubEnv("FRAPPE_API_BASE_URL", "https://frappe.example");
  vi.stubEnv("FRAPPE_DEMAND_SYNC_STATUSES", "");
  orders = new Set(["old-PO", "new-PO-1"]);
  localItems = [{ id: "F-DOI-00002", requestNo: "old-PO", deviceCode: "old-model", quantity: 10 },
    { id: "F-DOI-00003", requestNo: "old-PO", deviceCode: "old-model-2", quantity: 8 },
    { id: "F-DOI-00001", requestNo: "new-PO-1", deviceCode: "06114834", quantity: 16 }];
  ledger = new Map([2, 3].map((n) => [`DOI-0000${n}`, { sourceItemId: `DOI-0000${n}`, sourceOrderId: `DO-0000${n}`, localRequestNo: `new-PO-${n}`, status: "pending_change", sourceHash: "stale", localRequestItemId: null, sourceDataJson: JSON.stringify(baseline(n)) }]));
  mock.query.mockImplementation(async (sql: string, args: any[] = []) => {
    if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
    if (sql.includes("SELECT requestNo FROM merge_power_requests")) return [orders.has(args[0]) ? [{ requestNo: args[0] }] : []];
    if (sql.includes("SELECT id, deviceCode FROM merge_power_requestitems")) return [localItems.filter((r) => r.requestNo === args[0])];
    if (sql.includes("WHERE i.sourceItemId")) { const row = ledger.get(args[0]); return [row ? [{ ...row, linkedRequestNo: localItems.find((r) => r.id === row.localRequestItemId)?.requestNo }] : []]; }
    return [[]];
  });
  mock.raw.mockImplementation(async (sql: string, args: Row = {}) => {
    if (sql.includes("FROM merge_power_demand_sync_items")) return [...ledger.values()];
    if (sql.includes("FROM merge_power_demand_sync_mappings")) return args.sourceId ? mappings.filter((r) => r.sourceId === args.sourceId) : mappings;
    if (sql.includes("merge_power_instancemodels")) return [{ deviceCode: "06114834", instanceType: "Equipment" }];
    if (sql.includes("merge_power_suppliers")) return [{ supplierId: "supplier-id" }];
    if (sql.includes("merge_power_countries")) return [{ code: "MX", name: "Mexico", defaultUndertakingUnitId: "unit-id", defaultCustomerId: "customer-id" }];
    return [];
  });
  mock.write.mockResolvedValue({ affectedRows: 0 });
  mock.execute.mockImplementation(async (sql: string, args: any[]) => {
    if (sql.includes("INSERT INTO merge_power_requests ")) orders.add(args[0]);
    if (sql.includes("INSERT INTO merge_power_requestitems ")) {
      if (localItems.some((r) => r.id === args[0])) throw new Error("Duplicate entry for legacy id");
      localItems.push({ id: args[0], requestNo: args[1], deviceCode: args[2], quantity: args[8] });
    }
    if (sql.includes("INSERT INTO merge_power_demand_sync_items")) {
      const prior = ledger.get(args[0]);
      ledger.set(args[0], { sourceItemId: args[0], sourceOrderId: args[1], localRequestNo: args[2] ?? prior?.localRequestNo, localRequestItemId: args[3],
        sourceHash: sql.includes("sourceHash=VALUES") ? args[5] : prior?.sourceHash ?? args[5], status: args[6],
        sourceDataJson: sql.includes("sourceDataJson=VALUES") ? args[8] : prior?.sourceDataJson ?? args[8] });
    }
    return [{}];
  });
  mock.fetch.mockImplementation(async (url: URL) => {
    const doctype = decodeURIComponent(new URL(url).pathname.split("/").at(-1)!);
    const data: Record<string, Row[]> = { "Demand Order Item": remoteItems, "Demand Order": remoteOrders,
      "Business Partner": [{ name: "BP-003", is_supplier: 1 }, { name: "unused-supplier", is_supplier: 1 }],
      Material: [{ name: "MAT-00041", customer_item_code: "06114834" }, { name: "unused-material" }],
      Datacenter: [{ name: "DC-011", country: "MX" }] };
    return { ok: true, json: async () => ({ data: data[doctype] ?? [] }) };
  });
  vi.stubGlobal("fetch", mock.fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("selected demand rebuild", () => {
  it("creates both recycled DOI demands, preserves old rows, refreshes baseline and skips on retry", async () => {
    const untouched = structuredClone(localItems);
    const result = await rebuildFrappeDemandOrders(["DO-00002", "DO-00003"], null);
    expect(result.summary).toMatchObject({ createdRequests: 2, createdItems: 2, blockedItems: 0, changedItems: 0 });
    expect(result.results.map((r) => r.localRequestNo)).toEqual(["new-PO-2", "new-PO-3"]);
    expect(localItems.slice(0, 3)).toEqual(untouched);
    expect(localItems.slice(3)).toEqual([expect.objectContaining({ requestNo: "new-PO-2", quantity: 16 }), expect.objectContaining({ requestNo: "new-PO-3", quantity: 16 })]);
    expect(localItems[3].id).not.toBe("F-DOI-00002");
    expect(JSON.parse(ledger.get("DOI-00003")!.sourceDataJson)).toMatchObject({ ...baseline(3), sourceBinding: { sourceOrderId: "DO-00003", requestNo: "new-PO-3" } });
    const retried = await rebuildFrappeDemandOrders(["DO-00002", "DO-00003"], null);
    expect(retried.summary).toMatchObject({ createdRequests: 0, skippedExisting: 2, changedItems: 0 });
    expect(localItems).toHaveLength(5);
    const automatic = await runFrappeDemandSync({ sourceOrderIds: ["DO-00002", "DO-00003"] });
    expect(automatic).toMatchObject({ createdRequests: 0, skippedExisting: 2, changedItems: 0 });
    const writes = JSON.stringify([...mock.execute.mock.calls, ...mock.write.mock.calls]);
    expect(writes).not.toContain("new-PO-1"); expect(writes).not.toContain("old-PO");
    expect(writes).not.toContain("unused-material"); expect(writes).not.toContain("unused-supplier");
  });
  it("does not reset any ledger or fetch remote data while another sync holds the lock", async () => {
    mock.query.mockResolvedValueOnce([[{ acquired: 0 }]]);
    await expect(rebuildFrappeDemandOrders(["DO-00003"], null)).rejects.toThrow("正在执行");
    expect(mock.write).not.toHaveBeenCalled(); expect(mock.execute).not.toHaveBeenCalled(); expect(mock.fetch).not.toHaveBeenCalled();
  });
  it("archives stale ownership and old snapshot while creating the selected new demand", async () => {
    Object.assign(ledger.get("DOI-00003")!, { localRequestNo: "old-PO", localRequestItemId: "F-DOI-00003",
      sourceDataJson: JSON.stringify({ ...baseline(3), quantity: 8, order: { ...baseline(3).order, customerPoNo: "old-PO" } }) });
    const result = await rebuildFrappeDemandOrders(["DO-00003"], null);
    expect(result.summary.createdRequests).toBe(1);
    const snapshot = JSON.parse(ledger.get("DOI-00003")!.sourceDataJson);
    expect(snapshot).toMatchObject({ quantity: 16, order: { customerPoNo: "new-PO-3" }, bindingHistory: [
      { localRequestNo: "old-PO", localRequestItemId: "F-DOI-00003", linkedRequestNo: "old-PO", snapshot: { quantity: 8 } },
    ] });
    expect(localItems.find((row) => row.id === "F-DOI-00003")).toMatchObject({ requestNo: "old-PO", quantity: 8 });
  });
  it("rolls back the whole demand if a later line fails, then records a retryable write error", async () => {
    const execute = mock.execute.getMockImplementation()!;
    mock.execute.mockImplementation(async (sql: string, args: any[]) => {
      if (sql.includes("INSERT INTO merge_power_requestitems")) throw new Error("simulated insert failure");
      return execute(sql, args);
    });
    const result = await rebuildFrappeDemandOrders(["DO-00003"], null);
    expect(result.summary).toMatchObject({ createdRequests: 0, createdItems: 0, blockedItems: 1 });
    expect(mock.beginTransaction).toHaveBeenCalledOnce(); expect(mock.rollback).toHaveBeenCalledOnce(); expect(mock.commit).not.toHaveBeenCalled();
    const ledgerWrite = mock.execute.mock.calls.find(([sql]) => sql.includes("INSERT INTO merge_power_demand_sync_items"))!;
    expect(ledgerWrite[1][6]).toBe("blocked"); expect(ledgerWrite[1][10]).toBe("write_failed");
  });
  it("retries a blocked insert instead of manufacturing an empty pending-change warning", async () => {
    ledger.get("DOI-00003")!.status = "blocked";
    const result = await runFrappeDemandSync({ sourceOrderIds: ["DO-00003"] });
    expect(result).toMatchObject({ createdRequests: 1, changedItems: 0, blockedItems: 0 });
  });
  it("does not auto-create a tracked reused remote identity, even when its hash matches", async () => {
    const item = { id: "DOI-00003", demandOrderId: "DO-00003", materialId: "MAT-00041", supplierId: "BP-003", status: "Committed", batchName: "", quantity: 16, requestedDeliveryDate: "2026-12-30", modified: "2026-10-28 10:00:00" };
    const order = { id: "DO-00003", customerPoNo: "new-PO-3", datacenterId: "DC-011", deliveryRecipientListId: "", transportMode: "", modified: "2026-10-28 10:00:00" };
    Object.assign(ledger.get(item.id)!, { status: "synced", localRequestNo: "old-PO", localRequestItemId: "F-DOI-00003", sourceHash: sourceHash(item, order) });
    const result = await runFrappeDemandSync({ sourceOrderIds: [order.id] });
    expect(result).toMatchObject({ createdRequests: 0, changedItems: 1 });
    expect(orders.has("new-PO-3")).toBe(false);
    expect(ledger.get(item.id)!.localRequestItemId).toBe("F-DOI-00003");
  });
  it("rejects changed PO expectations before writing mappings, status or demand rows", async () => {
    await expect(runFrappeDemandSync({ sourceOrderIds: ["DO-00003"], rebuild: true, expectedRequestNos: { "DO-00003": "different" } })).rejects.toThrow("预期不一致");
    expect(mock.execute.mock.calls).toHaveLength(1); // Audit run only.
    expect(mock.write.mock.calls.every(([sql]) => sql.includes("UPDATE merge_power_demand_sync_runs"))).toBe(true);
  });
  it("repairs a legacy successful snapshot only when both the accepted hash and actual local owner match", async () => {
    const item = { id: "DOI-00001", demandOrderId: "DO-00001", materialId: "MAT-00041", supplierId: "BP-003", status: "Committed", batchName: "", quantity: 16, requestedDeliveryDate: "2026-12-30", modified: "2026-10-28 10:00:00" };
    const order = { id: "DO-00001", customerPoNo: "new-PO-1", datacenterId: "DC-011", deliveryRecipientListId: "", transportMode: "", modified: "2026-10-28 10:00:00" };
    ledger.set(item.id, { sourceItemId: item.id, sourceOrderId: order.id, localRequestNo: order.customerPoNo,
      localRequestItemId: "F-DOI-00001", linkedRequestNo: order.customerPoNo, status: "skipped_existing", sourceHash: sourceHash(item, order),
      sourceDataJson: JSON.stringify({ ...baseline(1), quantity: 38, order: { customerPoNo: "stale-PO" } }) });
    const untouched = structuredClone(localItems);
    const result = await runFrappeDemandSync({ sourceOrderIds: [order.id] });
    expect(result).toMatchObject({ createdRequests: 0, skippedExisting: 1, changedItems: 0 });
    expect(localItems).toEqual(untouched);
    expect(JSON.parse(ledger.get(item.id)!.sourceDataJson)).toMatchObject({ quantity: 16, order: { customerPoNo: order.customerPoNo }, bindingHistory: [{ snapshot: { quantity: 38 } }] });
    expect(ledger.get(item.id)!.localRequestItemId).toBe("F-DOI-00001");
  });
  it("reports selected missing or cancelled orders instead of silently returning no result", async () => {
    const result = await rebuildFrappeDemandOrders(["DO-missing"], null);
    expect(result.results).toEqual([expect.objectContaining({ sourceOrderId: "DO-missing", status: "blocked", reason: "远端需求单不存在" })]);
    expect(result.summary.createdRequests).toBe(0);
  });
  it("retains stable links when two remote lines have the same device code", async () => {
    orders.add("new-PO-3");
    // Both remote lines belong to this PO; an existing link to its second row is reserved first.
    const extra = { ...remoteItems[2], name: "DOI-extra" };
    remoteItems.push(extra);
    localItems.push({ id: "line-first", requestNo: "new-PO-3", deviceCode: "06114834" }, { id: "line-second", requestNo: "new-PO-3", deviceCode: "06114834" });
    Object.assign(ledger.get("DOI-00003")!, { localRequestItemId: "line-second" });
    try {
      await rebuildFrappeDemandOrders(["DO-00003"], null);
      expect(ledger.get("DOI-00003")!.localRequestItemId).toBe("line-second");
      expect(ledger.get("DOI-extra")!.localRequestItemId).toBe("line-first");
    } finally { remoteItems.pop(); }
  });
});
