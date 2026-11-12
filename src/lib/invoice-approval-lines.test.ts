import { describe, expect, it } from "vitest";
import { approvalInvoiceLineTotal, parseMexicoInvoiceLines, readMexicoInvoiceExpectation, validateMexicoInvoiceLines } from "./invoice-approval-lines";

const lines = ["9290.82", "100002.00"].map(amountIncludingTax => ({ amountIncludingTax, invoiceContent: "Servicios relacionados con la Voice servicio", cfdiCodeKey: "G03-key" }));
describe("editable Feishu invoice rows", () => {
  it("validates the screenshot's two independent rows against the complete invoice", () => {
    expect(validateMexicoInvoiceLines(lines, "109292.82", ["G03-key"])).toEqual(lines);
    expect(approvalInvoiceLineTotal([{amountIncludingTax:"0.10"},{amountIncludingTax:"0.20"}])).toBe("0.30");
  });
  it.each([[], null, {}, [{...lines[0],amountIncludingTax:""}], [{...lines[0],amountIncludingTax:"NaN"}], [{...lines[0],amountIncludingTax:"1,23.4"}], [{...lines[0],invoiceContent:" "}], [{...lines[0],cfdiCodeKey:""}], Array(101).fill(lines[0])])("rejects malformed or incomplete details", value => {
    expect(() => parseMexicoInvoiceLines(value)).toThrow();
  });
  it("normalizes pasted or calculated MXN amounts before summing and submitting",()=>{
    const input=[{...lines[0],amountIncludingTax:" 11,516.540000000001 ",allocationSourceId:"account-1"},{...lines[1],amountIncludingTax:"９２３７６．１３００００" ,allocationSourceId:"account-2"}];
    expect(approvalInvoiceLineTotal(input)).toBe("103892.67");
    expect(validateMexicoInvoiceLines(input,"103892.67").map(row=>[row.amountIncludingTax,row.allocationSourceId])).toEqual([["11516.54","account-1"],["92376.13","account-2"]]);
    expect(parseMexicoInvoiceLines([{...lines[0],amountIncludingTax:"1.005"}])[0].amountIncludingTax).toBe("1.01");
    expect(parseMexicoInvoiceLines([{...lines[0],amountIncludingTax:"-1.005"}])[0].amountIncludingTax).toBe("-1.01");
  });
  it("rejects differences, zero totals and stale option keys", () => {
    expect(() => validateMexicoInvoiceLines(lines,"9290.82")).toThrow("合计");
    expect(() => validateMexicoInvoiceLines([{...lines[0],amountIncludingTax:"0"}],"0")).toThrow("大于零");
    expect(() => validateMexicoInvoiceLines(lines,"109292.82",["other"])).toThrow("失效");
  });
  it("keeps negative service adjustments as separate rows with a positive total", () => {
    expect(approvalInvoiceLineTotal(validateMexicoInvoiceLines([{...lines[0],amountIncludingTax:"100"},{...lines[1],amountIncludingTax:"-10"}],"90"))).toBe("90.00");
  });
  it("reads all persisted rows, with exact cents and one currency", () => {
    const form = [{id:"widget17634576967120001",value:lines.map(line => [{id:"widget17634577022660001",currency:"MXN",value:Number(line.amountIncludingTax)}])}];
    expect(readMexicoInvoiceExpectation(JSON.stringify(form))).toEqual({currency:"MXN",amountIncludingTax:"109292.82"});
    form[0].value[1][0].currency="USD";
    expect(readMexicoInvoiceExpectation(form)).toBeNull();
    expect(readMexicoInvoiceExpectation("invalid")).toBeNull();
  });
});
