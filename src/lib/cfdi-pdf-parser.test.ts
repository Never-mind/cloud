import { describe, expect, it } from "vitest";
import { parseCfdiInvoiceText } from "./cfdi-pdf-parser";

/** 带票面原串的模板（原串里的长抬头会被 PDF 换行切断，样例保留了这个断行）。 */
const CADENA_TEMPLATE = `FACTURA
FOLIO: F200
FECHA EXP: 29-09-2026 12:25:17
UUID: C4789601-30C6-48A6-9548-0EB20C1FC4FE
CERTIFICADO 00001000000727948258
TIPO: I INGRESO
DEMO ISSUER SA
RFC: AAA010101AAA
DEMO CUSTOMER
Uso CFDI: G01 ADQUISICIÓN DE MERCANCIAS
Moneda: USD
BBB020202BBB
Tipo de Cambio: 17.8413
SUBTOTAL 13,515.90
TRASLADO IVA 2,162.54
TOTAL A PAGAR 15,678.44
CADENA ORIGINAL DEL TIMBRE
||4.0|F|F200|2026-09-29T12:25:17|99|00001000000727948258|13515.90|USD|17.8413|15678.44|I|01|PPD|11529|AAA010101AAA|DEMO ISSUER SA|601|BBB020202BBB|DEMO CUSTOMER
MEXICO|06500|601|G01|43211501|Demo Server|1.0|H87|F5 Server|13515.90|13515.90|02|13515.90|002|Tasa|0.160000|2162.54|13515.90|002|Tasa|0.160000|2162.54|2162.54||`;

/** 没有原串的模板：按标签兜底（Folio 换行、Serie 换行都是真实版式的坑）。 */
const LABEL_TEMPLATE = `Fecha: 01/09/2026 Serie:
B
Lugar de Expedicion: 05348
Folio:
Tipo de Comprobante: Ingreso 4.0 122917
Emisor
Nombre : DEMO SUPPLIER SA RFC : CCC030303CCC
Regimen Fiscal : 601 - General de Ley Personas Morales
Receptor
Nombre : DEMO BUYER SA RFC : DDD040404DDD
Uso CFDI : G01 - Adquisición de Mercancías Reg. Fiscal: 601 - General de Ley Personas Morales
Datos Generales del Comprobante
Moneda : USD Forma de pago :99 - Por definir
Tipo cambio : 17.01 Condiciones de pago : 7 Días
Partidas del Comprobante
81141800 DEMO-ITEM 2.00 02 E48 Unidad de $ 870.00 0.00 IVA(16%) VENTAS $ 1740.00
Importe con letra SubTotal $ 1,740.00
DOS MIL DIECIOCHO PUNTO CUARENTA DÓLARES IVA(16%) VENTAS $ 278.40
Total Comprobante $ 2,018.40
DATOS DE CFDI
Folio Fiscal
535f813b-0eb0-4771-a11b-3a2c6102c56c`;

describe("CFDI PDF 解析", () => {
  it("有票面原串时按位置精确取值（换行也能还原）", () => {
    const invoice = parseCfdiInvoiceText(CADENA_TEMPLATE);
    expect(invoice.exact).toBe(true);
    expect(invoice.version).toBe("4.0");
    expect(invoice.fullNumber).toBe("F200");
    expect(invoice.uuid).toBe("C4789601-30C6-48A6-9548-0EB20C1FC4FE");
    expect(invoice.invoiceDate).toBe("2026-09-29");
    expect(invoice.issuerName).toBe("DEMO ISSUER SA");
    expect(invoice.issuerTaxNumber).toBe("AAA010101AAA");
    expect(invoice.receiverName).toBe("DEMO CUSTOMER MEXICO");
    expect(invoice.receiverTaxNumber).toBe("BBB020202BBB");
    expect(invoice.currency).toBe("USD");
    expect(invoice.amountExcludingTax).toBe(13515.9);
    expect(invoice.taxAmount).toBe(2162.54);
    expect(invoice.totalIncludingTax).toBe(15678.44);
    expect(invoice.taxRate).toBe(16);
  });

  it("没有原串的模板按标签读，Serie+Folio 组成票号、UUID 单独读", () => {
    const invoice = parseCfdiInvoiceText(LABEL_TEMPLATE);
    expect(invoice.exact).toBe(false);
    expect(invoice.fullNumber).toBe("B122917");
    expect(invoice.uuid).toBe("535f813b-0eb0-4771-a11b-3a2c6102c56c");
    expect(invoice.invoiceDate).toBe("2026-09-01");
    expect(invoice.issuerName).toBe("DEMO SUPPLIER SA");
    expect(invoice.issuerTaxNumber).toBe("CCC030303CCC");
    expect(invoice.receiverName).toBe("DEMO BUYER SA");
    expect(invoice.receiverTaxNumber).toBe("DDD040404DDD");
    expect(invoice.amountExcludingTax).toBe(1740);
    expect(invoice.taxAmount).toBe(278.4);
    expect(invoice.totalIncludingTax).toBe(2018.4);
    expect(invoice.taxRate).toBe(16);
  });

  it("Folio 自带 Serie 前缀时不再重复拼", () => {
    const invoice = parseCfdiInvoiceText(CADENA_TEMPLATE.replace("|F|F200|", "|F|200|"));
    expect(invoice.fullNumber).toBe("F200");
  });

  it("不是 CFDI 的文件直接报错", () => {
    expect(() => parseCfdiInvoiceText("一张普通的表格")).toThrow(/CFDI/);
  });
});
