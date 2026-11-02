import type { InvoicePartyFields } from "./invoice-party-fields";

export type ChileInvoice = {
  invoiceNo: string;
  invoiceDate: string;
  issuerName: string;
  issuerTaxNumber: string;
  receiverName: string;
  receiverTaxNumber: string;
  currency: "CLP";
  exchangeRate: string;
  usdAmount: string;
  amountExcludingTax: number;
  taxRate: number;
  taxAmount: number;
  totalIncludingTax: number;
  partyFields: InvoicePartyFields;
  comment: string;
};

const MONTHS: Record<string, string> = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
  julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
};
const RUT = /R\s*\.?\s*U\s*\.?\s*T\s*\.?\s*:\s*((?:\d{1,2}(?:\.\d{3}){2}|\d{7,8})\s*-\s*[\dK])/i;
const FOLIO = /(?:^|\n)\s*N(?:[º°o.]|ro\.?)\s*:?\s*(\d+)\s*(?=\n|$)/i;
const CUSTOMER = /SE[ÑN]OR\s*(?:\(ES\)|ES)?\s*:/i;

function text(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\r/g, "").trim();
}

function plain(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/** CLP 票面用点分隔千位，逗号才是小数点；不能沿用美元金额的解析规则。 */
function amount(value: string | undefined): number | null {
  if (!value || !/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value)) return null;
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isSafeInteger(parsed) || (Number.isFinite(parsed) && parsed >= 0 && parsed < Number.MAX_SAFE_INTEGER) ? parsed : null;
}

function labeledAmount(content: string, label: string) {
  return amount(new RegExp(`(?:^|\\n)\\s*${label}\\s*:?\\s*(?:CLP\\s*)?\\$?\\s*([\\d.]+(?:,\\d{1,2})?)(?=\\s|$)`, "i").exec(content)?.[1]);
}

/** 描述中的美元参考金额保留票面格式，兼容两种标签及英／西文数字分隔符。 */
function descriptionUsdAmount(content: string) {
  const value = /\b(?:USD\s+amount|amount\s+USD)\b\s*[:：=]?\s*(?:US\s*\$|\$)?\s*(\d[\d.,]*)/i.exec(content)?.[1] ?? "";
  return /^(?:\d+(?:[.,]\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?)$/.test(value) ? value : "";
}

function invoiceDate(content: string) {
  const match = /Fecha\s+(?:de\s+)?Emisi[oó]n\s*:\s*(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+del?\s+(\d{4})/i.exec(content);
  const month = match && MONTHS[plain(match[2]).toLowerCase()];
  if (!match || !month) return "";
  const date = `${match[3]}-${month}-${match[1].padStart(2, "0")}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : "";
}

export function isChileInvoiceText(content: string) {
  const normalized = plain(content);
  return /FACTURA\s+ELECTRONICA/i.test(normalized)
    && RUT.test(normalized)
    && /MONTO\s+NETO/i.test(normalized)
    && /S\.?\s*I\.?\s*I\.?|Timbre\s+Electronico\s+SII/i.test(normalized);
}

function parseChileInvoiceText(source: string): ChileInvoice {
  const content = text(source);
  const receiverStart = CUSTOMER.exec(content);
  if (!isChileInvoiceText(content) || !receiverStart) throw new Error("不是可识别的智利电子发票");
  const header = content.slice(0, receiverStart.index);
  const receiver = content.slice(receiverStart.index + receiverStart[0].length);
  const invoiceNo = FOLIO.exec(header)?.[1] ?? "";
  const date = invoiceDate(content);
  const issuerTaxNumber = RUT.exec(header)?.[1].replace(/\s+/g, "").toUpperCase() ?? "";
  const receiverTaxMatch = RUT.exec(receiver);
  const receiverTaxNumber = receiverTaxMatch?.[1].replace(/\s+/g, "").toUpperCase() ?? "";
  // 右侧红框与左侧主体信息会交错成行，先移除红框标签再读取名称和地址。
  const issuerLines = header.replace(RUT, "").replace(/FACTURA\s+ELECTR[OÓ]NICA/gi, "")
    .replace(FOLIO, "\n").replace(/S\.?\s*I\.?\s*I\.?\s*-?[^\n]*/gi, "")
    .split("\n").map(compact).filter(Boolean);
  const giroIndex = issuerLines.findIndex(line => /^Giro\s*:/i.test(line));
  const issuerName = giroIndex > 0 ? issuerLines.slice(0, giroIndex).join(" ") : "";
  const receiverName = receiverTaxMatch ? compact(receiver.slice(0, receiverTaxMatch.index)
    .replace(/Fecha\s+(?:de\s+)?Emisi[oó]n\s*:[^\n]*/gi, "")) : "";
  if (!invoiceNo || !date || !issuerName || !issuerTaxNumber || !receiverName || !receiverTaxNumber) {
    throw new Error("智利发票的票号、开票日期或双方名称／RUT 未完整识别，请核对原件或手工登记");
  }
  // 描述中的 USD amount 是参考金额；实际发票币种必须取明细里明确列出的 CLP。
  if (!/\bCLP\b/.test(content)) throw new Error("智利发票未明确列出 CLP 币种，请核对原件或手工登记");
  const net = labeledAmount(content, "MONTO\\s+NETO");
  const iva = /\bI\s*\.?\s*V\s*\.?\s*A\s*\.?\s*(\d+(?:[.,]\d+)?)\s*%\s*:?\s*\$?\s*([\d.]+(?:,\d{1,2})?)(?=\s|$)/i.exec(content);
  const rate = iva ? Number(iva[1].replace(",", ".")) : null;
  const tax = amount(iva?.[2]);
  const total = labeledAmount(content, "TOTAL");
  const additional = labeledAmount(content, "IMPUESTO\\s+ADICIONAL");
  if (net === null || tax === null || total === null || rate === null || rate < 0 || rate > 100) {
    throw new Error("智利发票的未税金额、IVA 税率、税金或总额未完整识别，请核对原件或手工登记");
  }
  if (/IMPUESTO\s+ADICIONAL/i.test(content) && additional !== 0) throw new Error("智利发票存在额外税金或额外税金未识别，请手工核对登记");
  if (Math.abs(net + tax - total) > 0.01 || Math.abs(Math.round(net * rate / 100) - tax) > 0.01) {
    throw new Error("智利发票金额校验不通过（未税金额、IVA 税金与含税总额不一致），请核对原件");
  }

  const addressStart = issuerLines.findIndex((line, index) => index > giroIndex && /^(?:DIRECCI[OÓ]N\s*:|AV(?:DA|ENIDA)?\.?\s|CALLE\s|PASAJE\s)/i.test(line));
  const addressLines = addressStart < 0 ? [] : issuerLines.slice(addressStart);
  const addressEnd = addressLines.findIndex(line => /^(?:e-?mail|Tel[eé]fono|TIPO\s+DE\s+VENTA)\s*:/i.test(line));
  const sellerAddress = (addressEnd < 0 ? addressLines : addressLines.slice(0, addressEnd)).join(" ").replace(/^DIRECCI[OÓ]N\s*:\s*/i, "");
  const customerStreet = /DIRECCI[OÓ]N\s*:\s*([^\n]+)/i.exec(receiver)?.[1].trim() ?? "";
  const location = /COMUNA\s*:?\s*([^\n]*?)\s+CIUDAD\s*:\s*([^\n]+)/i.exec(receiver);
  const email = /e-?mail\s*:\s*([^\s]+@[^\s]+)/i.exec(header)?.[1] ?? "";
  const phone = /Tel[eé]fono[ \t]*:[ \t]*([^\n]*)/i.exec(header)?.[1].trim() ?? "";
  const contact = /CONTACTO\s*:[ \t]*([^\n]*)/i.exec(receiver)?.[1].trim() ?? "";
  const exchangeRate = /exchange\s+rate\s+(\d+(?:\.\d+)?)/i.exec(content)?.[1] ?? "";
  const usdAmount = descriptionUsdAmount(content);
  const payment = /Forma\s+de\s+Pago[ \t]*:[ \t]*([^\n]*)/i.exec(content)?.[1].trim() ?? "";
  const partyFields: InvoicePartyFields = {
    sellerName: issuerName, customerName: receiverName, customerTaxNumber: receiverTaxNumber,
    ...(sellerAddress ? { sellerAddress } : {}),
    ...(customerStreet ? { customerAddress: [customerStreet, location?.[1].trim(), location?.[2].trim()].filter(Boolean).join(", ") } : {}),
    ...(email ? { sellerFinanceEmail: email } : {}), ...(phone ? { sellerTelephone: phone } : {}),
    ...(contact ? { customerContact: contact } : {}),
  };
  const comment = [
    ...(usdAmount ? [`美金金额（Amount USD）：${usdAmount} USD`] : []),
    ...(exchangeRate ? [`票面汇率：1 USD = ${exchangeRate} CLP`] : []),
    ...(payment ? [`付款方式：${payment}`] : []),
  ].join("；");
  return { invoiceNo, invoiceDate: date, issuerName, issuerTaxNumber, receiverName, receiverTaxNumber,
    currency: "CLP", exchangeRate, usdAmount, amountExcludingTax: net, taxRate: rate, taxAmount: tax,
    totalIncludingTax: total, partyFields, comment };
}

/** 正本和 CEDIBLE 副本只读一次；含多张不同发票的 PDF 必须拆开上传。 */
export function parseChileInvoicePages(pages: ReadonlyArray<{ text: string }>): ChileInvoice {
  const invoices = pages.filter(page => isChileInvoiceText(page.text)).map(page => parseChileInvoiceText(page.text));
  if (!invoices.length) throw new Error("不是可识别的智利电子发票");
  const first = invoices[0];
  const keys = ["invoiceNo", "invoiceDate", "issuerTaxNumber", "receiverTaxNumber", "issuerName", "receiverName",
    "currency", "exchangeRate", "usdAmount", "amountExcludingTax", "taxRate", "taxAmount", "totalIncludingTax"] as const;
  if (invoices.some(invoice => keys.some(key => invoice[key] !== first[key]))) {
    throw new Error("这个 PDF 包含多张不同的智利发票或副本内容不一致，请拆分后逐张上传");
  }
  return first;
}
