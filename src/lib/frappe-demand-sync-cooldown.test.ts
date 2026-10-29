import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock=vi.hoisted(()=>({connect:vi.fn(),query:vi.fn(),execute:vi.fn(),end:vi.fn(),raw:vi.fn(),write:vi.fn(),fetch:vi.fn()}));
vi.mock("mysql2/promise",()=>({createConnection:mock.connect}));
vi.mock("./db",()=>({buildDbConfig:()=>({database:"test"}),queryRowsRaw:mock.raw,executeRaw:mock.write,getDb:vi.fn()}));
import {runFrappeDemandSync} from "./frappe-demand-sync-service";
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
beforeEach(()=>{
  vi.resetAllMocks();mock.connect.mockResolvedValue({query:mock.query,execute:mock.execute,end:mock.end});
  mock.query.mockImplementation(async(sql:string)=>sql.includes("GET_LOCK")?[[{acquired:1}]]:[[]]);
  mock.raw.mockResolvedValue([]);vi.stubGlobal("fetch",mock.fetch);
});
describe("shared demand-sync cooldown and lock",()=>{
  it("skips recent real runs inside the database lock without inserting another run or calling Frappe",async()=>{
    mock.query.mockImplementation(async(sql:string)=>sql.includes("GET_LOCK")?[[{acquired:1}]]:sql.includes("ageSeconds")?[[{ageSeconds:120}]]:[[]]);
    const result=await runFrappeDemandSync({triggerType:"login",minimumIntervalSeconds:300});
    expect(result).toMatchObject({skipped:"recent",retryAfterMs:180000});expect(mock.execute).not.toHaveBeenCalled();expect(mock.fetch).not.toHaveBeenCalled();
    expect(mock.query.mock.calls[1][0]).toContain("WHERE dryRun = 0");expect(mock.query.mock.calls[1][0]).toContain("GREATEST(startedAt, COALESCE(finishedAt, startedAt))");expect(mock.query).toHaveBeenLastCalledWith("SELECT RELEASE_LOCK(?)",["suanli-frappe-demand-sync"]);expect(mock.end).toHaveBeenCalledOnce();
  });
  it("skips automatic work if a manual run or another server holds the lock",async()=>{
    mock.query.mockResolvedValueOnce([[{acquired:0}]]);
    expect(await runFrappeDemandSync({triggerType:"scheduled",minimumIntervalSeconds:1800})).toMatchObject({skipped:"running"});
    expect(mock.execute).not.toHaveBeenCalled();expect(mock.query).toHaveBeenCalledOnce();expect(mock.end).toHaveBeenCalledOnce();
  });
  it("still tells manual callers about an overlapping run",async()=>{
    mock.query.mockResolvedValueOnce([[{acquired:0}]]);await expect(runFrappeDemandSync()).rejects.toThrow("正在执行");expect(mock.end).toHaveBeenCalledOnce();
  });
  it("records an actual attempted sync and releases its connection even when Frappe configuration fails",async()=>{
    // No remote credentials are read or used in this test.
    for(const key of ["FRAPPE_API_TOKEN","MATERIAL_API_TOKEN","FRAPPE_DEMAND_API_TOKEN"])vi.stubEnv(key,"");
    await expect(runFrappeDemandSync({triggerType:"scheduled",minimumIntervalSeconds:1800})).rejects.toThrow("密钥");
    expect(mock.execute.mock.calls[0][0]).toContain("INSERT INTO merge_power_demand_sync_runs");expect(mock.write.mock.calls[0][0]).toContain("finishedAt = CURRENT_TIMESTAMP");expect(mock.write.mock.calls[0][0]).not.toContain(":finishedAt");expect(mock.end).toHaveBeenCalledOnce();vi.unstubAllEnvs();
  });
});
