"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { buildDetailRoute } from "@/lib/client-list-navigation";
import type { ProspectRow } from "./prospect-forms";
export function CustomerProspectSources({customerId}:{customerId:string}) {
  const [items,setItems]=useState<ProspectRow[]>([]);const params=useSearchParams();
  useEffect(()=>{const controller=new AbortController();void fetch(`/api/prospects?customerId=${encodeURIComponent(customerId)}&pageSize=100`,{signal:controller.signal}).then(async r=>{if(r.ok)setItems((await r.json()).items||[]);}).catch(()=>{});return()=>controller.abort();},[customerId]);
  if(!items.length)return null;
  const current=`/customers/${customerId}${params.get('embed')==='1'?'?embed=1':''}`;
  return <section className="border-t border-line-soft p-5"><h2 className="mb-3 font-medium">潜在客户来源</h2><p className="mb-3 text-xs text-ink-3">查看转化前的跟进记录和附件资料。</p><div className="flex flex-wrap gap-3">{items.map(row=><Link className="rounded border border-line px-3 py-2 text-sm text-primary" key={String(row.id)} href={buildDetailRoute(`/prospects/${row.id}`,current)}>{row.name} · {row.convertedAt}</Link>)}</div></section>;
}
