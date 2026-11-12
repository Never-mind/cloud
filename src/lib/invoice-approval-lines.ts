import { centsText, moneyCents } from "./invoice-allocation";
import { normalizeInvoiceMoneyInput } from "./invoice-money-input";

/** Actual rows submitted to Cloud Invoice's Mexico Invoice Information table. */
export type MexicoInvoiceLine = {
  amountIncludingTax: string;
  invoiceContent: string;
  cfdiCodeKey: string;
  /** A concrete bill ID, not a month: one month may contain several accounts. */
  allocationSourceId?: string;
};
export const MAX_APPROVAL_INVOICE_LINES = 100;

export function parseMexicoInvoiceLines(value: unknown): MexicoInvoiceLine[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_APPROVAL_INVOICE_LINES) {
    throw new Error(`请填写 1 至 ${MAX_APPROVAL_INVOICE_LINES} 行飞书开票明细`);
  }
  return value.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`第 ${index + 1} 行开票明细格式不正确`);
    const row = value as Record<string, unknown>;
    let amount: string;
    try { amount = normalizeInvoiceMoneyInput(row.amountIncludingTax); }
    catch { throw new Error(`第 ${index + 1} 行请填写有效含税金额，例如 11516.54；系统按两位小数入账`); }
    const invoiceContent = String(row.invoiceContent ?? "").trim();
    const cfdiCodeKey = String(row.cfdiCodeKey ?? "").trim();
    if (!invoiceContent || invoiceContent.length > 500) throw new Error(`第 ${index + 1} 行请填写开票内容（最多 500 字）`);
    if (!cfdiCodeKey) throw new Error(`第 ${index + 1} 行请选择 CFDI 用途码`);
    if (row.allocationSourceId !== undefined && typeof row.allocationSourceId !== "string") throw new Error(`第 ${index + 1} 行关联账单格式不正确`);
    return { amountIncludingTax: amount, invoiceContent, cfdiCodeKey, ...(row.allocationSourceId ? { allocationSourceId: row.allocationSourceId.trim() } : {}) };
  });
}

export function approvalInvoiceLineTotal(lines: Pick<MexicoInvoiceLine, "amountIncludingTax">[]): string {
  const cents = lines.reduce((sum, row) => sum + BigInt(moneyCents(normalizeInvoiceMoneyInput(row.amountIncludingTax))), BigInt(0));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("开票明细合计超出范围");
  return centsText(Number(cents));
}

export function validateMexicoInvoiceLines(value: unknown, total: unknown, allowedCfdiKeys?: string[]): MexicoInvoiceLine[] {
  const lines = parseMexicoInvoiceLines(value);
  if (allowedCfdiKeys && lines.some(row => !allowedCfdiKeys.includes(row.cfdiCodeKey))) throw new Error("开票明细中的 CFDI 用途码已失效，请重新选择");
  if (moneyCents(approvalInvoiceLineTotal(lines)) !== moneyCents(normalizeInvoiceMoneyInput(total))) throw new Error("开票明细含税合计与整单含税金额不一致，请核对明细或使用明细合计");
  if (moneyCents(normalizeInvoiceMoneyInput(total)) <= 0) throw new Error("开票明细含税合计必须大于零");
  return lines;
}

const MEXICO_INFO = "widget17634576967120001";
const MEXICO_AMOUNT = "widget17634577022660001";
/** Read every row from the saved submission, never use only the first amount. */
export function readMexicoInvoiceExpectation(formJson: unknown): { currency: string; amountIncludingTax: string } | null {
  try {
    const form = typeof formJson === "string" ? JSON.parse(formJson) : formJson;
    if (!Array.isArray(form)) return null;
    const rows = form.find(field => field.id === MEXICO_INFO)?.value;
    if (!Array.isArray(rows) || !rows.length) return null;
    const amounts = rows.map(row => Array.isArray(row) ? row.find(field => field.id === MEXICO_AMOUNT) : null);
    const currency = String(amounts[0]?.currency ?? "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency) || amounts.some(item => !item || String(item.currency).toUpperCase() !== currency)) return null;
    return { currency, amountIncludingTax: approvalInvoiceLineTotal(amounts.map(item => ({ amountIncludingTax: String(item.value) }))) };
  } catch { return null; }
}
