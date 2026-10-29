import {beforeEach,describe,expect,it,vi} from "vitest";
import type {InvoiceRecognition} from "./invoice-recognition-service";
const mocks=vi.hoisted(()=>({query:vi.fn(),files:vi.fn(),review:vi.fn(),content:vi.fn(),save:vi.fn(),audit:vi.fn()}));
vi.mock("./db",()=>({queryRows:mocks.query}));
vi.mock("./invoice-approval-return-service",()=>({listReturnedInvoiceFiles:mocks.files,returnedInvoiceReview:mocks.review,returnedInvoiceContent:mocks.content}));
vi.mock("./invoice-service",()=>({saveInvoice:mocks.save}));
vi.mock("./operation-log",()=>({recordOperationLog:mocks.audit}));
import {autoRegisterReturnedInvoice} from "./invoice-approval-auto-register";
const facts={invoiceNo:"26952000000000000001",invoiceDate:"2026-10-28",currency:"CNY",exchangeRate:"",amountExcludingTax:"852929.65",taxRate:"6",taxAmount:"51175.78",amountIncludingTax:"904105.43",issuerName:"实际开票单位",issuerTaxNumber:"UNIT-TAX",receiverName:"实际收票客户",receiverTaxNumber:"CUSTOMER-TAX",taxUuid:""};
const recognition={facts,matches:{issuerUnitId:"unit-b",receiverCustomerId:"customer-b"}} as InvoiceRecognition;
const pdf={id:"pdf",fileName:`invoice_${facts.invoiceNo}.pdf`,invoiceIdentity:"identity",invoiceNo:facts.invoiceNo,invoiceId:"",recognition,recognitionError:""};
const review=()=>({base:{sourceNo:"202607 account",period:"202607",currency:"USD",exchangeRate:"1",paymentTermDays:30},approval:{status:"approved",sourceType:"cloud_row",sourceId:"row",allocationSourceIds:[]},allocationPlan:null,partySnapshot:{customerId:"customer-b",undertakingUnitId:"unit-b",customer:{address:"审批地址"}},expectedInvoice:{currency:"CNY",amountIncludingTax:"904105.43"}});
beforeEach(()=>{vi.resetAllMocks();mocks.query.mockResolvedValue([{status:"approved",invoiceId:null}]);mocks.files.mockResolvedValue([pdf,{...pdf,id:"ofd",fileName:`invoice_${facts.invoiceNo}.ofd`,invoiceIdentity:"",invoiceNo:"",recognition:null,recognitionError:"unsupported"}]);mocks.review.mockResolvedValue(review());mocks.content.mockResolvedValue({fileName:pdf.fileName,fileType:"application/pdf",bytes:Buffer.from("pdf")});mocks.save.mockResolvedValue({id:"invoice"});});
describe("automatic return posting",()=>{
 it.each(["cloud_row","service_fee","billing_statement","settlement_invoice"])("posts %s with actual invoice parties, currency and dates without manual confirmation",async sourceType=>{
  const data=review();data.approval.sourceType=sourceType;mocks.review.mockResolvedValue(data);
  expect(await autoRegisterReturnedInvoice("instance")).toMatchObject({status:"registered",invoiceId:"invoice"});
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({source:"external",sourceType,sourceId:"row",period:"202607",invoiceNo:facts.invoiceNo,currency:"CNY",exchangeRate:"",amountIncludingTax:"904105.43",customerId:"customer-b",undertakingUnitId:"unit-b",invoiceDate:"2026-10-28",dueDate:"2026-11-27",paymentTermDays:30,file:expect.objectContaining({fileType:"application/pdf"})}),{name:"飞书回票自动登记"},{instanceCode:"instance",fileId:"pdf",relatedFileIds:["pdf","ofd"],mode:"automatic"});
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({action:"auto_register_return"}));
 });
 it.each(["cloud_row","service_fee"])("preserves six-period allocation amounts for %s even when the invoice has one summary line",async sourceType=>{
  const data=review();const plan={version:1,sourceType,currency:"CNY",lineMode:"summary",summaryCompatible:true,description:"202512–202605服务费",allocations:["202512","202601","202602","202603","202604","202605"].map((period,i)=>({sourceId:`row${i}`,sourceType,period,sourceCurrency:"USD",exchangeRate:"7",taxRate:"6",amountExcludingTax:"700",taxAmount:"42",amountIncludingTax:"742"}))};
  mocks.review.mockResolvedValue({...data,allocationPlan:plan,approval:{...data.approval,sourceType,sourceId:"row0",allocationSourceIds:plan.allocations.map(row=>row.sourceId)}});
  mocks.files.mockResolvedValue([{...pdf,recognition:{...recognition,facts:{...facts,amountExcludingTax:"4200",taxAmount:"252",amountIncludingTax:"4452"}}}]);
  await autoRegisterReturnedInvoice("instance");expect(mocks.save.mock.calls[0][0].allocationPlan).toEqual(plan);
 });
 it.each(["pending","returned","rejected","canceled"])("does not post a %s approval",async status=>{mocks.query.mockResolvedValue([{status}]);expect((await autoRegisterReturnedInvoice("instance")).status).toBe("waiting");expect(mocks.save).not.toHaveBeenCalled();});
 it("never overwrites a registered invoice on later polling",async()=>{mocks.query.mockResolvedValue([{status:"approved",invoiceId:"existing"}]);expect((await autoRegisterReturnedInvoice("instance")).invoiceId).toBe("existing");expect(mocks.files).not.toHaveBeenCalled();expect(mocks.save).not.toHaveBeenCalled();});
 it("treats a concurrent successful registration as idempotent",async()=>{mocks.save.mockRejectedValueOnce(new Error("already registered"));mocks.query.mockResolvedValueOnce([{status:"approved"}]).mockResolvedValueOnce([{invoiceId:"other-run"}]);expect((await autoRegisterReturnedInvoice("instance")).invoiceId).toBe("other-run");expect(mocks.save).toHaveBeenCalledOnce();});
 it("reports missing recognition instead of inventing invoice facts",async()=>{mocks.files.mockResolvedValue([{...pdf,recognition:null,recognitionError:"unreadable"}]);await expect(autoRegisterReturnedInvoice("instance")).rejects.toThrow("unreadable");expect(mocks.save).not.toHaveBeenCalled();});
 it("does not guess unmatched partners",async()=>{mocks.files.mockResolvedValue([{...pdf,recognition:{...recognition,matches:{}}}]);await expect(autoRegisterReturnedInvoice("instance")).rejects.toThrow("未唯一匹配");expect(mocks.save).not.toHaveBeenCalled();});
 it("does not merge different invoice numbers",async()=>{mocks.files.mockResolvedValue([pdf,{...pdf,id:"another",invoiceIdentity:"another",invoiceNo:"ANOTHER"}]);await expect(autoRegisterReturnedInvoice("instance")).rejects.toThrow("多张发票");expect(mocks.save).not.toHaveBeenCalled();});
 it("does not copy whole invoice totals to multiple periods without an allocation",async()=>{const data=review();mocks.review.mockResolvedValue({...data,approval:{...data.approval,allocationSourceIds:["row1","row2"]}});await expect(autoRegisterReturnedInvoice("instance")).rejects.toThrow("分摊");expect(mocks.save).not.toHaveBeenCalled();});
 it("uses actual single-period invoice amounts even if application amounts differ",async()=>{mocks.review.mockResolvedValue({...review(),expectedInvoice:{currency:"CNY",amountIncludingTax:"900000"}});await autoRegisterReturnedInvoice("instance");expect(mocks.save.mock.calls[0][0].amountIncludingTax).toBe("904105.43");});
 it("surfaces a persistence failure so the next cycle can retry",async()=>{mocks.save.mockRejectedValueOnce(new Error("transaction failed"));await expect(autoRegisterReturnedInvoice("instance")).rejects.toThrow("transaction failed");expect(mocks.audit).not.toHaveBeenCalled();});
 it("rejects a return whose currency differs from the approved VAT application",async()=>{mocks.files.mockResolvedValue([{...pdf,recognition:{...recognition,facts:{...facts,currency:"USD"}}}]);await expect(autoRegisterReturnedInvoice("instance")).rejects.toThrow("币种");expect(mocks.save).not.toHaveBeenCalled();});
 it("does not silently adjust an allocation to a different returned total",async()=>{
  const data=review();mocks.review.mockResolvedValue({...data,allocationPlan:{version:1,sourceType:"cloud_row",currency:"CNY",lineMode:"period",allocations:[{sourceId:"row",sourceType:"cloud_row",period:"202607",sourceCurrency:"CNY",exchangeRate:"1",taxRate:"6",amountExcludingTax:"100",taxAmount:"6",amountIncludingTax:"106"}]}});
  await expect(autoRegisterReturnedInvoice("instance")).rejects.toThrow();expect(mocks.save).not.toHaveBeenCalled();
 });
});
