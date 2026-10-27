import { describe, expect, it } from "vitest";
import { completeInvoiceReviewAmounts, updateInvoiceReviewAmounts, validateInvoiceReview } from "./invoice-review";
import { confirmedCloudInvoiceAmounts, calculateCloudTaxGroup } from "./cloud-tax";
import { buildSupplierPaymentInvoicePatch } from "./supplier-payment-invoice-recognition";

const original = { amountExcludingTax: "100", taxRate: "13", taxAmount: "12.99", amountIncludingTax: "112.99" };
describe("invoice review", () => {
  it("preserves supplied tax instead of forcing rate multiplication", () => {
    expect(completeInvoiceReviewAmounts(original)).toEqual(original);
    expect(validateInvoiceReview({ ...original, invoiceNo: "TEST", invoiceDate: "2026-10-23", currency: "CNY" })).toBe("");
  });
  it("fills missing amounts from gross and rate including zero tax", () => {
    expect(completeInvoiceReviewAmounts({ amountExcludingTax: "", taxAmount: "", amountIncludingTax: "113", taxRate: "13" })).toEqual({ amountExcludingTax: "100", taxAmount: "13", amountIncludingTax: "113", taxRate: "13" });
    expect(completeInvoiceReviewAmounts({ amountExcludingTax: "100", taxAmount: "", amountIncludingTax: "", taxRate: "0" }).taxAmount).toBe("0");
  });
  it("links edits without mutating the recognized original", () => {
    expect(updateInvoiceReviewAmounts(original, "amountExcludingTax", "200")).toMatchObject({ taxAmount: "26", amountIncludingTax: "226" });
    expect(updateInvoiceReviewAmounts(original, "taxRate", "16")).toMatchObject({ taxAmount: "16", amountIncludingTax: "116" });
    expect(updateInvoiceReviewAmounts(original, "taxAmount", "12.98")).toMatchObject({ taxRate: "13", amountIncludingTax: "112.98" });
    expect(updateInvoiceReviewAmounts(original, "amountIncludingTax", "226")).toMatchObject({ amountExcludingTax: "200", taxAmount: "26" });
    expect(original.taxAmount).toBe("12.99");
  });
  it("rejects inconsistent amounts, invalid numbers and impossible dates", () => {
    expect(validateInvoiceReview({ ...original, taxAmount: "oops" }, false)).not.toBe("");
    expect(validateInvoiceReview({ ...original, amountIncludingTax: "120" }, false)).toContain("不一致");
    expect(validateInvoiceReview({ ...original, invoiceNo: "TEST", invoiceDate: "2026-02-30", currency: "USD" })).toContain("日期");
  });
  it.each([0, 0.5, 1, 16])("maps percent %s to cloud stored fraction", percent => {
    const { patch } = buildSupplierPaymentInvoicePatch({ taxRate: String(percent), invoiceDate: "2026-10-01" }, { receivableDate: "2026-12-10" });
    expect(Number(patch.invoiceTaxRate)).toBe(percent / 100);
    expect(patch).not.toHaveProperty("receivableDate");
  });
  it("preserves full reviewed cloud tuple and still recalculates single-field edits", () => {
    const values = { invoiceNetAmount: 100, invoiceTaxRate: 0.13, invoiceTaxAmount: 12.99, invoiceTotalAmount: 112.99 };
    expect(confirmedCloudInvoiceAmounts(values, Object.keys(values))).toMatchObject({ net: 100, tax: 12.99, total: 112.99, source: null });
    expect(confirmedCloudInvoiceAmounts(values, ["invoiceNetAmount"])).toBeNull();
    expect(calculateCloudTaxGroup({ ...values, invoiceNetAmount: 200 }, "invoice", ["invoiceNetAmount"])).toMatchObject({ tax: 26, total: 226 });
  });
});
