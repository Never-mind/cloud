"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { PROSPECT_STATUSES } from "@/lib/prospect";
import { buildDetailRoute, getPositiveNumber } from "@/lib/client-list-navigation";
import { Button, Input, Panel, Select } from "./ui";
import { PaginationBar } from "./pagination-bar";
import { useWorkspaceDataRefresh } from "@/lib/workspace-events";
import { prospectLabel, prospectRequest, type ProspectRow, type ProspectCapabilities } from "./prospect-forms";

export function ProspectsPage() {
  const router=useRouter(),params=useSearchParams();const [keyword,setKeyword]=useState(()=>params.get("keyword")||"");const [status,setStatus]=useState(()=>params.get("status")||"");const [query,setQuery]=useState({keyword,status});
  const [page,setPage]=useState(()=>getPositiveNumber(params.get("page"),1)),[pageSize,setPageSize]=useState(()=>getPositiveNumber(params.get("pageSize"),20));const [data,setData]=useState<{items:ProspectRow[];total:number;capabilities?:ProspectCapabilities}>({items:[],total:0});
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[revision,setRevision]=useState(0);
  const routeParams=new URLSearchParams({page:String(page),pageSize:String(pageSize)});
  if(query.keyword)routeParams.set("keyword",query.keyword);
  if(query.status)routeParams.set("status",query.status);
  if(params.get("embed")==="1")routeParams.set("embed","1");
  const listRoute=`/prospects?${routeParams}`;
  const currentSearch=params.toString();
  useEffect(()=>{if(`/prospects?${currentSearch}`!==listRoute)router.replace(listRoute,{scroll:false});},[currentSearch,listRoute,router]);
  useWorkspaceDataRefresh(()=>setRevision(value=>value+1));
  const detail=(id:string)=>buildDetailRoute(`/prospects/${id}`,listRoute);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError("");void prospectRequest('/api/prospects?'+new URLSearchParams({...query,page:String(page),pageSize:String(pageSize)}),{signal:controller.signal}).then(setData).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[query,page,pageSize,revision]);
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-medium">潜在客户</h1><p className="mt-1 text-sm text-ink-3">记录接洽中的公司、跟进情况和材料，合作确定后转为客户。</p></div><div className="flex gap-2"><Button onClick={()=>setRevision(v=>v+1)} disabled={loading}><RefreshCw size={15}/>刷新</Button>{data.capabilities?.create?<Button tone="primary" onClick={()=>router.push(detail("new"))}><Plus size={15}/>新增潜在客户</Button>:null}</div></div>
    <Panel><form className="flex flex-wrap gap-3 p-4" onSubmit={e=>{e.preventDefault();setPage(1);setQuery({keyword,status});}}><Input className="w-80" aria-label="搜索潜在客户" placeholder="公司、联系人、负责人、国家或电话" value={keyword} onChange={e=>setKeyword(e.target.value)}/><Select aria-label="跟进状态筛选" value={status} onChange={e=>setStatus(e.target.value)}><option value="">全部状态</option>{PROSPECT_STATUSES.map(s=><option value={s.value} key={s.value}>{s.label}</option>)}</Select><Button type="submit" tone="secondary">查询</Button><Button type="button" onClick={()=>{setKeyword('');setStatus('');setPage(1);setQuery({keyword:'',status:''});}}>重置</Button></form></Panel>
    {error?<p className="text-sm text-danger" role="alert">{error}</p>:null}<Panel><div className="overflow-auto"><table className="w-full text-left text-sm"><thead className="bg-surface-2 text-ink-2"><tr>{['公司名称','国家/地区','联系人','电话','负责人','跟进状态','最近跟进','下次跟进','操作'].map(h=><th className="whitespace-nowrap px-4 py-3 font-medium" key={h}>{h}</th>)}</tr></thead><tbody>{data.items.map(row=><tr className="border-t border-line-soft hover:bg-surface-2" key={String(row.id)}><td className="px-4 py-3"><Link className="font-medium text-primary" href={detail(String(row.id))}>{row.name}</Link>{row.shortName?<div className="text-xs text-ink-3">{row.shortName}</div>:null}</td>{['country','contactName','contactPhone','ownerName'].map(k=><td className="whitespace-nowrap px-4 py-3" key={k}>{row[k]||'—'}</td>)}<td className="whitespace-nowrap px-4 py-3"><StatusBadge status={row.status}/></td><td className="whitespace-nowrap px-4 py-3">{row.lastFollowUpDate||'—'}</td><td className="whitespace-nowrap px-4 py-3">{row.nextFollowUpDate||'—'}</td><td className="whitespace-nowrap px-4 py-3"><Link className="text-primary" href={detail(String(row.id))}>{row.status==='converted'?'查看档案':'跟进 / 转化'}</Link></td></tr>)}</tbody></table>{loading?<p className="p-8 text-center text-sm text-ink-3">加载中…</p>:!data.items.length?<p className="p-10 text-center text-sm text-ink-3">{query.keyword||query.status?'没有符合条件的潜在客户':'暂无潜在客户，点击“新增潜在客户”开始记录。'}</p>:null}</div><PaginationBar page={page} pageSize={pageSize} total={data.total} onPageChange={setPage} onPageSizeChange={size=>{setPageSize(size);setPage(1);}}/></Panel>
  </div>;
}
export function StatusBadge({status}:{status:unknown}) {return <span className={`inline-flex rounded px-2 py-1 text-xs ${status==='converted'?'bg-success-soft text-success':status==='closed'?'bg-surface-2 text-ink-3':'bg-info-soft text-primary'}`}>{prospectLabel(status)}</span>;}
