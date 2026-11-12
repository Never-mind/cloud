import { describe,it,expect } from "vitest";
import { allocatePaymentAmount,assertSameCloudPaymentGroup,invoiceAllocationAmounts,parseCloudPaymentPlan,paymentCents,paymentTaxAmounts } from "./cloud-payment-allocation";

describe("supplier invoice/payment allocation arithmetic",()=>{
  it("conserves Maxinfo's 15,353.93 over seven four-decimal payables",()=>{
    const amounts=allocatePaymentAmount(15353.93,[387.4332,2742.3702,742.8247,704.6068,621.8112,5219.7433,4935.1362]);
    expect(amounts).toEqual([387.43,2742.37,742.83,704.61,621.81,5219.74,4935.14]);
    expect(amounts.reduce((sum,n)=>sum+paymentCents(n),0)).toBe(1535393);
  });
  it("handles a one-cent payment and zero-weight periods deterministically",()=>{
    expect(allocatePaymentAmount(.01,[1,1,0])).toEqual([.01,0,0]);
  });
  it.each([NaN,Infinity,"",null,1e12])("rejects invalid amount %s",value=>expect(()=>paymentCents(value)).toThrow());
  it("rejects negative and zero-sum allocation weights",()=>{
    expect(()=>allocatePaymentAmount(1,[1,-1])).toThrow();
    expect(()=>allocatePaymentAmount(1,[0,0])).toThrow();
  });
  it("splits net and tax, preserving invoice totals and tax rounding",()=>{
    const result=invoiceAllocationAmounts(100,.16,[33.33,33.33,33.34]);
    expect(result.reduce((sum,row)=>sum+paymentCents(row.amount),0)).toBe(10000);
    expect(result.reduce((sum,row)=>sum+paymentCents(row.netAmount),0)).toBe(8621);
    expect(result.reduce((sum,row)=>sum+paymentCents(row.taxAmount),0)).toBe(1379);
    expect(invoiceAllocationAmounts(100,0,[0,100])[0]).toEqual({amount:0,netAmount:0,taxAmount:0,taxRate:0});
  });
  it("rejects discrepancies, negative allocations and invalid tax",()=>{
    expect(()=>invoiceAllocationAmounts(100,0,[50,49.99])).toThrow("合计");
    expect(()=>invoiceAllocationAmounts(100,0,[-1,101])).toThrow();
    expect(()=>paymentTaxAmounts(10,2)).toThrow("税率");
  });
  it.each(["supplierId","payerUnitId","supplierPayableCurrency"])("requires matching %s",field=>{
    const row={supplierId:"s",payerUnitId:"u",supplierPayableCurrency:"USD"};
    expect(()=>assertSameCloudPaymentGroup([row,{...row,[field]:"other"}])).toThrow();
  });
  it("does not interpret legacy or invoice approvals as payment allocations",()=>{
    expect(parseCloudPaymentPlan(null)).toBeNull();
    expect(parseCloudPaymentPlan('{"kind":"invoice"}')).toBeNull();
    expect(()=>parseCloudPaymentPlan('{"kind":"cloud_supplier_payment","version":1,"entries":[]}')).toThrow();
  });
});
