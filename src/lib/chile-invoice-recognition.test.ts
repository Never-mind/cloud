import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRows: vi.fn(), extractPdfLayoutPages: vi.fn() }));
vi.mock("./db", () => ({ queryRows: mocks.queryRows }));
vi.mock("./pdf-text-extract", () => ({ extractPdfLayoutPages: mocks.extractPdfLayoutPages }));
import { isChileInvoiceText, parseChileInvoicePages } from "./chile-invoice-parser";
import { recognizeInvoiceFile } from "./invoice-recognition-service";
import { recognizedInvoiceFields } from "./invoice-recognition-fill";
import { validateInvoiceReview } from "./invoice-review";

// 依照实际 pdfjs 行序保留左右栏交错、空电话、智利千位分隔符和 CEDIBLE 副本；主体信息匿名化。
const source = `R.U.T.:77.732.239- 7
DEMO ISSUER SPA
Giro: DESARROLLO Y MANTENCION DE
FACTURA ELECTRONICA
SOFTWARE
AV EXAMPLE 2687 OF 2301 Piso- LAS
Nº371
CONDES
S.I.I. - SANTIAGO ORIENTE
eMail : billing@example.com Telefono :
TIPO DE VENTA: DEL GIRO
SEÑOR(ES): DEMO CUSTOMER CHILE SPA Fecha Emision: 14 de Mayo del 2026
R.U.T.: 77.569.009- 7
GIRO: PROCESAMIENTO DE DATOS, HOSPEDAJE Y
DIRECCION: Example Norte 532 1101
COMUNA LAS CONDES CIUDAD: SANTIAGO
CONTACTO:
TIPO DE
DEL GIRO
COMPRA:
%Impto
Codigo Descripcion Cantidad Precio %Desc. Valor
Adic.*
- Computing Power Service 1 CLP 7.217.826 7.217.826
exchange rate 896.82
USD amount 9577.41
Forma de Pago:Crédito
MONTO NETO $ 7.217.826
I.V.A. 19% $ 1.371.387
IMPUESTO ADICIONAL $ 0
TOTAL $ 8.589.213
Timbre Electrónico SII
Res.99 de 2014 Verifique documento: www.sii.cl`;
const secondSource = source.replace("Nº371", "Nº372").replaceAll("7.217.826", "11.566.363")
  .replace("1.371.387", "2.197.609").replace("8.589.213", "13.763.972")
  .replace("896.82", "905.3147918622").replace("9577.41", "15203.52");
const pages = (content = source) => [{ text: content }, { text: `${content}\nNombre: ___ RUT: ___ Fecha: ___\nCEDIBLE` }];

beforeEach(() => {
  mocks.queryRows.mockReset();
  mocks.extractPdfLayoutPages.mockReset();
  mocks.queryRows.mockImplementation(async (sql: string) => {
    if (sql.includes("undertaking_units")) return [{ id: "unit-cl", name: "本地智利单位", taxNumber: "77732239-7", paymentTermDays: "45" }];
    if (sql.includes("customers")) return [{ id: "customer-cl", name: "本地智利客户", taxNumber: "77.569.009 - 7" }];
    if (sql.includes("suppliers")) return [];
    throw new Error(`Unexpected query: ${sql}`);
  });
});

describe("Chile electronic invoice parsing", () => {
  it.each([
    [source, "371", 7217826, 1371387, 8589213, "896.82", "9577.41"],
    [secondSource, "372", 11566363, 2197609, 13763972, "905.3147918622", "15203.52"],
  ] as const)("reads CLP totals once from the original and CEDIBLE copy, folio=%s", (content, invoiceNo, net, tax, total, rate, usd) => {
    expect(parseChileInvoicePages(pages(content))).toMatchObject({
      invoiceNo, invoiceDate: "2026-05-14", currency: "CLP", amountExcludingTax: net, taxRate: 19,
      taxAmount: tax, totalIncludingTax: total, exchangeRate: rate, usdAmount: usd,
      issuerName: "DEMO ISSUER SPA", issuerTaxNumber: "77.732.239-7",
      receiverName: "DEMO CUSTOMER CHILE SPA", receiverTaxNumber: "77.569.009-7",
      partyFields: { sellerAddress: "AV EXAMPLE 2687 OF 2301 Piso- LAS CONDES",
        customerAddress: "Example Norte 532 1101, LAS CONDES, SANTIAGO", sellerFinanceEmail: "billing@example.com" },
    });
  });

  it("does not consume the following label for empty telephone/contact or invent payment days", () => {
    const parsed = parseChileInvoicePages(pages());
    expect(parsed.partyFields).not.toHaveProperty("sellerTelephone");
    expect(parsed.partyFields).not.toHaveProperty("customerContact");
    expect(parsed).not.toHaveProperty("paymentTermDays");
    expect(parsed).not.toHaveProperty("dueDate");
    expect(parsed).not.toHaveProperty("servicePeriod");
    expect(parsed.comment).toContain("付款方式：Crédito");
  });

  it("accepts a single original page, accents, normalized folio symbol and unformatted RUT", () => {
    const content = source.normalize("NFKC").replace("Emision", "Emisión")
      .replace("77.732.239- 7", "77732239-7").replace("77.569.009- 7", "77569009-7");
    expect(parseChileInvoicePages([{ text: content }])).toMatchObject({ invoiceNo: "371", invoiceDate: "2026-05-14", issuerTaxNumber: "77732239-7" });
  });

  it("supports Spanish month names and validates dates", () => {
    const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    for (const [index, month] of months.entries()) {
      expect(parseChileInvoicePages(pages(source.replace("Mayo", month))).invoiceDate).toBe(`2026-${String(index + 1).padStart(2, "0")}-14`);
    }
    expect(() => parseChileInvoicePages(pages(source.replace("14 de Mayo", "31 de Febrero")))).toThrow("开票日期");
  });

  it("requires Chile/SII identifiers instead of matching every Spanish FACTURA", () => {
    expect(isChileInvoiceText(source)).toBe(true);
    expect(isChileInvoiceText("FACTURA\nCFDI 4.0\nRFC: AAA010101AAA\nMONTO NETO 100")).toBe(false);
    expect(() => parseChileInvoicePages([{ text: "FACTURA CFDI" }])).toThrow("不是可识别");
  });

  it("keeps USD reference data optional without changing the CLP invoice currency", () => {
    const parsed = parseChileInvoicePages(pages(source.replace("exchange rate 896.82\n", "").replace("USD amount 9577.41\n", "")));
    expect(parsed).toMatchObject({ currency: "CLP", exchangeRate: "", usdAmount: "", totalIncludingTax: 8589213 });
    expect(() => parseChileInvoicePages(pages(source.replace("1 CLP", "1 USD")))).toThrow("CLP 币种");
  });

  it.each([
    ["USD amount 9577.41", "9577.41"],
    ["Amount USD: 9,577.41", "9,577.41"],
    ["amount usd = US$ 15,203.52", "15,203.52"],
    ["Amount USD：$ 9.577,41", "9.577,41"],
    ["Amount USD\n9577.41", "9577.41"],
  ])("keeps the description's USD amount in remarks: %s", (label, usdAmount) => {
    const parsed = parseChileInvoicePages(pages(source.replace("USD amount 9577.41", label)));
    expect(parsed.usdAmount).toBe(usdAmount);
    expect(parsed.comment).toContain(`美金金额（Amount USD）：${usdAmount} USD`);
    expect(parsed.comment).toContain("票面汇率：1 USD = 896.82 CLP");
    expect(parsed).toMatchObject({ currency: "CLP", amountExcludingTax: 7217826, taxAmount: 1371387, totalIncludingTax: 8589213 });
  });

  it.each(["Amount USD:", "Amount USD: 9,57.41", "USD amount unknown", "CLP amount 8589213"])("does not guess or truncate a missing/invalid USD amount: %s", label => {
    const parsed = parseChileInvoicePages(pages(source.replace("USD amount 9577.41", label)));
    expect(parsed.usdAmount).toBe("");
    expect(parsed.comment).not.toContain("美金金额");
  });

  it("rejects a PDF with two different invoices or inconsistent copies", () => {
    expect(() => parseChileInvoicePages([{ text: source }, { text: secondSource }])).toThrow("多张不同");
    expect(() => parseChileInvoicePages([{ text: source }, { text: source.replace("DEMO CUSTOMER", "ANOTHER CUSTOMER") }])).toThrow("副本内容不一致");
  });

  it.each([
    ["MONTO NETO $ 7.217.826", "MONTO NETO $ 7.21.826", "未完整识别"],
    ["I.V.A. 19% $ 1.371.387", "I.V.A. 19% $", "未完整识别"],
    ["TOTAL $ 8.589.213", "TOTAL $ 17.178.426", "金额校验不通过"],
    ["I.V.A. 19%", "I.V.A. 18%", "金额校验不通过"],
    ["IMPUESTO ADICIONAL $ 0", "IMPUESTO ADICIONAL $ 100", "额外税金"],
  ])("rejects incomplete or inconsistent amounts: %s", (before, after, message) => {
    expect(() => parseChileInvoicePages(pages(source.replace(before, after)))).toThrow(message);
  });
});

describe("Chile recognition and shared cloud/service-fee invoice filling", () => {
  it.each([source, secondSource, source.replace("USD amount 9577.41", "Amount USD: 9,577.41")])("routes Chile before CFDI, matches RUT and fills the selected statement", async content => {
    mocks.extractPdfLayoutPages.mockResolvedValue(pages(content));
    const parsed = parseChileInvoicePages(pages(content));
    const recognition = await recognizeInvoiceFile({ fileName: `F${parsed.invoiceNo} SPARKOO.pdf`, bytes: Buffer.from("%PDF-mocked"), direction: "income" });
    expect(recognition).toMatchObject({ source: "智利电子发票 PDF", exact: true, warnings: [],
      facts: { invoiceNo: parsed.invoiceNo, invoiceDate: "2026-05-14", currency: "CLP", taxRate: "19", taxUuid: "" },
      matches: { issuerUnitId: "unit-cl", receiverCustomerId: "customer-cl" },
      partyMatches: { issuerUnit: { status: "matched", via: "税号" }, receiverCustomer: { status: "matched", via: "税号" } },
    });
    expect(recognition.taxTreatment).toBeUndefined();
    const filled = recognizedInvoiceFields(recognition, { currency: "USD", exchangeRate: "1" });
    expect(filled).toMatchObject({
      invoiceNo: parsed.invoiceNo, currency: "CLP", exchangeRate: parsed.exchangeRate, invoiceDate: "2026-05-14",
      amountExcludingTax: String(parsed.amountExcludingTax), taxRate: "19", taxAmount: String(parsed.taxAmount), amountIncludingTax: String(parsed.totalIncludingTax),
      undertakingUnitId: "unit-cl", customerId: "customer-cl", customerTaxNumber: "77.569.009-7",
      sellerName: "DEMO ISSUER SPA", customerName: "DEMO CUSTOMER CHILE SPA",
      paymentTermDays: "45", dueDate: "2026-06-28",
    });
    expect(filled.comment).toContain(`美金金额（Amount USD）：${parsed.usdAmount} USD`);
    expect(validateInvoiceReview(filled)).toBe("");
    for (const key of ["period", "sourceId", "collected", "collectionDate", "confirmed"]) expect(filled).not.toHaveProperty(key);
  });

  it("preserves recognized parties for manual selection if local archives are missing", async () => {
    mocks.queryRows.mockResolvedValue([]);
    mocks.extractPdfLayoutPages.mockResolvedValue(pages());
    const recognition = await recognizeInvoiceFile({ fileName: "invoice.pdf", bytes: Buffer.from("%PDF-mocked"), direction: "income" });
    expect(recognition.matches).toMatchObject({ issuerUnitId: "", receiverCustomerId: "" });
    expect(recognition.warnings.join(" ")).toContain("未匹配到档案");
    expect(recognizedInvoiceFields(recognition, { currency: "USD", exchangeRate: "1" })).toMatchObject({
      sellerName: "DEMO ISSUER SPA", customerName: "DEMO CUSTOMER CHILE SPA", amountIncludingTax: "8589213", paymentTermDays: "30", dueDate: "2026-06-13",
    });
  });
});
