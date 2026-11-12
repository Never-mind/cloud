import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceRecognition } from "./invoice-recognition-service";
import type { InvoiceAllocationPlan } from "./invoice-allocation";
const mocks = vi.hoisted(() => ({ query: vi.fn(), files: vi.fn(), review: vi.fn(), content: vi.fn(), save: vi.fn(), audit: vi.fn() }));
vi.mock("./db", () => ({ queryRows: mocks.query }));
vi.mock("./invoice-approval-return-service", () => ({ listReturnedInvoiceFiles: mocks.files, returnedInvoiceReview: mocks.review, returnedInvoiceContent: mocks.content }));
vi.mock("./invoice-service", () => ({ saveInvoice: mocks.save }));
vi.mock("./operation-log", () => ({ recordOperationLog: mocks.audit }));
import { autoRegisterReturnedInvoice } from "./invoice-approval-auto-register";
const approved: InvoiceAllocationPlan = {
  version: 1, sourceType: "cloud_row", currency: "MXN", lineMode: "period", description: "202610服务费", allocations: [
    { sourceId: "account1", amountExcludingTax: "9928.05", taxAmount: "1588.49", amountIncludingTax: "11516.54", exchangeRate: "18.598162233742" },
    { sourceId: "account2", amountExcludingTax: "79634.59", taxAmount: "12741.54", amountIncludingTax: "92376.13", exchangeRate: "18.598309613019" },
  ].map(row => ({ ...row, sourceType: "cloud_row", period: "202610", sourceNo: row.sourceId, customerId: "business", customerName: "Business", undertakingUnitId: "unit", account: row.sourceId, sourceCurrency: "USD", sourceNet: "100", sourceTotal: "116", sourceTax: "16", sourceTaxRate: "16", taxRate: "16" }))
};
function returns(plan = approved) {
  return plan.allocations.flatMap((row, index) => ["pdf", "xml"].map(ext => {
    const invoiceNo = `F${index + 30}`;
    return { id: `${invoiceNo}.${ext}`, fileName: `${invoiceNo}.${ext}`, invoiceIdentity: invoiceNo, invoiceNo, invoiceId: "", recognitionError: "", recognition: {
      facts: { invoiceNo, invoiceDate: "2026-11-11", currency: plan.currency, exchangeRate: "1", amountExcludingTax: row.amountExcludingTax, taxRate: "16", taxAmount: row.taxAmount, amountIncludingTax: row.amountIncludingTax, issuerTaxNumber: "ISSUER", receiverTaxNumber: "BUYER" }, matches: { issuerUnitId: "unit", receiverCustomerId: "customer" }
    } as InvoiceRecognition };
  }));
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockResolvedValue([{ status: "approved", invoiceId: null }]);
  mocks.files.mockResolvedValue(returns());
  mocks.review.mockResolvedValue({ allocationPlan: approved, base: { currency: "USD", paymentTermDays: 30 }, approval: { sourceType: "cloud_row", sourceId: "account1", allocationSourceIds: ["account1", "account2"] }, expectedInvoice: { currency: "MXN" } });
  mocks.content.mockImplementation(async id => ({ fileName: id, fileType: "application/pdf", bytes: Buffer.from(id) }));
  mocks.save.mockImplementation(async input => ({ id: `invoice-${input.invoiceNo}` }));
});
describe("multiple approval return invoices", () => {
  it("groups PDF/XML and maps two same-month invoices by amounts regardless of upload order", async () => {
    mocks.files.mockResolvedValue(returns().reverse());
    expect(await autoRegisterReturnedInvoice("approval")).toMatchObject({ status: "registered", note: "2 张发票已自动登记并回填对应账期" });
    expect(mocks.save).toHaveBeenCalledTimes(2);
    const calls = mocks.save.mock.calls.sort((a,b) => a[0].invoiceNo.localeCompare(b[0].invoiceNo));
    for (const [index, [input, , options]] of calls.entries()) {
      const row = approved.allocations[index];
      expect(input).toMatchObject({ sourceId: row.sourceId, period: "202610", invoiceNo: `F${index+30}`, amountIncludingTax: row.amountIncludingTax, exchangeRate: row.exchangeRate, dueDate: "2026-12-11" });
      expect(input.allocationPlan.allocations).toEqual([row]);
      expect(options).toMatchObject({ allocationMode: "matched_return", relatedFileIds: expect.arrayContaining([`F${index+30}.xml`, `F${index+30}.pdf`]) });
    }
  });
  it("resumes only the pending invoice after a partial save", async () => {
    mocks.query.mockResolvedValue([{ status: "approved", invoiceId: "invoice-F30" }]);
    mocks.files.mockResolvedValue(returns().map(file => ({...file, invoiceId: file.invoiceNo === "F30" ? "invoice-F30" : ""})));
    await autoRegisterReturnedInvoice("approval");
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ invoiceNo: "F31", sourceId: "account2" });
  });
  it("does not hide a second invoice failure behind the first invoice's success", async () => {
    mocks.save.mockResolvedValueOnce({id:"invoice-F30"}).mockRejectedValueOnce(new Error("second write failed"));
    mocks.query.mockResolvedValueOnce([{status:"approved"}]).mockResolvedValueOnce([{invoiceId:null}]);
    await expect(autoRegisterReturnedInvoice("approval")).rejects.toThrow("second write failed");
    expect(mocks.query.mock.calls.at(-1)?.[0]).toContain("merge_common_invoice_approval_files");
  });
  it("validates all partners before saving even the first invoice", async () => {
    mocks.files.mockResolvedValue(returns().map(file => file.invoiceNo === "F31" ? {...file,recognition:{...file.recognition,matches:{}}} : file));
    await expect(autoRegisterReturnedInvoice("approval")).rejects.toThrow("未唯一匹配");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects ambiguous identical amounts without guessing accounts", async () => {
    const plan = {...approved,allocations:approved.allocations.map(row => ({...approved.allocations[0],sourceId:row.sourceId}))};
    mocks.review.mockResolvedValue({...await mocks.review(),allocationPlan:plan});mocks.files.mockResolvedValue(returns(plan));
    await expect(autoRegisterReturnedInvoice("approval")).rejects.toThrow("不能唯一匹配");expect(mocks.save).not.toHaveBeenCalled();
  });
  it("requires every expected invoice before writing a partial batch", async () => {
    mocks.files.mockResolvedValue(returns().slice(0,2));
    await expect(autoRegisterReturnedInvoice("approval")).rejects.toThrow("分摊");expect(mocks.save).not.toHaveBeenCalled();
  });
  it("does not write again when both invoices already exist", async () => {
    mocks.files.mockResolvedValue(returns().map(file => ({...file,invoiceId:`invoice-${file.invoiceNo}`})));
    expect((await autoRegisterReturnedInvoice("approval")).status).toBe("registered");expect(mocks.save).not.toHaveBeenCalled();
  });
  it("does not replace a legacy registered invoice with a new unmatched return", async () => {
    mocks.files.mockResolvedValue(returns().slice(0,2));mocks.query.mockResolvedValue([{status:"approved",invoiceId:"legacy"}]);
    await expect(autoRegisterReturnedInvoice("approval")).rejects.toThrow("已有正式发票");expect(mocks.save).not.toHaveBeenCalled();
  });
});
