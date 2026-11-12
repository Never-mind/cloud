import { describe, expect, it } from "vitest";
import { customerMatchReasons, nextCustomerCode, normalizeProspect, normalizeProspectCustomer, validProspectDate } from "./prospect";
import { getRoutePermission, hasPermission, permissionMask } from "./permission-definitions";
describe("潜在客户与转化",()=>{
  it("整页新建表单及草稿接口要求新增权限",()=>{
    expect(getRoutePermission('/prospects/new')).toEqual({moduleKey:'prospects',action:'create'});
    expect(getRoutePermission('/api/prospects/new')).toEqual({moduleKey:'prospects',action:'create'});
  });
  it("仅名称必填，保留联系方式及日期",()=>{expect(normalizeProspect({name:' 公司A ',nextFollowUpDate:'2026-11-15'})).toMatchObject({name:'公司A',status:'new',nextFollowUpDate:'2026-11-15'});expect(()=>normalizeProspect({name:''})).toThrow('公司名称');});
  it("拒绝无效日期和直接伪造已转化状态",()=>{expect(()=>validProspectDate('2026-02-30')).toThrow();expect(()=>normalizeProspect({name:'A',status:'converted'})).toThrow('转为客户');expect(()=>normalizeProspect({name:'A',status:'invalid'})).toThrow();});
  it("税号及中英文全称归一化查重，不使用简称误匹配",()=>{expect(customerMatchReasons({name:'ABC, Ltd.',taxNumber:'MX-123'},{name:'abc ltd',taxNumber:'mx123'})).toEqual(['税号相同','公司名称相同']);expect(customerMatchReasons({name:'新公司'},{name:'公司B',shortName:'新公司'})).toEqual([]);expect(customerMatchReasons({name:'公司A',nameEn:'ACME ＬＴＤ'},{nameEn:'acme ltd'})).toEqual(['公司名称相同']);expect(customerMatchReasons({},{})).toEqual([]);});
  it("自动编码延续现有custom格式并跳过其他编码",()=>{expect(nextCustomerCode(['custom9','custom21','ABC100'])).toBe('custom22');expect(nextCustomerCode([])).toBe('custom1');});
  it("转化可修改抬头，明确留空不回填，账期支持0天",()=>{const value=normalizeProspectCustomer({name:'正式抬头',taxNumber:'',paymentTermDays:0},{name:'原名称',taxNumber:'OLD',contactName:'王先生'});expect(value).toMatchObject({name:'正式抬头',nameCn:'正式抬头',taxNumber:null,contactName:'王先生',paymentTermDays:0,status:'active'});expect(normalizeProspectCustomer({}, {name:'A'}).paymentTermDays).toBe(30);expect(()=>normalizeProspectCustomer({paymentTermDays:-1},{name:'A'})).toThrow();});
  it("跟进按修改权限，转化按确认权限，纳入业务伙伴",()=>{expect(getRoutePermission('/api/prospects/id/convert','POST')).toEqual({moduleKey:'prospects',action:'confirm'});expect(getRoutePermission('/api/prospects/id/followups','POST')).toEqual({moduleKey:'prospects',action:'update'});expect(getRoutePermission('/prospects/id')).toEqual({moduleKey:'prospects',action:'view'});expect(hasPermission({role:'user',grants:{'domain:business-partners':permissionMask({canView:true})}},'prospects','view')).toBe(true);});
});
