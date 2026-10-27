import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), release: vi.fn(), destroy: vi.fn() }));
vi.mock("./db", () => ({
  getDb: () => ({ getConnection: async () => ({ release: mocks.release, destroy: mocks.destroy }) }),
  queryRowsInTransaction: (_: unknown, sql: string, values: unknown) => mocks.query(sql, values),
  executeInTransaction: (_: unknown, sql: string, values: unknown) => mocks.execute(sql, values),
  execute: vi.fn(), queryRows: vi.fn(),
}));
vi.mock("./feishu-message-service", () => ({ getFeishuTenantAccessToken: vi.fn(async () => "test-token") }));
vi.mock("./invoice-service", () => ({}));
import { submitInvoiceApproval } from "./feishu-approval-service";
import { buildVatApprovalForm, VAT_FIELDS as F, type VatDefinition, type VatDraft } from "./vat-invoice-approval";
const input = { ownerType: "cloud_row" as const, ownerId: "source", starterOpenId: "ou_test", form: [], approvalCode: "vat", nodeApprovers: [{ key: "handling-node", value: ["ou_handler"] }] };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockImplementation(async (sql: string) => sql.includes("GET_LOCK") ? [{ acquired: 1 }] : []);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: 0, data: { instance_code: "created" } }), { headers: { "content-type": "application/json" } })));
});
afterEach(() => vi.unstubAllGlobals());
describe("invoice approval submission lock", () => {
  it("uses configured Open ID node assignments and persists on the lock-owning connection", async () => {
    await submitInvoiceApproval(input);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toMatchObject({ approval_code: "vat", node_approver_open_id_list: input.nodeApprovers });
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO merge_common_feishu_approvals"), expect.objectContaining({ instanceCode: "created" }));
    expect(mocks.query).toHaveBeenCalledWith("SELECT RELEASE_LOCK(:key)", expect.anything());
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it.each(["special", "ordinary"] as const)("serializes %s VAT contacts using open_ids without treating Open IDs as user IDs", async invoiceType => {
    const option = (id: string, text: string) => ({ id, option: [{ value: id, text }] });
    const definition: VatDefinition = { status: "ACTIVE", form: JSON.stringify([
      option(F.group, "CLOUD"), option(F.company, "Unit"), option(F.type, invoiceType === "special" ? "专票" : "普票"),
      option(F.months, "10月"), option(F.payment, "后付"),
    ]) };
    const draft: VatDraft = {
      invoiceType, companyKey: F.company, customerName: "Customer", taxId: "TAX", address: "Address", phone: "123",
      bankName: "Bank", bankAccount: "Account", months: [F.months], payments: [F.payment], paymentTermDays: "30",
      amountIncludingTax: "106", amountExcludingTax: "100", taxRate: "6", taxAmount: "6", attachmentIds: [],
    };
    const nodeApprovers = [{ key: "handling-node", value: [input.starterOpenId] }];
    await submitInvoiceApproval({ ...input, nodeApprovers, form: buildVatApprovalForm(draft, definition, input.starterOpenId) });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    const expectedContact = { id: F.liaison, type: "contact", value: [], open_ids: [input.starterOpenId] };
    expect(body).toMatchObject({ open_id: input.starterOpenId, node_approver_open_id_list: nodeApprovers });
    expect(JSON.parse(body.form)).toContainEqual(expectedContact);
    expect(JSON.parse(mocks.execute.mock.calls[0][1].formJson)).toContainEqual(expectedContact);
  });
  it("does not persist or retry an approval rejected by Feishu", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: 1390001, msg: "user: ou_test not found", error: { log_id: "test-log" } }), { status: 400 })));
    await expect(submitInvoiceApproval(input)).rejects.toThrow("1390001");
    expect(fetch).toHaveBeenCalledOnce();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledWith("SELECT RELEASE_LOCK(:key)", expect.anything());
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("blocks duplicate source approvals without sending a remote request", async () => {
    mocks.query.mockImplementation(async (sql: string) => sql.includes("GET_LOCK") ? [{ acquired: 1 }] : sql.includes("SELECT id FROM") ? [{ id: "existing" }] : []);
    await expect(submitInvoiceApproval(input)).rejects.toThrow("已有生效审批");
    expect(fetch).not.toHaveBeenCalled(); expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("releases every acquired source lock after a later lock timeout", async () => {
    mocks.query.mockResolvedValueOnce([{ acquired: 1 }]).mockResolvedValueOnce([{ acquired: 0 }]).mockResolvedValue([]);
    await expect(submitInvoiceApproval({ ...input, allocationSourceIds: ["another", "source"] })).rejects.toThrow("正在提交");
    expect(mocks.query.mock.calls.filter(call => call[0].includes("RELEASE_LOCK"))).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled(); expect(mocks.release).toHaveBeenCalledOnce();
  });
});
