import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ email: "admin@test", permission: true, mode: "delete" as "delete" | "void", preview: vi.fn(), remove: vi.fn(), committed: false }));
vi.mock("./auth", () => ({ getAuthenticatedUserEmail: () => mocks.email }));
vi.mock("./permission-service", () => ({ getPermissionStateForEmail: async () => ({ role: "admin" }) }));
vi.mock("./permission-definitions", () => ({ hasPermission: (_state: unknown, _module: string, action: string) => mocks.permission && action === (mocks.mode === "delete" ? "delete" : "update") }));
vi.mock("./operation-actor", () => ({ getOperationActor: async () => ({ userId: "user", displayName: "Admin" }) }));
vi.mock("./statement-invoice-removal", () => ({ previewStatementInvoiceRemoval: mocks.preview, removeStatementInvoiceRegistration: mocks.remove }));
import { GET, DELETE } from "../app/api/invoices/[id]/registration/route";
const context = { params: Promise.resolve({ id: "invoice-1" }) };
const params = { sourceType: "cloud_row", sourceId: "row-1", revision: "verified" };
const request = (method: string) => new NextRequest("http://localhost/api/invoices/invoice-1/registration?sourceType=cloud_row&sourceId=row-1", method === "GET" ? {} : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(params) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.email = "admin@test"; mocks.permission = true; mocks.mode = "delete"; mocks.committed = false;
  mocks.preview.mockImplementation(async () => ({ id: "invoice-1", mode: mocks.mode, revision: "verified", sources: [] }));
  mocks.remove.mockImplementation(async (_id, _context, _actor, authorize) => { authorize(mocks.mode); mocks.committed = true; return { mode: mocks.mode, affectedCount: 2 }; });
});
describe("statement invoice removal endpoint", () => {
  it("requires login before previewing or modifying a record", async () => {
    mocks.email = "";
    expect((await GET(request("GET"), context)).status).toBe(400);
    expect((await DELETE(request("DELETE"), context)).status).toBe(400);
    expect(mocks.preview).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it.each(["delete", "void"] as const)("uses the corresponding permission for %s and passes source/revision/actor", async mode => {
    mocks.mode = mode;
    expect((await GET(request("GET"), context)).status).toBe(200);
    expect((await DELETE(request("DELETE"), context)).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith("invoice-1", params, { userId: "user", name: "Admin" }, expect.any(Function));
    expect(mocks.committed).toBe(true);
  });
  it("denies a mutation inside the transaction when permission is missing", async () => {
    mocks.permission = false;
    expect((await GET(request("GET"), context)).status).toBe(400);
    expect((await DELETE(request("DELETE"), context)).status).toBe(400);
    expect(mocks.committed).toBe(false);
  });
  it("reports stale revisions without claiming success", async () => {
    mocks.remove.mockRejectedValue(new Error("发票或分摊已变化"));
    const response = await DELETE(request("DELETE"), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "发票或分摊已变化" });
  });
});
