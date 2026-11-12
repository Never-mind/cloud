"use client";

import { useEffect, useState } from "react";
import { allocatePaymentAmount, invoiceAllocationAmounts } from "@/lib/cloud-payment-allocation";
import type { InvoiceRecognition } from "@/lib/invoice-recognition-service";
import { InvoiceRecognitionReview } from "./invoice-recognition-review";
import { Modal } from "./modal";
import { Button, Input, Select } from "./ui";

type Source = { id:string;period:string;supplierId:string;supplierName:string;supplierPayableTotalAmount:string;supplierPayableCurrency:string;invoiceNo:string|null;invoiceTotalAmount:string|null;invoiceTaxRate:string|null;invoiceCurrency:string|null;invoiceDate:string|null;invoiceExchangeRate:string|null };
type Attachment = { id:string;fileName:string };
const ownerId = (row:Source) => `${row.period}::${row.supplierId}`;
const money = (n:number) => n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});

export function SupplierInvoiceAllocationModal({ ownerIds,onClose,onSaved }:{ ownerIds:string[];onClose:()=>void;onSaved:()=>void }) {
  const [rows,setRows] = useState<Source[]>([]), [attachments,setAttachments] = useState<Attachment[]>([]);
  const [form,setForm] = useState({ invoiceNo:"",currency:"USD",total:"",taxRate:"0",exchangeRate:"1",invoiceDate:"" });
  const [amounts,setAmounts] = useState<string[]>([]), [attachmentId,setAttachmentId] = useState("");
  const [file,setFile] = useState<File|null>(null), [dataUrl,setDataUrl] = useState("");
  const [recognition,setRecognition] = useState<InvoiceRecognition|null>(null);
  const [loading,setLoading] = useState(true), [busy,setBusy] = useState(false), [error,setError] = useState("");
  useEffect(() => {
    let cancelled=false;
    void (async () => {
      try {
        const response=await fetch(`/api/cloud/supplier-payments/invoice-allocation?ids=${encodeURIComponent(ownerIds.join(","))}`);
        const result=await response.json(); if(!response.ok) throw new Error(result.error);
        if(cancelled) return;
        const sources:Source[]=result.rows;
        const invoice=sources.find(row=>row.invoiceNo);
        const total=invoice ? sources.reduce((sum,row)=>sum+Number(row.invoiceTotalAmount||0),0) : sources.reduce((sum,row)=>sum+Number(row.supplierPayableTotalAmount||0),0);
        setRows(sources);setAttachments(result.attachments);
        setForm({ invoiceNo:invoice?.invoiceNo||"",currency:invoice?.invoiceCurrency||sources[0]?.supplierPayableCurrency||"USD",total:total.toFixed(2),taxRate:String(Number(invoice?.invoiceTaxRate||0)*100),exchangeRate:String(invoice?.invoiceExchangeRate||1),invoiceDate:invoice?.invoiceDate?.slice(0,10)||"" });
        try { setAmounts(allocatePaymentAmount(total,sources.map(row=>row.supplierPayableTotalAmount)).map(n=>n.toFixed(2))); }
        catch { setAmounts(sources.map(()=>"0.00")); }
      } catch(err) { if(!cancelled)setError(err instanceof Error?err.message:"加载失败"); }
      finally { if(!cancelled)setLoading(false); }
    })();
    return ()=>{cancelled=true;};
  },[ownerIds]);
  let breakdown:ReturnType<typeof invoiceAllocationAmounts> = [], validation="";
  if(rows.length) try { breakdown=invoiceAllocationAmounts(form.total,Number(form.taxRate)/100,amounts); } catch(err) { validation=err instanceof Error?err.message:"请检查金额"; }
  const sum=amounts.reduce((a,b)=>a+Math.round(Number(b||0)*100),0)/100;
  function distribute(total=form.total) {
    try {setAmounts(allocatePaymentAmount(total,rows.map(row=>row.supplierPayableTotalAmount)).map(n=>n.toFixed(2)));setError("");} catch(err){setError(err instanceof Error?err.message:"分摊失败");}
  }
  async function recognize(selected:File) {
    setBusy(true);setError("");setRecognition(null);setFile(selected);setAttachmentId("");setDataUrl("");
    try {
      if(selected.size>20*1024*1024)throw new Error("文件不能超过20MB");
      const encoded=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(selected);});
      setDataUrl(encoded);
      const body=new FormData();body.set("file",selected);
      const response=await fetch("/api/cloud/supplier-payments/recognize",{method:"POST",body});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      const parsed:InvoiceRecognition=result.recognition, f=parsed.form;
      setRecognition(parsed);
      setForm(current=>({...current,invoiceNo:String(f.invoiceNo||""),currency:String(f.currency||current.currency),invoiceDate:String(f.invoiceDate||"").slice(0,10),taxRate:String(f.taxRate??0),total:String(f.invoiceTotal??""),exchangeRate:String(f.exchangeRate||current.exchangeRate)}));
      if(f.invoiceTotal!==undefined && f.invoiceTotal!==null)distribute(String(f.invoiceTotal));
    } catch(err) { setError((err instanceof Error?err.message:"识别失败")+"；可以核对原件后手动填写。"); }
    finally {setBusy(false);}
  }
  async function save() {
    if(busy||validation)return;
    setBusy(true);setError("");
    try {
      const response=await fetch("/api/cloud/supplier-payments/invoice-allocation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ownerIds,invoiceNo:form.invoiceNo,currency:form.currency,totalAmount:Number(form.total),taxRate:Number(form.taxRate)/100,exchangeRate:Number(form.exchangeRate),invoiceDate:form.invoiceDate,allocations:rows.map((row,i)=>({ownerId:ownerId(row),amount:Number(amounts[i])})),attachmentId:attachmentId||undefined,file:file&&dataUrl?{fileName:file.name,dataUrl}:undefined})});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      onSaved();
    } catch(err){setError(err instanceof Error?err.message:"保存失败");}finally{setBusy(false);}
  }
  return <Modal title="供应商发票跨账期分摊" description="一张发票、一个发票号，按账期保存分摊金额；实付信息保持原值。" onClose={()=>{if(!busy)onClose();}} widthClass="max-w-4xl" footer={<><Button disabled={busy} onClick={onClose}>取消</Button><Button tone="primary" disabled={busy||loading||!!validation||!rows.length||(!attachmentId&&!dataUrl)} onClick={()=>void save()}>{busy?"处理中…":"确认分摊并保存"}</Button></>}>
    {error?<p role="alert" className="mb-3 rounded bg-danger-soft p-3 text-sm text-danger">{error}</p>:null}
    {loading?<p className="p-6 text-center">正在加载所选账期…</p>:<>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded border border-line-soft bg-canvas p-3 text-sm"><span>{rows[0]?.supplierName} · {rows.length} 个账期</span><label className="cursor-pointer text-primary">{busy?"识别中…":"上传并识别共用发票"}<input disabled={busy} type="file" accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg" className="hidden" onChange={event=>{const f=event.target.files?.[0];if(f)void recognize(f);event.target.value="";}}/></label><span className="text-ink-3">{file?.name}</span></div>
      <label className="mb-4 block space-y-1 text-sm"><span>或从所选账期的已有附件选择</span><Select disabled={busy} className="w-full" value={attachmentId} onChange={event=>{setAttachmentId(event.target.value);setFile(null);setDataUrl("");setRecognition(null);}}><option value="">请选择共用发票附件</option>{attachments.map(a=><option key={a.id} value={a.id}>{a.fileName}</option>)}</Select></label>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-3">{([["invoiceNo","发票号","text"],["currency","发票币种","text"],["invoiceDate","开票日期","date"],["total","整票含税金额","number"],["taxRate","税率（%）","number"],["exchangeRate","汇率","number"]] as const).map(([key,label,type])=><label key={key} className="space-y-1 text-sm"><span>{label}</span><Input aria-label={label} className="w-full" type={type} value={form[key]} step={key==="exchangeRate"?"0.000001":"0.01"} onChange={event=>setForm(current=>({...current,[key]:event.target.value}))}/></label>)}</fieldset>
      {file?<div className="mt-3"><InvoiceRecognitionReview file={file} recognition={recognition} direction="cost" values={{invoiceNo:form.invoiceNo,invoiceDate:form.invoiceDate,currency:form.currency,taxRate:form.taxRate,amountIncludingTax:form.total,exchangeRate:form.exchangeRate}}/></div>:null}
      <div className="my-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span>分摊合计 <strong>{money(sum)} {form.currency}</strong> · 整票 {money(Number(form.total||0))}</span><Button disabled={busy} onClick={()=>distribute()}>按各期应付比例分摊</Button></div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["账期","原应付","发票含税分摊","未税","税金"].map(label=><th key={label} className="border-b border-line-soft px-2 py-2 text-left">{label}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={row.id}><td className="p-2">{row.period}</td><td className="p-2">{money(Number(row.supplierPayableTotalAmount))} {row.supplierPayableCurrency}</td><td className="p-2"><Input disabled={busy} className="w-36" type="number" step="0.01" aria-label={`${row.period}发票分摊金额`} value={amounts[i]??""} onChange={event=>setAmounts(current=>current.map((value,index)=>index===i?event.target.value:value))}/></td><td className="p-2">{breakdown[i]?money(breakdown[i].netAmount):"—"}</td><td className="p-2">{breakdown[i]?money(breakdown[i].taxAmount):"—"}</td></tr>)}</tbody></table></div>
      {validation?<p role="alert" className="mt-3 text-sm text-danger">{validation}</p>:null}
      <p className="mt-3 text-xs text-ink-3">如果这张发票已经登记到某一期，请一并勾选该期；系统会重新分摊整票，不重复累计。</p>
    </>}
  </Modal>;
}
