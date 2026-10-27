import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), feishu: vi.fn(), recognize: vi.fn(), store: vi.fn(), read: vi.fn(), prefill: vi.fn() }));
vi.mock("./db", () => ({ queryRows: mocks.query, execute: mocks.execute }));
vi.mock("./feishu-approval-service", () => ({ callFeishu: mocks.feishu }));
vi.mock("./invoice-service", () => ({ buildInvoicePrefill: mocks.prefill }));
vi.mock("./invoice-recognition-service", () => ({ recognizeInvoiceFile: mocks.recognize }));
vi.mock("./file-storage-service", () => ({ storeFile: mocks.store, readFile: mocks.read }));
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
