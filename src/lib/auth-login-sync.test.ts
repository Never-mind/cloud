import {beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
const mock=vi.hoisted(()=>({valid:vi.fn(),user:vi.fn(),cookies:vi.fn(),audit:vi.fn(),schedule:vi.fn(),state:vi.fn(),exchange:vi.fn(),profile:vi.fn(),resolve:vi.fn()}));
vi.mock("@/lib/auth",()=>({validateLogin:mock.valid,getUserByEmail:mock.user}));
vi.mock("@/lib/auth-login-cookies",()=>({applyLoginCookies:mock.cookies}));
vi.mock("@/lib/operation-log",()=>({getOperationRequestId:()=>"request",recordOperationLog:mock.audit}));
vi.mock("@/lib/login-background-sync",()=>({scheduleLoginBackgroundSync:mock.schedule}));
vi.mock("@/lib/feishu-auth-service",()=>({verifyFeishuState:mock.state,exchangeFeishuCode:mock.exchange,fetchFeishuProfile:mock.profile,resolveFeishuLoginUser:mock.resolve,readNextFromState:()=>"/"}));
vi.mock("@/lib/feishu-auth-config",()=>({resolveFeishuRedirectUri:()=>"http://localhost/api/auth/feishu/callback"}));
import {POST} from "../app/api/auth/login/route";
import {GET} from "../app/api/auth/feishu/callback/route";
beforeEach(()=>{
 vi.resetAllMocks();mock.valid.mockResolvedValue(true);mock.user.mockResolvedValue({userId:"user",email:"user@example.com",displayName:"User"});mock.audit.mockResolvedValue(undefined);
 mock.state.mockReturnValue(true);mock.exchange.mockResolvedValue("test-token");mock.profile.mockResolvedValue({email:"user@example.com"});mock.resolve.mockResolvedValue({ok:true,email:"user@example.com",userId:"user"});
});
describe("only authenticated logins trigger demand sync",()=>{
 it("queues synchronization after a successful password login",async()=>{
  const response=await POST(new NextRequest("http://localhost/api/auth/login",{method:"POST",body:JSON.stringify({email:"user@example.com",password:"test"})}));
  expect(response.status).toBe(200);expect(mock.schedule).toHaveBeenCalledOnce();expect(mock.cookies.mock.invocationCallOrder[0]).toBeLessThan(mock.schedule.mock.invocationCallOrder[0]);
 });
 it("does not synchronize for a failed password login",async()=>{
  mock.valid.mockResolvedValue(false);expect((await POST(new NextRequest("http://localhost/api/auth/login",{method:"POST",body:"{}"}))).status).toBe(401);expect(mock.schedule).not.toHaveBeenCalled();
 });
 it("queues synchronization after successful Feishu login",async()=>{
  const response=await GET(new NextRequest("http://localhost/api/auth/feishu/callback?code=code&state=state"));expect(response.status).toBe(307);expect(mock.schedule).toHaveBeenCalledOnce();
 });
 it.each(["state","account"])("never synchronizes after rejected Feishu %s",async failure=>{
  if(failure==="state")mock.state.mockReturnValue(false);else mock.resolve.mockResolvedValue({ok:false,reason:"unauthorized"});
  const response=await GET(new NextRequest("http://localhost/api/auth/feishu/callback?code=code&state=state"));expect(response.headers.get("location")).toContain("/login?error=");expect(mock.schedule).not.toHaveBeenCalled();
 });
});
