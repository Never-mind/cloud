/** Shared money rules for supplier payments and cross-period invoice registration. */
export function paymentCents(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") throw new Error("请填写金额");
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > 1e11) throw new Error("金额无效或超出范围");
  return Math.round((number + Math.sign(number) * Number.EPSILON) * 100);
}

export function allocatePaymentAmount(total: unknown, weights: unknown[]): number[] {
  const cents = paymentCents(total);
  if (cents < 0 || !weights.length) throw new Error("分摊总额不能为负数，且必须选择账期");
  const units = weights.map(weight => {
    const n = Number(weight);
    if (!Number.isFinite(n) || n < 0 || n > 1e11) throw new Error("应付金额为负数或无效，不能按比例分摊");
    return BigInt(Math.round(n * 10000));
  });
  const sum = units.reduce((a,b) => a+b, BigInt(0));
  if (sum === BigInt(0)) throw new Error("应付合计为零，请手动填写各期分摊金额");
  const parts = units.map((weight,index) => ({ index, cents: BigInt(cents)*weight/sum, remainder: BigInt(cents)*weight%sum }));
  const left = Number(BigInt(cents)-parts.reduce((a,b) => a+b.cents,BigInt(0)));
  [...parts].sort((a,b) => a.remainder === b.remainder ? a.index-b.index : a.remainder > b.remainder ? -1 : 1).slice(0,left).forEach(part => part.cents++);
  return parts.map(part => Number(part.cents)/100);
}

export type CloudPaymentAllocationEntry = {
  ownerId: string; paymentRecordId: string; period: string; supplierId: string; payerUnitId: string;
  amount: number; currency: string; netAmount: number; taxRate: number; taxAmount: number; exchangeRate: number;
};
export type CloudPaymentAllocationPlan = {
  kind: "cloud_supplier_payment"; version: 1; entries: CloudPaymentAllocationEntry[]; total: number; appliedAt?: string;
};

export function paymentTaxAmounts(total: unknown, rate: unknown) {
  const cents = paymentCents(total), taxRate = Number(rate ?? 0);
  if (cents <= 0) throw new Error("付款金额必须大于0");
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) throw new Error("税率必须介于0%和100%之间");
  const net = Math.round(cents/(1+taxRate));
  return { amount: cents/100, netAmount: net/100, taxAmount: (cents-net)/100, taxRate };
}

export function parseCloudPaymentPlan(value: unknown): CloudPaymentAllocationPlan | null {
  if (!value) return null;
  const plan = typeof value === "string" ? JSON.parse(value) : value;
  if (plan.kind !== "cloud_supplier_payment") return null;
  if (plan.version !== 1 || !Array.isArray(plan.entries) || !plan.entries.length) throw new Error("付款分摊记录损坏，请核对");
  const seen = new Set<string>();
  let sum = 0;
  for (const entry of plan.entries) {
    if (!entry.paymentRecordId || !entry.ownerId || seen.has(entry.paymentRecordId)) throw new Error("付款分摊账期重复或缺失");
    seen.add(entry.paymentRecordId);
    const amounts = paymentTaxAmounts(entry.amount, entry.taxRate);
    if (paymentCents(entry.netAmount) + paymentCents(entry.taxAmount) !== paymentCents(amounts.amount)) throw new Error("付款分摊未税和税金合计不一致");
    if (!(Number(entry.exchangeRate) > 0) || !entry.currency) throw new Error("付款分摊币种或汇率缺失");
    sum += paymentCents(entry.amount);
  }
  if (sum !== paymentCents(plan.total)) throw new Error("付款分摊合计与审批金额不一致");
  return plan;
}

export function assertSameCloudPaymentGroup(rows: Array<Record<string, unknown>>) {
  if (!rows.length) throw new Error("请选择付款账期");
  for (const [field,label] of [["supplierId","供应商"],["payerUnitId","付款单位"],["supplierPayableCurrency","应付币种"]]) {
    const values = rows.map(row => String(row[field] ?? "").trim());
    if (values.some(value => !value) || new Set(values).size !== 1) throw new Error(`所选账期的${label}不一致或缺失，请分开办理`);
  }
}

export function invoiceAllocationAmounts(total: unknown, taxRate: unknown, amounts: unknown[]) {
  const whole = paymentTaxAmounts(total,taxRate);
  const cents = amounts.map(paymentCents);
  if (cents.some(n => n < 0) || cents.reduce((a,b) => a+b,0) !== paymentCents(total)) throw new Error("各账期分摊金额合计必须等于整张发票金额，且不能为负数");
  const taxes = whole.taxAmount === 0 ? cents.map(() => 0) : allocatePaymentAmount(whole.taxAmount, cents);
  return cents.map((amount,i) => ({ amount: amount/100, netAmount: (amount-paymentCents(taxes[i]))/100, taxAmount: taxes[i], taxRate: whole.taxRate }));
}
