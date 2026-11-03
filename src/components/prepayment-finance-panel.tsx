"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Input, Panel, Select, Textarea } from "./ui";
import { Modal } from "./modal";
import { SearchSelect } from "./search-select";
import { usePartnerOptions } from "./use-invoice-partner-options";
import { InvoiceDraftModal } from "./invoice-draft-modal";
import { InvoiceApprovalProgress } from "./invoice-approval-progress";
import { PrepaymentFinanceStatus } from "./prepayment-finance-status";
import { notify } from "./app-dialog";
import { financialAmounts, money, type ReceiptInput } from "@/lib/prepayment-finance";
import { updateInvoiceReviewAmounts } from "@/lib/invoice-review";
import { broadcastMasterDataChanged, useWorkspaceDataRefresh } from "@/lib/workspace-events";

type Invoice = { id: string; invoiceNo: string; source: string; status: string; currency: string; customerId: string; customerName: string; undertakingUnitId: string; sellerName: string; amountExcludingTax: string; taxRate: string; taxAmount: string; amountIncludingTax: string; invoiceDate: string; dueDate: string; fileName: string; receivedAmount: string; businessExchangeRate: string };
type Receipt = ReceiptInput & { id: string; version: number; status: string; voidReason?: string };
type FinanceData = {
  contract: { financeId: string; contractNo: string; status: string; currency: string; totalAmount: string; financeAmountBasis: string | null; financeTaxRate: string | null; financeCustomerId: string | null; financeUnitId: string | null; financeVersion: number };
  summary: { target: number | null; invoiced: number; received: number; reserved: number; remainingInvoice: number | null; remainingReceipt: number | null; invoiceStatus: string; receiptStatus: string };
  invoices: Invoice[]; receipts: Receipt[];
};
const display = (value: unknown) => value === null || value === undefined || value === "" ? "—" : Number(value).toLocaleString("zh-CN",{minimumFractionDigits:2,maximumFractionDigits:2});
const cell = "whitespace-nowrap border-b border-line-soft px-3 py-3 text-left";
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1 text-sm text-ink-2"><span>{label}</span>{children}</label>; }
async function jsonRequest(url: string, method = "GET", body?: unknown) {
  const response = await fetch(url,{ method, cache:"no-store", ...(body === undefined ? {} : {headers:{"content-type":"application/json"},body:JSON.stringify(body)}) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "操作失败"); return data;
}

export function PrepaymentFinancePanel({ contractNo, children }: { contractNo: string; children: ReactNode }) {
  const [data,setData] = useState<FinanceData | null>(null), [error,setError] = useState("");
  const [tab,setTab] = useState<"contract"|"invoices"|"receipts">("contract");
  const [settings,setSettings] = useState<{basis:string;taxRate:string;customerId:string;undertakingUnitId:string;version:number}|null>(null);
  const [invoiceMode,setInvoiceMode] = useState<"generated"|"external"|"manual"|null>(null);
  const [receipt,setReceipt] = useState<ReceiptInput|null>(null);
  const [removing,setRemoving] = useState<{type:"invoice"|"receipt";id:string;version?:number}|null>(null), [reason,setReason] = useState("");
  const [busy,setBusy] = useState(false); const lock = useRef(false), requestId = useRef(0);
  const customers = usePartnerOptions("customers"), units = usePartnerOptions("undertaking-units");
  const endpoint = `/api/prepayments/contracts/${encodeURIComponent(contractNo)}/finance`;
  const load = useCallback(async () => {
    const id = ++requestId.current;
    try { const result = await jsonRequest(endpoint); if (id === requestId.current) { setData(result); setError(""); } }
    catch(error) { if (id === requestId.current) setError((error as Error).message); }
  },[endpoint]);
  useEffect(() => { void load(); return () => { requestId.current++; }; },[load]);
  useWorkspaceDataRefresh(() => { void load(); });
  useEffect(() => {
    if (busy || settings || invoiceMode || receipt || removing) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); },60_000);
    return () => clearInterval(timer);
  },[load,busy,settings,invoiceMode,receipt,removing]);
  const refresh = useCallback(async () => {
    await load(); broadcastMasterDataChanged("prepayment-contracts");
  },[load]);
  async function perform(work: () => Promise<unknown>, success: () => void) {
    if (lock.current) return; lock.current=true; setBusy(true);
    try { await work(); success(); await refresh(); notify("已保存","success"); }
    catch(error) { notify((error as Error).message,"error"); }
    finally { lock.current=false; setBusy(false); }
  }
  function startReceipt(invoice?: Invoice) {
    if (!data) return;
    const chosen = invoice ?? data.invoices.find(row => row.status === "issued" && Number(row.amountIncludingTax) > Number(row.receivedAmount));
    const amount = chosen ? money(Number(chosen.amountIncludingTax)-Number(chosen.receivedAmount)) : data.summary.remainingReceipt ?? 0;
    const amounts = financialAmounts(amount,chosen?.taxRate ?? data.contract.financeTaxRate ?? 0);
    setReceipt({ requestKey:crypto.randomUUID(),customerId:chosen?.customerId || data.contract.financeCustomerId || "",undertakingUnitId:chosen?.undertakingUnitId || data.contract.financeUnitId || "",currency:chosen?.currency || data.contract.currency,businessExchangeRate:chosen?.businessExchangeRate || "1",...amounts,receivedDate:"",isReceived:true,bankSerialNo:"",remark:"",allocations:chosen ? [{invoiceId:chosen.id,amount:amount.toFixed(2),invoiceExchangeRate:"1"}] : [] });
  }
  const ready = data?.contract.status === "已确认" && data.summary.target !== null;
  return <div className="space-y-4">
    <Panel>
      <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-4 py-3"><span className="font-medium">开票与收款</span><span className="text-xs text-ink-3">按合同币种 {data?.contract.currency} 汇总含税金额</span><Button className="ml-auto" onClick={() => void load()}>刷新</Button><Button disabled={!data} onClick={() => data && setSettings({ basis:data.contract.financeAmountBasis || "",taxRate:String(data.contract.financeTaxRate ?? ""),customerId:data.contract.financeCustomerId || "",undertakingUnitId:data.contract.financeUnitId || "",version:data.contract.financeVersion })}>财务设置</Button></div>
      {error ? <p role="alert" className="p-4 text-danger">{error}</p> : !data ? <p className="p-4 text-ink-3">正在加载财务记录…</p> : <>
        <div className="grid grid-cols-2 gap-4 p-4 lg:grid-cols-6">{[["合同含税总额",data.summary.target],["已开票",data.summary.invoiced],["审批中／待出票",data.summary.reserved],["剩余可开",data.summary.remainingInvoice],["已收款",data.summary.received],["合同未收",data.summary.remainingReceipt]].map(([label,value]) => <div key={String(label)}><div className="text-xs text-ink-3">{label}</div><div className="mt-1 text-lg tabular-nums">{display(value)}</div></div>)}</div>
        <div className="flex flex-wrap items-center gap-3 px-4 pb-4 text-sm"><PrepaymentFinanceStatus status={data.summary.invoiceStatus} /><PrepaymentFinanceStatus status={data.summary.receiptStatus} />{data.summary.target === null ? <span className="text-warning">请先在财务设置中确认合同金额是含税还是未税，并填写税率。</span> : null}</div>
      </>}
    </Panel>
    <div role="tablist" aria-label="预付款合同内容" className="flex gap-5 border-b border-line-soft">{([["contract","合同明细"],["invoices","开票记录"],["receipts","收款记录"]] as const).map(([key,label]) => <button key={key} type="button" role="tab" aria-selected={tab===key} onClick={() => setTab(key)} className={`border-b-2 px-2 py-3 text-sm ${tab===key ? "border-primary font-medium text-primary" : "border-transparent text-ink-3"}`}>{label}{data && key!=="contract" ? `（${key==="invoices" ? data.invoices.length : data.receipts.length}）` : ""}</button>)}</div>
    <div hidden={tab!=="contract"} className="space-y-5">{children}</div>
    {tab==="invoices" && data ? <div className="space-y-4">
      <div className="flex flex-wrap gap-2"><Button tone="primary" disabled={!ready} onClick={() => setInvoiceMode("generated")}>开票／飞书审批</Button><Button disabled={!ready} onClick={() => setInvoiceMode("external")}>上传并识别</Button><Button disabled={!ready} onClick={() => setInvoiceMode("manual")}>手动登记发票</Button></div>
      <Panel><div className="overflow-auto"><table className="w-full text-sm"><thead className="bg-canvas"><tr>{["发票号","客户／开票单位","币种","未税金额","税率","税金","含税金额","开票日期","应收日期","已关联实收","状态","操作"].map(label => <th key={label} className={cell}>{label}</th>)}</tr></thead><tbody>{data.invoices.map(row => <tr key={row.id}><td className={cell}>{row.invoiceNo}</td><td className={cell}><div>{row.customerName}</div><div className="text-xs text-ink-3">{row.sellerName}</div></td><td className={cell}>{row.currency}</td><td className={cell}>{display(row.amountExcludingTax)}</td><td className={cell}>{row.taxRate}%</td><td className={cell}>{display(row.taxAmount)}</td><td className={cell}>{display(row.amountIncludingTax)}</td><td className={cell}>{row.invoiceDate}</td><td className={cell}>{row.dueDate}</td><td className={cell}>{display(row.receivedAmount)}</td><td className={cell}><PrepaymentFinanceStatus status={row.status==="issued"?"已开票":"已作废"} /></td><td className={cell}><div className="flex gap-3"><a className="text-primary" href={`/api/invoices/${encodeURIComponent(row.id)}/file`} target="_blank" rel="noreferrer">{row.fileName?.endsWith("手工登记说明.txt")?"登记说明":"查看发票"}</a>{row.status==="issued"?<><button className="text-primary" onClick={() => startReceipt(row)}>登记收款</button><button className="text-danger" onClick={() => {setReason("");setRemoving({type:"invoice",id:row.id});}}>作废</button></>:null}</div></td></tr>)}{!data.invoices.length?<tr><td colSpan={12} className="p-8 text-center text-ink-3">暂无发票，可分多次开票或登记。</td></tr>:null}</tbody></table></div></Panel>
      <InvoiceApprovalProgress sourceType="prepayment_contract" sourceId={data.contract.financeId} />
    </div> : null}
    {tab==="receipts" && data ? <div className="space-y-4"><div className="flex items-center gap-3"><Button tone="primary" disabled={!ready} onClick={() => startReceipt()}>新增收款</Button><span className="text-xs text-ink-3">可先收款后开票；关联发票只用于核对余额，不重复累计实收。</span></div><Panel><div className="overflow-auto"><table className="w-full text-sm"><thead className="bg-canvas"><tr>{["客户／承接单位","币种","实收未税","税率","税金","实收含税","实收日期","银行流水号","关联发票","状态","操作"].map(label=><th key={label} className={cell}>{label}</th>)}</tr></thead><tbody>{data.receipts.map(row=><tr key={row.id}><td className={cell}><div>{customers.find(option=>option.value===row.customerId)?.label || row.customerId}</div><div className="text-xs text-ink-3">{units.find(option=>option.value===row.undertakingUnitId)?.label || row.undertakingUnitId}</div></td><td className={cell}>{row.currency}</td><td className={cell}>{display(row.amountExcludingTax)}</td><td className={cell}>{row.taxRate}%</td><td className={cell}>{display(row.taxAmount)}</td><td className={cell}>{display(row.amountIncludingTax)}</td><td className={cell}>{row.receivedDate || "—"}</td><td className={cell}>{row.bankSerialNo || "—"}</td><td className={cell}>{(row.allocations || []).map(item=>data.invoices.find(i=>i.id===item.invoiceId)?.invoiceNo).join("、") || "未关联"}</td><td className={cell}><PrepaymentFinanceStatus status={row.status==="void"?"已作废":row.isReceived?"已收款":"未收款"} /></td><td className={cell}>{row.status==="active"?<div className="flex gap-3"><button className="text-primary" onClick={()=>setReceipt({...row,isReceived:Boolean(row.isReceived)})}>编辑／分配</button><button className="text-danger" onClick={()=>{setReason("");setRemoving({type:"receipt",id:row.id,version:row.version});}}>作废</button></div>:row.voidReason}</td></tr>)}{!data.receipts.length?<tr><td colSpan={11} className="p-8 text-center text-ink-3">暂无收款记录。</td></tr>:null}</tbody></table></div></Panel></div>:null}
    {settings && data ? <Modal title="预付款财务设置" description="此设置用于开票和收款，不改变合同原金额及24个月核销。" onClose={()=>!busy&&setSettings(null)} footer={<><Button disabled={busy} onClick={()=>setSettings(null)}>取消</Button><Button tone="primary" disabled={busy} onClick={()=>void perform(()=>jsonRequest(endpoint,"PUT",settings),()=>setSettings(null))}>保存</Button></>}><div className="grid grid-cols-2 gap-4"><Field label={`合同原金额：${display(data.contract.totalAmount)} ${data.contract.currency}`}><Select value={settings.basis} onChange={e=>setSettings({...settings,basis:e.target.value})}><option value="">请选择金额口径</option><option value="gross">含税金额</option><option value="net">未税金额</option></Select></Field><Field label="合同税率（%）"><Input type="number" value={settings.taxRate} onChange={e=>setSettings({...settings,taxRate:e.target.value})}/></Field><Field label="默认开票客户（每张票可调整）"><SearchSelect appearance="partner" options={customers} value={settings.customerId} onChange={value=>setSettings({...settings,customerId:value})}/></Field><Field label="默认承接单位（每张票可调整）"><SearchSelect appearance="partner" options={units} value={settings.undertakingUnitId} onChange={value=>setSettings({...settings,undertakingUnitId:value})}/></Field></div></Modal>:null}
    {invoiceMode && data ? <InvoiceDraftModal open mode={invoiceMode==="generated"?"generated":"external"} manualRegistration={invoiceMode==="manual"} sourceType="prepayment_contract" sourceId={data.contract.financeId} onClose={()=>{setInvoiceMode(null);void refresh();}} onSaved={()=>void refresh()}/>:null}
    {receipt && data ? <ReceiptEditor key={receipt.id || receipt.requestKey} initial={receipt} contractCurrency={data.contract.currency} invoices={data.invoices} busy={busy} onClose={()=>!busy&&setReceipt(null)} onSave={input=>void perform(()=>jsonRequest(endpoint,"POST",input),()=>setReceipt(null))}/>:null}
    {removing ? <Modal title={removing.type==="invoice"?"作废发票":"作废收款记录"} description="作废后从有效汇总中扣除，原记录保留供核查。" onClose={()=>!busy&&setRemoving(null)} footer={<><Button disabled={busy} onClick={()=>setRemoving(null)}>取消</Button><Button tone="warning" disabled={busy||!reason.trim()} onClick={()=>void perform(()=>removing.type==="receipt"?jsonRequest(endpoint,"DELETE",{...removing,reason}):jsonRequest(`/api/invoices/${encodeURIComponent(removing.id)}/void`,"POST",{reason}),()=>setRemoving(null))}>确认作废</Button></>}><Field label="作废原因"><Textarea value={reason} onChange={e=>setReason(e.target.value)}/></Field></Modal>:null}
  </div>;
}

function ReceiptEditor({initial,contractCurrency,invoices,busy,onClose,onSave}:{initial:ReceiptInput;contractCurrency:string;invoices:Invoice[];busy:boolean;onClose:()=>void;onSave:(input:ReceiptInput)=>void}) {
  const [draft,setDraft] = useState(initial);
  const customers=usePartnerOptions("customers"),units=usePartnerOptions("undertaking-units");
  const patch=(values:Partial<ReceiptInput>)=>setDraft(current=>({...current,...values}));
  const fields = {amountExcludingTax:String(draft.amountExcludingTax??""),taxRate:String(draft.taxRate??""),taxAmount:String(draft.taxAmount??""),amountIncludingTax:String(draft.amountIncludingTax??"")};
  const allocations=draft.allocations || [];
  function changeAmount(key: keyof typeof fields, value: string) {
    const next = updateInvoiceReviewAmounts(fields,key,value);
    const followsTotal = allocations.length === 1 && Number(allocations[0].amount) === Number(draft.amountIncludingTax);
    patch({ ...next, ...(followsTotal ? { allocations:[{...allocations[0],amount:next.amountIncludingTax}] } : {}) });
  }
  function addInvoice(id:string) {
    const invoice=invoices.find(row=>row.id===id); if(!invoice)return;
    patch({allocations:[...allocations,{invoiceId:id,amount:"",invoiceExchangeRate:invoice.currency===draft.currency?"1":""}]});
  }
  return <Modal title={draft.id?"编辑收款信息":"新增收款"} widthClass="max-w-4xl" description="默认按发票未收余额填写；没有发票时按合同未收金额填写。金额和单位均可修改。" onClose={onClose} footer={<><Button disabled={busy} onClick={onClose}>取消</Button><Button tone="primary" disabled={busy} onClick={()=>onSave(draft)}>{busy?"保存中…":"确认并保存"}</Button></>}>
    <fieldset disabled={busy} className="space-y-5"><div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      <Field label="收款客户"><SearchSelect appearance="partner" options={customers} value={draft.customerId} onChange={customerId=>patch({customerId})}/></Field><Field label="收款承接单位"><SearchSelect appearance="partner" options={units} value={draft.undertakingUnitId} onChange={undertakingUnitId=>patch({undertakingUnitId})}/></Field>
      <Field label="实收币种"><Input value={draft.currency} onChange={e=>patch({currency:e.target.value.toUpperCase(),businessExchangeRate:"",allocations:allocations.map(row=>({...row,invoiceExchangeRate:""}))})}/></Field>
      {([["amountExcludingTax","实收未税金额"],["taxRate","实收税率（%）"],["taxAmount","实收税金"],["amountIncludingTax","实收含税金额"]] as const).map(([key,label])=><Field key={key} label={label}><Input type="number" step="any" value={fields[key]} onChange={e=>changeAmount(key,e.target.value)}/></Field>)}
      <Field label={`合同折算汇率：1 ${draft.currency} = N ${contractCurrency}`}><Input type="number" step="any" disabled={draft.currency===contractCurrency} value={draft.currency===contractCurrency?"1":draft.businessExchangeRate??""} onChange={e=>patch({businessExchangeRate:e.target.value})}/></Field>
      <Field label="汇率：1 USD 对应实收币金额"><Input type="number" step="any" value={draft.exchangeRate??""} onChange={e=>patch({exchangeRate:e.target.value})}/></Field>
      <Field label="实收日期"><Input type="date" value={draft.receivedDate||""} onChange={e=>patch({receivedDate:e.target.value})}/></Field>
      <Field label="是否收款"><Select value={draft.isReceived?"yes":"no"} onChange={e=>patch({isReceived:e.target.value==="yes"})}><option value="yes">是 · 已收款</option><option value="no">否 · 未收款</option></Select></Field>
      <Field label="银行流水号"><Input value={draft.bankSerialNo||""} maxLength={255} onChange={e=>patch({bankSerialNo:e.target.value})}/></Field>
    </div>
    <div className="space-y-3 rounded border border-line-soft p-4"><div className="flex items-center justify-between"><span className="text-sm font-medium">关联发票（可留空或关联多张）</span><Select aria-label="添加关联发票" value="" onChange={e=>addInvoice(e.target.value)}><option value="">添加发票…</option>{invoices.filter(row=>row.status==="issued"&&!allocations.some(item=>item.invoiceId===row.id)).map(row=><option key={row.id} value={row.id}>{row.invoiceNo} · {row.currency} · 未收 {display(Number(row.amountIncludingTax)-Number(row.receivedAmount))}</option>)}</Select></div>
      {allocations.map((row,index)=>{const invoice=invoices.find(item=>item.id===row.invoiceId);const update=(values:Partial<typeof row>)=>patch({allocations:allocations.map((item,i)=>i===index?{...item,...values}:item)});return <div key={row.invoiceId} className="grid grid-cols-4 items-end gap-3"><div className="pb-2 text-sm">{invoice?.invoiceNo || "发票不存在"}</div><Field label={`本笔分配额（${draft.currency}）`}><Input type="number" step="any" value={row.amount} onChange={e=>update({amount:e.target.value})}/></Field><Field label={`1 ${draft.currency} = N ${invoice?.currency}`}><Input type="number" step="any" disabled={invoice?.currency===draft.currency} value={invoice?.currency===draft.currency?"1":row.invoiceExchangeRate||""} onChange={e=>update({invoiceExchangeRate:e.target.value})}/></Field><Button onClick={()=>patch({allocations:allocations.filter((_,i)=>i!==index)})}>解除关联</Button></div>;})}
      <p className="text-xs text-ink-3">本笔未分配：{display(Number(draft.amountIncludingTax)-allocations.reduce((sum,row)=>sum+Number(row.amount||0),0))} {draft.currency}。分配金额不会再次计入合同实收。</p>
    </div><Field label="备注"><Textarea value={draft.remark||""} onChange={e=>patch({remark:e.target.value})}/></Field></fieldset>
  </Modal>;
}
