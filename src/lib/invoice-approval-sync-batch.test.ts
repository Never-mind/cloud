import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({connect:vi.fn(),query:vi.fn(),end:vi.fn(),sync:vi.fn()}));
vi.mock("mysql2/promise",()=>({createConnection:mocks.connect}));
vi.mock("./db",()=>({buildDbConfig:()=>({host:"test-host",database:"test-db",user:"test-user",port:3306})}));
vi.mock("./feishu-approval-service",()=>({syncPendingInvoiceApprovals:mocks.sync}));
import {syncInvoiceApprovalBatch} from "./invoice-approval-sync-batch";
beforeEach(()=>{vi.resetAllMocks();mocks.connect.mockResolvedValue({query:mocks.query,end:mocks.end});mocks.query.mockResolvedValue([[{acquired:1}]]);mocks.sync.mockResolvedValue({checked:1,updated:1,errors:[]});});
describe("cross-process invoice polling lock",()=>{
 it("does not use the application pool and releases the lock after syncing",async()=>{
  expect(await syncInvoiceApprovalBatch()).toMatchObject({checked:1,skipped:false});
  expect(mocks.sync).toHaveBeenCalledWith(20,true);
  expect(mocks.query).toHaveBeenLastCalledWith("SELECT RELEASE_LOCK(?)",[expect.stringMatching(/^invoice-return-sync:/)]);
  expect(mocks.end).toHaveBeenCalledOnce();
 });
 it("skips if another server owns the lock",async()=>{
  mocks.query.mockResolvedValueOnce([[{acquired:0}]]);
  expect(await syncInvoiceApprovalBatch()).toMatchObject({checked:0,skipped:true});
  expect(mocks.sync).not.toHaveBeenCalled();expect(mocks.query).toHaveBeenCalledTimes(1);expect(mocks.end).toHaveBeenCalledOnce();
 });
 it("releases the connection and lock on a batch failure",async()=>{
  mocks.sync.mockRejectedValueOnce(new Error("failure"));
  await expect(syncInvoiceApprovalBatch()).rejects.toThrow("failure");
  expect(mocks.query).toHaveBeenLastCalledWith("SELECT RELEASE_LOCK(?)",expect.any(Array));expect(mocks.end).toHaveBeenCalledOnce();
 });
});
