/**
 * 新加坡商业发票（GST Invoice）解析。
 *
 * 典型版式：
 *   Invoice No : SG2609000101
 *   Invoice Date : 23-Sep-26
 *   Currency : USD
 *   GST (0%) : 0.00
 *   Sub-Total: 160,389.46
 *   Total: 160,389.46
 */

export type SingaporeInvoice = {
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  poNo: string;
  contractNo: string;
  paymentTerms: string;
  supplierName: string;
  supplierAddress: string;
  supplierGstRegNo: string;
  customerName: string;
  customerAddress: string;
  subtotal: number | null;
  gstRate: number | null;
  gstAmount: number | null;
  total: number | null;
  sgdTotal: number | null;
  usdSgdRate: string;
};

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function amount(value: unknown) {
  const parsed = Number(text(value).replace(/[,\s$]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value: string) {
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(text(value));
  if (!match) return "";
  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${month}-${match[1].padStart(2, "0")}`;
}

export function isSingaporeInvoiceText(content: string) {
  return /GST\s*Reg\s*No/i.test(content)
    && /Invoice\s*No\s*:/i.test(content)
    && /(?:Currency\s*Exchange\s*Rate|GST\s*\()/i.test(content);
}

export function parseSingaporeInvoiceText(source: string): SingaporeInvoice {
  const content = text(source);
  const invoiceNo = /Invoice\s*No\s*[:：]\s*([A-Za-z0-9-]+)/i.exec(content)?.[1] ?? "";
  if (!invoiceNo) throw new Error("不是可识别的新加坡商业发票");

  const invoiceDate = normalizeDate(/Invoice\s*Date\s*[:：]\s*([0-9]{1,2}-[A-Za-z]{3}-[0-9]{2,4})/i.exec(content)?.[1] ?? "");
  const dueDate = normalizeDate(/Due\s*Date\s*[:：]\s*([0-9]{1,2}-[A-Za-z]{3}-[0-9]{2,4})/i.exec(content)?.[1] ?? "");
  const currency = (/Currency\s*[:：]\s*([A-Z]{3})/i.exec(content)?.[1] ?? "USD").toUpperCase();
  const poNo = /PO\s*No\s*[:：]\s*([A-Za-z0-9-]+)/i.exec(content)?.[1] ?? "";
  const contractNo = /Contract\s*No\s*[:：]\s*([A-Za-z0-9-]+)/i.exec(content)?.[1] ?? "";
  const paymentTerms = /Payment\s*Terms?\s*[:：]\s*([^\n]+)/i.exec(content)?.[1]?.trim() ?? "";

  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const telIndex = lines.findIndex((line) => /^Tel\s*:/i.test(line));
  const supplierName = lines[0] ?? "";
  const supplierAddress = lines.slice(1, telIndex > 0 ? telIndex : Math.min(lines.length, 4)).join(", ");
  const supplierGstRegNo = /GST\s*Reg\s*No\s*[:：]\s*([A-Za-z0-9]+)/i.exec(content)?.[1] ?? "";

  const billTo = /Bill\s*To\s*:\s*([\s\S]*?)\s*Invoice\s*No/i.exec(content)?.[1] ?? "";
  const billLines = billTo.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const customerName = billLines[0] ?? "";
  const customerAddress = billLines.slice(1).join(", ");

  const subtotalText = /Sub-Total\s*[:：]\s*([\d,]+\.\d{2})/i.exec(content)?.[1] ?? "";
  const gstMatch = /GST\s*\(\s*([\d.]+)\s*%\s*\)\s*[:：]\s*([\d,]+\.\d{2})/i.exec(content);
  const totalText = /^Total\s*[:：]\s*([\d,]+\.\d{2})/im.exec(content)?.[1] ?? "";
  const sgdTotalText = /Total\s*=\s*SGD\s*([\d,]+\.\d{2})/i.exec(content)?.[1] ?? "";
  const rateMatch = /Currency\s*Exchange\s*Rate\s*1\s*([A-Z]{3})\s*=\s*([\d.]+)\s*([A-Z]{3})/i.exec(content);

  return {
    invoiceNo,
    invoiceDate,
    dueDate,
    currency,
    poNo,
    contractNo,
    paymentTerms,
    supplierName,
    supplierAddress,
    supplierGstRegNo,
    customerName,
    customerAddress,
    subtotal: amount(subtotalText),
    gstRate: gstMatch ? Number(gstMatch[1]) : null,
    gstAmount: gstMatch ? amount(gstMatch[2]) : null,
    total: amount(totalText),
    sgdTotal: amount(sgdTotalText),
    usdSgdRate: rateMatch ? rateMatch[2] : "",
  };
}
