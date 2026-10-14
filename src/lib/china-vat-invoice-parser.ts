/**
 * 中国增值税电子发票（电子发票（普通发票）/（专用发票）/全电票）文字层解析。
 *
 * 输入是 `extractPdfPages()` 抽出来的文字（按行还原过），字段全部按关键词定位，不写死坐标，
 * 所以同一版式换个开票服务商一般也能读。票面里没有的字段（记账日期、实收日期）不猜。
 */

export type ChinaVatInvoice = {
  /** 票种：普通发票 / 专用发票 / 增值税电子普通发票… */
  kind: string;
  invoiceNo: string;
  invoiceDate: string;
  buyerName: string;
  buyerTaxNumber: string;
  sellerName: string;
  sellerTaxNumber: string;
  /** 合计金额（不含税） */
  amountExcludingTax: number | null;
  taxAmount: number | null;
  totalIncludingTax: number | null;
  /** 百分数，如 1 表示 1% */
  taxRate: number | null;
  taxExempt: boolean;
  currency: "CNY";
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function number(value: unknown) {
  const parsed = Number(text(value).replace(/[,¥\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** 票面会把长名称断行成"宁永网络设 备 商行"，这里只压缩汉字之间的空白，英文名保留词间空格。 */
export function cleanupInvoiceName(value: unknown) {
  return text(value)
    .replace(/(?<=[\u4e00-\u9fff）)])\s+(?=[\u4e00-\u9fff（(])/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** 名称：买方名称 名称：卖方名称（个别版式卖方名前面的"销/售"会跑到下一行，所以不依赖它）。 */
function readParties(source: string) {
  // 用"标签位置"切分而不是正则一次性捕获：两个"名称："在同一行，捕获式正则会一口吃到最后。
  const markers = [...source.matchAll(/名\s*称\s*[:：]/g)];
  const parts = markers.map((marker, index) => {
    const start = (marker.index ?? 0) + marker[0].length;
    const end = index + 1 < markers.length ? (markers[index + 1].index ?? source.length) : source.length;
    return source.slice(start, end).split("\n")[0];
  });
  const buyerPart = parts[0] ?? "";
  const sellerPart = parts[1] ?? "";
  return { buyerName: cleanupInvoiceName(buyerPart), sellerName: cleanupInvoiceName(sellerPart) };
}

function readTaxNumbers(source: string) {
  return [...source.matchAll(/(?:统一社会信用代码|纳税人识别号)\s*\/?\s*(?:纳税人识别号)?\s*[:：]?\s*([0-9A-Z]{15,20})/g)]
    .map((match) => match[1]);
}

/** 明细区的税率：取"税率/征收率"列上的百分数，免税票写"免税"或"***"。 */
function readTaxRate(source: string) {
  const exempt = /免税/.test(source) || /合\s*计[\s\S]{0,40}?\*{2,}/.test(source);
  const percent = /(\d+(?:\.\d+)?)\s*%/.exec(source)?.[1];
  if (percent) return { taxRate: number(percent), taxExempt: false };
  return { taxRate: exempt ? 0 : null, taxExempt: exempt };
}

export function parseChinaVatInvoice(source: string): ChinaVatInvoice {
  const content = text(source);
  if (!content) throw new Error("发票文件没有文字层，无法识别");
  const kind = /电子发票（(普通发票|专用发票)）/.exec(content)?.[1]
    ?? /增值税电子(普通发票|专用发票)/.exec(content)?.[1]
    ?? "";
  const invoiceNo = /发票号码\s*[:：]?\s*([0-9]{8,25})/.exec(content)?.[1] ?? "";
  const dateMatch = /开票日期\s*[:：]?\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(content);
  if (!invoiceNo && !dateMatch) throw new Error("不是可识别的中国增值税电子发票");
  const { buyerName, sellerName } = readParties(content);
  const taxNumbers = readTaxNumbers(content);
  const summary = /合\s*计\s*¥\s*([\d,]+\.\d{2})\s*(?:¥\s*([\d,]+\.\d{2})|(\*{2,}))/.exec(content);
  const { taxRate, taxExempt } = readTaxRate(content);
  const amountExcludingTax = summary ? number(summary[1]) : null;
  const taxAmount = summary ? (summary[3] ? 0 : number(summary[2])) : null;
  // 价税合计直接抓"（小写）¥x"，抓不到就用 金额 + 税额 兜底（价税合计的定义就是这个）。
  const totalText = /（小写）\s*¥\s*([\d,]+\.\d{2})/.exec(content)?.[1];
  const totalIncludingTax = totalText
    ? number(totalText)
    : (amountExcludingTax === null ? null : Number((amountExcludingTax + (taxAmount ?? 0)).toFixed(2)));
  return {
    kind,
    invoiceNo,
    invoiceDate: dateMatch ? `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[3]).padStart(2, "0")}` : "",
    buyerName,
    buyerTaxNumber: taxNumbers[0] ?? "",
    sellerName,
    sellerTaxNumber: taxNumbers[1] ?? "",
    amountExcludingTax,
    taxAmount,
    totalIncludingTax,
    taxRate,
    taxExempt,
    currency: "CNY",
  };
}
