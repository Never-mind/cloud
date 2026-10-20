/**
 * 墨西哥 CFDI 发票 PDF（文字层）解析。
 *
 * 两条路：
 *   1. 票面带 CFDI 4.0 的"原串"（||4.0|Serie|Folio|Fecha|… 竖线分隔）→ 按位置精确取值，
 *      这是最稳的，PDF 换模板也认；
 *   2. 没有原串的模板（比如华为自己出的 PDF）→ 按 Fecha / Emisor / Receptor / SubTotal 等标签兜底。
 *
 * 能拿到 XML 时优先用 XML（`parseCfdiInvoice`，属性解析、零误差），PDF 这条路是给"只有 PDF"的情况用的。
 */
import { buildCfdiInvoiceNumber } from "./cfdi-invoice-parser";

export type CfdiPdfInvoice = {
  version: string;
  serie: string;
  folio: string;
  /** 展示用票号：Folio 自带 Serie 前缀时直接用 Folio（如 F200），否则拼 Serie + Folio */
  fullNumber: string;
  uuid: string;
  invoiceDate: string;
  issuerName: string;
  issuerTaxNumber: string;
  receiverName: string;
  receiverTaxNumber: string;
  currency: string;
  exchangeRate: string;
  amountExcludingTax: number | null;
  taxAmount: number | null;
  totalIncludingTax: number | null;
  taxRate: number | null;
  /** 原串路径命中，字段可信度高 */
  exact: boolean;
};

const RFC_PATTERN = "[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function number(value: unknown) {
  const parsed = Number(text(value).replace(/[,\s$]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanupName(value: unknown) {
  return text(value).replace(/\s{2,}/g, " ").trim();
}

function isoFromDmy(day: string, month: string, year: string) {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** 票面的"原串"会被 PDF 换行切断（长抬头名称尤其明显），先取整段再把换行还原成空格。 */
function readCadenaParts(source: string) {
  const start = source.indexOf("||4.0|");
  if (start < 0) return null;
  const end = source.indexOf("||", start + 5);
  const parts = source.slice(start, end < 0 ? start + 900 : end).replace(/\s*\n\s*/g, " ").split("|");
  return parts.length > 23 && parts[2] === "4.0" ? parts : null;
}

export function parseCfdiInvoiceText(source: string): CfdiPdfInvoice {
  const content = text(source);
  if (!content) throw new Error("发票文件没有文字层，无法识别");
  const parts = readCadenaParts(content);
  const uuid = /UUID\s*[:：]\s*([0-9A-Fa-f-]{36})/.exec(content)?.[1]
    ?? /Folio Fiscal\s*\n\s*([0-9a-fA-F-]{36})/.exec(content)?.[1]
    ?? "";
  const currency = (/Moneda\s*[:：]\s*([A-Z]{3})/i.exec(content)?.[1] ?? "").toUpperCase();

  if (parts) {
    // 原串位置（CFDI 4.0）：2=版本 3=Serie 4=Folio 5=开票时间 8=小计 9=币种 10=汇率 11=总额 16/17=开票方 19/20=收票方
    const [, , version, serie, folio, issuedAt, , , subtotal, currencyCode, cadenaRate, total, , , , , issuerRfc, issuerName, , receiverRfc, receiverName] = parts;
    const taxAmount = /TRASLADO IVA\s*([\d,]+\.\d{2})/.exec(content)?.[1] ?? "";
    return {
      version,
      serie,
      folio,
      fullNumber: buildCfdiInvoiceNumber(serie, folio),
      uuid,
      invoiceDate: text(issuedAt).slice(0, 10),
      issuerName: cleanupName(issuerName),
      issuerTaxNumber: issuerRfc,
      receiverName: cleanupName(receiverName),
      receiverTaxNumber: receiverRfc,
      currency: currencyCode || currency,
      exchangeRate: cadenaRate ?? "",
      amountExcludingTax: number(subtotal),
      taxAmount: number(taxAmount),
      totalIncludingTax: number(total),
      taxRate: resolveTaxRate(content, number(subtotal), number(taxAmount)),
      exact: true,
    };
  }

  // 没有原串的模板：按标签兜底
  const dateMatch = /Fecha\s*[:：]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(content);
  const issuer = new RegExp(`Emisor[\\s\\S]{0,40}?Nombre\\s*[:：]\\s*(.+?)\\s+RFC\\s*[:：]\\s*(${RFC_PATTERN})`).exec(content);
  const receiver = new RegExp(`Receptor[\\s\\S]{0,40}?Nombre\\s*[:：]\\s*(.+?)\\s+RFC\\s*[:：]\\s*(${RFC_PATTERN})`).exec(content);
  const totals = /SubTotal\s*\$\s*([\d,]+\.\d{2})[\s\S]{0,240}?IVA\((\d+(?:\.\d+)?)%\)[^0-9]{0,40}([\d,]+\.\d{2})[\s\S]{0,80}?Total Comprobante\s*\$\s*([\d,]+\.\d{2})/.exec(content);
  const serie = /Serie\s*[:：]\s*([A-Z0-9]{1,10})/i.exec(content)?.[1]
    ?? /Serie\s*\n\s*([A-Z0-9]{1,10})/i.exec(content)?.[1]
    ?? /FOLIO\s*[:：]\s*([A-Za-z]+)(?=\s*-|\s*$)/i.exec(content)?.[1]
    ?? "";
  const folio = /Tipo de Comprobante[^\n]*?\bV?\d\.\d\s+([0-9]{1,15})/i.exec(content)?.[1]
    ?? /(?:^|\n)\s*Folio\s*[:：]\s*\n?\s*([0-9]{1,20})\b/i.exec(content)?.[1]
    ?? /FOLIO\s*[:：][ \t]*([A-Za-z0-9-]{1,20})/i.exec(content)?.[1]
    ?? "";
  if (!totals && !dateMatch && !issuer) throw new Error("不是可识别的 CFDI 发票");
  return {
    version: /Comprobante\s*[:：]?[^\n]*?\b(\d\.\d)\b/.exec(content)?.[1] ?? "4.0",
    serie: /^FOLIO/.test(serie) ? "" : serie,
    folio,
    fullNumber: buildCfdiInvoiceNumber(serie, folio),
    uuid,
    invoiceDate: dateMatch ? isoFromDmy(dateMatch[1], dateMatch[2], dateMatch[3]) : "",
    issuerName: cleanupName(issuer?.[1] ?? ""),
    issuerTaxNumber: issuer?.[2] ?? "",
    receiverName: cleanupName(receiver?.[1] ?? ""),
    receiverTaxNumber: receiver?.[2] ?? "",
    currency,
    exchangeRate: (
      /exchange[\s\S]{0,160}?rate\s*[=:]\s*([\d.]+)/i.exec(content)?.[1]
      ?? /\brate\s*=\s*([\d.]+)/i.exec(content)?.[1]
      ?? /(?:Tipo\s*(?:de\s*)?[Cc]ambio|TipoCambio)\s*[:：]?\s*([\d.,]+)/i.exec(content)?.[1]
      ?? ""
    ).replace(/,/g, ""),
    amountExcludingTax: totals ? number(totals[1]) : null,
    taxAmount: totals ? number(totals[3]) : null,
    totalIncludingTax: totals ? number(totals[4]) : null,
    taxRate: totals ? number(totals[2]) : resolveTaxRate(content, null, null),
    exact: false,
  };
}

/**
 * 税率优先读票面（TasaOCuota 形如 0.160000 → 16%，或 IVA(16%)），
 * 读不到就用 税金 ÷ 小计 反算，避免某些模板不印税率。
 */
function resolveTaxRate(content: string, net: number | null, tax: number | null) {
  const explicit = /TasaOCuota\s*[:：]?\s*(0?\.\d+)/.exec(content)?.[1]
    ?? /IVA\(\s*(\d+(?:\.\d+)?)\s*%\s*\)/.exec(content)?.[1];
  if (explicit) {
    const value = Number(explicit);
    if (!Number.isFinite(value)) return null;
    // TasaOCuota 是小数（0.16），IVA(%) 已经是百分数（16）
    return value > 0 && value < 1 ? Number((value * 100).toFixed(2)) : value;
  }
  if (net && net > 0 && tax !== null && Number.isFinite(tax)) return Number(((tax / net) * 100).toFixed(2));
  return null;
}
