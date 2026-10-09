import { describe, expect, it } from "vitest";
import { parseCfdiInvoice, verifyInvoiceAgainstExpectation } from "./cfdi-invoice-parser";

/** 真实发票（Xtransfer F205）的 XML：只保留与解析相关的属性，结构一致。 */
const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Exportacion="01" Fecha="2026-10-08T18:48:56" Folio="F205" FormaPago="99" LugarExpedicion="11529" MetodoPago="PPD" Moneda="USD" NoCertificado="00001000000727948258" Serie="F" SubTotal="11424.00" TipoCambio="17.967" TipoDeComprobante="I" Total="13251.84" Version="4.0"><cfdi:Emisor Nombre="LUZ NEWMEDIA" RegimenFiscal="601" Rfc="LNE181206664"/><cfdi:Receptor DomicilioFiscalReceptor="64780" Nombre="XTRANSFER MEXICO" RegimenFiscalReceptor="601" Rfc="XME2412037R1" UsoCFDI="G03"/><cfdi:Conceptos><cfdi:Concepto Cantidad="1.0" ClaveProdServ="81111809" ClaveUnidad="XUN" Descripcion="Equipment procurement and installation" Importe="11424.00" NoIdentificacion="Equipment" ObjetoImp="02" ValorUnitario="11424.00"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="11424.00" Importe="1827.84" Impuesto="002" TasaOCuota="0.160000" TipoFactor="Tasa"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto></cfdi:Conceptos><cfdi:Impuestos TotalImpuestosTrasladados="1827.84"><cfdi:Traslados><cfdi:Traslado Base="11424.00" Importe="1827.84" Impuesto="002" TasaOCuota="0.160000" TipoFactor="Tasa"/></cfdi:Traslados></cfdi:Impuestos><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" FechaTimbrado="2026-10-08T18:50:43" RfcProvCertif="PPD101129EA3" UUID="D4752475-4E30-4EE8-AD15-F081095D5DB3" Version="1.1"/></cfdi:Complemento></cfdi:Comprobante>`;

describe("CFDI 发票 XML 解析", () => {
  it("解析票号、开票时间、金额、税金与 UUID", () => {
    const invoice = parseCfdiInvoice(FIXTURE);
    expect(invoice.version).toBe("4.0");
    expect(invoice.type).toBe("I");
    expect(invoice.serie).toBe("F");
    expect(invoice.folio).toBe("F205");
    expect(invoice.fullNumber).toBe("F-F205");
    expect(invoice.issuedAt).toBe("2026-10-08 18:48:56");
    expect(invoice.currency).toBe("USD");
    expect(invoice.exchangeRate).toBe(17.967);
    expect(invoice.subtotal).toBe(11424);
    expect(invoice.total).toBe(13251.84);
    expect(invoice.transferredTaxTotal).toBe(1827.84);
    expect(invoice.taxRate).toBe(16);
    expect(invoice.uuid).toBe("D4752475-4E30-4EE8-AD15-F081095D5DB3");
    expect(invoice.stampedAt).toBe("2026-10-08 18:50:43");
  });

  it("解析开票方与客户信息（含税制、邮编、用途码、付款方式）", () => {
    const invoice = parseCfdiInvoice(FIXTURE);
    expect(invoice.issuer).toEqual({ rfc: "LNE181206664", name: "LUZ NEWMEDIA", regime: "601" });
    expect(invoice.receiver).toEqual({
      rfc: "XME2412037R1", name: "XTRANSFER MEXICO", regime: "601", zipCode: "64780", cfdiUse: "G03",
    });
    expect(invoice.paymentForm).toBe("99");
    expect(invoice.paymentMethod).toBe("PPD");
    expect(invoice.expeditionZip).toBe("11529");
  });

  it("解析明细行", () => {
    const [concept] = parseCfdiInvoice(FIXTURE).concepts;
    expect(concept).toMatchObject({
      description: "Equipment procurement and installation",
      quantity: 1,
      unitPrice: 11424,
      amount: 11424,
      satProductCode: "81111809",
      identificationNumber: "Equipment",
    });
  });

  it("非 CFDI 文本直接报错", () => {
    expect(() => parseCfdiInvoice("<html>not an invoice</html>")).toThrow(/CFDI/);
  });
});

describe("发票与账单/审批的核验", () => {
  it("五项都对得上时没有差异", () => {
    const invoice = parseCfdiInvoice(FIXTURE);
    expect(verifyInvoiceAgainstExpectation(invoice, {
      total: 13251.84,
      issuerRfc: "LNE181206664",
      receiverRfc: "XME2412037R1",
      cfdiUse: "G03",
      paymentMethod: "PPD",
    })).toEqual([]);
  });

  it("金额不一致时会报出来（用于审批与发票对不上时的提示）", () => {
    const invoice = parseCfdiInvoice(FIXTURE);
    const issues = verifyInvoiceAgainstExpectation(invoice, { total: 13000 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ field: "含税金额", expected: "13000.00", actual: "13251.84" });
  });
});
