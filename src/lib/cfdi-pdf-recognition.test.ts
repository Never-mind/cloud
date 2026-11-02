import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRows: vi.fn(), extractPdfLayoutPages: vi.fn() }));
vi.mock("./db", () => ({ queryRows: mocks.queryRows }));
vi.mock("./pdf-text-extract", () => ({ extractPdfLayoutPages: mocks.extractPdfLayoutPages }));
import { recognizeInvoiceFile } from "./invoice-recognition-service";
import { recognizedInvoiceFields } from "./invoice-recognition-fill";
import { validateInvoiceReview } from "./invoice-review";

// Contalink 票面结构，匿名化双方名称和 RFC；保留零折扣、换行和金额以覆盖实际故障。
const template = `FACTURA
FOLIO: F116
FECHA EXP: 10-11-2025 10:42:17
UUID: 11111111-2222-3333-4444-555555555555
CERTIFICADO 00001000000515381943
TIPO: I INGRESO
DEMO ISSUER
RFC: AAA010101AAA
DEMO CUSTOMER MEXICO
Uso CFDI: G03 GASTOS EN GENERAL
Moneda: USD
BBB020202BBB
Tipo de Cambio: 18.6233
TasaOCuota: 0.160000 Importe Impuesto: 188.97
Entrega en: SUBTOTAL 1,181.09
DESCUENTO 0.00
TRASLADO IVA 188.97
( UN MIL TRESCIENTOS SETENTA DOLARES 06/100 USD ) TOTAL A PAGAR 1,370.06
CADENA ORIGINAL DEL TIMBRE
||4.0|F|F116|2025-11-10T10:42:17|03|00001000000515381943|1181.09|0.00|USD|18.6233|1370.06|I|01|PUE|11529|AAA010101AAA|DEMO ISSUER|601|BBB020202BBB|DEMO CUSTOMER
MEXICO|05348|601|G03|43212201|Huawei|1.0|E48|Computing Power Service:
DEMO-ITEM|1181.09|1181.09|0.00|02|1181.09|002|Tasa|0.160000|188.97|1181.09|002|Tasa|0.160000|188.97|188.97||`;

beforeEach(() => {
  mocks.queryRows.mockReset();
  mocks.extractPdfLayoutPages.mockReset();
  mocks.queryRows.mockImplementation(async (sql: string) => {
    if (sql.includes("undertaking_units")) return [{ id: "unit-1", name: "本地承接单位", taxNumber: "AAA010101AAA", paymentTermDays: "30" }];
    if (sql.includes("customers")) return [{ id: "customer-1", name: "本地客户", taxNumber: "BBB020202BBB" }];
    if (sql.includes("suppliers")) return [];
    throw new Error(`Unexpected query: ${sql}`);
  });
});

describe("CFDI PDF recognition and shared statement filling", () => {
  it.each([true, false])("matches both parties by RFC and fills the whole invoice, zero discount present=%s", async hasDiscount => {
    const source = hasDiscount ? template : template.replace("DESCUENTO 0.00\n", "").replace("|1181.09|0.00|USD|", "|1181.09|USD|");
    mocks.extractPdfLayoutPages.mockResolvedValue([{ text: source, rows: [] }]);
    const result = await recognizeInvoiceFile({ fileName: "contalink.pdf", bytes: Buffer.from("%PDF-mocked-text-layer"), direction: "income" });
    expect(result.source).toBe("墨西哥 CFDI PDF");
    expect(result.partyMatches?.issuerUnit).toMatchObject({ id: "unit-1", status: "matched", via: "税号" });
    expect(result.partyMatches?.receiverCustomer).toMatchObject({ id: "customer-1", status: "matched", via: "税号" });
    expect(result.warnings).toEqual([]);
    expect(result.form).toMatchObject({ companyEntityId: "unit-1", invoiceEntityId: "customer-1", invoiceTotal: "1370.06" });
    const fields = recognizedInvoiceFields(result, { currency: "CNY", exchangeRate: "7" });
    expect(fields).toMatchObject({
      invoiceNo: "F116", invoiceDate: "2025-11-10", currency: "USD", exchangeRate: "1",
      amountExcludingTax: "1181.09", taxAmount: "188.97", taxRate: "16", amountIncludingTax: "1370.06",
      customerId: "customer-1", undertakingUnitId: "unit-1", customerTaxNumber: "BBB020202BBB",
      sellerName: "DEMO ISSUER", customerName: "DEMO CUSTOMER MEXICO",
    });
    expect(validateInvoiceReview(fields)).toBe("");
  });
});
