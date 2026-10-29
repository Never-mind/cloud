import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db", () => ({ queryRows: db.query }));
import { recognizeInvoiceFile } from "./invoice-recognition-service";
import { recognizedInvoiceFields } from "./invoice-recognition-fill";

const source = `<html><table>
<tr><td>HK WANZHONG TECHNOLOGY LIMITED</td></tr><tr><td>INV No.CI-WZ_TEST</td></tr>
<tr><td>FROM</td><td>INVOICE ADDRESS</td></tr>
<tr><td>HK WANZHONG TECHNOLOGY LIMITED<br>Issuer address</td><td>Customer Limited<br>Buyer address</td></tr>
<tr><td>CONTACT Alice</td><td>CUSTOMER CONTACT 王甲</td></tr>
<tr><td>TELEPHONE 0755-00000000</td><td>TELEPHONE 13000000000</td></tr>
<tr><td>E-mail issuer@example.com</td><td>E-mail buyer@example.com</td></tr>
<tr><td>Invoice Date 2026/5/7</td><td>Due Date 2026/5/14</td></tr>
<tr><td>Currency USD</td><td>Payment Terms 7 days after invoice issuing date</td></tr>
<tr><td>TIME Description Quantity Unit Price Subtotal Amount</td></tr>
<tr><td>2026-04 1.00 1,059.76 1,059.76</td></tr>
<tr><td>Comment:服务费202604</td><td>Total USD 1,059.76</td></tr>
<tr><td>Beneficiary's Bank：Example Bank</td></tr><tr><td>Beneficiary's Bank Code：020</td></tr>
<tr><td>Beneficiary's Account Number：00012345678</td></tr></table></html>`;

beforeEach(() => {
  db.query.mockReset();
  db.query.mockImplementation(async (sql: string) => sql.includes("undertaking_units")
    ? [{ id: "unit-1", nameEn: "HK WANZHONG TECHNOLOGY LIMITED", paymentTermDays: "30" }]
    : sql.includes("customers") ? [{ id: "customer-1", nameEn: "Customer Limited" }] : []);
});

describe("shared commercial invoice recognition and filling", () => {
  it("recognizes HTML under xlsx, matches archives and applies only the authorized template's zero-tax rule", async () => {
    const result = await recognizeInvoiceFile({ fileName: "202604.xlsx", bytes: Buffer.from(source), direction: "income" });
    expect(result).toMatchObject({ source: "香港万众商业发票 Excel", taxTreatment: "template_no_tax",
      matches: { issuerUnitId: "unit-1", receiverCustomerId: "customer-1" },
      facts: { amountExcludingTax: "1059.76", amountIncludingTax: "1059.76", taxRate: "0", taxAmount: "0", dueDate: "2026-05-14", paymentTermDays: "7", servicePeriod: "2026-04" } });
    expect(result.fields.find(field => field.key === "taxRate")?.status).toBe("derived");
    expect(recognizedInvoiceFields(result, { currency: "CNY", exchangeRate: "7" })).toMatchObject({
      invoiceNo: "CI-WZ_TEST", invoiceDate: "2026-05-07", dueDate: "2026-05-14", paymentTermDays: "7",
      amountExcludingTax: "1059.76", taxRate: "0", taxAmount: "0", amountIncludingTax: "1059.76",
      currency: "USD", exchangeRate: "1", customerId: "customer-1", undertakingUnitId: "unit-1",
      customerAddress: "Buyer address", sellerAddress: "Issuer address", bankName: "Example Bank", bankCode: "020", bankAccount: "00012345678",
      comment: "服务费202604", lines: [{ periodLabel: "2026-04", description: "", amount: "1059.76" }],
    });
  });

  it("keeps unmatched partners and raw invoice details for manual confirmation", async () => {
    db.query.mockResolvedValue([]);
    const result = await recognizeInvoiceFile({ fileName: "invoice.xls", bytes: Buffer.from(source), direction: "income" });
    expect(result.matches).toMatchObject({ issuerUnitId: "", receiverCustomerId: "" });
    expect(recognizedInvoiceFields(result, { currency: "USD", exchangeRate: "1" })).toMatchObject({
      sellerName: "HK WANZHONG TECHNOLOGY LIMITED", customerName: "Customer Limited", customerContact: "王甲", paymentTermDays: "7" });
  });

  it("leaves actual receipts and confirmed source bill identity out of the update", async () => {
    const result = await recognizeInvoiceFile({ fileName: "invoice.xlsx", bytes: Buffer.from(source) });
    const fields = recognizedInvoiceFields(result, { currency: "USD", exchangeRate: "1" });
    expect(fields).not.toHaveProperty("period");
    expect(fields).not.toHaveProperty("collected");
    expect(fields).not.toHaveProperty("collectionDate");
    expect(fields).not.toHaveProperty("repaymentAmount");
    expect(fields).not.toHaveProperty("confirmed");
  });
});
