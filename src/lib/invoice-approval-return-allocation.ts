import { moneyCents, validateInvoiceAllocationPlan, type InvoiceAllocationPlan } from "./invoice-allocation";
import type { groupReturnedInvoices } from "./invoice-approval-returns";

type ReturnGroup = ReturnType<typeof groupReturnedInvoices>[number];

/** Match a complete set of returned invoices to unique approved accounting rows.
 * Equal amounts are ambiguous: file order and upload order never choose an account. */
export function matchReturnedInvoiceAllocations(groups: ReturnGroup[], plan: InvoiceAllocationPlan | null) {
  if (!plan || groups.length !== plan.allocations.length) throw new Error("多张发票尚未与申请的账期明细一一对应，请核对回票及分摊");
  const invalid = validateInvoiceAllocationPlan(plan);
  if (invalid) throw new Error(invalid);
  const matched = new Map<string, InvoiceAllocationPlan>();
  const used = new Set<string>();
  for (const group of groups) {
    const facts = group.primary.recognition?.facts;
    if (group.conflicting || !facts) throw new Error("多张回票中存在识别失败或不同格式信息冲突，请处理回票异常");
    if (facts.currency.toUpperCase() !== plan.currency) throw new Error("回票币种与申请分摊币种不同");
    const candidates = plan.allocations.filter(row =>
      ["amountExcludingTax", "taxAmount", "amountIncludingTax"].every(key =>
        moneyCents(row[key as keyof typeof row]) === moneyCents(facts[key as keyof typeof facts]))
      && Number(row.taxRate) === Number(facts.taxRate));
    if (candidates.length !== 1 || used.has(candidates[0].sourceId)) throw new Error(`发票 ${facts.invoiceNo} 的金额不能唯一匹配申请账期，请核对分摊`);
    const row = candidates[0];
    used.add(row.sourceId);
    matched.set(group.key, { ...plan, lineMode: "period", allocations: [{ ...row }] });
  }
  return matched;
}
