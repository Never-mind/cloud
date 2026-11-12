import { describe, expect, it } from "vitest";
import { applyRecognizedPeriodAmounts,allocationInvoiceLines, allocationTotals, moneyCents, servicePeriodLabel, splitInvoiceAmount, suggestInvoiceAllocations, validateInvoiceAllocationPlan, type InvoiceAllocationSource } from "./invoice-allocation";
const source = (period: string, total = "100.00"): InvoiceAllocationSource => ({ sourceType: "cloud_row", sourceId: period, sourceNo: period, period, customerId: "a", customerName: "A", undertakingUnitId: "unit", account: "", sourceCurrency: "USD", sourceNet: total, sourceTax: "0", sourceTotal: total, sourceTaxRate: "0" });
describe("invoice allocation", () => {
  it("prefers explicit monthly invoice amounts and refuses ambiguous service ranges",()=>{
    const plan=suggestInvoiceAllocations([source("202601"),source("202602")],"USD");
    const totals={amountExcludingTax:"200",taxAmount:"0",amountIncludingTax:"200",taxRate:"0"};
    const matched=applyRecognizedPeriodAmounts(plan,[{periodLabel:"202601",description:"服务费",amount:"80"},{periodLabel:"202602",description:"服务费",amount:"120"}],totals);
    expect(matched?.allocations.map(row=>row.amountIncludingTax)).toEqual(["80.00","120.00"]);
    expect(applyRecognizedPeriodAmounts(plan,[{periodLabel:"202601–202602",description:"服务费",amount:"200"}],totals)).toBeNull();
  });
  it("keeps six monthly allocations while rendering one cross-year line", () => {
    const plan = suggestInvoiceAllocations(["202512", "202601", "202602", "202603", "202604", "202605"].map(p => source(p)), "USD");
    plan.lineMode = "summary"; plan.summaryCompatible=true;
    expect(validateInvoiceAllocationPlan(plan)).toBeNull();
    expect(allocationInvoiceLines(plan)).toEqual([{ periodLabel: "202512–202605", description: "202512–202605服务费", amount: "600.00" }]);
    expect(plan.allocations.map(row => row.amountIncludingTax)).toEqual(Array(6).fill("100.00"));
  });
  it("never implies missing months and deduplicates multiple accounts in a period", () => {
    expect(servicePeriodLabel(["202512", "202602", "202602"])).toBe("202512、202602");
    expect(servicePeriodLabel(["2025-12", "2026-01"])).toBe("202512–202601");
  });
  it("updates an automatic period description when adding months while preserving custom wording",()=>{
    const previous=suggestInvoiceAllocations([source("202512")],"USD");
    expect(suggestInvoiceAllocations([source("202512"),source("202601")],"USD",undefined,previous).description).toBe("202512–202601服务费");
    previous.description="双方约定的服务内容";
    expect(suggestInvoiceAllocations([source("202512"),source("202601")],"USD",undefined,previous).description).toBe("双方约定的服务内容");
  });
  it("allocates cents exactly and handles zero weights", () => {
    expect(splitInvoiceAmount("100", [1, 1, 1])).toEqual(["33.34", "33.33", "33.33"]);
    expect(splitInvoiceAmount("0.01", [0, 0])).toEqual(["0.01", "0.00"]);
    expect(() => moneyCents("Infinity")).toThrow();
    expect(moneyCents("-1")).toBe(-100);
    expect(moneyCents("-1.005")).toBe(-101);
    expect(moneyCents("1.005")).toBe(101);
    expect(() => moneyCents("90071992547409.92")).toThrow("超出范围");
  });
  it("apportions signed totals with exact cents while preserving deduction periods", () => {
    expect(splitInvoiceAmount("-100", [-1, -1, -1])).toEqual(["-33.34", "-33.33", "-33.33"]);
    expect(splitInvoiceAmount("69.90", [100, -30])).toEqual(["99.86", "-29.96"]);
    expect(splitInvoiceAmount("-69.90", [-100, 30])).toEqual(["-99.86", "29.96"]);
    expect(() => splitInvoiceAmount("1", [100, -100])).toThrow("相抵为零");
    expect(() => splitInvoiceAmount("10", [-100, 30])).toThrow("正负方向");
    for (const weights of [[8, -3, 2], [-8, 3, -2], [-1, -2, -3], [1, 1, 1]]) {
      for (const amount of [0, 0.01, 10.01, 123.45]) {
        const target = amount * Math.sign(weights.reduce((a,b)=>a+b,0));
        const shares = splitInvoiceAmount(target.toFixed(2), weights);
        expect(shares.reduce((sum, share)=>sum+moneyCents(share),0)).toBe(moneyCents(target.toFixed(2)));
        shares.forEach((share,i)=>expect(moneyCents(share)*weights[i]).toBeGreaterThanOrEqual(0));
      }
    }
  });
  it.each([
    ["100.00", "-30.00", "72.03"],
    ["-100.00", "-30.00", "-133.77"],
    ["100.00", "-100.00", "0.00"],
  ])("keeps signed service-fee amounts, taxes and summary lines: %s / %s", (first, second, total) => {
    const sources = [first,second].map((net,i)=>({...source(`20260${i+1}`, net),sourceType: "service_fee" as const,sourceTaxRate:"2.9",sourceTax:(Number(net)*0.029).toFixed(2),sourceTotal:(Number(net)*1.029).toFixed(2)}));
    const plan = suggestInvoiceAllocations(sources, "USD");
    const totals = allocationTotals(plan.allocations);
    expect(totals.amountIncludingTax).toBe(total);
    expect(validateInvoiceAllocationPlan(plan,totals)).toBeNull();
    const redistributed = suggestInvoiceAllocations(sources, "USD", totals);
    expect(redistributed.allocations.map(row=>row.amountExcludingTax)).toEqual([first,second]);
    expect(validateInvoiceAllocationPlan(redistributed,totals)).toBeNull();
    plan.lineMode="summary"; plan.summaryCompatible=true;
    expect(allocationInvoiceLines(plan)[0].amount).toBe(total);
  });
  it("converts negative periods and derives tax as rounded gross less net", () => {
    const plan=suggestInvoiceAllocations([{...source("202608","-263293.0648"),sourceType:"service_fee",sourceCurrency:"CNY",sourceTaxRate:"2.9",sourceTax:"-7635.4988",sourceTotal:"-270928.5636"},
      {...source("202609","49710.9329"),sourceType:"service_fee",sourceTaxRate:"2.9",sourceTax:"1441.6171",sourceTotal:"51152.55",suggestedRate:"6.8"}],"CNY");
    expect(plan.allocations[0].amountIncludingTax).toBe("-270928.56");
    expect(plan.allocations[1].amountIncludingTax).toBe("347837.34");
    expect(allocationTotals(plan.allocations).amountIncludingTax).toBe("76908.78");
    expect(validateInvoiceAllocationPlan(plan)).toBeNull();
  });
  it("matches recognized negative monthly lines without losing their signs", () => {
    const sources=[source("202601","100"),source("202602","-30")].map(row=>({...row,sourceType:"service_fee" as const}));
    const plan=suggestInvoiceAllocations(sources,"USD");
    const totals={amountExcludingTax:"70",taxAmount:"0",amountIncludingTax:"70",taxRate:"0"};
    const matched=applyRecognizedPeriodAmounts(plan,[{periodLabel:"202601",description:"服务费",amount:"100"},{periodLabel:"202602",description:"服务费",amount:"-30"}],totals);
    expect(matched?.allocations.map(row=>row.amountIncludingTax)).toEqual(["100.00","-30.00"]);
    expect(validateInvoiceAllocationPlan(suggestInvoiceAllocations([source("202601","-100")],"USD"))).toContain("暂不支持");
  });
  it("requires explicit FX and preserves original USD receivables", () => {
    const missing = suggestInvoiceAllocations([source("202601")], "CNY");
    expect(validateInvoiceAllocationPlan(missing)).toContain("汇率");
    const plan = suggestInvoiceAllocations([{ ...source("202601"), suggestedRate: "7" }, { ...source("202602"), suggestedRate: "7.2" }], "CNY");
    expect(allocationTotals(plan.allocations).amountIncludingTax).toBe("1420.00");
    expect(plan.allocations[0].sourceTotal).toBe("100.00");
  });
  it("rejects mismatched totals, tax, duplicate sources and mixed-rate summary", () => {
    const plan = suggestInvoiceAllocations([source("202601"), source("202602")], "USD");
    expect(validateInvoiceAllocationPlan(plan, { amountExcludingTax: "200", taxAmount: "0", amountIncludingTax: "199" })).toContain("合计");
    plan.allocations[1].taxRate = "6"; plan.allocations[1].taxAmount = "6"; plan.allocations[1].amountIncludingTax = "106";
    plan.lineMode = "summary";
    expect(validateInvoiceAllocationPlan(plan)).toContain("不同税率");
    plan.lineMode = "period";
    expect(validateInvoiceAllocationPlan(plan)).toBeNull();
    plan.allocations[1].sourceId = plan.allocations[0].sourceId;
    expect(validateInvoiceAllocationPlan(plan)).toContain("重复");
  });
});
