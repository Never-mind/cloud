import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), definition: vi.fn(), prefill: vi.fn(), active: vi.fn(), submit: vi.fn(), upload: vi.fn(), read: vi.fn() }));
vi.mock("./file-storage-service", () => ({ readFile: mocks.read }));
vi.mock("./db", () => ({ queryRows: mocks.query }));
vi.mock("./invoice-service", () => ({ buildInvoicePrefill: mocks.prefill }));
vi.mock("./feishu-approval-service", () => ({ callFeishu: mocks.definition, findActiveInvoiceApproval: mocks.active, submitInvoiceApproval: mocks.submit, uploadApprovalAttachment: mocks.upload, readCustomerAttachment: vi.fn() }));
import { buildVatApprovalPrefill, submitVatInvoiceApproval, vatNodeApprovers } from "./vat-invoice-approval-service";
import { VAT_FIELDS as F, type VatDefinition } from "./vat-invoice-approval";
const option = (id: string, text: string) => ({ id, option: [{ value: id, text }] });
const definition: VatDefinition = {
  status: "ACTIVE",
  form: JSON.stringify([option(F.group, "CLOUD"), option(F.company, "Unit"), option(F.type, "专票"), option(F.months, "10月"), option(F.payment, "后付")]),
  node_list: [{ node_id: "finance", name: "财务审批", need_approver: false }, { node_id: "delivery", name: "办理-票据发送", need_approver: true }],
};
const source = { sourceType: "cloud_row" as const, sourceId: "source", starterOpenId: "ou_alice" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.definition.mockResolvedValue(definition); mocks.active.mockResolvedValue(null);
  mocks.prefill.mockResolvedValue({ sourceId: "source", sourceNo: "Source", period: "202610", undertakingUnitId: "unit", customerId: "customer", currency: "CNY", amountIncludingTax: "106", amountExcludingTax: "100", taxAmount: "6", taxRate: "6", lines: [] });
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM merge_cloud_rows")) return [{ id: "source", customerId: "customer" }];
    if (sql.includes("FROM merge_common_undertaking_units")) return [{ name: "Unit", paymentTermDays: 30 }];
    if (sql.includes("FROM merge_common_customers")) return [{ name: "Customer", taxNumber: "TAX", address: "Address", contactPhone: "123" }];
    if (sql.includes("FROM merge_common_customer_bank_accounts")) return [{ bankName: "Bank", bankAccount: "Account", isDefault: 1 }];
    return [];
  });
});
describe("VAT approval material submission", () => {
  it("uses the selected customer and unit for prefill, attachments and the saved submission snapshot", async () => {
    const prefill = await buildVatApprovalPrefill({ ...source, customerId: "other-customer", undertakingUnitId: "other-unit" });
    expect(prefill.draft).toMatchObject({ customerId: "other-customer", undertakingUnitId: "other-unit" });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("FROM merge_common_customer_bank_accounts"), { id: "other-customer" });
    await submitVatInvoiceApproval({ ...source, draft: { ...prefill.draft, customerName: "Manual legal name" } });
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ partySnapshot: expect.objectContaining({ customerId: "other-customer", undertakingUnitId: "other-unit", customer: expect.objectContaining({ name: "Manual legal name" }) }) }));
  });
  it("rejects a selected unit with a mismatched Feishu company before uploads", async () => {
    const prefill = await buildVatApprovalPrefill(source);
    await expect(submitVatInvoiceApproval({ ...source, draft: { ...prefill.draft, companyKey: "another-company" } })).rejects.toThrow("不匹配");
    expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("uploads existing and inline files once and sends all tokens to the VAT attachment widget", async () => {
    const prefill = await buildVatApprovalPrefill(source);
    const baseQuery = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM merge_common_attachments")) return [{ attachmentId: "stored", fileName: "stored.pdf", fileSize: 3 }];
      return baseQuery(sql);
    });
    mocks.read.mockResolvedValue({ bytes: Buffer.from("pdf") });
    mocks.upload.mockResolvedValueOnce("existing-token").mockResolvedValueOnce("new-token");
    await submitVatInvoiceApproval({ ...source, draft: { ...prefill.draft, attachmentIds: ["stored"], attachmentRefs: [{ source: "customer", attachmentId: "stored" }], attachments: [{ fileName: "new.pdf", dataUrl: "data:application/pdf;base64,cGRm" }] } });
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ form: expect.arrayContaining([{ id: F.attachments, type: "attachmentV2", value: ["existing-token", "new-token"] }]) }));
  });
  it("blocks foreign references before uploading any new file", async () => {
    const prefill = await buildVatApprovalPrefill(source);
    await expect(submitVatInvoiceApproval({ ...source, draft: { ...prefill.draft, attachmentIds: ["foreign"], attachments: [{ fileName: "new.pdf", dataUrl: "data:application/pdf;base64,cGRm" }] } })).rejects.toThrow("不属于");
    expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("does not create an approval when an upload fails", async () => {
    const prefill = await buildVatApprovalPrefill(source);
    mocks.upload.mockRejectedValue(new Error("upload failed"));
    await expect(submitVatInvoiceApproval({ ...source, draft: { ...prefill.draft, attachments: [{ fileName: "new.pdf", dataUrl: "data:application/pdf;base64,cGRm" }] } })).rejects.toThrow("upload failed");
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});

describe("VAT invoice currency is independent of the source currency", () => {
  it.each(["USD", "usd", "EUR"])("keeps %s source amounts as references without copying them into CNY", async currency => {
    mocks.prefill.mockResolvedValue({ ...(await mocks.prefill()), currency });
    const result = await buildVatApprovalPrefill(source);
    expect(result.blockers).toEqual([]);
    expect(result).toMatchObject({ currency: "CNY", sourceCurrency: currency.toUpperCase(), sourceAmountIncludingTax: "106" });
    expect(result.draft).toMatchObject({ amountIncludingTax: "", amountExcludingTax: "", taxAmount: "", taxRate: "6" });
    await expect(submitVatInvoiceApproval({ ...source, draft: result.draft })).rejects.toThrow("含税金额");
    expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("submits the agreed CNY gross amount for a USD statement", async () => {
    const base = { ...(await mocks.prefill()), currency: "USD" };
    mocks.prefill.mockResolvedValue(base);
    const result = await buildVatApprovalPrefill(source);
    const draft = { ...result.draft, amountExcludingTax: "700", taxAmount: "42", amountIncludingTax: "742" };
    await submitVatInvoiceApproval({ ...source, draft });
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({
      ownerType: "cloud_row", ownerId: "source",
      form: expect.arrayContaining([{ id: F.amount, type: "number", value: 742 }]),
    }));
    expect(base).toMatchObject({ currency: "USD", amountIncludingTax: "106", amountExcludingTax: "100" });
  });
  it("retains CNY prefill amounts", async () => {
    const result = await buildVatApprovalPrefill(source);
    expect(result.draft).toMatchObject({ amountIncludingTax: "106", amountExcludingTax: "100", taxAmount: "6" });
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("VAT handler follows the authenticated starter", () => {
  it.each(["ou_alice", "ou_bob"])("assigns only the delivery node to %s and ignores legacy configuration", starter => {
    vi.stubEnv("FEISHU_VAT_INVOICE_HANDLER_OPEN_IDS", "ou_fixed");
    expect(vatNodeApprovers(definition, starter)).toEqual([{ key: "delivery", value: [starter] }]);
  });
  it.each(["", "user123", "ou_bad-id"])("rejects an invalid bound identity: %s", starter => {
    expect(() => vatNodeApprovers(definition, starter)).toThrow("绑定");
  });
  it("does not replace unrelated approval personnel with the starter", () => {
    expect(() => vatNodeApprovers({ ...definition, node_list: [{ node_id: "finance", name: "财务审批", need_approver: true }] }, "ou_alice")).toThrow("自选节点");
    expect(vatNodeApprovers({ ...definition, node_list: [{ node_id: "finance", name: "财务审批", need_approver: false }] }, "ou_alice")).toEqual([]);
  });
  it("prefills successfully without a configured fixed handler", async () => {
    vi.stubEnv("FEISHU_VAT_INVOICE_HANDLER_OPEN_IDS", "");
    expect((await buildVatApprovalPrefill(source)).blockers).toEqual([]);
  });
  it("passes the same starter to both the delivery node and hidden contact", async () => {
    const prefill = await buildVatApprovalPrefill(source);
    await submitVatInvoiceApproval({ ...source, draft: prefill.draft });
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ starterOpenId: "ou_alice", nodeApprovers: [{ key: "delivery", value: ["ou_alice"] }], form: expect.arrayContaining([{ id: F.liaison, type: "contact", value: [], open_ids: ["ou_alice"] }]) }));
  });
  it("blocks unbound users before uploads or submission", async () => {
    const prefill = await buildVatApprovalPrefill({ ...source, starterOpenId: "" });
    expect(prefill.blockers.join()).toContain("绑定");
    await expect(submitVatInvoiceApproval({ ...source, starterOpenId: "", draft: prefill.draft })).rejects.toThrow("绑定");
    expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled();
  });
});
