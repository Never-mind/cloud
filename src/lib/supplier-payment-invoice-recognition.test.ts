import { describe, expect, it } from "vitest";
import { buildSupplierPaymentInvoicePatch } from "./supplier-payment-invoice-recognition";

describe("华为云供应商付款发票识别回填", () => {
  it("把识别结果映射到供应商开票字段", () => {
    const { patch, warnings } = buildSupplierPaymentInvoicePatch({
      invoiceNo: "26332000007049990716",
      invoiceDate: "2026-08-17",
      currency: "CNY",
      exchangeRate: "1",
      amountExcludingTax: "742.57",
      taxRate: "1",
      taxAmount: "7.43",
      invoiceTotal: "750",
      invoiceEntityId: "supplier-1",
    }, { supplierId: "supplier-1" });

    expect(patch).toEqual({
      invoiceNo: "26332000007049990716",
      invoiceDate: "2026-08-17",
      invoiceCurrency: "CNY",
      invoiceExchangeRate: "1",
      invoiceNetAmount: "742.57",
      invoiceTaxRate: "1",
      invoiceTaxAmount: "7.43",
      invoiceTotalAmount: "750",
      invoiceStatus: "issued",
    });
    expect(warnings).toEqual([]);
  });

  it("空字段不覆盖手工值，并提示需要补录", () => {
    const { patch, warnings } = buildSupplierPaymentInvoicePatch({ invoiceNo: "", invoiceTotal: "" });
    expect(patch).toEqual({});
    expect(warnings).toEqual(["未识别到发票号，请手工填写", "未识别到发票含税金额，请手工填写"]);
  });

  it("识别到的供应商与当前付款供应商不一致时提示核对", () => {
    const { warnings } = buildSupplierPaymentInvoicePatch(
      { invoiceNo: "A-1", invoiceTotal: "100", invoiceEntityId: "supplier-2" },
      { supplierId: "supplier-1" },
    );
    expect(warnings).toContain("识别的供应商与当前付款供应商不一致，请核对");
  });
});
