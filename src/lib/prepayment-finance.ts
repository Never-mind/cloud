/** Pure financial rules. Rates are percentages; business FX means 1 document currency = N contract currency. */
export const PREPAYMENT_SOURCE = "prepayment_contract" as const;
export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function numberValue(value: unknown, label: string, allowZero = true) {
  if (value === null || value === undefined || String(value).trim() === "") throw new Error(`请填写${label}`);
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || (!allowZero && result === 0)) throw new Error(`${label}必须是${allowZero ? "非负" : "正"}数`);
  return result;
}
export function financialAmounts(total: unknown, taxRate: unknown) {
  const gross = money(numberValue(total, "含税金额"));
  const rate = numberValue(taxRate, "税率");
  if (rate > 100) throw new Error("税率不能超过100%");
  const net = money(gross / (1 + rate / 100));
  return { amountExcludingTax: net, taxRate: rate, taxAmount: money(gross - net), amountIncludingTax: gross };
}
export function contractTarget(amount: unknown, basis: unknown, rate: unknown) {
  if (basis !== "gross" && basis !== "net") return null;
  const value = numberValue(amount, "合同金额");
  const tax = numberValue(rate, "合同税率");
  if (tax > 100) throw new Error("税率不能超过100%");
  return basis === "gross" ? money(value) : money(value * (1 + tax / 100));
}
export function businessRate(currency: unknown, contractCurrency: unknown, rate: unknown) {
  if (!currency || !contractCurrency) throw new Error("请填写币种");
  if (String(currency).toUpperCase() === String(contractCurrency).toUpperCase()) return 1;
  return numberValue(rate, "折算至合同币种的汇率", false);
}
export function progressLabel(total: number, target: number | null, kind: "开票" | "收款") {
  if (target === null) return "待设置口径";
  if (total <= 0) return `未${kind}`;
  if (money(total) < money(target)) return `部分${kind}`;
  return money(total) > money(target) ? `超额${kind}` : `已${kind}`;
}
export type PrepaymentBusinessRequest = { currency: string; amountIncludingTax: string; taxRate: string; businessExchangeRate: string };
export function readBusinessRequest(value: unknown): PrepaymentBusinessRequest | null {
  if (!value) return null;
  try {
    const data = typeof value === "string" ? JSON.parse(value) : value;
    if (!data || !data.currency || !(Number(data.amountIncludingTax) > 0)) return null;
    return data as PrepaymentBusinessRequest;
  } catch { return null; }
}
export type ReceiptAllocationInput = { invoiceId: string; amount: string | number; invoiceExchangeRate?: string | number };
export type ReceiptInput = {
  id?: string; version?: number; requestKey: string; customerId: string; undertakingUnitId: string;
  currency: string; businessExchangeRate?: string | number; exchangeRate?: string | number;
  amountExcludingTax?: string | number; taxRate: string | number; taxAmount?: string | number; amountIncludingTax: string | number;
  receivedDate?: string; isReceived: boolean; bankSerialNo?: string; remark?: string;
  allocations?: ReceiptAllocationInput[];
};
export function validateAllocationTotals(receiptTotal: number, allocations: Array<{ amount: number }>) {
  const sum = money(allocations.reduce((total, row) => total + numberValue(row.amount, "分配金额"), 0));
  if (sum > money(receiptTotal)) throw new Error("分配到发票的金额不能超过本笔收款金额");
  return sum;
}
