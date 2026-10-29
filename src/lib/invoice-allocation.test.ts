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
    expect(() => moneyCents("-1")).toThrow();
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
