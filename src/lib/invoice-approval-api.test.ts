import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ email: vi.fn(), permission: vi.fn(), review: vi.fn(), content: vi.fn(), save: vi.fn(), sync: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUserEmail: mocks.email }));
vi.mock("@/lib/permission-definitions", () => ({ hasPermission: mocks.permission }));
vi.mock("@/lib/permission-service", () => ({ getPermissionStateForEmail: vi.fn(async () => ({})) }));
vi.mock("@/lib/operation-actor", () => ({ getOperationActor: vi.fn(async () => ({ userId: "user", displayName: "User" })) }));
vi.mock("@/lib/operation-log", () => ({ recordOperationLog: mocks.audit }));
vi.mock("@/lib/invoice-approval-return-service", () => ({ returnedInvoiceReview: mocks.review, returnedInvoiceContent: mocks.content, listInvoiceApprovalProgress: vi.fn(async () => ({ approvals: [], nextOffset: null })) }));
vi.mock("@/lib/invoice-service", () => ({ saveInvoice: mocks.save }));
vi.mock("@/lib/feishu-approval-service", () => ({ syncInvoiceApproval: mocks.sync }));
import { GET, POST } from "../app/api/invoices/approval/returns/route";
const body = { fileId: "file", draft: { invoiceNo: "EDITED", sourceId: "tampered", sourceType: "manual", allocationSourceIds: ["tampered"], amountIncludingTax: "106" } };
const request = () => new NextRequest("http://localhost/api/invoices/approval/returns", { method: "POST", body: JSON.stringify(body) });
const review = () => ({ approval: { status: "approved", instanceCode: "instance", sourceType: "cloud_row", sourceId: "source", allocationSourceIds: [] }, base: { sourceNo: "source-no", period: "202603" }, group: { registered: false, files: [{ id: "file" }], primary: { recognition: { facts: { invoiceNo: "ORIGINAL" } } } } });
beforeEach(() => {
  vi.resetAllMocks(); mocks.email.mockReturnValue("user@example.test"); mocks.permission.mockReturnValue(true);
  mocks.review.mockResolvedValue(review()); mocks.content.mockResolvedValue({ fileName: "invoice.pdf", fileType: "application/pdf", bytes: Buffer.from("pdf") });
  mocks.save.mockResolvedValue({ id: "invoice", invoiceNo: "EDITED" });
});
describe("invoice return API authorization and confirmation", () => {
  it("rejects unauthenticated downloads before reading storage", async () => {
    mocks.email.mockReturnValue(null);
    const response = await GET(new NextRequest("http://localhost/api/invoices/approval/returns?fileId=file&download=1"));
    expect(response.status).toBe(401); expect(mocks.content).not.toHaveBeenCalled();
  });
  it("requires invoice creation permission before syncing or saving", async () => {
    mocks.permission.mockReturnValue(false);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.sync).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("uses the server source and allowlisted reviewed fields", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ invoiceNo: "EDITED", sourceId: "source", sourceType: "cloud_row", allocationSourceIds: [], file: expect.objectContaining({ fileName: "invoice.pdf" }) }), expect.anything(), { fileId: "file", instanceCode: "instance", relatedFileIds: ["file"] });
  });
  it("accepts CNY VAT returns from USD statements", async () => {
    mocks.review.mockResolvedValue({ ...review(), base: { currency: "USD", sourceNo: "source-no", period: "202603", amountIncludingTax: "106" }, expectedInvoice: { currency: "CNY", amountIncludingTax: "742" } });
    const response = await POST(new NextRequest("http://localhost/api/invoices/approval/returns", { method: "POST", body: JSON.stringify({ fileId: "file", draft: { ...body.draft, currency: "CNY", amountIncludingTax: "742" } }) }));
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ currency: "CNY", amountIncludingTax: "742" }), expect.anything(), expect.anything());
  });
  it("validates the actual VAT invoice currency instead of the source currency", async () => {
    mocks.review.mockResolvedValue({ ...review(), base: { currency: "USD" }, expectedInvoice: { currency: "CNY", amountIncludingTax: "742" } });
    const response = await POST(new NextRequest("http://localhost/api/invoices/approval/returns", { method: "POST", body: JSON.stringify({ fileId: "file", draft: { ...body.draft, currency: "USD" } }) }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("开票币种");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rechecks approval state after synchronization", async () => {
    const changed = review(); changed.approval.status = "pending";
    mocks.review.mockResolvedValueOnce(review()).mockResolvedValueOnce(changed);
    expect((await POST(request())).status).toBe(400); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("never overwrites a registered return", async () => {
    const registered = review(); registered.group.registered = true; mocks.review.mockResolvedValue(registered);
    expect((await POST(request())).status).toBe(400); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("returns stored originals as private downloads", async () => {
    const response = await GET(new NextRequest("http://localhost/api/invoices/approval/returns?fileId=file&download=1"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain("attachment");
  });
});
