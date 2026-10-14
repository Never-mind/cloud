import type { ChinaVatInvoice } from "./china-vat-invoice-parser";

/**
 * 中国全电发票（数电票）XML 解析。
 *
 * 数电票的 XML 是"要素文件"，字段是结构化的，比 PDF 更准；但各地/各服务商的标签名不完全统一
 * （InvoiceNumber / EINumber、BuyerName / Gmfmc …），所以这里**按候选标签名逐个试**，
 * 取值时先看 Buyer/Seller 这样的分组节点，再退回全局搜索，避免同名标签串味。
 *
 * 税率可能是小数（0.01）也可能是百分数（1），统一归一成百分数。
 */

const BUYER_BLOCKS = ["BuyerInfo", "Buyer", "PurchaserInfo", "Purchaser", "BuyerInformation", "Gmfxx"];
const SELLER_BLOCKS = ["SellerInfo", "Seller", "SellersInfo", "Sellers", "SellerInformation", "Xsfxx"];

const INVOICE_NO_TAGS = ["EINumber", "InvoiceNumber", "InvoiceNo", "Fphm", "BillNumber", "InvoiceCodeAndNumber"];
const DATE_TAGS = ["IssueTime", "InvoiceDate", "IssueDate", "BillingTime", "Kprq", "InvoiceTime"];
const BUYER_NAME_TAGS = ["BuyerName", "Name", "PurchaserName", "Gmfmc", "Buyer"];
const BUYER_TAX_TAGS = ["BuyerIdNum", "BuyerTaxNumber", "BuyerTaxpayerId", "BuyerTaxNo", "BuyerTaxID", "BuyerTaxCode", "Nsrsbh", "Gmsh", "TaxNumber"];
const SELLER_NAME_TAGS = ["SellerName", "Name", "SellersName", "Xsfmc", "Seller"];
const SELLER_TAX_TAGS = ["SellerIdNum", "SellerTaxNumber", "SellerTaxpayerId", "SellerTaxNo", "SellerTaxID", "SellerTaxCode", "Nsrsbh", "Xssh", "TaxNumber"];
const TOTAL_TAGS = ["TotalAmWithTax", "TotalAmountWithTax", "TotalTaxIncludedAmount", "AmountWithTax", "TotalPriceTaxIncluded", "TotalIncludeTax", "Jshj"];
const NET_TAGS = ["TotalAmWithoutTax", "TotalAmountWithoutTax", "AmountWithoutTax", "TotalAmount", "TotalPrice", "Hjje", "Amount"];
const TAX_TAGS = ["TotalTax", "TotalTaxAmount", "TaxAmount", "TotalTaxInclAmount", "Hjse"];
const RATE_TAGS = ["TaxRate", "Sl", "Rate"];

function stripTags(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .trim();
}

function elementBody(source: string, names: string[]) {
  for (const name of names) {
    const matched = new RegExp(`<(?:[A-Za-z0-9_]*:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_]*:)?${name}>`, "i").exec(source);
    if (matched) return matched[1];
  }
  return "";
}

/** 先按分组节点找（Buyer/Seller），找不到再全局找；`Name` 这种通用标签只在分组里认。 */
function pickValue(source: string, blockNames: string[], tagNames: string[], allowGlobal: boolean) {
  const block = elementBody(source, blockNames);
  if (block) {
    const inBlock = stripTags(elementBody(block, tagNames));
    if (inBlock) return inBlock;
  }
  if (!allowGlobal) return "";
  for (const name of tagNames) {
    const matched = new RegExp(`<(?:[A-Za-z0-9_]*:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_]*:)?${name}>`, "i").exec(source);
    const value = matched ? stripTags(matched[1]) : "";
    if (value) return value;
  }
  return "";
}

function toNumber(value: string) {
  const parsed = Number(value.replace(/[,¥\s%]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** 税率归一到百分数：0.01 → 1，1 → 1，13% → 13。 */
function normalizeRate(value: string) {
  const numeric = toNumber(value);
  if (numeric === null) return null;
  if (/%/.test(value)) return numeric;
  return numeric > 0 && numeric < 1 ? Number((numeric * 100).toFixed(2)) : numeric;
}

function normalizeDate(value: string) {
  const dashed = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  if (dashed) return `${dashed[1]}-${dashed[2].padStart(2, "0")}-${dashed[3].padStart(2, "0")}`;
  const chinese = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(value);
  if (chinese) return `${chinese[1]}-${chinese[2].padStart(2, "0")}-${chinese[3].padStart(2, "0")}`;
  const compact = /^(\d{4})(\d{2})(\d{2})/.exec(value.replace(/\D/g, ""));
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return "";
}

export function parseChinaEinvoiceXml(xml: string): ChinaVatInvoice {
  const source = String(xml ?? "").trim();
  if (!source || !/^</.test(source)) throw new Error("不是有效的 XML 文件");
  if (/cfdi:|Comprobante/i.test(source)) throw new Error("这是墨西哥 CFDI 的 XML，不是数电票");

  const invoiceNo = pickValue(source, [], INVOICE_NO_TAGS, true).replace(/\s/g, "");
  const invoiceDate = normalizeDate(pickValue(source, [], DATE_TAGS, true));
  if (!invoiceNo && !invoiceDate) throw new Error("不是可识别的数电票 XML（没找到发票号码或开票日期）");

  const total = toNumber(pickValue(source, [], TOTAL_TAGS, true));
  const net = toNumber(pickValue(source, [], NET_TAGS, true));
  const tax = toNumber(pickValue(source, [], TAX_TAGS, true));
  const taxRate = normalizeRate(pickValue(source, ["Goods", "InvoiceLine", "GoodsInfo", "InvoiceLines"], RATE_TAGS, true));
  const typeText = pickValue(source, [], ["InvoiceType", "EIType", "Fplx", "InvoiceKind"], true);

  return {
    kind: /专/.test(typeText) ? "专用发票" : /普/.test(typeText) ? "普通发票" : "数电票（全电发票）",
    invoiceNo,
    invoiceDate,
    buyerName: pickValue(source, BUYER_BLOCKS, BUYER_NAME_TAGS, true),
    buyerTaxNumber: pickValue(source, BUYER_BLOCKS, BUYER_TAX_TAGS, true),
    sellerName: pickValue(source, SELLER_BLOCKS, SELLER_NAME_TAGS, true),
    sellerTaxNumber: pickValue(source, SELLER_BLOCKS, SELLER_TAX_TAGS, true),
    amountExcludingTax: net,
    taxAmount: tax,
    totalIncludingTax: total ?? (net === null ? null : Number((net + (tax ?? 0)).toFixed(2))),
    taxRate,
    taxExempt: tax === 0 && Number(taxRate) === 0,
    currency: "CNY",
  };
}
