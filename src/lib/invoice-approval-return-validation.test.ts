import { beforeEach, expect, it, vi } from "vitest";
import type { InvoiceAllocationPlan } from "./invoice-allocation";
const mock=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("./db",()=>({queryRowsInTransaction:mock.query}));
import { validateMatchedReturn } from "./invoice-approval-return-validation";
const plan:InvoiceAllocationPlan={version:1,sourceType:"cloud_row",currency:"MXN",lineMode:"period",description:"Service",allocations:[100,200].map((n,i)=>({sourceType:"cloud_row",sourceId:`row${i}`,sourceNo:`Account ${i}`,account:`Account ${i}`,period:"202610",customerId:"customer",customerName:"Customer",undertakingUnitId:"unit",sourceCurrency:"USD",sourceNet:"10",sourceTax:"0",sourceTotal:"10",sourceTaxRate:"0",exchangeRate:"18",taxRate:"0",amountExcludingTax:String(n),taxAmount:"0",amountIncludingTax:String(n)}))};
const files=plan.allocations.map((row,i)=>({id:`file${i}`,fileName:`F${i}.pdf`,invoiceNo:`F${i}`,invoiceIdentity:`identity${i}`,recognitionJson:JSON.stringify({facts:{invoiceNo:`F${i}`,invoiceDate:"2026-11-11",currency:"MXN",amountExcludingTax:row.amountExcludingTax,taxAmount:"0",taxRate:"0",amountIncludingTax:row.amountIncludingTax},matches:{issuerUnitId:"unit",receiverCustomerId:"customer"}})}));
const approval={ownerId:"row0",allocationSourceIds:"row0,row1",allocationPlanJson:JSON.stringify(plan)};
const input={sourceType:"cloud_row" as const,sourceId:"row1",invoiceNo:"F1",invoiceDate:"2026-11-11",customerId:"customer",undertakingUnitId:"unit",currency:"MXN",amountExcludingTax:"200",taxAmount:"0",amountIncludingTax:"200"};
const subset={...plan,allocations:[{...plan.allocations[1]}]};
const options={instanceCode:"instance",fileId:"file1",relatedFileIds:["file1"]};
beforeEach(()=>{vi.resetAllMocks();mock.query.mockImplementation(async(_connection,sql)=>sql.includes("invoice_approval_files")?files:[]);});
it("accepts a non-owner account only when the locked return uniquely matches",async()=>{
 await expect(validateMatchedReturn({} as never,approval,input,subset,options)).resolves.toBeUndefined();
});
it.each(["amountExcludingTax","amountIncludingTax","exchangeRate","taxRate"])("rejects a caller-modified %s",async field=>{
 const changed={...subset,allocations:[{...subset.allocations[0],[field]:"999"}]};
 await expect(validateMatchedReturn({} as never,approval,input,changed,options)).rejects.toThrow();
});
it("rejects attaching another invoice's original to the same row",async()=>{
 await expect(validateMatchedReturn({} as never,approval,input,subset,{...options,relatedFileIds:["file0","file1"]})).rejects.toThrow("归组");
});
it("rejects registration after a concurrent worker has linked this invoice",async()=>{
 mock.query.mockResolvedValue(files.map(file=>({...file,invoiceId:"existing"})));
 await expect(validateMatchedReturn({} as never,approval,input,subset,options)).rejects.toThrow("已登记");
});
it("rejects a second invoice against an already consumed approval allocation",async()=>{
 mock.query.mockImplementation(async(_connection,sql)=>sql.includes("invoice_approval_files")?files:[{id:"existing"}]);
 await expect(validateMatchedReturn({} as never,approval,input,subset,options)).rejects.toThrow("已有发票");
});
