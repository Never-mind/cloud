import { describe, expect, it } from "vitest";
import {
  isDazhuangCommercialInvoiceText,
  parseDazhuangCommercialInvoiceText,
} from "./commercial-invoice-parser";

const CONTENT = `达创精密智造（昆山）有限公司
Invoice
开票方：达创精密智造（昆山）有限公司 收票方：LUZ TECHNOLOGY SPA
Invoice No/发票号 8850167149
Invoice Date/开票日期 2026/5/13
Partner Order/订单号 PO20260330
Currency/币种 CNY
06114174-001 40 83086.13 3323445.36
TOTAL(CNY):3323445.36`;

describe("达创普通商业发票", () => {
  it("识别票号、日期、双方、币种和总额", () => {
    expect(isDazhuangCommercialInvoiceText(CONTENT)).toBe(true);
    expect(parseDazhuangCommercialInvoiceText(CONTENT)).toEqual({
      invoiceNo: "8850167149",
      invoiceDate: "2026-05-13",
      issuerName: "达创精密智造（昆山）有限公司",
      receiverName: "LUZ TECHNOLOGY SPA",
      currency: "CNY",
      totalIncludingTax: 3323445.36,
      amountExcludingTax: null,
      taxAmount: null,
      taxRate: null,
    });
  });

  it("普通商业发票不会猜税率或税金", () => {
    const invoice = parseDazhuangCommercialInvoiceText(CONTENT);
    expect(invoice.amountExcludingTax).toBeNull();
    expect(invoice.taxAmount).toBeNull();
    expect(invoice.taxRate).toBeNull();
  });
});
