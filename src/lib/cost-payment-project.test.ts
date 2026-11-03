import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), write: vi.fn(), upload: vi.fn(), remote: vi.fn(), fetch: vi.fn() }));
vi.mock("./db", () => ({ queryRows: mocks.query, execute: mocks.write }));
vi.mock("./feishu-message-service", () => ({ getFeishuTenantAccessToken: async () => "test-token" }));
vi.mock("./feishu-approval-service", () => ({ uploadApprovalAttachment: mocks.upload, fetchInvoiceApprovalInstance: mocks.remote }));
vi.mock("./file-storage-service", () => ({ readFile: async () => ({ bytes: Buffer.from("test"), fileName: "test.txt" }) }));
import {
  buildCostPaymentForm, parseCostPaymentApprovalOptions, submitCostPaymentApproval, syncCostPaymentApprovals,
  validateCostPaymentProjectOptions, type CostPaymentBranch, type CostPaymentEntryInput,
} from "./cost-payment-approval-service";
import { COST_PAYMENT_PROJECT_KEYS, COST_PAYMENT_PROJECT_LABELS, COST_PAYMENT_LIST_WIDGETS, costPaymentProjectLabel, remapCostPaymentOption } from "./cost-payment-project";

const branches: CostPaymentBranch[] = ["huawei", "other", "compute"];
const owners = { huawei: "cloud_supplier_payment", other: "settlement_invoice_payment", compute: "purchase_order_payment" } as const;
const tables = { huawei: "merge_cloud_supplier_payments", other: "merge_po_settlement_invoices", compute: "merge_power_purchaseorders" };
const formEntry = {
  amount: 123.45, currency: "USD", payee: "Supplier", bankAccount: "000123", bankName: "Bank", swiftCode: "SWIFT",
  feeKey: "none" as const, paymentDate: "2099-01-01", invoiceIssued: false, orderNo: "PO-1", batchNo: "Batch-1", attachmentTokens: [],
};
const form = (branch: CostPaymentBranch, issued = false) => buildCostPaymentForm(branch, { reason: "Test", companyKey: "company", entries: [{ ...formEntry, invoiceIssued: issued }] });
function definition() {
  return [
    { id: "widget17688921620770001", option: [{ value: "company", text: "公司" }] },
    { id: "widget17688932030050001", option: branches.map(branch => ({ value: COST_PAYMENT_PROJECT_KEYS[branch], text: COST_PAYMENT_PROJECT_LABELS[branch] })) },
    ...branches.map(branch => ({ id: COST_PAYMENT_LIST_WIDGETS[branch], type: "fieldList", children:
      (form(branch)[4].value as Array<Array<{ id: string; type: string; value: unknown }>>)[0].map((field, index) => ({
        id: field.id, type: field.type,
        option: field.type === "amount" ? { currencyRange: ["USD", "CNY"] }
          : field.type === "radioV2" ? field.id === "widget17688981032310001" ? [{ value: "customer", text: "客户" }]
            : String(field.value).includes("lhk7") || String(field.value).includes("z8fi") || String(field.value).includes("5isf") ? [{ value: String(field.value), text: "无" }]
              : [
                { value: String(((form(branch, true)[4].value as Array<Array<{ value: unknown }>>)[0][index]).value), text: "已开" },
                { value: String(field.value), text: "未开" },
              ] : undefined,
      })),
    })),
  ];
}
function entry(source: CostPaymentBranch): CostPaymentEntryInput {
  return { ...formEntry, ownerType: owners[source], ownerId: "original-id", ownerNo: "original-no", undertakingUnitCode: "MXGS01", companyKey: "company",
    customerOptionKey: "customer", attachmentRefs: [], attachments: [{ fileName: "test.txt", dataUrl: "data:text/plain;base64,dGVzdA==" }] };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.query.mockResolvedValue([]); mocks.write.mockResolvedValue({ affectedRows: 1 }); mocks.upload.mockResolvedValue("file-token");
  mocks.fetch.mockImplementation(async (url: string) => ({ json: async () => ({ code: 0, data: url.includes("/approvals/") ? { form: JSON.stringify(definition()) } : { instance_code: "instance-test" } }) }));
});
afterEach(() => vi.unstubAllGlobals());

describe("independent payment cost projects", () => {
  it.each(branches.flatMap(source => branches.map(project => [source, project] as const)))("%s source submits %s form and syncs back to original source", async (source, project) => {
    const result = await submitCostPaymentApproval({ branch: source, costProject: project, entries: [entry(source)], reason: "Test", starter: { openId: "ou_test" } });
    expect(result.costProject).toBe(project);
    const create = mocks.fetch.mock.calls.find(([, init]) => init?.method === "POST");
    const sent = JSON.parse(JSON.parse(create![1].body).form);
    expect(sent.find((field: { id: string }) => field.id === "widget17688932030050001").value).toBe(COST_PAYMENT_PROJECT_KEYS[project]);
    expect(sent.filter((field: { type: string }) => field.type === "fieldList").map((field: { id: string }) => field.id)).toEqual([COST_PAYMENT_LIST_WIDGETS[project]]);
    const saved = mocks.write.mock.calls.find(([sql]) => sql.includes("INSERT INTO merge_common_feishu_approvals"))![1];
    expect(saved).toMatchObject({ ownerType: owners[source], ownerId: "original-id", allocationSourceIds: "original-id" });
    expect(costPaymentProjectLabel(saved.formJson)).toBe(COST_PAYMENT_PROJECT_LABELS[project]);
    expect(mocks.write.mock.calls.some(([sql]) => sql.startsWith(`UPDATE ${tables[source]}`))).toBe(true);
    const attachmentTable = { huawei: "merge_cloud_attachments", other: "merge_po_settlement_attachments", compute: "merge_common_attachments" }[source];
    expect(mocks.write.mock.calls.some(([sql]) => sql.startsWith(`INSERT INTO ${attachmentTable}`))).toBe(true);
    mocks.write.mockClear();
    mocks.query.mockResolvedValue([{ ...saved, status: "pending" }]);
    mocks.remote.mockResolvedValue({ status: "approved", paymentConfirmedAt: new Date("2026-11-02T03:00:00Z"), paymentConfirmedNode: "确认到账" });
    await syncCostPaymentApprovals();
    expect(mocks.write.mock.calls[0][0]).toContain(`UPDATE ${tables[source]}`);
    expect(mocks.write.mock.calls[0][1].ownerId).toBe("original-id");
  });
  it("retains the default for old callers", async () => {
    const result = await submitCostPaymentApproval({ branch: "other", entries: [entry("other")], reason: "r", starter: { openId: "ou_test" } });
    expect(result.costProject).toBe("other");
  });
  it("keeps cloud attachments when submitting the other cost project", async () => {
    mocks.query.mockResolvedValue([{ fileName: "cloud-invoice.pdf" }]);
    await submitCostPaymentApproval({ branch: "huawei", costProject: "other", reason: "r", starter: { openId: "ou_test" }, entries: [{
      ...entry("huawei"), attachments: [], attachmentRefs: [{ source: "cloud_supplier_payment", attachmentId: "cloud-file" }], attachmentOwnerId: "cloud-physical-id",
    }] });
    expect(mocks.query.mock.calls[0][0]).toContain("merge_cloud_attachments");
    expect(mocks.query.mock.calls[0][1].paymentOwnerIds).toContain("cloud-physical-id");
    expect(mocks.upload).toHaveBeenCalledOnce();
  });
  it("requires selected-branch fields before uploads", async () => {
    await expect(submitCostPaymentApproval({ branch: "huawei", costProject: "compute", entries: [{ ...entry("huawei"), orderNo: "" }], reason: "r", starter: { openId: "ou_test" } })).rejects.toThrow("订单号");
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
  it("rejects ownership changes and duplicate sources", async () => {
    const input = { branch: "huawei" as const, costProject: "other" as const, reason: "r", starter: { openId: "ou_test" } };
    await expect(submitCostPaymentApproval({ ...input, entries: [entry("other")] })).rejects.toThrow("来源");
    await expect(submitCostPaymentApproval({ ...input, entries: [entry("huawei"), entry("huawei")] })).rejects.toThrow("重复");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("maps option labels across branches and rejects stale keys", () => {
    const options = parseCostPaymentApprovalOptions(definition());
    expect(options.huawei.available).toBe(true);
    expect(remapCostPaymentOption(options.huawei.fee[0].value, options.huawei.fee, options.other.fee)).toBe(options.other.fee[0].value);
    expect(remapCostPaymentOption("obsolete", options.huawei.fee, options.other.fee)).toBe("");
    expect(validateCostPaymentProjectOptions("other", [{ ...entry("huawei"), feeOptionKey: options.huawei.fee[0].value }], options.other)).toContain("手续费");
    expect(validateCostPaymentProjectOptions("huawei", [{ ...entry("other"), customerOptionKey: "unknown" }], options.huawei)).toContain("客户名称");
    expect(validateCostPaymentProjectOptions("other", [{ ...entry("huawei"), currency: "EUR" }], options.other)).toContain("币种");
  });
  it("disables missing and changed branches without inventing mappings", () => {
    const widgets = definition();
    const project = widgets[1] as { option: Array<{ value: string; text: string }> };
    project.option = project.option.filter(option => option.value !== COST_PAYMENT_PROJECT_KEYS.other);
    expect(parseCostPaymentApprovalOptions(widgets).other.available).toBe(false);
    expect(parseCostPaymentApprovalOptions(widgets).huawei.available).toBe(true);
    expect(costPaymentProjectLabel("broken json")).toBe("");
    expect(costPaymentProjectLabel(null)).toBe("");
  });
});
