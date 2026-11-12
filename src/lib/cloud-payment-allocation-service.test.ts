import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({query:vi.fn(),txQuery:vi.fn(),write:vi.fn(),lock:vi.fn(),end:vi.fn(),remote:vi.fn(),upload:vi.fn(),execute:vi.fn(),transaction:vi.fn(),fetch:vi.fn()}));
vi.mock("mysql2/promise",()=>({createConnection:async()=>({query:mocks.lock,end:mocks.end})}));
vi.mock("./db",()=>({queryRows:mocks.query,queryRowsInTransaction:mocks.txQuery,executeInTransaction:mocks.write,execute:mocks.execute,buildDbConfig:()=>({}),withTransaction:mocks.transaction}));
vi.mock("./feishu-approval-service",()=>({fetchInvoiceApprovalInstance:mocks.remote,uploadApprovalAttachment:mocks.upload}));
vi.mock("./feishu-message-service",()=>({getFeishuTenantAccessToken:async()=>"test-token"}));
import { applyCloudPaymentAllocation,loadSupplierInvoiceAllocation,prepareCloudPaymentPlan,saveSupplierInvoiceAllocation,withCloudPaymentSources } from "./cloud-payment-allocation-service";
import { buildCostPaymentForm,submitCostPaymentApproval,syncCostPaymentApprovals,type CostPaymentEntryInput } from "./cost-payment-approval-service";
import { COST_PAYMENT_PROJECT_KEYS,COST_PAYMENT_LIST_WIDGETS } from "./cost-payment-project";

const source=(period:string,extra={})=>({id:"p"+period,period,supplierId:"s",payerUnitId:"u",supplierName:"Supplier",supplierPayableCurrency:"USD",supplierPayableTotalAmount:100,supplierTaxRate:0,paid:0,invoiceNo:null,...extra});
const entry=(period:string,extra={})=>({ownerType:"cloud_supplier_payment",ownerId:period+"::s",amount:100,currency:"USD",payee:"Supplier",bankAccount:"001",bankName:"Bank",swiftCode:"SWIFT",companyKey:"company",undertakingUnitCode:"MXGS01",paymentDate:"2099-01-01",...extra}) as CostPaymentEntryInput;
const actor={userId:"u",displayName:"tester",email:"tester@example.com"};
const invoiceInput=()=>({ownerIds:["202601::s","202602::s"],invoiceNo:"I-1",currency:"USD",totalAmount:200,taxRate:0,exchangeRate:1,invoiceDate:"2026-11-09",allocations:[{ownerId:"202601::s",amount:90},{ownerId:"202602::s",amount:110}],attachmentId:"file"});
beforeEach(()=>{
 vi.resetAllMocks();mocks.query.mockResolvedValue([]);mocks.write.mockResolvedValue({affectedRows:1});mocks.lock.mockResolvedValue([[{acquired:1}]]);
 mocks.transaction.mockImplementation(async(fn:(connection:unknown)=>unknown)=>fn({}));
});
afterEach(()=>vi.unstubAllGlobals());

describe("merged submission integration",()=>{
 it("creates one approval with all periods and uploads the shared file once",async()=>{
   mocks.query.mockImplementation(async(sql:string)=>sql.includes("SELECT * FROM merge_cloud_supplier_payments")?[source("202601"),source("202602")]:[]);
   mocks.upload.mockResolvedValue("file-token");
   const sample={amount:100,currency:"USD",payee:"Supplier",bankAccount:"001",bankName:"Bank",swiftCode:"SWIFT",feeKey:"none" as const,paymentDate:"2099-01-01",invoiceIssued:false,attachmentTokens:[]};
   const fields=(buildCostPaymentForm("other",{reason:"r",companyKey:"c",entries:[sample]})[4].value as Array<Array<{id:string;type:string;value:unknown}>>)[0];
   const issued=(buildCostPaymentForm("other",{reason:"r",companyKey:"c",entries:[{...sample,invoiceIssued:true}]})[4].value as Array<Array<{value:unknown}>>)[0];
   const definition=[{id:"widget17688921620770001",option:[{value:"mkm8pzj4-abuwjgwrngb-0",text:"Company"}]},{id:"widget17688932030050001",option:[{value:COST_PAYMENT_PROJECT_KEYS.other,text:"其他"}]},
    {id:COST_PAYMENT_LIST_WIDGETS.other,type:"fieldList",children:fields.map((field,i)=>({...field,option:field.type==="amount"?{currencyRange:["USD"]}:field.type==="radioV2"?[{value:field.value,text:field.value===issued[i].value?"无":"未开"},...(field.value===issued[i].value?[]:[{value:issued[i].value,text:"已开"}])]:undefined}))}];
   mocks.fetch.mockImplementation(async(_url:string,init:RequestInit)=>{
     if(!init?.method)return {json:async()=>({code:0,data:{form:JSON.stringify(definition)}})};
     return {json:async()=>({code:0,data:{instance_code:"one-instance"}})};
   });vi.stubGlobal("fetch",mocks.fetch);
   const entries=[entry("202601",{amount:90,companyKey:"mkm8pzj4-abuwjgwrngb-0",attachments:[{fileName:"invoice.pdf",dataUrl:"data:application/pdf;base64,dGVzdA=="}]}),entry("202602",{amount:110,companyKey:"mkm8pzj4-abuwjgwrngb-0"})];
   await submitCostPaymentApproval({branch:"huawei",costProject:"other",entries,reason:"two months",starter:{openId:"ou_test"}});
   expect(mocks.upload).toHaveBeenCalledOnce();
   const creates=mocks.fetch.mock.calls.filter(([,init])=>init?.method==="POST");expect(creates).toHaveLength(1);
   const form=JSON.parse(JSON.parse(creates[0][1].body).form);
   const detail=form.find((field:{type:string})=>field.type==="fieldList").value;
   expect(detail.map((row:Array<{type:string;value:unknown}>)=>row.find(field=>field.type==="amount")?.value)).toEqual([90,110]);
   const saved=mocks.write.mock.calls.find(([,sql])=>sql.includes("INSERT INTO merge_common_feishu_approvals"))![2];
   expect(saved.allocationSourceIds).toBe("202601::s,202602::s");
   expect(JSON.parse(saved.allocationPlanJson)).toMatchObject({total:200,entries:[{amount:90},{amount:110}]});
   expect(mocks.write.mock.calls.filter(([,sql])=>sql.includes("SET paymentApprovalId")).map(([, ,params])=>params.id)).toEqual(["p202601","p202602"]);
 });
});

describe("cloud payment source validation and immutable plans",()=>{
 it("canonicalizes physical IDs and rounds Feishu and plan amounts identically",async()=>{
   const result=await prepareCloudPaymentPlan([source("202601")],[entry("202601",{ownerId:"p202601",supplierId:"forged",period:"wrong",amount:100.1234})]);
   expect(result.entries[0]).toMatchObject({ownerId:"202601::s",supplierId:"s",period:"202601",amount:100.12});
   expect(result.plan).toMatchObject({total:100.12,entries:[{paymentRecordId:"p202601",amount:100.12,netAmount:100.12,taxAmount:0}]});
 });
 it("does not truncate 13+ month source links",async()=>{
   const periods=Array.from({length:18},(_,i)=>String(202501+i));
   const result=await prepareCloudPaymentPlan(periods.map(p=>source(p)),periods.map(p=>entry(p)));
   expect(result.plan.entries).toHaveLength(18);expect(result.plan.total).toBe(1800);
 });
 it.each(["pending","returned","approved"])("blocks duplicate %s approvals",async status=>{
   mocks.query.mockResolvedValue([{status,ownerId:"other",allocationSourceIds:"202601::s"}]);
   await expect(prepareCloudPaymentPlan([source("202601")],[entry("202601")])).rejects.toThrow("重复申请");
 });
 it("blocks paid records, mismatched accounts and missing conversion rates",async()=>{
   await expect(prepareCloudPaymentPlan([source("202601",{paid:1})],[entry("202601")])).rejects.toThrow("已付款");
   await expect(prepareCloudPaymentPlan([source("202601"),source("202602")],[entry("202601"),entry("202602",{bankAccount:"002"})])).rejects.toThrow("账户");
   await expect(prepareCloudPaymentPlan([source("202601")],[entry("202601",{currency:"CNY"})])).rejects.toThrow("汇率");
 });
 it("locks a supplier and releases the lock on remote failure",async()=>{
   mocks.query.mockResolvedValue([source("202601")]);
   await expect(withCloudPaymentSources(["202601::s"],async()=>{throw new Error("remote failed");})).rejects.toThrow("remote failed");
   expect(mocks.lock.mock.calls.at(-1)?.[0]).toContain("RELEASE_LOCK");expect(mocks.end).toHaveBeenCalled();
 });
 it("does not proceed if another submission owns the supplier lock",async()=>{
   mocks.query.mockResolvedValue([source("202601")]);mocks.lock.mockResolvedValue([[{acquired:0}]]);
   const work=vi.fn();await expect(withCloudPaymentSources(["202601::s"],work)).rejects.toThrow("正在办理");expect(work).not.toHaveBeenCalled();
 });
});

describe("confirmed payment backfill",()=>{
 async function setup(applied=false){
   const {plan}=await prepareCloudPaymentPlan([source("202601"),source("202602")],[entry("202601",{amount:90}),entry("202602",{amount:110})]);
   if(applied)plan.appliedAt="2026-11-09";
   mocks.txQuery.mockImplementation(async(_connection,sql:string)=>sql.includes("feishu_approvals")?[{allocationPlanJson:JSON.stringify(plan)}]:[source("202601",{paymentApprovalId:"approval"}),source("202602",{paymentApprovalId:"approval"})]);
   return plan;
 }
 it("atomically writes exact allocations then marks them applied",async()=>{
   await setup();await applyCloudPaymentAllocation("approval","2026-11-09");
   expect(mocks.transaction).toHaveBeenCalledOnce();expect(mocks.write).toHaveBeenCalledTimes(3);
   expect(mocks.write.mock.calls[0][2]).toMatchObject({amount:90,paymentRecordId:"p202601",paidDate:"2026-11-09"});
   expect(mocks.write.mock.calls[1][2]).toMatchObject({amount:110,paymentRecordId:"p202602"});
   expect(JSON.parse(mocks.write.mock.calls[2][2].plan).appliedAt).toBeTruthy();
 });
 it("preserves subsequent manual edits on repeated sync",async()=>{
   await setup(true);await applyCloudPaymentAllocation("approval","2026-11-10");expect(mocks.write).not.toHaveBeenCalled();
 });
 it("does not write amounts without payment confirmation",async()=>{
   await setup();await applyCloudPaymentAllocation("approval","");expect(mocks.transaction).not.toHaveBeenCalled();
 });
 it("detects changed source association before writes",async()=>{
   const plan=await setup();mocks.txQuery.mockResolvedValueOnce([{allocationPlanJson:JSON.stringify(plan)}]).mockResolvedValueOnce([source("202601",{paymentApprovalId:"different"})]);
   await expect(applyCloudPaymentAllocation("approval","2026-11-09")).rejects.toThrow("来源已变更");expect(mocks.write).not.toHaveBeenCalled();
 });
 it("keeps approved-but-unpaid allocations in the polling queue",async()=>{
   const plan=await setup();mocks.query.mockResolvedValue([{id:"approval",instanceCode:"instance",status:"pending",ownerType:"cloud_supplier_payment",ownerId:"202601::s",allocationSourceIds:"202601::s,202602::s",allocationPlanJson:JSON.stringify(plan)}]);
   mocks.remote.mockResolvedValue({status:"approved",paymentConfirmedAt:null});
   await syncCostPaymentApprovals();expect(mocks.write).not.toHaveBeenCalled();
   expect(mocks.execute.mock.calls.some(([sql])=>sql.includes("merge_cloud_supplier_payments"))).toBe(false);
   expect(mocks.query.mock.calls.at(-1)?.[0]).toContain("paymentConfirmedAt IS NULL");
 });
});

describe("shared supplier invoice registration",()=>{
 it("returns date-only strings without UTC conversion shifting a day",async()=>{
   mocks.query.mockResolvedValueOnce([source("202601",{invoiceDate:new Date(2026,9,29),paymentDate:new Date(2026,10,6)})]).mockResolvedValueOnce([]);
   const result=await loadSupplierInvoiceAllocation(["202601::s"]);
   expect(result.rows[0]).toMatchObject({invoiceDate:"2026-10-29",paymentDate:"2026-11-06"});
 });
 function setup(extraRows:unknown[]=[]){
   const rows=[source("202601"),source("202602")];mocks.query.mockResolvedValue(rows);
   mocks.txQuery.mockImplementation(async(_c,sql:string)=>sql.includes("id NOT IN")?extraRows:sql.includes("supplier_payments")?[...rows,...extraRows]:sql.includes("SELECT * FROM merge_cloud_attachments")?[{id:"file",fileName:"invoice.pdf",fileType:"application/pdf",fileSize:3,storageProvider:"obs",storageKey:"original.pdf"}]:sql.includes("merge_common_suppliers")?[{name:"Supplier"}]:[]);
 }
 it("saves one invoice number and allocated amounts, linking the same file to both periods",async()=>{
   setup();const result=await saveSupplierInvoiceAllocation(invoiceInput(),actor);expect(result).toMatchObject({count:2,totalAmount:200});
   const writes=mocks.write.mock.calls.filter(([,sql])=>sql.includes("UPDATE merge_cloud_supplier_payments"));
   expect(writes.map(call=>call[2].amount)).toEqual([90,110]);expect(writes.every(call=>call[2].invoiceNo==="I-1")).toBe(true);
   expect(mocks.write.mock.calls.filter(([,sql])=>sql.includes("INSERT INTO merge_cloud_attachments")).map(call=>call[2].storageKey)).toEqual(["original.pdf","original.pdf"]);
 });
 it("requires inclusion of an existing whole-invoice period",async()=>{
   setup([source("202603",{invoiceNo:"I-1"})]);await expect(saveSupplierInvoiceAllocation(invoiceInput(),actor)).rejects.toThrow("一并选择");expect(mocks.write).not.toHaveBeenCalled();
 });
 it("does not overwrite another invoice",async()=>{
   setup();mocks.txQuery.mockResolvedValueOnce([source("202601",{invoiceNo:"different"}),source("202602")]);
   await expect(saveSupplierInvoiceAllocation(invoiceInput(),actor)).rejects.toThrow("不能覆盖");expect(mocks.write).not.toHaveBeenCalled();
 });
 it("rejects duplicated logical sources sent via physical and composite IDs",async()=>{
   setup();const input=invoiceInput();input.allocations[1].ownerId="p202601";
   await expect(saveSupplierInvoiceAllocation(input,actor)).rejects.toThrow("重复或缺失");expect(mocks.write).not.toHaveBeenCalled();
 });
 it("rejects totals before any database changes",async()=>{
   setup();await expect(saveSupplierInvoiceAllocation({...invoiceInput(),totalAmount:201},actor)).rejects.toThrow("合计");expect(mocks.write).not.toHaveBeenCalled();
 });
 it("rejects attachments outside selected periods",async()=>{
   setup();mocks.txQuery.mockImplementation(async(_c,sql:string)=>sql.includes("id NOT IN")?[]:sql.includes("supplier_payments")?[source("202601"),source("202602")]:[]);
   await expect(saveSupplierInvoiceAllocation(invoiceInput(),actor)).rejects.toThrow("不属于");expect(mocks.write).not.toHaveBeenCalled();
 });
});
