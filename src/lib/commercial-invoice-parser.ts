/**
 * 普通商业发票（非增值税发票）文字层解析。
 *
 * 当前覆盖达创精密智造（昆山）有限公司给海外主体的 Invoice 模板：
 *   Invoice No/发票号
 *   Invoice Date/开票日期
 *   Currency/币种
 *   TOTAL(币种): 金额
 *
 * 商业发票票面没有税率、税金、未税金额时保持 null，不默认按 0 处理；
 * 由识别结果提示业务人工确认。
 */

export type CommercialInvoice = {
  invoiceNo: string;
  invoiceDate: string;
  issuerName: string;
  receiverName: string;
  currency: string;
  totalIncludingTax: number | null;
  amountExcludingTax: number | null;
  taxAmount: number | null;
  taxRate: number | null;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function number(value: unknown) {
  const parsed = Number(text(value).replace(/[,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(year: string, month: string, day: string) {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function isDazhuangCommercialInvoiceText(source: string) {
  const content = text(source);
  return /达创精密智造/.test(content)
    && /Invoice\s*No\s*\/\s*发票号/i.test(content)
    && /TOTAL\s*\(\s*[A-Z]{3}\s*\)\s*[:：]/i.test(content);
}

export function parseDazhuangCommercialInvoiceText(source: string): CommercialInvoice {
  const content = text(source);
  if (!isDazhuangCommercialInvoiceText(content)) throw new Error("不是可识别的达创商业发票");

  const parties = /开票方[：:]\s*(.+?)\s+收票方[：:]\s*(.+)$/m.exec(content);
  const date = /Invoice\s*Date\s*\/\s*开票日期\s+(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/i.exec(content);
  const total = /TOTAL\s*\(\s*([A-Z]{3})\s*\)\s*[:：]\s*([\d,]+\.\d{2})/i.exec(content);
  const currency = /Currency\s*\/\s*币种\s+([A-Z]{3})/i.exec(content)?.[1]
    ?? total?.[1]
    ?? "";
  const invoiceNo = /Invoice\s*No\s*\/\s*发票号\s+([A-Za-z0-9-]+)/i.exec(content)?.[1] ?? "";
  const issuerName = text(parties?.[1]) || text(content.split(/\r?\n/)[0]);
  const receiverName = text(parties?.[2]);

  return {
    invoiceNo,
    invoiceDate: date ? isoDate(date[1], date[2], date[3]) : "",
    issuerName,
    receiverName,
    currency: currency.toUpperCase(),
    totalIncludingTax: total ? number(total[2]) : null,
    amountExcludingTax: null,
    taxAmount: null,
    taxRate: null,
  };
}
