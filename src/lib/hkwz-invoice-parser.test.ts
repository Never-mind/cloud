import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { hkwzPdfRows, isHkwzInvoiceText, parseHkwzInvoice, parseHkwzWorkbook, type InvoiceTemplateRows } from "./hkwz-invoice-parser";
import type { PdfLayoutPage } from "./pdf-text-extract";

const issuer = "HK WANZHONG TECHNOLOGY LIMITED";
export function templateRows(): InvoiceTemplateRows {
  return [
    [{ x: 0, text: issuer }], [{ x: 3, text: "INV No.CI-WZ_TEST-01" }],
    [{ x: 0, text: "FROM" }, { x: 4, text: "INVOICE ADDRESS" }],
    [{ x: 0, text: `${issuer}\nIssuer address line 1\nIssuer address line 2` }, { x: 4, text: "Example Customer Limited\nCustomer address line 1\nHong Kong." }],
    [{ x: 0, text: "CONTACT" }, { x: 2, text: "Alice" }, { x: 4, text: "CUSTOMER CONTACT" }, { x: 6, text: "王甲" }],
    [{ x: 0, text: "TELEPHONE" }, { x: 2, text: "0755-00000000" }, { x: 4, text: "TELEPHONE" }, { x: 6, text: "13000000000" }],
    [{ x: 0, text: "E-mail" }, { x: 2, text: "issuer@example.com" }, { x: 4, text: "E-mail" }, { x: 6, text: "buyer@example.com" }],
    [{ x: 0, text: "Invoice Date" }, { x: 2, text: "2026/05/07" }, { x: 4, text: "Due Date" }, { x: 6, text: "2026/05/14" }],
    [{ x: 0, text: "Currency" }, { x: 2, text: "USD" }, { x: 4, text: "Payment Terms" }, { x: 6, text: "7 days after invoice issuing date" }],
    [{ x: 0, text: "TIME" }, { x: 1, text: "Description" }, { x: 2, text: "Quantity" }, { x: 3, text: "Unit Price" }, { x: 4, text: "Subtotal Amount" }],
    [{ x: 0, text: "2026-04" }, { x: 1, text: "" }, { x: 2, text: "1.00" }, { x: 3, text: "1,059.76" }, { x: 4, text: "1,059.76" }],
    [{ x: 0, text: "Comment:服务费202604" }, { x: 3, text: "Total" }, { x: 4, text: "USD 1,059.76" }],
    [{ x: 0, text: `Beneficiary's Name：${issuer}` }],
    [{ x: 0, text: "Beneficiary's Bank：Example Bank" }],
    [{ x: 0, text: "Beneficiary's Bank Address：Example bank address" }],
    [{ x: 0, text: "Beneficiary's SWIFT Code：EXAMPLE1" }],
    [{ x: 0, text: "Beneficiary's Account Number：00012345678" }],
    [{ x: 0, text: "Beneficiary's Bank Code：020" }],
  ];
}

function workbook(rows = templateRows(), change?: (book: XLSX.WorkBook) => void, type: XLSX.BookType = "xlsx") {
  const book = XLSX.utils.book_new();
  const table = rows.map(row => { const values: string[] = []; for (const cell of row) values[cell.x] = cell.text; return values; });
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(table), "Invoice");
  change?.(book);
  return XLSX.write(book, { type: "buffer", bookType: type });
}

describe("HK Wanzhong commercial invoice", () => {
  it("extracts bill dates, period, both parties and bank details without mixing columns", () => {
    expect(parseHkwzInvoice(templateRows())).toMatchObject({
      invoiceNo: "CI-WZ_TEST-01", invoiceDate: "2026-05-07", dueDate: "2026-05-14", paymentTermDays: "7",
      servicePeriod: "2026-04", currency: "USD", total: 1059.76, comment: "服务费202604",
      partyFields: { sellerAddress: "Issuer address line 1 Issuer address line 2", customerAddress: "Customer address line 1 Hong Kong.",
        customerContact: "王甲", sellerContactName: "Alice", sellerFinanceEmail: "issuer@example.com", customerContactEmail: "buyer@example.com",
        bankCode: "020", bankAccount: "00012345678", bankName: "Example Bank", bankAddress: "Example bank address" },
      lines: [{ periodLabel: "2026-04", description: "", quantity: "1.00", unitPrice: "1059.76", amount: "1059.76" }],
    });
  });

  it.each(["xlsx", "xls", "html"] as const)("reads %s workbooks including HTML exported under an Excel extension", type => {
    const data = parseHkwzWorkbook(workbook(undefined, undefined, type));
    expect(data).toMatchObject({ invoiceNo: "CI-WZ_TEST-01", invoiceDate: "2026-05-07", servicePeriod: "2026-04", total: 1059.76 });
    expect(data.partyFields.bankCode).toBe("020");
  });

  it("reads numeric Excel dates and cached formula amounts", () => {
    const bytes = workbook(undefined, book => {
      book.Sheets.Invoice.C8 = { t: "n", v: 46149, z: "yyyy/mm/dd" };
      book.Sheets.Invoice.G8 = { t: "n", v: 46156, z: "yyyy/mm/dd", f: "C8+7" };
      book.Sheets.Invoice.A11 = { t: "n", v: 46113, z: "yyyy-mm" };
      book.Sheets.Invoice.E11 = { t: "n", v: 1059.76, f: "C11*D11" };
    });
    expect(parseHkwzWorkbook(bytes)).toMatchObject({ invoiceDate: "2026-05-07", dueDate: "2026-05-14", servicePeriod: "2026-04", total: 1059.76 });
  });

  it("skips cover sheets but refuses to arbitrarily select from multiple invoices", () => {
    expect(parseHkwzWorkbook(workbook(undefined, book => {
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["cover"]]), "Cover"); book.SheetNames.reverse();
    })).invoiceNo).toBe("CI-WZ_TEST-01");
    expect(() => parseHkwzWorkbook(workbook(undefined, book => {
      XLSX.utils.book_append_sheet(book, { ...book.Sheets.Invoice }, "Second invoice");
    }))).toThrow("多张发票");
  });

  it("derives a consistent term from an explicit due date and flags conflicting text", () => {
    const rows = templateRows(); rows[8][3].text = "30 days after invoice issuing date";
    const result = parseHkwzInvoice(rows);
    expect(result).toMatchObject({ dueDate: "2026-05-14", paymentTermDays: "7" });
    expect(result.warnings.join(" ")).toContain("不一致");
  });

  it("derives due date when only a stated term is supplied", () => {
    const rows = templateRows(); rows[7][3].text = "";
    expect(parseHkwzInvoice(rows)).toMatchObject({ dueDate: "2026-05-14", paymentTermDays: "7" });
  });

  it("does not classify unrelated commercial invoices as this no-tax template", () => {
    expect(isHkwzInvoiceText("Example Supplier INVOICE Total USD 100")).toBe(false);
    expect(() => parseHkwzInvoice(templateRows().map(row => row.map(cell => ({ ...cell, text: cell.text.replaceAll(issuer, "Other Company") }))))).toThrow("不是可识别");
  });

  it("preserves invoice number underscores and rejects multiple invoice numbers", () => {
    const rows = templateRows(); rows.push([{ x: 0, text: "INV No.CI-WZ_SECOND" }]);
    expect(() => parseHkwzInvoice(rows)).toThrow("多张发票");
  });

  it("keeps PDF glyphs on the correct side of the address boundary", () => {
    const page = { text: "", rows: [
      { y: 100, items: [{ str: "FROM", width: 20, transform: [1,0,0,1,20,100] }, { str: "INVOICE ADDRESS", width: 80, transform: [1,0,0,1,300,100] }] },
      { y: 90, items: [{ str: "Seller", width: 30, transform: [1,0,0,1,20,90] }, { str: "Buyer", width: 30, transform: [1,0,0,1,300,90] }] },
    ] } satisfies PdfLayoutPage;
    expect(hkwzPdfRows([page])[1]).toEqual([{ x: 20, text: "Seller" }, { x: 300, text: "Buyer" }]);
  });
});
