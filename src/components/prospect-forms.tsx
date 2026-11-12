"use client";

import { useEffect, useState } from "react";
import { PROSPECT_STATUSES } from "@/lib/prospect";
import { Modal } from "./modal";
import { Button, Input, Select, Textarea } from "./ui";
import { SearchSelect } from "./search-select";
import { broadcastMasterDataChanged } from "@/lib/workspace-events";

export type ProspectRow = Record<string, string | number | null>;
export type ProspectCapabilities = { create:boolean;update:boolean;delete:boolean;convert:boolean;createCustomer:boolean;viewCustomer:boolean };
export async function prospectRequest(path:string,options:RequestInit={}) {
  const response=await fetch(path,{cache:"no-store",...options});
  const body=await response.json();
  if(!response.ok)throw Object.assign(new Error(body.error||"操作失败"),{candidates:body.candidates||[]});
  return body;
}
export function prospectJson(method:string,value:unknown):RequestInit {return {method,headers:{"Content-Type":"application/json"},body:JSON.stringify(value)};}
export const prospectLabel=(status:unknown)=>PROSPECT_STATUSES.find(s=>s.value===status)?.label||String(status||"—");
type Field={key:string;label:string;type?:string;required?:boolean;wide?:boolean;maxLength?:number};
const basicFields:Field[]=[
  {key:"name",label:"公司名称",required:true},{key:"nameEn",label:"英文名称"},{key:"shortName",label:"简称"},{key:"country",label:"国家/地区",maxLength:100},
  {key:"city",label:"城市",maxLength:100},{key:"taxNumber",label:"税号",maxLength:100},{key:"contactName",label:"联系人"},{key:"contactPhone",label:"联系电话",maxLength:100},
  {key:"contactEmail",label:"联系邮箱",type:"email"},{key:"address",label:"地址",wide:true},
];
const customerFields:Field[]=[...basicFields,{key:"taxRegime",label:"税制（Régimen Fiscal）"},{key:"postCode",label:"发票地址邮编",maxLength:32},{key:"paymentTermDays",label:"默认开票账期（天）",type:"number"},{key:"businessTypes",label:"合作业务"},{key:"website",label:"官网",maxLength:500},{key:"remark",label:"客户备注",type:"textarea",wide:true}];
function Fields({ fields, draft, onChange, disabled = false, wideClass = "sm:col-span-2" }: {
  fields: Field[];
  draft: ProspectRow;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
  wideClass?: string;
}) {
  return <>{fields.map(field => <label className={field.wide ? wideClass : "block"} key={field.key}>
    <span className="mb-1.5 block text-xs text-ink-2">{field.label}{field.required ? <span className="ml-1 text-danger">*</span> : null}</span>
    {field.type === "textarea" ? <Textarea className="w-full disabled:bg-canvas disabled:text-ink-2" disabled={disabled} maxLength={10000} rows={3} value={String(draft[field.key] ?? "")} onChange={e => onChange(field.key, e.target.value)} /> :
      <Input className="w-full disabled:bg-canvas disabled:text-ink-2" disabled={disabled} maxLength={field.maxLength ?? (field.key === "address" ? 10000 : 255)} type={field.type || "text"} required={field.required} min={field.type === 'number' ? 0 : undefined} max={field.type === 'number' ? 3650 : undefined} step={field.type === 'number' ? 1 : undefined} value={String(draft[field.key] ?? "")} onChange={e => onChange(field.key, e.target.value)} />}
  </label>)}</>;
}

export function ProspectBaseFields({ draft, editing, onChange }: {
  draft: ProspectRow;
  editing: boolean;
  onChange: (key: string, value: string) => void;
}) {
  return <div className="grid gap-x-5 gap-y-4 md:grid-cols-2 lg:grid-cols-4">
    <Fields fields={basicFields.filter(field => field.key !== "address")} draft={draft} disabled={!editing} onChange={onChange} />
    <Fields fields={[{ key: "source", label: "客户来源" }, { key: "ownerName", label: "负责人" }]} draft={draft} disabled={!editing} onChange={onChange} />
    <label className="block"><span className="mb-1.5 block text-xs text-ink-2">跟进状态</span>
      <Select className="w-full disabled:text-ink-2" disabled={!editing} value={String(draft.status || "new")} onChange={e => onChange("status", e.target.value)}>
        {PROSPECT_STATUSES.filter(status => status.value !== "converted" || draft.status === "converted").map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
      </Select>
    </label>
    <Fields fields={[{ key: "lastFollowUpDate", label: "最近跟进日期", type: "date" }]} draft={draft} disabled onChange={onChange} />
    <Fields fields={[{ key: "nextFollowUpDate", label: "下次跟进日期", type: "date" }, { key: "address", label: "地址", wide: true, type: "textarea" }, { key: "remark", label: "备注", wide: true, type: "textarea" }]} draft={draft} disabled={!editing} onChange={onChange} wideClass="md:col-span-2" />
  </div>;
}

type Candidate=ProspectRow & {matchReasons?:string[]};
export function ProspectConversion({prospect,capabilities,onClose,onDone}:{prospect:ProspectRow;capabilities:ProspectCapabilities;onClose:()=>void;onDone:()=>void}) {
  const [mode,setMode]=useState(capabilities.createCustomer?"create":"link");const [draft,setDraft]=useState<ProspectRow>({...prospect,paymentTermDays:30});
  const [candidates,setCandidates]=useState<Candidate[]>([]);const [search,setSearch]=useState("");const [selectedCustomer,setSelectedCustomer]=useState<Candidate|null>(null);const [checking,setChecking]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  useEffect(()=>{
    if(!capabilities.viewCustomer)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      setChecking(true);
      const params=new URLSearchParams({name:String(draft.name||""),nameEn:String(draft.nameEn||""),taxNumber:String(draft.taxNumber||""),keyword:search});
      void prospectRequest(`/api/prospects/${prospect.id}/matches?${params}`,{signal:controller.signal}).then(data=>setCandidates(data.candidates)).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setChecking(false);});
    },250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[prospect.id,draft.name,draft.nameEn,draft.taxNumber,search,capabilities.viewCustomer]);
  async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setError("");try{await prospectRequest(`/api/prospects/${prospect.id}/convert`,prospectJson("POST",{mode,version:prospect.version,customerId,customer:draft}));broadcastMasterDataChanged("customers");onDone();}catch(e){setError((e as Error).message);const found=(e as {candidates?:Candidate[]}).candidates;if(found?.length)setCandidates(found);}finally{setBusy(false);}}
  const customerId=String(selectedCustomer?.customerId||"");
  const customerOptions=selectedCustomer&&!candidates.some(c=>c.customerId===selectedCustomer.customerId)?[selectedCustomer,...candidates]:candidates;
  const duplicates=candidates.filter(c=>c.matchReasons?.length);
  return <Modal title="转为客户" description="确认公司和开票资料。原跟进记录与附件会保留在潜在客户档案。" widthClass="max-w-3xl" onClose={()=>{if(!busy)onClose();}} panelAs="form" panelProps={{onSubmit:submit}} footer={<><Button type="button" disabled={busy} onClick={onClose}>取消</Button><Button tone="primary" type="submit" disabled={busy||checking||(mode==='link'&&!customerId)}>{busy?"转化中…":mode==='create'?"确认并创建客户":"确认关联客户"}</Button></>}>
    <div className="mb-4 flex gap-2">{capabilities.createCustomer?<Button tone={mode==='create'?'primary':'default'} type="button" onClick={()=>setMode('create')}>新建客户</Button>:null}{capabilities.viewCustomer?<Button tone={mode==='link'?'primary':'default'} type="button" onClick={()=>setMode('link')}>关联已有客户</Button>:null}</div>
    {error?<p className="mb-3 text-sm text-danger" role="alert">{error}</p>:null}
    {duplicates.length?<div className="mb-4 rounded border border-warning-border bg-warning-soft p-3 text-sm"><p className="mb-2 font-medium">发现可能重复的客户，请核对：</p>{duplicates.map(c=><div className="flex items-center justify-between gap-3 py-1" key={String(c.customerId)}><span>{c.name} · {c.customerCode}（{c.matchReasons?.join('、')}）{c.status!=='active'?' · 已停用':''}</span>{capabilities.viewCustomer?<Button type="button" size="sm" disabled={c.status!=='active'} onClick={()=>{setMode('link');setSelectedCustomer(c);}}>选择关联</Button>:null}</div>)}</div>:null}
    {mode==='create'?<><p className="mb-4 text-xs text-ink-3">客户编码由系统生成，档案默认启用。开票资料可按实际业务补充，默认账期30天。</p><div className="grid gap-4 sm:grid-cols-2"><Fields fields={customerFields} draft={draft} onChange={(key,value)=>setDraft(d=>({...d,[key]:value}))}/></div></>:<div className="space-y-3"><label className="block text-sm">选择正式客户</label><SearchSelect inputId="prospect-customer" appearance="partner" value={customerId} onChange={value=>setSelectedCustomer(customerOptions.find(c=>String(c.customerId)===value)||null)} onSearch={setSearch} loading={checking} options={customerOptions.filter(c=>c.status==='active').map(c=>({value:String(c.customerId),label:String(c.name||c.shortName),code:String(c.customerCode),hint:[c.country,c.taxNumber].filter(Boolean).join(' · ')}))} placeholder="输入公司名称、客户编码或税号搜索"/><p className="text-xs text-ink-3">关联后沿用该客户的现有资料。</p></div>}
  </Modal>;
}
