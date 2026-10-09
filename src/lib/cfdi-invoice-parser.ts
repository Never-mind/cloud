/**
 * 墨西哥 CFDI 发票 XML 解析（CFDI 3.3 / 4.0）。
 *
 * 开票流程里，审批人在审批意见里回传的发票是"PDF + XML"两份。XML 是结构化数据，
 * 票号、UUID、开票时间、金额、税金、双方税号都能精确解析（不需要 OCR），
 * PDF 只作为存档附件。
 *
 * 只做属性解析：CFDI 的字段几乎全在标签属性上，用属性正则比引 XML 库更稳、更轻。
 */

export type CfdiConcept = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  satProductCode: string;
  identificationNumber: string;
};

export type CfdiInvoice = {
  version: string;
  /** 票据类型：I=收入发票，E=贷记通知，P=收款收据 */
  type: string;
  serie: string;
  folio: string;
  /** 展示用的完整票号：Serie + Folio（如 F-F205） */
  fullNumber: string;
  /** 开票时间（CFDI Fecha），格式 YYYY-MM-DD HH:mm:ss */
  issuedAt: string;
  currency: string;
  exchangeRate: number | null;
  subtotal: number | null;
  discount: number | null;
  total: number | null;
  transferredTaxTotal: number | null;
  /** 主税率（百分数，如 16）；取不到为 null */
  taxRate: number | null;
  /** SAT 税务唯一标识 */
  uuid: string;
  /** SAT 盖章时间 */
  stampedAt: string;
  paymentForm: string;
  paymentMethod: string;
  expeditionZip: string;
  issuer: { rfc: string; name: string; regime: string };
  receiver: { rfc: string; name: string; regime: string; zipCode: string; cfdiUse: string };
  concepts: CfdiConcept[];
};

/**
 * 取标签里的某个属性值：先定位标签起始，再在标签内取属性。
 * 属性名前面必须是空白，否则 `Total="` 会误匹配到 `SubTotal="`。
 */
function attributeOfTag(xml: string, tagPattern: RegExp, attribute: string) {
  const tag = xml.match(tagPattern)?.[0] ?? "";
  return new RegExp(`(?:^|\\s)${attribute}="([^"]*)"`).exec(tag)?.[1] ?? "";
}

function numberOf(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** CFDI 时间形如 2026-10-08T18:48:56 → 2026-10-08 18:48:56 */
function normalizeDateTime(value: string) {
  return value.replace("T", " ").slice(0, 19);
}

export function parseCfdiInvoice(xml: string): CfdiInvoice {
  const source = String(xml ?? "").trim();
  if (!source.includes("cfdi:Comprobante")) throw new Error("不是有效的 CFDI 发票 XML");

  const comprobanteTag = /<cfdi:Comprobante\b[^>]*>/;
  const attribute = (name: string) => attributeOfTag(source, comprobanteTag, name);

  const serie = attribute("Serie");
  const folio = attribute("Folio");
  const uuid = attributeOfTag(source, /<tfd:TimbreFiscalDigital\b[^>]*>/, "UUID")
    || attributeOfTag(source, /<[a-zA-Z0-9]*:?TimbreFiscalDigital\b[^>]*>/, "UUID");

  const concepts = [...source.matchAll(/<cfdi:Concepto\b[^>]*>/g)].map((match) => {
    const tag = match[0];
    const read = (name: string) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1] ?? "";
    return {
      description: read("Descripcion"),
      quantity: numberOf(read("Cantidad")) ?? 0,
      unit: read("Unidad") || read("ClaveUnidad"),
      unitPrice: numberOf(read("ValorUnitario")) ?? 0,
      amount: numberOf(read("Importe")) ?? 0,
      satProductCode: read("ClaveProdServ"),
      identificationNumber: read("NoIdentificacion"),
    };
  });

  const trasladoRate = Number(/TasaOCuota="([0-9.]+)"/.exec(source)?.[1] ?? "");
  return {
    version: attribute("Version") || attribute("cfdi:Version"),
    type: attribute("TipoDeComprobante"),
    serie,
    folio,
    fullNumber: [serie, folio].filter(Boolean).join("-"),
    issuedAt: normalizeDateTime(attribute("Fecha")),
    currency: attribute("Moneda"),
    exchangeRate: numberOf(attribute("TipoCambio")),
    subtotal: numberOf(attribute("SubTotal")),
    discount: numberOf(attribute("Descuento")),
    total: numberOf(attribute("Total")),
    // 概念行里也有 <cfdi:Impuestos>（没有这个属性），所以直接在整份 XML 上找该属性
    transferredTaxTotal: numberOf(/(?:^|\s)TotalImpuestosTrasladados="([^"]*)"/.exec(source)?.[1] ?? ""),
    taxRate: Number.isFinite(trasladoRate) ? Math.round(trasladoRate * 10000) / 100 : null,
    uuid: uuid.toUpperCase(),
    stampedAt: normalizeDateTime(attributeOfTag(source, /<tfd:TimbreFiscalDigital\b[^>]*>/, "FechaTimbrado")),
    paymentForm: attribute("FormaPago"),
    paymentMethod: attribute("MetodoPago"),
    expeditionZip: attribute("LugarExpedicion"),
    issuer: {
      rfc: attributeOfTag(source, /<cfdi:Emisor\b[^>]*>/, "Rfc"),
      name: attributeOfTag(source, /<cfdi:Emisor\b[^>]*>/, "Nombre"),
      regime: attributeOfTag(source, /<cfdi:Emisor\b[^>]*>/, "RegimenFiscal"),
    },
    receiver: {
      rfc: attributeOfTag(source, /<cfdi:Receptor\b[^>]*>/, "Rfc"),
      name: attributeOfTag(source, /<cfdi:Receptor\b[^>]*>/, "Nombre"),
      regime: attributeOfTag(source, /<cfdi:Receptor\b[^>]*>/, "RegimenFiscalReceptor"),
      zipCode: attributeOfTag(source, /<cfdi:Receptor\b[^>]*>/, "DomicilioFiscalReceptor"),
      cfdiUse: attributeOfTag(source, /<cfdi:Receptor\b[^>]*>/, "UsoCFDI"),
    },
    concepts,
  };
}

/** 发票信息与单据的核验结果（金额/主体/客户/用途码/付款方式）。 */
export type InvoiceVerificationIssue = { field: string; expected: string; actual: string };

export function verifyInvoiceAgainstExpectation(
  invoice: CfdiInvoice,
  expected: { total?: number | null; issuerRfc?: string; receiverRfc?: string; cfdiUse?: string; paymentMethod?: string },
): InvoiceVerificationIssue[] {
  const issues: InvoiceVerificationIssue[] = [];
  const total = Number(expected.total ?? 0);
  if (Number.isFinite(total) && total > 0 && invoice.total !== null && Math.abs(total - invoice.total) > 0.01) {
    issues.push({ field: "含税金额", expected: total.toFixed(2), actual: invoice.total.toFixed(2) });
  }
  const rfc = String(expected.issuerRfc ?? "").trim().toUpperCase();
  if (rfc && invoice.issuer.rfc && rfc !== invoice.issuer.rfc.toUpperCase()) {
    issues.push({ field: "开票方税号", expected: rfc, actual: invoice.issuer.rfc });
  }
  const receiverRfc = String(expected.receiverRfc ?? "").trim().toUpperCase();
  if (receiverRfc && invoice.receiver.rfc && receiverRfc !== invoice.receiver.rfc.toUpperCase()) {
    issues.push({ field: "客户税号", expected: receiverRfc, actual: invoice.receiver.rfc });
  }
  const use = String(expected.cfdiUse ?? "").trim().toUpperCase();
  if (use && invoice.receiver.cfdiUse && use !== invoice.receiver.cfdiUse.toUpperCase()) {
    issues.push({ field: "CFDI 用途码", expected: use, actual: invoice.receiver.cfdiUse });
  }
  const method = String(expected.paymentMethod ?? "").trim().toUpperCase();
  if (method && invoice.paymentMethod && method !== invoice.paymentMethod.toUpperCase()) {
    issues.push({ field: "付款方式", expected: method, actual: invoice.paymentMethod });
  }
  return issues;
}
