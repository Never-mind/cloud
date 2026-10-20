import { describe, expect, it } from "vitest";
import { isSingaporeInvoiceText, parseSingaporeInvoiceText } from "./sg-invoice-parser";

const FIXTURE = `XFUSION INTERNATIONAL PTE. LTD.
20 PASIR PANJANG ROAD #06-24,MAPLETREE BUSINESS CITY SINGAPORE (117439)
Tel:6980 8555
GST Reg No：202138254N
Invoice
Bill To: LUZ TECHNOLOGY SpA.
La provisoria Almirante Zegers 764, Providencia, Santiago de Chile
Invoice No : SG2609000101
Invoice Date : 23-Sep-26
Currency : USD
PO No : PO20260908
Contract No : AY01522609000B
Due Date : 23-Oct-26
Payment Terms : POD 30 Days
Sub-Total: 160,389.46
GST (0%) : 0.00
Total: 160,389.46
Sub-Total=SGD 204,235.13; GST=SGD 0.00;Total=SGD 204,235.13; Currency Exchange Rate 1USD=1.2734SGD`;

describe("新加坡商业发票解析", () => {
  it("识别发票号、日期、币种、PO、合同号和金额", () => {
    expect(isSingaporeInvoiceText(FIXTURE)).toBe(true);
    const invoice = parseSingaporeInvoiceText(FIXTURE);
    expect(invoice.invoiceNo).toBe("SG2609000101");
    expect(invoice.invoiceDate).toBe("2026-09-23");
    expect(invoice.dueDate).toBe("2026-10-23");
    expect(invoice.currency).toBe("USD");
    expect(invoice.poNo).toBe("PO20260908");
    expect(invoice.contractNo).toBe("AY01522609000B");
    expect(invoice.supplierName).toBe("XFUSION INTERNATIONAL PTE. LTD.");
    expect(invoice.supplierGstRegNo).toBe("202138254N");
    expect(invoice.customerName).toBe("LUZ TECHNOLOGY SpA.");
    expect(invoice.subtotal).toBe(160389.46);
    expect(invoice.gstRate).toBe(0);
    expect(invoice.gstAmount).toBe(0);
    expect(invoice.total).toBe(160389.46);
    expect(invoice.sgdTotal).toBe(204235.13);
    expect(invoice.usdSgdRate).toBe("1.2734");
  });
});
