import {beforeEach,describe,expect,it,vi} from "vitest";
const mock=vi.hoisted(()=>({query:vi.fn(),write:vi.fn(),remote:vi.fn()}));
vi.mock("./db",()=>({queryRows:mock.query,execute:mock.write}));
vi.mock("./feishu-approval-service",()=>({fetchInvoiceApprovalInstance:mock.remote}));
import {syncCostPaymentApprovals} from "./cost-payment-approval-service";
const row=(id:string)=>({id,instanceCode:id,status:"pending",ownerType:"purchase_order_payment",ownerId:id,allocationSourceIds:null});
beforeEach(()=>{vi.resetAllMocks();mock.query.mockResolvedValue([]);mock.remote.mockResolvedValue({status:"approved",remoteStatus:"APPROVED",serialNumber:"serial",rejectReason:"",finishedAt:null,paymentConfirmedAt:null,paymentConfirmedNode:""});});
describe("payment synchronization work queue",()=>{
 it("only checks unfinished or failed records, oldest checked first, bounded and throttled",async()=>{
  await syncCostPaymentApprovals(999,true);const sql=mock.query.mock.calls[0][0];
  expect(sql).toContain("status IN ('pending', 'returned') OR NULLIF(syncError, '') IS NOT NULL");expect(sql).toContain("ORDER BY COALESCE(lastSyncedAt, submittedAt) ASC LIMIT 200");expect(sql).toContain("TIMESTAMPADD(SECOND, -60");
 });
 it("backfills payment before marking the approval complete",async()=>{
  mock.query.mockResolvedValue([row("one")]);await syncCostPaymentApprovals();
  expect(mock.write.mock.calls[0][0]).toContain("UPDATE merge_power_purchaseorders");expect(mock.write.mock.calls[1][0]).toContain("SET status = :status");
 });
 it("continues other approvals after one remote error and rotates the failed record",async()=>{
  mock.query.mockResolvedValue([row("one"),row("two")]);mock.remote.mockRejectedValueOnce(new Error("timeout"));
  const result=await syncCostPaymentApprovals();expect(result.errors).toEqual([{instanceCode:"one",error:"timeout"}]);expect(result.results).toHaveLength(1);expect(mock.remote).toHaveBeenCalledTimes(2);
  expect(mock.write.mock.calls[0][0]).toContain("lastSyncedAt = CURRENT_TIMESTAMP");
 });
 it("does not advance status when the source update fails",async()=>{
  mock.query.mockResolvedValue([row("one")]);mock.write.mockRejectedValueOnce(new Error("source failed"));const result=await syncCostPaymentApprovals();
  expect(result.errors).toHaveLength(1);expect(mock.write.mock.calls.some(([sql])=>sql.includes("SET status = :status"))).toBe(false);
 });
 it("leaves unchanged pending payment data alone",async()=>{
  mock.query.mockResolvedValue([row("one")]);mock.remote.mockResolvedValue({status:"pending",paymentConfirmedAt:null});await syncCostPaymentApprovals();
  expect(mock.write.mock.calls.some(([sql])=>sql.includes("UPDATE merge_power_purchaseorders"))).toBe(false);
 });
});
