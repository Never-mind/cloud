import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), feishu: vi.fn(), recognize: vi.fn(), store: vi.fn(), read: vi.fn(), prefill: vi.fn(), autoRegister: vi.fn() }));
vi.mock("./db", () => ({ queryRows: mocks.query, execute: mocks.execute }));
vi.mock("./feishu-approval-service", () => ({ callFeishu: mocks.feishu }));
vi.mock("./invoice-service", () => ({ buildInvoicePrefill: mocks.prefill }));
vi.mock("./invoice-recognition-service", () => ({ recognizeInvoiceFile: mocks.recognize }));
vi.mock("./file-storage-service", () => ({ storeFile: mocks.store, readFile: mocks.read }));
vi.mock("./invoice-approval-auto-register", () => ({ autoRegisterReturnedInvoice: mocks.autoRegister }));
import { downloadReturnedInvoice, syncReturnedInvoices, returnedInvoiceReview } from "./invoice-approval-return-service";
import { VAT_APPROVAL_CODE, VAT_FIELDS } from "./vat-invoice-approval";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockImplementation(async (sql: string) => sql.includes("SELECT period") ? [{ period: "202603" }] : []);
  mocks.store.mockResolvedValue({ provider: "db", storageKey: null });
  mocks.recognize.mockResolvedValue({ facts: { invoiceNo: "12345678901234567890", issuerTaxNumber: "ISSUER", amountIncludingTax: "106" } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("invoice file")));
});

describe("cross-currency VAT return review", () => {
  it("compares return parties and terms with the approved selections instead of source defaults", async () => {
    const partySnapshot = { customerId: "actual-customer", undertakingUnitId: "actual-unit", customer: { name: "Approved Customer", taxId: "TAX", address: "Approved Address" }, sellerName: "Approved Unit", paymentTermDays: 30 };
    mocks.prefill.mockResolvedValue({ customerId: "business-customer", undertakingUnitId: "business-unit", paymentTermDays: 1111 });
    mocks.query.mockImplementation(async (sql: string) => sql.includes("SELECT instanceCode") ? [{ instanceCode: "instance" }] : sql.includes("FROM merge_common_feishu_approvals") ? [{ ownerType: "cloud_row", ownerId: "source", status: "approved", partySnapshotJson: JSON.stringify(partySnapshot) }] : []);
    const result = await returnedInvoiceReview("file");
    expect(result.base).toMatchObject({ customerId: "actual-customer", undertakingUnitId: "actual-unit", customerName: "Approved Customer", customerTaxNumber: "TAX", paymentTermDays: 30 });
    expect(result.partySnapshot).toEqual(partySnapshot);
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes("SELECT paymentTermDays"))).toBe(false);
  });
  it.each([JSON.stringify([{ id: VAT_FIELDS.amount, value: 742 }]), "invalid snapshot"])("uses the VAT application currency while preserving the USD source: %s", async formJson => {
    mocks.prefill.mockResolvedValue({ currency: "USD", amountIncludingTax: "106", exchangeRate: "1" });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT instanceCode")) return [{ instanceCode: "instance" }];
      if (sql.includes("FROM merge_common_feishu_approvals")) return [{ approvalCode: VAT_APPROVAL_CODE, formJson, ownerType: "cloud_row", ownerId: "source", status: "approved" }];
      return [];
    });
    const result = await returnedInvoiceReview("file");
    expect(result.expectedInvoice).toEqual({ currency: "CNY", amountIncludingTax: formJson.startsWith("[") ? "742" : "" });
    expect(result.base).toMatchObject({ currency: "USD", amountIncludingTax: "106", exchangeRate: "1" });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
afterEach(() => vi.unstubAllGlobals());
const attachment = (ext: string) => ({ title: "invoice_12345678901234567890." + ext, url: "https://lf9-approval-sign.feishucdn.com/invoice." + ext });

describe("returned invoice intake", () => {
  const withStoredReturn = () => {
    mocks.feishu.mockResolvedValue({});
    mocks.query.mockImplementation(async (sql: string) => sql.includes("SELECT period") ? [{ period: "202603" }] : sql.includes("ORDER BY createdAt") ? [{ id: "pdf", fileName: "invoice.pdf", invoiceNo: "12345678901234567890", invoiceIdentity: "identity" }] : []);
    mocks.autoRegister.mockResolvedValue({ status: "waiting", note: "审批通过后自动登记" });
  };
  it("automatically processes a stored return on normal synchronization", async () => {
    withStoredReturn();
    const result = await syncReturnedInvoices("instance");
    expect(mocks.autoRegister).toHaveBeenCalledWith("instance");
    expect(result.errors).toEqual([]);
    expect(result.note).toBe("审批通过后自动登记");
  });
  it("keeps manual exception corrections from being posted before their edits", async () => {
    withStoredReturn();
    await syncReturnedInvoices("instance", { autoRegister: false });
    expect(mocks.autoRegister).not.toHaveBeenCalled();
  });
  it("persists automatic posting errors for display and retry", async () => {
    withStoredReturn();
    mocks.autoRegister.mockRejectedValue(new Error("transaction failed"));
    const result = await syncReturnedInvoices("instance");
    expect(result.errors).toEqual(["自动登记失败：transaction failed"]);
    expect(mocks.execute).toHaveBeenLastCalledWith(expect.stringContaining("invoiceParseJson"), expect.objectContaining({ error: "自动登记失败：transaction failed" }));
  });
  it("does not post an incomplete set of returns after a download error", async () => {
    withStoredReturn();
    mocks.feishu.mockResolvedValue({ timeline: [{ type: "PASS", files: [attachment("pdf")] }] });
    vi.mocked(fetch).mockResolvedValueOnce(new Response("expired", { status: 403 }));
    expect((await syncReturnedInvoices("instance")).errors).toHaveLength(1);
    expect(mocks.autoRegister).not.toHaveBeenCalled();
  });
  it("archives and recognizes early financial attachments without posting a business invoice", async () => {
    mocks.feishu.mockResolvedValue({ timeline: [{ type: "PASS", files: [attachment("pdf")] }], task_list: [{ node_name: "Financial", status: "APPROVED" }, { node_name: "Delivery", status: "PENDING" }] });
    expect((await syncReturnedInvoices("instance")).added).toBe(1);
    expect(mocks.recognize).toHaveBeenCalledWith(expect.objectContaining({ direction: "income" }));
    const sql = mocks.execute.mock.calls.map(call => call[0]).join("\n");
    expect(sql).toContain("INSERT INTO merge_common_invoice_approval_files");
    expect(sql).not.toContain("INSERT INTO merge_common_invoices");
    expect(sql).not.toContain("UPDATE merge_cloud_rows");
  });
  it("skips identical stored bytes and preserves manual confirmation on resync", async () => {
    mocks.feishu.mockResolvedValue({ timeline: [{ type: "PASS", files: [attachment("pdf")] }] });
    mocks.query.mockImplementation(async (sql: string) => sql.includes("SELECT period") ? [{ period: "202603", invoiceId: "posted" }] : sql.includes("contentHash") ? [{ id: "existing" }] : []);
    expect((await syncReturnedInvoices("instance")).added).toBe(0);
    expect(mocks.recognize).not.toHaveBeenCalled(); expect(mocks.store).not.toHaveBeenCalled();
    expect(mocks.execute.mock.calls.some(call => call[0].includes("confirmedJson"))).toBe(false);
  });
  it("retains an unrecognized rendition and continues to the PDF", async () => {
    mocks.feishu.mockResolvedValue({ timeline: [{ type: "PASS", files: [attachment("ofd"), attachment("pdf")] }] });
    mocks.recognize.mockRejectedValueOnce(new Error("Unsupported OFD"));
    expect((await syncReturnedInvoices("instance")).added).toBe(2);
    const inserts = mocks.execute.mock.calls.filter(call => call[0].startsWith("INSERT"));
    expect(inserts[0][1].error).toBe("Unsupported OFD");
    expect(inserts[1][1].invoiceNo).toBe("12345678901234567890");
  });
  it("reports a failed download but continues other files", async () => {
    mocks.feishu.mockResolvedValue({ comment_list: [{ files: [attachment("ofd"), attachment("pdf")] }] });
    vi.mocked(fetch).mockResolvedValueOnce(new Response("expired", { status: 403 }));
    const result = await syncReturnedInvoices("instance");
    expect(result.added).toBe(1); expect(result.errors).toHaveLength(1);
  });
  it("refuses redirect escapes and oversized files", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } }));
    await expect(downloadReturnedInvoice(attachment("pdf").url)).rejects.toThrow("可信域名");
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.mocked(fetch).mockResolvedValueOnce(new Response("large", { headers: { "content-length": String(21 * 1024 * 1024) } }));
    await expect(downloadReturnedInvoice(attachment("pdf").url)).rejects.toThrow("20 MB");
  });
});
