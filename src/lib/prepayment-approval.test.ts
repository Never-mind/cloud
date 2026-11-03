import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({query:vi.fn(),write:vi.fn(),capacity:vi.fn(),begin:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()}));
vi.mock("./db",()=>({
  getDb:()=>({getConnection:async()=>({beginTransaction:mocks.begin,commit:mocks.commit,rollback:mocks.rollback,release:mocks.release,destroy:vi.fn()})}),
  queryRows:vi.fn(),execute:vi.fn(),queryRowsInTransaction:(_:unknown,sql:string,params:unknown)=>mocks.query(sql,params),
  executeInTransaction:(_:unknown,sql:string,params:unknown)=>mocks.write(sql,params),
}));
vi.mock("./prepayment-finance-service",()=>({lockPrepaymentCapacity:mocks.capacity}));
vi.mock("./invoice-service",()=>({}));
vi.mock("./feishu-message-service",()=>({getFeishuTenantAccessToken:async()=>"test-token"}));
import { submitInvoiceApproval, findActiveInvoiceApproval } from "./feishu-approval-service";
beforeEach(()=>{
  vi.resetAllMocks(); mocks.query.mockImplementation(async(sql:string)=>sql.includes("GET_LOCK")?[{acquired:1}]:[]);
  mocks.capacity.mockResolvedValue({rate:7});
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({code:0,data:{instance_code:"new-instance"}}))));
});
afterEach(()=>vi.unstubAllGlobals());
const request={currency:"USD",amountIncludingTax:"1000",taxRate:"6",businessExchangeRate:"7"};
const input={ownerType:"prepayment_contract" as const,ownerId:"stable-contract-id",ownerNo:"P-1",starterOpenId:"ou_test",approvalCode:"test-vat",form:[],businessRequest:request};
describe("partial prepayment approvals",()=>{
  it("allows multiple applications but atomically reserves each amount",async()=>{
    expect(await findActiveInvoiceApproval("prepayment_contract","stable-contract-id")).toBeNull();
    await submitInvoiceApproval(input);
    expect(mocks.capacity).toHaveBeenCalledWith(expect.anything(),"stable-contract-id",request);
    expect(mocks.query.mock.calls.some(([sql])=>sql.includes("SELECT id FROM merge_common_feishu_approvals"))).toBe(false);
    const record=mocks.write.mock.calls.find(([sql])=>sql.includes("INSERT INTO merge_common_feishu_approvals"))![1];
    expect(JSON.parse(record.businessRequestJson)).toEqual(request);
    expect(record).toMatchObject({ownerType:"prepayment_contract",ownerId:"stable-contract-id"});
    expect(mocks.commit).toHaveBeenCalledOnce(); expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("does not start a remote approval when the amount is already reserved",async()=>{
    mocks.capacity.mockRejectedValue(new Error("超过剩余可开金额"));
    await expect(submitInvoiceApproval(input)).rejects.toThrow("剩余可开");
    expect(fetch).not.toHaveBeenCalled();expect(mocks.write).not.toHaveBeenCalled();expect(mocks.rollback).toHaveBeenCalledOnce();
  });
  it("rolls back reservations if Feishu rejects the application",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({code:1390001,msg:"test rejection"}),{status:400})));
    await expect(submitInvoiceApproval(input)).rejects.toThrow("1390001");
    expect(mocks.write).not.toHaveBeenCalled();expect(mocks.rollback).toHaveBeenCalledOnce();expect(mocks.release).toHaveBeenCalledOnce();
  });
});
