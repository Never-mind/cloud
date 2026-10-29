import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ query: vi.fn(), raw: vi.fn() }));
vi.mock("./db", () => ({ queryRows: mock.query, queryRowsRaw: mock.raw }));
import { listCloudRows } from "./cloud-service";
import { findActiveInvoiceApproval } from "./feishu-approval-service";
import { invoiceApprovalStatusLabel } from "./invoice-approval-status";

beforeEach(() => {
  vi.resetAllMocks();
  mock.raw.mockImplementation(async (sql: string) => sql.startsWith("SELECT * FROM merge_cloud_rows") ? [{ id: "first" }, { id: "second" }] : []);
  mock.query.mockImplementation(async (sql: string) => sql.includes("FROM merge_common_feishu_approvals")
    ? [{ ownerId: "first", allocationSourceIds: "first,second", instanceCode: "instance", serialNumber: "202610280008", status: "approved", invoiceId: "invoice", invoiceStatus: "issued" }] : []);
});
describe("cloud billing approval registration status", () => {
  it("carries the registered invoice status to every billing period in a combined approval", async () => {
    const result = await listCloudRows(new URLSearchParams()) as { items: Record<string, unknown>[] };
    expect(result.items).toHaveLength(2);
    for (const row of result.items) {
      expect(row).toMatchObject({ invoiceApprovalStatus: "approved", invoiceApprovalNo: "202610280008", invoiceApprovalInvoiceId: "invoice", invoiceApprovalInvoiceStatus: "issued" });
      expect(invoiceApprovalStatusLabel(row.invoiceApprovalStatus, row.invoiceApprovalInvoiceId, row.invoiceApprovalInvoiceStatus)).toBe("审批通过已开票");
    }
    expect(mock.query.mock.calls.find(([sql]) => sql.includes("FROM merge_common_feishu_approvals"))?.[0]).toContain("i.status AS invoiceStatus");
  });
  it("reads the current invoice status when opening an existing approval", async () => {
    const approval = await findActiveInvoiceApproval("cloud_row", "second");
    expect(approval?.invoiceStatus).toBe("issued");
    const sql = mock.query.mock.calls[0][0];
    expect(sql).toContain("LEFT JOIN merge_common_invoices");
    expect(sql).toContain("FIND_IN_SET(:ownerId, a.allocationSourceIds)");
  });
});
