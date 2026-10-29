import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ queryRows: vi.fn(), execute: vi.fn() }));
vi.mock("./db", () => mocks);
vi.mock("./auth", () => ({ getAuthenticatedUserEmail: () => "test@example.invalid" }));
vi.mock("./operation-actor", () => ({ getOperationActor: async () => null }));
vi.mock("./operation-log", () => ({ recordOperationLog: vi.fn() }));
import { GET, PATCH } from "../app/api/procurement/purchase-orders/[purchaseOrderId]/invoice-info/route";

const current = { purchaseOrderId: "PO-1", supplierId: "supplier-from-items", invoiceNo: "INV-1" };
const context = () => ({ params: Promise.resolve({ purchaseOrderId: "PO-1" }) });
const request = (method = "GET") => new NextRequest("http://localhost/api/procurement/purchase-orders/PO-1/invoice-info", {
  method, ...(method === "PATCH" ? { body: JSON.stringify({ invoiceNo: "INV-1" }), headers: { "Content-Type": "application/json" } } : {}),
});
beforeEach(() => vi.resetAllMocks());

describe("purchase order invoice registration", () => {
  it("loads invoice information with the supplier resolved from demand items", async () => {
    mocks.queryRows.mockResolvedValue([current]);
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ invoiceInfo: current });
    expect(mocks.queryRows.mock.calls[0][0]).not.toContain("po.supplierId");
  });

  it("blocks duplicate invoices for the resolved supplier before writing", async () => {
    mocks.queryRows.mockResolvedValueOnce([current]).mockResolvedValueOnce([{ purchaseOrderId: "PO-2" }]);
    const response = await PATCH(request("PATCH"), context());
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("该供应商的发票已在其他采购订单登记");
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.queryRows.mock.calls[1][1]).toMatchObject({ supplierId: "supplier-from-items" });
  });

  it("saves when that supplier has no duplicate invoice", async () => {
    mocks.queryRows.mockResolvedValueOnce([current]).mockResolvedValueOnce([]).mockResolvedValueOnce([current]);
    const response = await PATCH(request("PATCH"), context());
    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
});
