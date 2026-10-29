import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("./db",()=>({queryRows:mocks.query}));
import {syncPendingInvoiceApprovals} from "./feishu-approval-service";
beforeEach(()=>{vi.resetAllMocks();mocks.query.mockResolvedValue([]);});
describe("invoice polling eligibility",()=>{
 it("only polls unfinished invoice workflows and retries failed returns",async()=>{
  await syncPendingInvoiceApprovals(20,true);
  const [sql,params]=mocks.query.mock.calls[0];
  expect(sql).toContain("ownerType IN ('cloud_row', 'billing_statement', 'service_fee', 'settlement_invoice')");
  expect(sql).toContain("lastSyncedAt IS NULL");expect(sql).toContain("TIMESTAMPADD(SECOND, -60");expect(params).toEqual({limit:20});
  expect(sql).toContain("NULLIF(invoiceId, '') IS NULL OR NULLIF(syncError, '') IS NOT NULL");
  expect(sql).not.toContain("86400");
 });
 it("keeps manual batch sync immediate and bounds its size",async()=>{
  await syncPendingInvoiceApprovals(1000);
  const [sql,params]=mocks.query.mock.calls[0];expect(sql).not.toContain("TIMESTAMPADD");expect(params).toEqual({limit:200});
 });
});
