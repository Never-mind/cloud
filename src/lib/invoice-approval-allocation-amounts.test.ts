import {describe,expect,it} from "vitest";
import {allocationTotals,suggestInvoiceAllocations,validateInvoiceAllocationPlan,type InvoiceAllocationSource} from "./invoice-allocation";
import {allocationWithConfirmedGross,applyInvoiceLineAmounts,invoiceAmountExchangeRate,invoiceLineAllocationCoverage,syncLinkedInvoiceLineAmounts,validateInvoiceLineAllocations,matchingInvoiceAllocationTotals} from "./invoice-approval-allocation-amounts";
import {normalizeInvoiceMoneyInput} from "./invoice-money-input";
import type {MexicoInvoiceLine} from "./invoice-approval-lines";

const sources:InvoiceAllocationSource[]=["638.95","5125.47"].map((sourceTotal,index)=>({sourceType:"cloud_row",sourceId:`account-${index+1}`,sourceNo:`202610 account-${index+1}`,period:"202610",customerId:"maxinfo",customerName:"Maxinfo",undertakingUnitId:"unit",account:`account-${index+1}`,sourceCurrency:"USD",sourceNet:sourceTotal,sourceTax:"0.00",sourceTotal,sourceTaxRate:"16"}));
const invoiceLines:MexicoInvoiceLine[]=["11516.54","92376.13"].map((amountIncludingTax,index)=>({amountIncludingTax,invoiceContent:`Servicio ${index+1}`,cfdiCodeKey:"G03",allocationSourceId:`account-${index+1}`}));
const makePlan=()=>suggestInvoiceAllocations(sources,"MXN");

describe("confirmed MXN amounts by account",()=>{
  it("keeps summed tax rounding when unlinked or merged invoice lines already match the account gross total",()=>{
    const plan=applyInvoiceLineAmounts(makePlan(),invoiceLines);
    const before=JSON.stringify(plan);
    expect(matchingInvoiceAllocationTotals(plan,"MXN","103892.67")).toEqual({amountIncludingTax:"103892.67",amountExcludingTax:"89562.64",taxAmount:"14330.03",taxRate:"16"});
    expect(matchingInvoiceAllocationTotals(plan,"MXN","103892.68")).toBeNull();
    expect(matchingInvoiceAllocationTotals(plan,"USD","103892.67")).toBeNull();
    expect(matchingInvoiceAllocationTotals(null,"MXN","103892.67")).toBeNull();
    expect(JSON.stringify(plan)).toBe(before);
  });
  it("does not reuse invalid account tax amounts just because gross totals match",()=>{
    const plan=applyInvoiceLineAmounts(makePlan(),invoiceLines);
    plan.allocations[0].taxAmount="1588.48";
    expect(()=>matchingInvoiceAllocationTotals(plan,"MXN","103892.67")).toThrow("未税金额加税金");
  });
  it("uses both requested amounts exactly with inferred rates and independent same-month allocations",()=>{
    const original=makePlan(), before=JSON.stringify(original);
    const result=applyInvoiceLineAmounts(original,[...invoiceLines].reverse());
    expect(result.allocations.map(row=>row.amountIncludingTax)).toEqual(["11516.54","92376.13"]);
    expect(result.allocations.map(row=>row.amountExcludingTax)).toEqual(["9928.05","79634.59"]);
    expect(result.allocations.map(row=>row.taxAmount)).toEqual(["1588.49","12741.54"]);
    expect(allocationTotals(result.allocations)).toEqual({amountIncludingTax:"103892.67",amountExcludingTax:"89562.64",taxAmount:"14330.03",taxRate:"16"});
    expect(result.allocations.map(row=>row.sourceTotal)).toEqual(["638.95","5125.47"]);
    expect(result.allocations.every(row=>Number(row.exchangeRate)>0)).toBe(true);
    expect(validateInvoiceAllocationPlan(result,allocationTotals(result.allocations))).toBeNull();
    expect(()=>validateInvoiceLineAllocations(invoiceLines,result)).not.toThrow();
    expect(JSON.stringify(original)).toBe(before);
  });
  it("keeps the confirmed gross amounts despite differences from the reference FX calculation",()=>{
    const original=makePlan();original.allocations.forEach(row=>{row.exchangeRate="18.02"});
    const result=applyInvoiceLineAmounts(original,invoiceLines);
    expect(result.allocations.map(row=>row.exchangeRate)).toEqual(["18.02","18.02"]);
    expect(result.allocations.map(row=>(Number(row.sourceTotal)*Number(row.exchangeRate)).toFixed(2))).not.toEqual(["11516.54","92376.13"]);
    expect(validateInvoiceAllocationPlan(result,allocationTotals(result.allocations))).toBeNull();
  });
  it("allows several details per account but refuses month-only or partial assignments",()=>{
    const divided=[{...invoiceLines[0],amountIncludingTax:"10000.00"},{...invoiceLines[0],amountIncludingTax:"1516.54"},invoiceLines[1]];
    expect(applyInvoiceLineAmounts(makePlan(),divided).allocations.map(row=>row.amountIncludingTax)).toEqual(["11516.54","92376.13"]);
    expect(invoiceLineAllocationCoverage([{...invoiceLines[0],allocationSourceId:undefined}],makePlan())).toBe(false);
    expect(()=>applyInvoiceLineAmounts(makePlan(),invoiceLines.slice(0,1))).toThrow("全部关联账单");
    expect(()=>applyInvoiceLineAmounts(makePlan(),[{...invoiceLines[0],allocationSourceId:"202610"},invoiceLines[1]])).toThrow("全部关联账单");
  });
  it("detects swapped account amounts even when the overall total is correct",()=>{
    const result=applyInvoiceLineAmounts(makePlan(),invoiceLines);
    expect(()=>validateInvoiceLineAllocations([{...invoiceLines[0],amountIncludingTax:invoiceLines[1].amountIncludingTax},{...invoiceLines[1],amountIncludingTax:invoiceLines[0].amountIncludingTax}],result)).toThrow("明细与账期金额不一致");
    expect(()=>validateInvoiceLineAllocations([{...invoiceLines[0],allocationSourceId:"foreign"}],result)).toThrow("未选择的账单");
  });
  it("updates uniquely linked details while preserving descriptions and independently split lines",()=>{
    const before=applyInvoiceLineAmounts(makePlan(),invoiceLines);
    const after={...before,allocations:before.allocations.map((row,i)=>i===0?allocationWithConfirmedGross(row,"MXN","11516.55"):row)};
    expect(syncLinkedInvoiceLineAmounts(invoiceLines,before,after)[0]).toEqual({...invoiceLines[0],amountIncludingTax:"11516.55"});
    const divided=[{...invoiceLines[0],amountIncludingTax:"10000.00"},{...invoiceLines[0],amountIncludingTax:"1516.54"},invoiceLines[1]];
    expect(syncLinkedInvoiceLineAmounts(divided,before,after)).toEqual(divided);
  });
  it("does not invent FX for zero or opposite-sign conversions",()=>{
    const row={...makePlan().allocations[0],amountIncludingTax:"0"};
    expect(()=>invoiceAmountExchangeRate(row,"MXN")).toThrow("不能反算");
    expect(()=>invoiceAmountExchangeRate({...row,amountIncludingTax:"-1"},"MXN")).toThrow("不能反算");
    expect(invoiceAmountExchangeRate({...row,sourceCurrency:"MXN"},"MXN")).toBe("1");
    expect(()=>allocationWithConfirmedGross({...row,taxRate:""},"MXN","10")).toThrow("税率");
  });
  it.each(["", "1,23.45", "11516,54", "MXN 11516.54", "1e3", "Infinity"])("rejects ambiguous or missing amount %s",value=>{
    expect(()=>normalizeInvoiceMoneyInput(value)).toThrow();
  });
});
