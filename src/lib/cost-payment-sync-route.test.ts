import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ batch: vi.fn() }));
vi.mock("./cost-payment-sync-batch", () => ({ syncCostPaymentBatch: mocks.batch }));
vi.mock("./cost-payment-approval-service", () => ({ isCostPaymentBranch: (branch: string) => ["compute", "huawei", "other"].includes(branch) }));
import { GET } from "../app/api/payments/cost-approval/[branch]/sync/route";
beforeEach(() => { vi.resetAllMocks(); mocks.batch.mockResolvedValue({ total: 0, results: [], errors: [], skipped: true }); });
const request = () => new NextRequest("http://localhost/api/payments/cost-approval/compute/sync");
describe("payment page refresh shares the background batch lock", () => {
  it.each(["compute", "huawei", "other"])("uses the locked batch for %s", async branch => {
    const response = await GET(request(), { params: Promise.resolve({ branch }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ total: 0, results: [], errors: [], skipped: true });
    expect(mocks.batch).toHaveBeenCalledOnce();
  });
  it("rejects invalid modules without starting synchronization", async () => {
    const response = await GET(request(), { params: Promise.resolve({ branch: "invalid" }) });
    expect(response.status).toBe(400); expect(mocks.batch).not.toHaveBeenCalled();
  });
  it("reports batch failures to the existing caller", async () => {
    mocks.batch.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await GET(request(), { params: Promise.resolve({ branch: "compute" }) });
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: "database unavailable" });
  });
});
