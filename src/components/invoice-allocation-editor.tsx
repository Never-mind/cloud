"use client";
import {useState,useEffect,useRef} from "react";
import {Button,Input} from "./ui";
import {Modal} from "./modal";
import {notify} from "./app-dialog";
import {updateInvoiceReviewAmounts} from "@/lib/invoice-review";
import {allocationTotals,servicePeriodLabel,suggestInvoiceAllocations,validateInvoiceAllocationPlan,applyRecognizedPeriodAmounts,moneyCents,type InvoiceAllocationPlan,type InvoiceAllocationSource,type AllocationTotals} from "@/lib/invoice-allocation";

export function InvoiceAllocationEditor({sourceType,sourceId,currency,totals,value,onChange,onTotalsChange,disabled=false,invoiceId,lockSources=false,autoOpen=false,recognizedLines=[]}: {
  sourceType:string;sourceId:string;currency:string;totals:AllocationTotals;value:InvoiceAllocationPlan|null;
  onChange:(plan:InvoiceAllocationPlan)=>void;onTotalsChange?:(totals:AllocationTotals)=>void;disabled?:boolean;invoiceId?:string;lockSources?:boolean;
  autoOpen?:boolean;recognizedLines?:Array<{periodLabel:string;description:string;amount:string}>;
}) {
  const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const [rows,setRows]=useState<InvoiceAllocationSource[]>([]),[selected,setSelected]=useState<string[]>([]);
  const [from,setFrom]=useState(""),[to,setTo]=useState("");
  const opened=useRef(false);
  useEffect(()=>{if(autoOpen&&!opened.current){opened.current=true;void choose();}},[autoOpen,sourceId]);
  if(!["cloud_row","service_fee"].includes(sourceType)||!sourceId) return null;
  const invalid=value?validateInvoiceAllocationPlan(value,totals):null;
  async function candidates() {
    const params=new URLSearchParams({sourceType,sourceId,currency,from:from.replace(/-/g,""),to:to.replace(/-/g,"")});
    if(invoiceId) params.set("invoiceId",invoiceId);
    const response=await fetch(`/api/invoices/allocations?${params}`,{cache:"no-store"});
    const data=await response.json();if(!response.ok) throw new Error(data.error||"账期加载失败");
    return data.rows as InvoiceAllocationSource[];
  }
  async function load() {
    setLoading(true);setError("");
    try{setRows(await candidates());}catch(error){setError(error instanceof Error?error.message:"加载失败");}finally{setLoading(false);}
  }
  async function choose() {setSelected(value?.allocations.map(row=>row.sourceId)||[sourceId]);setOpen(true);await load();}
  function apply() {
    try {
      const chosen=selected.map(id=>rows.find(row=>row.sourceId===id)||value?.allocations.find(row=>row.sourceId===id)).filter(Boolean) as InvoiceAllocationSource[];
      if(chosen.length!==selected.length) throw new Error("部分已选账单不在当前结果中，请重新查询");
      if(!selected.includes(sourceId)) throw new Error("请保留当前打开的来源账单");
      let reviewedTotals:AllocationTotals|undefined;
      try {for(const key of ["amountExcludingTax","taxAmount","amountIncludingTax"] as const)moneyCents(totals[key]);if(!onTotalsChange)reviewedTotals=totals;}catch{/* Choose periods before filling invoice totals. */}
      let plan=suggestInvoiceAllocations(chosen,currency,reviewedTotals,value);
      const matched=recognizedLines.length?applyRecognizedPeriodAmounts(plan,recognizedLines,totals):null;
      if(matched)plan=matched;
      onChange(plan);
      if(onTotalsChange&&plan.allocations.every(row=>row.amountIncludingTax!=="")) onTotalsChange(allocationTotals(plan.allocations));
      setOpen(false);
    }catch(error){setError(error instanceof Error?error.message:"生成分摊失败");}
  }
  async function recalculate(useInvoice:boolean) {
    if(!value)return;
    try {
      setLoading(true);
      const all=lockSources?value.allocations:await candidates();
      const sources=value.allocations.map(old=>{
        const current=all.find(row=>row.sourceId===old.sourceId);
        if(!current)throw new Error("关联账期不在当前筛选范围内，请清空范围后重试");
        return {...current,suggestedRate:value.currency===currency?old.exchangeRate:current.suggestedRate};
      });
      const plan=suggestInvoiceAllocations(sources,currency,useInvoice?totals:undefined,value);
      onChange(plan);
      if(!useInvoice&&onTotalsChange&&plan.allocations.every(row=>row.amountIncludingTax!==""))onTotalsChange(allocationTotals(plan.allocations));
    }catch(error){notify(error instanceof Error?error.message:"分摊失败","error");}finally{setLoading(false);}
  }
  function edit(index:number,key:string,next:string) {
    if(!value)return;
    const allocations=value.allocations.map((row,i)=>i!==index?row:key==="exchangeRate"?{...row,exchangeRate:next}:updateInvoiceReviewAmounts(row,key as "amountExcludingTax"|"taxRate"|"taxAmount"|"amountIncludingTax",next));
    onChange({...value,allocations});
  }
  let sums:AllocationTotals|null=null;try{if(value)sums=allocationTotals(value.allocations);}catch{/* Incomplete values remain editable. */}
  return <section className="space-y-3 rounded border border-line-soft p-4" aria-label="关联账期及开票分摊">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><b className="text-sm">关联账期及开票分摊</b><p className="mt-1 text-xs text-ink-3">{value?`已选 ${new Set(value.allocations.map(row=>row.period)).size} 个账期 / ${value.allocations.length} 条账单` : "当前账单，可选择多个账期共用一张发票"}</p></div>
      {!lockSources?<Button disabled={disabled||loading} onClick={()=>void choose()} size="sm">选择／调整账期</Button>:<span className="text-xs text-ink-3">关联账期按审批申请保留</span>}
    </div>
    {value?<fieldset disabled={disabled||loading} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm"><span>票面明细</span><select aria-label="票面明细展示方式" className="rounded border border-line px-2 py-1" value={value.lineMode} onChange={event=>onChange({...value,lineMode:event.target.value as "period"|"summary"})}><option value="period">按账期分行</option><option value="summary">合并为一行</option></select><span className="text-xs text-ink-3">{servicePeriodLabel(value.allocations.map(row=>row.period))} · 开票币种 {value.currency}</span></div>
      {value.lineMode==="summary"?<div className="space-y-2"><label className="block text-sm">票面服务描述<Input className="mt-1 w-full" maxLength={500} value={value.description} onChange={event=>onChange({...value,description:event.target.value})}/></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(value.summaryCompatible)} onChange={e=>onChange({...value,summaryCompatible:e.target.checked})}/>已确认服务内容及税收分类适合合并为一行；不同税率应分行。</label></div>:null}
      <div className="flex flex-wrap gap-2"><Button size="sm" onClick={()=>void recalculate(true)}>按当前票面总额分摊</Button>{onTotalsChange?<Button size="sm" onClick={()=>void recalculate(false)}>按账单及汇率填入金额</Button>:null}</div>
      {recognizedLines.length?<Button size="sm" onClick={()=>{const matched=applyRecognizedPeriodAmounts(value,recognizedLines,totals);if(matched)onChange(matched);else notify("票面逐月金额与所选账期或合计无法完整匹配，请核对后分摊","info");}}>按识别的逐月金额匹配</Button>:null}
      <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-xs"><thead><tr>{["账期／账单","账单原币含税","汇率：1 原币 → 开票币","本期开票未税","税率 %","税金","本期开票含税"].map(label=><th key={label} className="border-b px-2 py-2 text-left">{label}</th>)}</tr></thead><tbody>{value.allocations.map((row,index)=><tr key={row.sourceId}><td className="border-b px-2 py-2">{row.period}<div className="text-ink-3">{row.account||row.sourceNo}</div></td><td className="border-b px-2 py-2">{row.sourceCurrency} {row.sourceTotal}</td>{(["exchangeRate","amountExcludingTax","taxRate","taxAmount","amountIncludingTax"] as const).map(key=><td key={key} className="border-b px-1 py-2"><Input aria-label={`${row.period} ${row.account||row.sourceId} ${key}`} className={key==="taxRate"?"w-20":"w-28"} type="number" min="0" step="any" disabled={key==="exchangeRate"&&row.sourceCurrency===value.currency} value={row[key]} onChange={event=>edit(index,key,event.target.value)}/></td>)}</tr>)}</tbody></table></div>
      {sums?<p className="text-xs">分摊合计：未税 {String(sums.amountExcludingTax)}，税金 {String(sums.taxAmount)}，含税 {String(sums.amountIncludingTax)} {value.currency}</p>:null}
      {value.currency!==currency?<p role="alert" className="text-sm text-danger">开票币种已变化，请重新按当前币种核对汇率并分摊。</p>:invalid?<p role="alert" className="text-sm text-warning-ink">{invalid}</p>:<p className="text-xs text-success">分摊合计与票面一致，各账期仅回填本期金额。</p>}
    </fieldset>:null}
    {open?<Modal title="选择关联账期" widthClass="max-w-5xl" onClose={()=>setOpen(false)} footer={<><span className="mr-auto text-xs">已选 {selected.length} 条账单</span><Button onClick={()=>setOpen(false)}>取消</Button><Button disabled={loading||!selected.length} tone="primary" onClick={apply}>确认关联账期</Button></>}>
      <div className="mb-3 flex flex-wrap items-end gap-2"><label className="text-sm">开始月份<Input type="month" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="text-sm">结束月份<Input type="month" value={to} onChange={e=>setTo(e.target.value)}/></label><Button disabled={loading} onClick={()=>void load()}>查询</Button><Button disabled={loading} onClick={()=>setSelected([...new Set([...selected,...rows.filter(row=>!row.disabledReason).map(row=>row.sourceId)])])}>全选可用账单</Button></div>
      <p className="mb-3 text-xs text-ink-3">按当前账单的业务客户筛选；实际开票客户可在表单中另选。汇率使用系统已维护的月度汇率，缺失时需填写。</p>
      {error?<p role="alert" className="text-danger">{error}</p>:null}{loading?<p>正在读取账期…</p>:<div className="max-h-96 overflow-auto"><table className="w-full text-sm"><thead><tr>{["选择","账期","客户／账号","原币含税","状态"].map(label=><th className="border-b p-2 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.sourceId}><td className="border-b p-2"><input aria-label={`选择 ${row.period} ${row.account}`} type="checkbox" disabled={Boolean(row.disabledReason)} checked={selected.includes(row.sourceId)} onChange={e=>setSelected(current=>e.target.checked?[...current,row.sourceId]:current.filter(id=>id!==row.sourceId))}/></td><td className="border-b p-2">{row.period}</td><td className="border-b p-2">{row.customerName} · {row.account}</td><td className="border-b p-2">{row.sourceCurrency} {row.sourceTotal}</td><td className="border-b p-2 text-xs">{row.disabledReason||"可选择"}</td></tr>)}</tbody></table></div>}
    </Modal>:null}
  </section>;
}
