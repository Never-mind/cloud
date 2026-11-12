/** Shared by the browser and server. Invoice lines and accounting allocations are independent. */
export type AllocationSourceType = "cloud_row" | "service_fee";
export type InvoiceAllocationSource = {
  sourceType: AllocationSourceType; sourceId: string; sourceNo: string; period: string;
  customerId: string; customerName: string; undertakingUnitId: string; account: string;
  sourceCurrency: string; sourceNet: string; sourceTax: string; sourceTotal: string; sourceTaxRate: string;
  suggestedRate?: string; invoiceUsdRate?: string; disabledReason?: string;
};
export type InvoiceAllocation = InvoiceAllocationSource & {
  exchangeRate: string; amountExcludingTax: string; taxRate: string; taxAmount: string; amountIncludingTax: string;
};
export type InvoiceAllocationPlan = {
  version: 1; sourceType: AllocationSourceType; currency: string;
  lineMode: "period" | "summary"; description: string; allocations: InvoiceAllocation[]; summaryCompatible?:boolean;
};
export type AllocationTotals = { amountExcludingTax: unknown; taxAmount: unknown; amountIncludingTax: unknown; taxRate?: unknown };

export function moneyCents(value: unknown): number {
  const raw = String(value ?? "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) throw new Error("请填写有效金额");
  const negative = raw.startsWith("-");
  const [whole, fraction = ""] = raw.replace(/^-/, "").split(".");
  const absolute = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0").slice(0, 2)) + BigInt(Number(fraction[2] ?? 0) >= 5 ? 1 : 0);
  if (absolute > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("开票金额超出范围");
  return Number(negative ? -absolute : absolute);
}
export const centsText = (cents: number) => (cents / 100).toFixed(2);

/** Signed proportional allocation in integer cents; negative periods remain deductions. */
export function splitInvoiceAmount(value: unknown, weights: number[]): string[] {
  const cents = moneyCents(value);
  if (!weights.length || weights.some(w => !Number.isFinite(w) || !Number.isSafeInteger(Math.round(w * 1000000)))) throw new Error("分摊依据不正确");
  const normalized = weights.some(w => w !== 0) ? weights : weights.map(() => 1);
  const integers = normalized.map(w => BigInt(Math.round(w * 1000000)));
  const signedSum = integers.reduce((a, b) => a + b, BigInt(0));
  if (!signedSum) throw new Error("账单正负金额相抵为零，无法按比例分摊，请按账单填入或手工调整");
  if (weights.some(w => w < 0) && cents !== 0 && (cents < 0) !== (signedSum < BigInt(0))) throw new Error("票面总额与账单合计的正负方向不同，请手工核对分摊");
  const sum = signedSum < BigInt(0) ? -signedSum : signedSum;
  const absolute = BigInt(Math.abs(cents));
  const shares = integers.map((weight, index) => {
    const numerator = absolute * (signedSum < BigInt(0) ? -weight : weight);
    let share = numerator / sum, remainder = numerator % sum;
    if (remainder < BigInt(0)) { share--; remainder += sum; }
    return { index, cents: share, remainder };
  });
  const remaining = Number(absolute - shares.reduce((total, row) => total + row.cents, BigInt(0)));
  const order = [...shares].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (let index = 0; index < remaining; index++) order[index].cents++;
  return shares.map(row => {
    if (row.cents > BigInt(Number.MAX_SAFE_INTEGER) || row.cents < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("分摊金额超出范围");
    return centsText(Number(row.cents) * (cents < 0 ? -1 : 1));
  });
}

/** Preserve exact monthly amounts, including a zero-total positive/negative offset. */
function splitByAmounts(value: unknown, amounts: number[]): string[] {
  const cents = amounts.map(amount => moneyCents(amount.toFixed(2)));
  return cents.reduce((sum, amount) => sum + amount, 0) === moneyCents(value)
    ? cents.map(centsText) : splitInvoiceAmount(value, amounts);
}

export function servicePeriodLabel(periods: string[]): string {
  const months = [...new Set(periods.map(p => p.replace(/[^0-9]/g, "").slice(0, 6)))].sort();
  if (months.some(p => !/^\d{4}(0[1-9]|1[0-2])$/.test(p))) throw new Error("账期格式不正确");
  const serial = (p: string) => Number(p.slice(0, 4)) * 12 + Number(p.slice(4));
  return months.length > 1 && months.every((p, i) => !i || serial(p) === serial(months[i - 1]) + 1)
    ? `${months[0]}–${months.at(-1)}` : months.join("、");
}

export function allocationTotals(rows: InvoiceAllocation[]): AllocationTotals & { taxRate: string } {
  const total = (key: "amountExcludingTax" | "taxAmount" | "amountIncludingTax") => centsText(rows.reduce((sum, row) => sum + moneyCents(row[key]), 0));
  const rates = [...new Set(rows.map(row => row.taxRate.trim()))];
  return { amountExcludingTax: total("amountExcludingTax"), taxAmount: total("taxAmount"), amountIncludingTax: total("amountIncludingTax"), taxRate: rates.length === 1 ? rates[0] : "" };
}

export function suggestInvoiceAllocations(sources: InvoiceAllocationSource[], currency: string, totals?: AllocationTotals, previous?: InvoiceAllocationPlan | null): InvoiceAllocationPlan {
  const target = currency.trim().toUpperCase();
  const rows: InvoiceAllocation[] = sources.map(source => {
    const old = previous?.currency === target ? previous.allocations.find(row => row.sourceId === source.sourceId) : undefined;
    const rate = source.sourceCurrency === target ? "1" : old?.exchangeRate || source.suggestedRate || "";
    const factor = Number(rate);
    return { ...source, exchangeRate: rate, taxRate: String(totals?.taxRate ?? "").trim() || source.sourceTaxRate,
      amountExcludingTax: factor > 0 ? (Number(source.sourceNet) * factor).toFixed(2) : "",
      taxAmount: factor > 0 ? centsText(moneyCents((Number(source.sourceTotal) * factor).toFixed(2)) - moneyCents((Number(source.sourceNet) * factor).toFixed(2))) : "",
      amountIncludingTax: factor > 0 ? (Number(source.sourceTotal) * factor).toFixed(2) : "" };
  });
  if (totals && sources.length && rows.every(row => Number(row.exchangeRate) > 0)) {
    const weights = rows.map(row => Number(row.sourceNet) * Number(row.exchangeRate));
    const nets = splitByAmounts(totals.amountExcludingTax, weights);
    const taxes = splitByAmounts(totals.taxAmount, rows.map((row,i)=>Number(nets[i])*Number(row.taxRate)/100));
    rows.forEach((row, i) => { row.amountExcludingTax = nets[i]; row.taxAmount = taxes[i]; row.amountIncludingTax = centsText(moneyCents(nets[i]) + moneyCents(taxes[i])); });
  }
  const defaultDescription=`${servicePeriodLabel(sources.map(row => row.period))}服务费`;
  const oldDefault=previous?`${servicePeriodLabel(previous.allocations.map(row=>row.period))}服务费`:"";
  return { version: 1, sourceType: sources[0]?.sourceType ?? "cloud_row", currency: target, lineMode: previous?.lineMode ?? "period",
    description: previous?.description&&previous.description!==oldDefault?previous.description:defaultDescription, allocations: rows,summaryCompatible:previous?.summaryCompatible??false };
}

export function validateInvoiceAllocationPlan(plan: InvoiceAllocationPlan, expected?: AllocationTotals): string | null {
  try {
    if (!plan || plan.version !== 1 || !["cloud_row", "service_fee"].includes(plan.sourceType)) return "不支持的分摊来源";
    if (!/^[A-Z]{3}$/.test(plan.currency)) return "请选择开票币种";
    if (!["period", "summary"].includes(plan.lineMode)) return "请选择票面展示方式";
    if (!Array.isArray(plan.allocations) || !plan.allocations.length || plan.allocations.length > 200) return "请选择 1 至 200 条账单";
    if (new Set(plan.allocations.map(row => row.sourceId)).size !== plan.allocations.length) return "关联账单不能重复";
    if (plan.lineMode === "summary" && (!plan.description.trim() || plan.description.length > 500)) return "请填写不超过 500 字的票面描述";
    for (const row of plan.allocations) {
      if (row.sourceType !== plan.sourceType || !row.sourceId) return "分摊来源不一致";
      if (!row.exchangeRate.trim() || !Number.isFinite(Number(row.exchangeRate)) || Number(row.exchangeRate) <= 0) return `${row.period} 请补齐有效汇率（1 ${row.sourceCurrency} 对应多少 ${plan.currency}）`;
      if (row.sourceCurrency === plan.currency && Number(row.exchangeRate) !== 1) return "同币种汇率必须为 1";
      const net = moneyCents(row.amountExcludingTax), tax = moneyCents(row.taxAmount), gross = moneyCents(row.amountIncludingTax);
      if (plan.sourceType !== "service_fee" && [net, tax, gross].some(amount => amount < 0)) return "该业务来源暂不支持负数开票分摊";
      if (net + tax !== gross) return `${row.period} 未税金额加税金应等于含税金额`;
      const rate = Number(row.taxRate);
      if (!String(row.taxRate).trim() || !Number.isFinite(rate) || rate < 0 || rate > 100) return `${row.period} 请填写有效税率`;
      if (Math.abs(Math.round(net * rate / 100) - tax) > 1) return `${row.period} 税金与未税金额、税率不一致，请核对`;
    }
    if (plan.lineMode === "summary" && new Set(plan.allocations.map(row => Number(row.taxRate))).size > 1) return "不同税率请按账期分行开票";
    if(plan.lineMode === "summary" && !plan.summaryCompatible)return "请确认所选服务内容及税收分类适合合并为一行";
    if (expected) {
      const sums = allocationTotals(plan.allocations);
      for (const field of ["amountExcludingTax", "taxAmount", "amountIncludingTax"] as const) {
        if (moneyCents(sums[field]) !== moneyCents(expected[field])) return "分摊合计与整张发票的未税、税金或含税金额不一致，请调整";
      }
    }
    return null;
  } catch (error) { return error instanceof Error ? error.message : "分摊信息不完整"; }
}

export function allocationInvoiceLines(plan: InvoiceAllocationPlan) {
  const total = allocationTotals(plan.allocations);
  if (plan.lineMode === "summary") return [{ periodLabel: servicePeriodLabel(plan.allocations.map(row => row.period)), description: plan.description, amount: String(total.amountIncludingTax) }];
  return plan.allocations.map(row => ({ periodLabel: row.period, description: `${row.period}服务费${row.account ? ` · ${row.account}` : ""}`, amount: row.amountIncludingTax }));
}

export function readInvoiceAllocationPlan(value: unknown): InvoiceAllocationPlan | null {
  try { const plan = typeof value === "string" ? JSON.parse(value) : value; return plan?.version === 1 && Array.isArray(plan.allocations) ? plan : null; }
  catch { return null; }
}

/** Only use explicit, unambiguous monthly amounts whose total matches the reviewed invoice. */
export function applyRecognizedPeriodAmounts(plan:InvoiceAllocationPlan,lines:Array<{periodLabel:string;description:string;amount:string}>,totals:AllocationTotals):InvoiceAllocationPlan|null {
  try {
    const monthly=new Map<string,number>();
    for(const line of lines) {
      const text=`${line.periodLabel} ${line.description}`;
      const periods=[...new Set(Array.from(text.matchAll(/\b(20\d{2})[-/年]?(0[1-9]|1[0-2])(?:月)?\b/g),match=>match[1]+match[2]))];
      if(periods.length!==1)return null;
      monthly.set(periods[0],(monthly.get(periods[0])??0)+moneyCents(line.amount));
    }
    if(!monthly.size||[...monthly.values()].reduce((a,b)=>a+b,0)!==moneyCents(totals.amountIncludingTax))return null;
    if([...monthly.keys()].some(period=>!plan.allocations.some(row=>row.period===period))||plan.allocations.some(row=>!monthly.has(row.period)))return null;
    const gross=new Map<string,string>();
    for(const [period,cents] of monthly){const rows=plan.allocations.filter(row=>row.period===period);const amounts=splitByAmounts(centsText(cents),rows.map(row=>Number(row.sourceTotal)*Number(row.exchangeRate)));rows.forEach((row,i)=>gross.set(row.sourceId,amounts[i]));}
    const taxes=splitByAmounts(totals.taxAmount,plan.allocations.map(row=>{const rate=Number(totals.taxRate??row.taxRate)/100;return Number(gross.get(row.sourceId))*rate/(1+rate);}));
    const next={...plan,allocations:plan.allocations.map((row,i)=>({...row,amountIncludingTax:gross.get(row.sourceId)!,taxAmount:taxes[i],amountExcludingTax:centsText(moneyCents(gross.get(row.sourceId))-moneyCents(taxes[i])),taxRate:String(totals.taxRate??row.taxRate)}))};
    return validateInvoiceAllocationPlan({...next,lineMode:"period"},totals)?null:next;
  }catch{return null;}
}
