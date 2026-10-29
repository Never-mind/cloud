import * as XLSX from "xlsx";
import { invoiceDueDate, resolveInvoicePaymentDates } from "./invoice-payment-terms";
import type { InvoicePartyFields } from "./invoice-party-fields";
import { joinPdfTextItems, type PdfLayoutPage } from "./pdf-text-extract";

type Cell = { x: number; text: string };
export type InvoiceTemplateRows = Cell[][];
export type HkwzInvoice = {
  invoiceNo: string; invoiceDate: string; dueDate: string; paymentTermDays: string;
  issuerName: string; receiverName: string; currency: string; total: number;
  servicePeriod: string; comment: string; partyFields: InvoicePartyFields;
  lines: Array<{ periodLabel: string; description: string; quantity: string; unitPrice: string; amount: string }>;
  warnings: string[];
};
const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const rowText = (row: Cell[]) => clean(row.map(cell => cell.text).join(" "));
const contentOf = (rows: InvoiceTemplateRows) => rows.map(rowText).join("\n");

export function isHkwzInvoiceText(text: string) {
  return /HK\s+WANZHONG\s+TECHNOLOGY\s+LIMITED/i.test(text)
    && /INV(?:OICE)?\s*No\s*\.?\s*[:：]?\s*[\w-]+/i.test(text)
    && /FROM\s+INVOICE\s+ADDRESS/i.test(text)
    && /Payment\s+Terms/i.test(text) && /Beneficiary[’']s\s+Bank/i.test(text);
}

export function hkwzPdfRows(pages: PdfLayoutPage[]): InvoiceTemplateRows {
  return pages.flatMap(page => page.rows.map(row => {
    // PDF 中标签和值可能由多个字形组成，按票面左右两栏合并，保留两栏边界。
    const header = page.rows.find(item => /FROM\s+INVOICE\s+ADDRESS/i.test(joinPdfTextItems(item.items)));
    const right = header?.items.find(item => /INVOICE/.test(item.str))?.transform[4];
    if (right === undefined) return row.items.map(item => ({ x: item.transform[4], text: item.str }));
    const sides = [row.items.filter(item => item.transform[4] < right - 2), row.items.filter(item => item.transform[4] >= right - 2)];
    return sides.filter(items => items.length).map(items => ({ x: items[0].transform[4], text: joinPdfTextItems(items) }));
  }));
}

function date(value: string) {
  const match = /\b(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})\b/.exec(value);
  if (!match) return "";
  const result = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  return invoiceDueDate(result, 0) ? result : "";
}

export function parseHkwzInvoice(rows: InvoiceTemplateRows): HkwzInvoice {
  const text = contentOf(rows);
  if (!isHkwzInvoiceText(text)) throw new Error("不是可识别的香港万众商业发票模板");
  const numbers = [...text.matchAll(/\bINV(?:OICE)?\s*No\s*\.?\s*[:：]?\s*([A-Za-z0-9_-]+)/gi)].map(match => match[1]);
  if (new Set(numbers).size !== 1) throw new Error("文件包含多张发票，请每次上传一张发票");
  const start = rows.findIndex(row => /FROM\s+INVOICE\s+ADDRESS/i.test(rowText(row)));
  const end = rows.findIndex((row, index) => index > start && /\bCONTACT\b/i.test(rowText(row)));
  const right = rows[start].find(cell => /INVOICE\s+ADDRESS/i.test(cell.text))?.x;
  if (right === undefined || end < 0) throw new Error("无法定位发票双方资料，请核对文件版式");
  const side = (row: Cell[], receiver: boolean) => row.filter(cell => receiver ? cell.x >= right - 0.01 : cell.x < right - 0.01);
  const parties = [false, true].map(receiver => rows.slice(start + 1, end)
    .flatMap(row => side(row, receiver).flatMap(cell => cell.text.split(/\r?\n/))).map(clean).filter(Boolean));
  const issuerName = parties[0][0] || "", receiverName = parties[1][0] || "";
  if (!/^HK\s+WANZHONG\s+TECHNOLOGY\s+LIMITED$/i.test(issuerName) || !receiverName) throw new Error("发票双方资料不完整，请核对原件");
  const labelled = (label: RegExp, receiver: boolean) => {
    const candidate = rows.map(row => rowText(side(row, receiver))).find(value => label.test(value));
    return candidate ? clean(candidate.replace(label, "")) : "";
  };
  const bank = (label: string) => clean(new RegExp(`Beneficiary[’']s\\s+${label}\\s*[:：]\\s*([^\\n]+)`, "i").exec(text)?.[1] || "");
  const invoiceDate = date(labelled(/^Invoice\s+Date\s*[:：]?\s*/i, false));
  const dueDate = date(labelled(/^Due\s+Date\s*[:：]?\s*/i, true));
  const terms = labelled(/^Payment\s+Terms\s*[:：]?\s*/i, true);
  const statedDays = /\b(\d+)\s*days?\s+after\s+invoice\s+issuing\s+date/i.exec(terms)?.[1] || "";
  if (!invoiceDate) throw new Error("未读到有效开票日期，请核对发票");
  const warnings: string[] = [];
  let paymentTermDays = statedDays;
  if (dueDate) {
    paymentTermDays = String(resolveInvoicePaymentDates({ invoiceDate, dueDate }, 30).paymentTermDays);
    if (statedDays && statedDays !== paymentTermDays) warnings.push(`票面到期日与 ${statedDays} 天付款期限不一致，暂按到期日计算，请核对`);
  }
  const totalMatch = /\bTotal\s+([A-Z]{3})\s*([\d,]+(?:\.\d+)?)/i.exec(text);
  const total = totalMatch ? Number(totalMatch[2].replace(/,/g, "")) : NaN;
  const currency = labelled(/^Currency\s*[:：]?\s*/i, false).toUpperCase() || totalMatch?.[1].toUpperCase() || "";
  if (!Number.isFinite(total) || !/^[A-Z]{3}$/.test(currency)) throw new Error("未读到有效的发票总额或币种，请核对原件");
  if (totalMatch && totalMatch[1].toUpperCase() !== currency) throw new Error("票面币种与合计币种不一致，请核对原件");
  const comment = /\bComment\s*[:：]\s*(.*?)(?:\s+Total\b|$)/im.exec(text)?.[1].trim() || "";
  const tableStart = rows.findIndex(row => /TIME\s+Description\s+Quantity\s+Unit\s+Price\s+Subtotal\s+Amount/i.test(rowText(row)));
  const tableEnd = rows.findIndex((row, index) => index > tableStart && /\bComment\s*[:：]|\bTotal\s+[A-Z]{3}/i.test(rowText(row)));
  const lines = rows.slice(tableStart + 1, tableEnd < 0 ? undefined : tableEnd).flatMap(row => {
    const match = /^(\d{4}[-/]\d{2})(?:[-/]\d{2})?\s+(.*?)\s*([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)$/.exec(rowText(row));
    return match ? [{ periodLabel: match[1].replace("/", "-"), description: match[2].trim(), quantity: match[3].replace(/,/g, ""), unitPrice: match[4].replace(/,/g, ""), amount: match[5].replace(/,/g, "") }] : [];
  });
  const periods = [...new Set(lines.map(line => line.periodLabel))];
  const commentPeriod = /\b(20\d{2})(0[1-9]|1[0-2])\b/.exec(comment);
  const servicePeriod = periods.length === 1 ? periods[0] : !periods.length && commentPeriod ? `${commentPeriod[1]}-${commentPeriod[2]}` : "";
  if (periods.length > 1) warnings.push("票面包含多个服务月份，请核对当前关联账单及发票分摊");
  if (lines.length && Math.abs(lines.reduce((sum, line) => sum + Number(line.amount), 0) - total) > 0.011) warnings.push("发票明细小计与总额不一致，请核对原件");
  const partyFields: InvoicePartyFields = {
    sellerName: issuerName, sellerAddress: parties[0].slice(1).join(" "),
    sellerContactName: labelled(/^CONTACT\s*[:：]?\s*/i, false), sellerTelephone: labelled(/^TELEPHONE\s*[:：]?\s*/i, false), sellerFinanceEmail: labelled(/^E-mail\s*[:：]?\s*/i, false),
    customerName: receiverName, customerAddress: parties[1].slice(1).join(" "),
    customerContact: labelled(/^CUSTOMER\s+CONTACT\s*[:：]?\s*/i, true), customerContactPhone: labelled(/^TELEPHONE\s*[:：]?\s*/i, true), customerContactEmail: labelled(/^E-mail\s*[:：]?\s*/i, true),
    bankAccountName: bank("Name"), bankName: bank("Bank"), bankAddress: bank("Bank\\s+Address"),
    bankSwiftCode: bank("SWIFT\\s+Code"), bankAccount: bank("Account\\s+Number"), bankCode: bank("Bank\\s+Code"),
  };
  return { invoiceNo: numbers[0], invoiceDate, dueDate: dueDate || invoiceDueDate(invoiceDate, paymentTermDays), paymentTermDays,
    issuerName, receiverName, currency, total, servicePeriod, comment, partyFields, lines, warnings };
}

/** XLS/XLSX 与 WPS 导出的 HTML 表格都按单元格位置读取，不执行宏、脚本或公式。 */
export function parseHkwzWorkbook(bytes: Buffer): HkwzInvoice {
  const book = XLSX.read(bytes, { type: "buffer", raw: true, cellDates: false, cellNF: true });
  const candidates: Array<{ name: string; rows: InvoiceTemplateRows }> = [];
  for (const name of book.SheetNames) {
    if (book.Workbook?.Sheets?.find(sheet => sheet.name === name)?.Hidden) continue;
    const sheet = book.Sheets[name];
    const byRow = new Map<number, Cell[]>();
    const cells = Object.entries(sheet).filter(([key]) => /^[A-Z]+\d+$/.test(key));
    if (cells.length > 50000) throw new Error("工作表数据过多，请仅保留需要识别的发票工作表");
    let missingFormula = false;
    for (const [key, cell] of cells) {
      if (cell.f && (cell.v === undefined || cell.t === "e")) missingFormula = true;
      if (cell.v === undefined || cell.v === null) continue;
      const pos = XLSX.utils.decode_cell(key);
      let value = String(cell.v);
      if (cell.t === "n" && cell.z && XLSX.SSF.is_date(cell.z)) {
        const parsed = XLSX.SSF.parse_date_code(Number(cell.v), { date1904: Boolean(book.Workbook?.WBProps?.date1904) });
        if (parsed) value = `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
      } else if (cell.t === "n" && /^0+$/.test(cell.z || "")) value = XLSX.utils.format_cell(cell);
      const row = byRow.get(pos.r) || [];
      row.push({ x: pos.c, text: value }); byRow.set(pos.r, row);
    }
    const rows = [...byRow.entries()].sort(([a], [b]) => a - b).map(([, row]) => row.sort((a, b) => a.x - b.x));
    if (!isHkwzInvoiceText(contentOf(rows))) continue;
    if (missingFormula) throw new Error(`工作表“${name}”有未计算或错误的公式，请用 Excel 重新计算并保存后上传`);
    candidates.push({ name, rows });
  }
  if (candidates.length > 1) throw new Error(`文件包含多张发票（${candidates.map(item => item.name).join("、")}），请每次上传一张`);
  if (!candidates.length) throw new Error("未找到可识别的香港万众商业发票工作表，请核对模板或手工登记");
  return parseHkwzInvoice(candidates[0].rows);
}
