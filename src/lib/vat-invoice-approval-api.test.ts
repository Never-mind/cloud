import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ email: vi.fn(), permission: vi.fn(), query: vi.fn(), prefill: vi.fn(), submit: vi.fn(), cloudSubmit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUserEmail: mocks.email }));
vi.mock("@/lib/permission-definitions", () => ({ hasPermission: mocks.permission }));
vi.mock("@/lib/permission-service", () => ({ getPermissionStateForEmail: vi.fn(async () => ({})) }));
vi.mock("@/lib/db", () => ({ queryRows: mocks.query }));
vi.mock("@/lib/feishu-approval-service", () => ({ buildInvoiceApprovalPrefill: vi.fn(), submitInvoiceApprovalFromSource: mocks.cloudSubmit }));
vi.mock("@/lib/vat-invoice-approval-service", () => ({ buildVatApprovalPrefill: mocks.prefill, submitVatInvoiceApproval: mocks.submit }));
import { GET } from "../app/api/invoices/approval/prefill/route";
import { POST } from "../app/api/invoices/approval/route";
const request = () => new NextRequest("http://localhost/api/invoices/approval", { method: "POST", body: JSON.stringify({ flow: "vat", sourceType: "cloud_row", sourceId: "source", draft: {}, starterOpenId: "ou_forged", handlerOpenId: "ou_forged", nodeApprovers: [{ key: "delivery", value: ["ou_forged"] }] }) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.email.mockReturnValue("alice@example.test"); mocks.permission.mockReturnValue(true);
  mocks.query.mockResolvedValue([{ userId: "alice", displayName: "Alice", feishuOpenId: "ou_alice", feishuName: "Alice" }]);
  mocks.prefill.mockResolvedValue({ blockers: [] }); mocks.submit.mockResolvedValue({ instanceCode: "mock" });
  mocks.cloudSubmit.mockResolvedValue({ instanceCode: "mock" });
});
describe("VAT API derives the starter on the server", () => {
  it("passes reviewed Cloud payment terms and explicit blank overrides without restoring archive values", async () => {
    const response = await POST(new NextRequest("http://localhost/api/invoices/approval", { method: "POST", body: JSON.stringify({ sourceType: "cloud_row", sourceId: "source", paymentTermDays: "45", customerOverride: { name: "Confirmed", address: "", taxId: "" } }) }));
    expect(response.status).toBe(200);
    expect(mocks.cloudSubmit.mock.calls[0][0]).toMatchObject({ paymentTermDays: "45", customerOverride: { name: "Confirmed", address: "", taxId: "" } });
  });
  it.each(["cloud", "vat"])("forwards selected partner identities for %s while ignoring client source ownership hints", async flow => {
    const parties = { customerId: "new-customer", undertakingUnitId: "new-unit" };
    const response = await POST(new NextRequest("http://localhost/api/invoices/approval", { method: "POST", body: JSON.stringify({ flow, sourceType: "service_fee", sourceId: "source", sourceCustomerId: "forged", ...(flow === "vat" ? { draft: parties } : parties) }) }));
    expect(response.status).toBe(200);
    const call = (flow === "vat" ? mocks.submit : mocks.cloudSubmit).mock.calls[0][0];
    expect(flow === "vat" ? call.draft : call).toMatchObject(parties);
    expect(call.sourceCustomerId).toBeUndefined();
  });
  it.each(["cloud", "vat"])("forwards validated %s selections and uploads", async flow => {
    const selection = { attachmentRefs: [{ source: "customer", attachmentId: "file", isCsf: true }], attachments: [{ fileName: "new.pdf", dataUrl: "data:application/pdf;base64,cGRm", isCsf: false }] };
    const response = await POST(new NextRequest("http://localhost/api/invoices/approval", { method: "POST", body: JSON.stringify({ flow, sourceType: "cloud_row", sourceId: "source", ...(flow === "vat" ? { draft: selection } : selection) }) }));
    expect(response.status).toBe(200);
    const call = (flow === "vat" ? mocks.submit : mocks.cloudSubmit).mock.calls[0][0];
    expect(flow === "vat" ? call.draft : call).toMatchObject(selection);
  });
  it.each(["cloud", "vat"])("rejects malformed %s attachments before invoking services", async flow => {
    const selection = { attachmentRefs: "bad" };
    const response = await POST(new NextRequest("http://localhost/api/invoices/approval", { method: "POST", body: JSON.stringify({ flow, sourceType: "cloud_row", sourceId: "source", ...(flow === "vat" ? { draft: selection } : selection) }) }));
    expect(response.status).toBe(400); expect(mocks.submit).not.toHaveBeenCalled(); expect(mocks.cloudSubmit).not.toHaveBeenCalled();
  });
  it("rejects anonymous requests before reading users or attachments", async () => {
    mocks.email.mockReturnValue(null); expect((await POST(request())).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("ignores a forged identity in prefill parameters", async () => {
    const response = await GET(new NextRequest("http://localhost/api/invoices/approval/prefill?flow=vat&sourceType=cloud_row&sourceId=source&starterOpenId=ou_forged"));
    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(expect.any(String), { email: "alice@example.test" });
    expect(mocks.prefill).toHaveBeenCalledWith(expect.objectContaining({ starterOpenId: "ou_alice" }));
  });
  it.each(["ou_alice", "ou_bob"])("uses the current bound account %s on submission", async starterOpenId => {
    mocks.query.mockResolvedValue([{ userId: "current", displayName: "Current", feishuOpenId: starterOpenId }]);
    expect((await POST(request())).status).toBe(200);
    const input = mocks.submit.mock.calls[0][0];
    expect(input.starterOpenId).toBe(starterOpenId);
    expect(input.handlerOpenId).toBeUndefined(); expect(input.nodeApprovers).toBeUndefined();
  });
  it("requires binding and permission before submission", async () => {
    mocks.query.mockResolvedValue([{ feishuOpenId: "" }]);
    expect((await POST(request())).status).toBe(400);
    mocks.permission.mockReturnValue(false);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
