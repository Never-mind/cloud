import { beforeEach, describe, expect, it, vi } from "vitest";
const mock=vi.hoisted(()=>({after:vi.fn(),config:vi.fn(),trigger:vi.fn()}));
vi.mock("next/server",()=>({after:mock.after}));
vi.mock("./frappe-demand-auto-sync",()=>({frappeDemandAutoSyncConfig:mock.config,triggerFrappeDemandAutoSync:mock.trigger}));
import {scheduleLoginBackgroundSync} from "./login-background-sync";
beforeEach(()=>{vi.resetAllMocks();mock.config.mockReturnValue({enabled:true,loginEnabled:true});});
describe("login background synchronization",()=>{
  it("schedules after response instead of waiting for remote synchronization",async()=>{
    const actor={userId:"user",displayName:"User",email:"user@example.com"};
    scheduleLoginBackgroundSync(actor);expect(mock.trigger).not.toHaveBeenCalled();
    await mock.after.mock.calls[0][0]();expect(mock.trigger).toHaveBeenCalledWith("login",actor);
  });
  it("respects the disabled login trigger",()=>{
    mock.config.mockReturnValue({enabled:true,loginEnabled:false});scheduleLoginBackgroundSync(null);expect(mock.after).not.toHaveBeenCalled();
  });
  it("does not turn scheduler initialization failure into a failed login",()=>{
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});mock.after.mockImplementation(()=>{throw new Error("unavailable");});
    expect(()=>scheduleLoginBackgroundSync(null)).not.toThrow();log.mockRestore();
  });
});
