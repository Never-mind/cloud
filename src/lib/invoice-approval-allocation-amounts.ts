import { allocationTotals, centsText, moneyCents, validateInvoiceAllocationPlan, type InvoiceAllocation, type InvoiceAllocationPlan } from "./invoice-allocation";
import { normalizeInvoiceMoneyInput } from "./invoice-money-input";
import type { MexicoInvoiceLine } from "./invoice-approval-lines";

/** Reuse already confirmed per-account taxes instead of calculating tax again on the gross sum. */
export function matchingInvoiceAllocationTotals(plan: InvoiceAllocationPlan | null, currency: string, gross: string) {
  if (!plan || plan.currency !== currency) return null;
  let totals: ReturnType<typeof allocationTotals>;
  try { totals = allocationTotals(plan.allocations); } catch { return null; }
  if (moneyCents(totals.amountIncludingTax) !== moneyCents(normalizeInvoiceMoneyInput(gross))) return null;
  const error = validateInvoiceAllocationPlan(plan);
  if (error) throw new Error(error);
  return totals;
}

export function invoiceAmountExchangeRate(row: InvoiceAllocation, currency: string): string {
  if (row.sourceCurrency === currency) return "1";
  const original = moneyCents(row.sourceTotal), actual = moneyCents(normalizeInvoiceMoneyInput(row.amountIncludingTax));
  if (!original || actual / original <= 0) throw new Error(`${row.period} ${row.account}：零金额或正负方向不同，不能反算汇率，请填写参考汇率`);
  const rate = (actual / original).toFixed(12).replace(/\.?0+$/, "");
  if (Number(rate) <= 0) throw new Error("反算汇率过小，请填写参考汇率");
  return rate;
}

/** Actual invoice amounts are authoritative. FX is a reference, never a gross-amount constraint. */
export function allocationWithConfirmedGross(row: InvoiceAllocation, currency: string, value: string): InvoiceAllocation {
  const gross = normalizeInvoiceMoneyInput(value), cents = moneyCents(gross), rate = Number(row.taxRate);
  if (!String(row.taxRate).trim() || !Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("请先填写有效税率");
  const net = Math.sign(cents) * Math.round(Math.abs(cents) / (1 + rate / 100));
  const next = { ...row, amountIncludingTax: gross, amountExcludingTax: centsText(net), taxAmount: centsText(cents - net) };
  if (row.sourceCurrency === currency) next.exchangeRate = "1";
  else if (!row.exchangeRate.trim()) {
    try { next.exchangeRate = invoiceAmountExchangeRate(next, currency); } catch { /* Zero invoices still need a reference rate. */ }
  }
  return next;
}

export function invoiceLineAllocationCoverage(lines: MexicoInvoiceLine[], plan: InvoiceAllocationPlan): boolean {
  const ids = new Set(plan.allocations.map(row => row.sourceId));
  return lines.length > 0 && lines.every(row => row.allocationSourceId && ids.has(row.allocationSourceId))
    && plan.allocations.every(row => lines.some(line => line.allocationSourceId === row.sourceId));
}

/** Matching is by source ID, never by array order or month alone. */
export function applyInvoiceLineAmounts(plan: InvoiceAllocationPlan, lines: MexicoInvoiceLine[]): InvoiceAllocationPlan {
  if (!invoiceLineAllocationCoverage(lines, plan)) throw new Error("请为每行选择对应账单，并覆盖全部关联账单；合并行可直接在上方填写各账期金额");
  const amounts = new Map<string, number>();
  for (const row of lines) amounts.set(row.allocationSourceId!, (amounts.get(row.allocationSourceId!) ?? 0) + moneyCents(normalizeInvoiceMoneyInput(row.amountIncludingTax)));
  const next = { ...plan, allocations: plan.allocations.map(row => allocationWithConfirmedGross(row, plan.currency, centsText(amounts.get(row.sourceId)!))) };
  const error = validateInvoiceAllocationPlan(next, allocationTotals(next.allocations));
  if (error) throw new Error(error);
  return next;
}

/** Keep independently split lines intact; only a unique linked row follows its bill's edited amount. */
export function syncLinkedInvoiceLineAmounts(lines: MexicoInvoiceLine[], previous: InvoiceAllocationPlan | null, next: InvoiceAllocationPlan): MexicoInvoiceLine[] {
  return lines.map(line => {
    const row = next.allocations.find(row => row.sourceId === line.allocationSourceId);
    if (!row || lines.filter(other => other.allocationSourceId === line.allocationSourceId).length !== 1) return line;
    const old = previous?.allocations.find(old => old.sourceId === row.sourceId);
    if (old?.amountIncludingTax === row.amountIncludingTax) return line;
    return { ...line, amountIncludingTax: row.amountIncludingTax };
  });
}

export function validateInvoiceLineAllocations(lines: MexicoInvoiceLine[], plan: InvoiceAllocationPlan): void {
  if (lines.some(line => line.allocationSourceId && !plan.allocations.some(row => row.sourceId === line.allocationSourceId))) throw new Error("开票明细关联了未选择的账单，请重新选择对应账单");
  if (!invoiceLineAllocationCoverage(lines, plan)) return;
  for (const row of plan.allocations) {
    const sum = lines.filter(line => line.allocationSourceId === row.sourceId).reduce((sum, line) => sum + moneyCents(normalizeInvoiceMoneyInput(line.amountIncludingTax)), 0);
    if (sum !== moneyCents(row.amountIncludingTax)) throw new Error(`${row.period} ${row.account}：明细与账期金额不一致，请点击“使用明细合计”更新账期`);
  }
}
