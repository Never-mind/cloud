import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("./frappe-demand-sync-service", () => ({ runFrappeDemandSync: mock.run }));
import { frappeDemandAutoSyncConfig, startFrappeDemandAutoSync, triggerFrappeDemandAutoSync } from "./frappe-demand-auto-sync";
let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks();
  for (const [key,value] of Object.entries({NODE_ENV:"production",NEXT_PHASE:"",FRAPPE_API_TOKEN:"test",MATERIAL_API_TOKEN:"",FRAPPE_DEMAND_API_TOKEN:"",FRAPPE_DEMAND_AUTO_SYNC:"1",FRAPPE_DEMAND_AUTO_SYNC_INTERVAL_SECONDS:"",FRAPPE_DEMAND_SYNC_ON_LOGIN:"1",FRAPPE_DEMAND_LOGIN_SYNC_COOLDOWN_SECONDS:""})) vi.stubEnv(key,value);
  mock.run.mockResolvedValue({runId:"run",createdRequests:1});
  vi.spyOn(console,"info").mockImplementation(()=>{});vi.spyOn(console,"error").mockImplementation(()=>{});
});
afterEach(()=>{stop?.();stop=undefined;vi.useRealTimers();vi.unstubAllEnvs();vi.restoreAllMocks();});
describe("Frappe automatic demand synchronization",()=>{
  it("runs once at startup and every thirty minutes, with a single timer",async()=>{
    stop=startFrappeDemandAutoSync();expect(startFrappeDemandAutoSync()).toBe(stop);
    await vi.advanceTimersByTimeAsync(4999);expect(mock.run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);expect(mock.run).toHaveBeenCalledWith({triggerType:"scheduled",actor:null,minimumIntervalSeconds:1800});
    await vi.advanceTimersByTimeAsync(1800000);expect(mock.run).toHaveBeenCalledTimes(2);
    stop?.();await vi.advanceTimersByTimeAsync(1800000);expect(mock.run).toHaveBeenCalledTimes(2);
  });
  it("coalesces concurrent logins and does not overlap a scheduled run",async()=>{
    let finish!: (value:unknown)=>void;mock.run.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const actor={userId:"user",displayName:"User",email:"test@example.com"};
    const first=triggerFrappeDemandAutoSync("login",actor),second=triggerFrappeDemandAutoSync("login",actor);
    stop=startFrappeDemandAutoSync();await vi.advanceTimersByTimeAsync(5000);
    expect(mock.run).toHaveBeenCalledOnce();expect(mock.run).toHaveBeenCalledWith({triggerType:"login",actor,minimumIntervalSeconds:300});
    finish({runId:"run"});await Promise.all([first,second]);await vi.advanceTimersByTimeAsync(0);
  });
  it("uses the remaining shared cooldown rather than delaying a whole extra interval",async()=>{
    mock.run.mockResolvedValueOnce({skipped:"recent",retryAfterMs:100000});stop=startFrappeDemandAutoSync();
    await vi.advanceTimersByTimeAsync(5000);await vi.advanceTimersByTimeAsync(99999);expect(mock.run).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);expect(mock.run).toHaveBeenCalledTimes(2);
  });
  it("isolates a remote failure from login and retries the next scheduled run",async()=>{
    mock.run.mockRejectedValueOnce(new Error("remote down"));await expect(triggerFrappeDemandAutoSync("login")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();stop=startFrappeDemandAutoSync();await vi.advanceTimersByTimeAsync(5000);expect(mock.run).toHaveBeenCalledTimes(2);
  });
  it.each([["NODE_ENV","test"],["NEXT_PHASE","phase-production-build"],["FRAPPE_DEMAND_AUTO_SYNC","0"],["FRAPPE_API_TOKEN",""]])("does not start remote work with %s=%s",async(key,value)=>{
    vi.stubEnv(key,value);stop=startFrappeDemandAutoSync();await triggerFrappeDemandAutoSync("login");await vi.advanceTimersByTimeAsync(2000000);expect(mock.run).not.toHaveBeenCalled();
  });
  it("supports an independent login switch and validated intervals",async()=>{
    vi.stubEnv("FRAPPE_DEMAND_SYNC_ON_LOGIN","0");vi.stubEnv("FRAPPE_DEMAND_AUTO_SYNC_INTERVAL_SECONDS","600");
    await triggerFrappeDemandAutoSync("login");expect(mock.run).not.toHaveBeenCalled();expect(frappeDemandAutoSyncConfig().intervalSeconds).toBe(600);
    vi.stubEnv("FRAPPE_DEMAND_AUTO_SYNC_INTERVAL_SECONDS","NaN");expect(frappeDemandAutoSyncConfig().intervalSeconds).toBe(1800);
  });
  it("does not reschedule when stopped during a slow synchronization",async()=>{
    let finish!: (value:unknown)=>void;mock.run.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    stop=startFrappeDemandAutoSync();await vi.advanceTimersByTimeAsync(5000);stop?.();finish({runId:"run"});
    await vi.advanceTimersByTimeAsync(4000000);expect(mock.run).toHaveBeenCalledOnce();
  });
});
