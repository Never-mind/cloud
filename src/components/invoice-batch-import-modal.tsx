"use client";
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Download,FileUp,RefreshCw,Search} from 'lucide-react';
import {Modal} from './modal';
import {Button,Input,Select,Textarea} from './ui';
import {notify} from './app-dialog';
import {SearchSelect} from './search-select';
import {usePartnerOptions} from './use-invoice-partner-options';
import {broadcastMasterDataChanged} from '@/lib/workspace-events';
import {BATCH_SOURCE_LABELS,IMPORT_COLUMNS,importSourceType,type BatchSourceType,type InvoiceImportRaw,type InvoiceImportBatch,type InvoiceImportRow} from '@/lib/invoice-batch-import';
import type {ImportCandidate} from '@/lib/invoice-batch-import-service';

const api='/api/invoices/import';
const cell='whitespace-nowrap border-b border-line-soft px-3 py-2 text-left';
const statusLabels:Record<string,string>={ready:'待开票',error:'需处理',issued:'已开票',skipped:'已存在，跳过'};
async function request(url:string,body?:unknown){
 const result=await fetch(url,{cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
 const data=await result.json();if(!result.ok)throw new Error(data.error||'操作失败');return data;
}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="grid gap-1 text-sm"><span className="text-ink-2">{label}</span>{children}</label>;}

export function InvoiceBatchImportModal({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
 const [batch,setBatch]=useState<InvoiceImportBatch|null>(null),[history,setHistory]=useState<Array<{id:string;fileName:string;totalRows:number;successRows:number}>>([]);
 const [busy,setBusy]=useState(false),[running,setRunning]=useState(false),[progress,setProgress]=useState(''),[selected,setSelected]=useState<string[]>([]),[reviewed,setReviewed]=useState(false);
 const [editing,setEditing]=useState<InvoiceImportRow|null>(null),[expanded,setExpanded]=useState<string|null>(null);
 const fileRef=useRef<HTMLInputElement>(null),stop=useRef(false),runLock=useRef(false);
 async function refreshHistory(){try{setHistory((await request(api)).batches);}catch(error){notify((error as Error).message,'error');}}
 useEffect(()=>{void refreshHistory();return()=>{stop.current=true;};},[]);
 function accept(next:InvoiceImportBatch){setBatch(next);setSelected(next.rows.filter(row=>!row.invoiceId&&!row.preview.errors.length).map(row=>row.id));setReviewed(false);}
 async function loadBatch(id:string){setBusy(true);try{accept(await request(`${api}?id=${encodeURIComponent(id)}`));}catch(error){notify((error as Error).message,'error');}finally{setBusy(false);}}
 async function upload(file:File){
  setBusy(true);try{
   const form=new FormData();form.set('file',file);
   const response=await fetch(api,{method:'POST',body:form}),data=await response.json();
   if(!response.ok)throw new Error(data.error||'导入失败');accept(data);setProgress(data.restored?'已恢复相同表格的导入批次，保留原校验和开票结果。':'系统已生成导入编号并补充默认值，请核对后开票。');await refreshHistory();
  }catch(error){notify((error as Error).message,'error');}finally{setBusy(false);if(fileRef.current)fileRef.current.value='';}
 }
 async function execute(){
  if(!batch||runLock.current||!reviewed)return;
  runLock.current=true;stop.current=false;setRunning(true);
  const todo=batch.rows.filter(row=>selected.includes(row.id)&&!row.invoiceId&&!row.preview.errors.length);
  let successes=0,failures=0;
  try{
   for(const [index,row] of todo.entries()){
    if(stop.current)break;
    setProgress(`正在处理 ${index+1}/${todo.length}：表格第${row.rowNo}行`);
    try{
     const result=await request(api,{action:'execute',batchId:batch.id,rowId:row.id,version:row.version});
     if(result.status==='error')failures++;else successes++;
     setBatch(current=>current?{...current,rows:current.rows.map(item=>item.id===row.id?{...item,...result}:item)}:current);
    }catch(error){failures++;setBatch(current=>current?{...current,rows:current.rows.map(item=>item.id===row.id?{...item,status:'error',message:(error as Error).message}:item)}:current);}
   }
   accept(await request(`${api}?id=${encodeURIComponent(batch.id)}`));
   setProgress(`${stop.current?'已停止后续处理':'本次处理完成'}：成功或跳过 ${successes} 行，失败 ${failures} 行`);
   await refreshHistory();onSaved();
   for(const key of ['prepayment-contracts','service-fee-snapshots','huawei-cloud'])broadcastMasterDataChanged(key);
  }catch(error){notify((error as Error).message,'error');}finally{runLock.current=false;setRunning(false);}
 }
 const available=batch?.rows.filter(row=>!row.invoiceId&&!row.preview.errors.length)??[];
 const selectedTotals=available.filter(row=>selected.includes(row.id)).reduce<Record<string,number>>((totals,row)=>{const currency=row.preview.currency;if(currency)totals[currency]=(totals[currency]||0)+Math.round(Number(row.preview.gross||0)*100);return totals;},{});
 const locked=busy||running;
 return <Modal title="导入批量开票" widthClass="max-w-[96vw]" description="一行生成一张本地发票，可关联多个账期；同一账期可分多行开票。金额以导入表为准。" onClose={()=>!locked&&onClose()} footer={<>
  {running?<Button onClick={()=>{stop.current=true;setProgress('正在完成当前行，随后停止');}}>停止后续处理</Button>:<Button onClick={onClose} disabled={busy}>关闭</Button>}
  <Button tone="primary" disabled={locked||!reviewed||!selected.length} onClick={()=>void execute()}>{running?'正在开票…':`确认开票（${selected.length}行）`}</Button>
 </>}>
  <div className="space-y-4">
   <div className="flex flex-wrap items-center gap-2">
    <a className="inline-flex h-9 items-center gap-1 rounded border border-line px-3 text-sm" href={`${api}?action=template`}><Download size={15}/>下载模板</a>
    <Button disabled={locked} onClick={()=>fileRef.current?.click()}><FileUp size={15}/>{busy?'正在校验…':'上传Excel并预览'}</Button>
    <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" aria-label="批量开票Excel" onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);}}/>
    <Select aria-label="最近导入批次" value={batch?.id||''} disabled={locked} onChange={event=>{if(event.target.value)void loadBatch(event.target.value);}} className="max-w-md"><option value="">恢复最近批次…</option>{history.map(row=><option value={row.id} key={row.id}>{row.fileName} · {row.successRows}/{row.totalRows}行已完成</option>)}</Select>
    {batch?<><Button disabled={locked} onClick={()=>void loadBatch(batch.id)}><RefreshCw size={15}/>刷新</Button><a className="text-sm text-primary" href={`${api}?id=${batch.id}&action=report`}>下载结果表</a>{batch.rows.some(row=>row.invoiceId)?<a className="text-sm text-primary" href={`${api}?id=${batch.id}&action=download`}>批量下载发票</a>:null}</>:null}
   </div>
   <div className="rounded border border-line-soft bg-canvas p-3 text-sm text-ink-2">填写业务模块、关联单据、币种、含税金额及票面描述，导入编号由系统生成。开票单位默认香港万众科技有限公司，税率默认0，开票日期留空按上传当天（北京时间）填写；均可在预览中修改。多账期用分号分隔，拆票时分多行填写金额。相同表格重复上传会恢复原批次。</div>
   {progress?<p role="status" className="text-sm text-primary">{progress}</p>:null}
   {batch?<>
    <div className="flex flex-wrap gap-4 text-sm"><strong>{batch.fileName}</strong><span>共{batch.rows.length}行</span><span className="text-success">已完成{batch.rows.filter(row=>row.invoiceId).length}行</span><span className="text-danger">需处理{batch.rows.filter(row=>row.preview.errors.length||row.status==='error').length}行</span>{Object.entries(selectedTotals).map(([currency,cents])=><span key={currency}>选中含税合计：{(cents/100).toFixed(2)} {currency}</span>)}</div>
    <div className="max-h-[48vh] overflow-auto rounded border border-line-soft"><table className="w-full text-sm"><thead className="sticky top-0 bg-canvas"><tr><th className={cell}><input aria-label="选择全部可开票行" type="checkbox" disabled={locked} checked={available.length>0&&available.every(row=>selected.includes(row.id))} onChange={event=>setSelected(event.target.checked?available.map(row=>row.id):[])}/></th>{['行号','模块／关联单据','开票客户／单位','币种','未税','税金','含税','开票日／应收日','结果／提示','操作'].map(label=><th key={label} className={cell}>{label}</th>)}</tr></thead><tbody>
     {batch.rows.map(row=><ImportPreviewRow key={row.id} row={row} selected={selected.includes(row.id)} expanded={expanded===row.id} disabled={locked} onSelect={checked=>setSelected(current=>checked?[...current,row.id]:current.filter(id=>id!==row.id))} onEdit={()=>setEditing(row)} onExpand={()=>setExpanded(current=>current===row.id?null:row.id)}/>)}
    </tbody></table></div>
    <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={reviewed} disabled={locked} onChange={event=>setReviewed(event.target.checked)}/><span>已核对选中行的开票双方、金额、关联单据与分摊差额；确认按表中金额生成正式本地发票。选用“一行汇总”的服务内容适合合并展示。</span></label>
   </>:<div className="py-8 text-center text-ink-3">先下载模板填写，再上传预览。上传不会立即开票。</div>}
  </div>
  {editing&&batch?<ImportRowEditor row={editing} batchId={batch.id} onClose={()=>setEditing(null)} onSaved={next=>{accept(next);setEditing(null);}}/>:null}
 </Modal>;
}

function ImportPreviewRow({row,selected,expanded,disabled,onSelect,onEdit,onExpand}:{row:InvoiceImportRow;selected:boolean;expanded:boolean;disabled:boolean;onSelect:(checked:boolean)=>void;onEdit:()=>void;onExpand:()=>void}){
 const {raw,preview}=row;
 return <><tr className="hover:bg-surface-2"><td className={cell}><input aria-label={`选择第${row.rowNo}行`} type="checkbox" checked={selected} disabled={disabled||Boolean(row.invoiceId)||preview.errors.length>0} onChange={event=>onSelect(event.target.checked)}/></td><td className={cell}><span className="text-xs text-ink-3">第{row.rowNo}行</span></td><td className={cell}>{raw.module}<div className="max-w-xs truncate text-xs text-ink-3" title={raw.references}>{preview.sources.map(source=>source.label).join('；')||raw.references}</div></td><td className={cell}>{preview.customerName||raw.customer||'默认客户'}<div className="text-xs text-ink-3">{preview.unitName||raw.unit||'默认开票单位'}</div></td><td className={cell}>{preview.currency||raw.currency}</td><td className={cell}>{preview.net||raw.net||'—'}</td><td className={cell}>{preview.tax||'—'}</td><td className={cell}>{preview.gross||raw.gross}</td><td className={cell}>{raw.invoiceDate}<div className="text-xs text-ink-3">{preview.dueDate||raw.dueDate||'—'}</div></td><td className={`${cell} max-w-sm whitespace-normal`}><span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${row.invoiceId?'bg-success-soft text-success':row.status==='error'?'bg-danger-soft text-danger':'bg-canvas text-ink-3'}`}>{statusLabels[row.status]||row.status}</span>{row.invoiceNo?<div>{row.invoiceNo}</div>:null}{row.message?<div className="mt-1 text-xs">{row.message}</div>:null}{preview.errors.map(error=><div key={error} className="mt-1 text-xs text-danger">{error}</div>)}{preview.warnings.length?<button className="mt-1 block text-xs text-warning-ink" onClick={onExpand}>{preview.warnings.length}项提示，查看分摊</button>:null}</td><td className={cell}><div className="flex gap-2">{!row.invoiceId?<button className="text-primary disabled:text-ink-3" disabled={disabled} onClick={onEdit}>修改／分摊</button>:<a href={`/api/invoices/${row.invoiceId}/file?inline=1`} target="_blank" rel="noreferrer" className="text-primary">查看发票</a>}<button className="text-primary" onClick={onExpand}>{expanded?'收起':'明细'}</button></div></td></tr>
  {expanded?<tr><td colSpan={11} className="bg-canvas p-4"><p className="mb-2 text-sm">票面：{raw.description} · {raw.lineMode||'一行汇总'}</p>{preview.warnings.map(warning=><p key={warning} className="text-xs text-warning-ink">{warning}</p>)}<table className="mt-3 text-xs"><thead><tr>{['关联单据','币种','当前未开余额','本票分摊','差额'].map(label=><th className={cell} key={label}>{label}</th>)}</tr></thead><tbody>{preview.sources.map(source=><tr key={source.id}><td className={cell}>{source.label}</td><td className={cell}>{source.currency}</td><td className={cell}>{source.referenceAmount}</td><td className={cell}>{source.allocated}</td><td className={cell}>{source.difference}</td></tr>)}</tbody></table><p className="mt-2 text-xs text-ink-3">差额＝本票分摊－当前未开余额。拆分开票时负差额表示尚余金额；同批次其他待开票行尚未扣除。</p></td></tr>:null}
 </>;
}
function ImportRowEditor({row,batchId,onClose,onSaved}:{row:InvoiceImportRow;batchId:string;onClose:()=>void;onSaved:(batch:InvoiceImportBatch)=>void}){
 const [raw,setRaw]=useState(row.raw),[busy,setBusy]=useState(false),[picker,setPicker]=useState(false);
 const customers=usePartnerOptions('customers'),units=usePartnerOptions('undertaking-units');
 const patch=(key:keyof InvoiceImportRaw,value:string)=>setRaw(current=>({...current,[key]:value}));
 async function save(){setBusy(true);try{onSaved(await request(api,{action:'edit',batchId,rowId:row.id,raw,version:row.version}));}catch(error){notify((error as Error).message,'error');}finally{setBusy(false);}}
 return <Modal title={`修改第${row.rowNo}行开票信息`} widthClass="max-w-5xl" onClose={()=>!busy&&onClose()} footer={<><Button disabled={busy} onClick={onClose}>取消</Button><Button disabled={busy} tone="primary" onClick={()=>void save()}>{busy?'校验中…':'保存并重新校验'}</Button></>}><fieldset disabled={busy} className="space-y-4"><div className="grid grid-cols-2 gap-4 md:grid-cols-3">
  <Field label="业务模块"><Select value={raw.module} onChange={event=>setRaw(current=>({...current,module:event.target.value,references:'',businessRates:'',allocations:''}))}><option value="">请选择</option>{Object.values(BATCH_SOURCE_LABELS).map(label=><option key={label}>{label}</option>)}</Select></Field>
  <Field label="币种"><Input value={raw.currency} onChange={event=>patch('currency',event.target.value.toUpperCase())}/></Field>
  <Field label="开票客户（空白使用业务默认）"><SearchSelect appearance="partner" options={raw.customer&&!customers.some(option=>option.value===raw.customer)?[{value:raw.customer,label:raw.customer},...customers]:customers} value={raw.customer} onChange={value=>patch('customer',value)} /></Field>
  <Field label="开票单位（默认香港万众）"><SearchSelect appearance="partner" options={raw.unit&&!units.some(option=>option.value===raw.unit)?[{value:raw.unit,label:raw.unit},...units]:units} value={raw.unit} onChange={value=>patch('unit',value)}/></Field>
  <Field label="票面展示"><Select value={raw.lineMode||'一行汇总'} onChange={event=>patch('lineMode',event.target.value)}><option>一行汇总</option><option>按账期分行</option></Select></Field>
  {IMPORT_COLUMNS.filter(([key])=>['gross','taxRate','net','invoiceDate','dueDate','paymentTermDays','invoiceNo','usdRate'].includes(key)).map(([key,label])=><Field key={key} label={label}><Input type={key==='invoiceDate'||key==='dueDate'?'date':'text'} value={raw[key]} onChange={event=>patch(key,event.target.value)}/></Field>)}
 </div><Field label="关联单据（多个用分号分隔）"><div className="flex gap-2"><Input value={raw.references} onChange={event=>patch('references',event.target.value)} className="flex-1"/><Button disabled={!Object.values(BATCH_SOURCE_LABELS).includes(raw.module as typeof BATCH_SOURCE_LABELS[BatchSourceType])} onClick={()=>setPicker(true)}><Search size={15}/>选择单据</Button></div></Field>
 <Field label="票面描述"><Input value={raw.description} onChange={event=>patch('description',event.target.value)} maxLength={500}/></Field>
 <div className="grid grid-cols-2 gap-4"><Field label="业务汇率：1开票币 = N来源币（多个用分号分隔）"><Input value={raw.businessRates} onChange={event=>patch('businessRates',event.target.value)}/></Field><Field label="分摊含税金额（按关联单据顺序，空白自动分摊）"><Input value={raw.allocations} onChange={event=>patch('allocations',event.target.value)}/></Field></div>
 <Field label="备注"><Textarea value={raw.remark} onChange={event=>patch('remark',event.target.value)}/></Field></fieldset>
 {picker?<ImportSourcePicker type={importSourceType(raw.module)} onClose={()=>setPicker(false)} onSelect={rows=>{patch('references',rows.map(item=>item.id).join(';'));patch('allocations','');patch('businessRates','');setPicker(false);}}/>:null}
 </Modal>;
}
function ImportSourcePicker({type,onClose,onSelect}:{type:BatchSourceType;onClose:()=>void;onSelect:(rows:ImportCandidate[])=>void}){
 const [rows,setRows]=useState<ImportCandidate[]>([]),[selected,setSelected]=useState<ImportCandidate[]>([]),[keyword,setKeyword]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[busy,setBusy]=useState(false),[more,setMore]=useState(false);
 async function search(){setBusy(true);try{const params=new URLSearchParams({action:'sources',module:type,keyword,from:from.replace('-',''),to:to.replace('-','')});const data=await request(`${api}?${params}`);setRows(data.rows);setMore(data.hasMore);}catch(error){notify((error as Error).message,'error');}finally{setBusy(false);}}
 useEffect(()=>{void search();},[]);
 return <Modal title={`选择${BATCH_SOURCE_LABELS[type]}来源`} widthClass="max-w-4xl" onClose={onClose} footer={<><Button onClick={onClose}>取消</Button><Button tone="primary" disabled={!selected.length} onClick={()=>onSelect(selected)}>关联选中{selected.length}条</Button></>}><div className="space-y-3"><div className="flex gap-2"><Input placeholder="单号／账号／国家／客户" value={keyword} onChange={event=>setKeyword(event.target.value)}/>{type!=='prepayment_contract'?<><Input aria-label="开始账期" type="month" value={from} onChange={event=>setFrom(event.target.value)}/><Input aria-label="结束账期" type="month" value={to} onChange={event=>setTo(event.target.value)}/></>:null}<Button disabled={busy} onClick={()=>void search()}>查询</Button></div>{more?<p className="text-xs text-warning-ink">仅显示前100条，请缩小账期或关键词范围。</p>:null}<div className="max-h-80 overflow-auto"><table className="w-full text-sm"><thead><tr>{['选择','来源单据','客户／国家','币种','应收／合同原金额'].map(label=><th key={label} className={cell}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><td className={cell}><input aria-label={`关联 ${row.label}`} type="checkbox" checked={selected.some(item=>item.id===row.id)} onChange={event=>setSelected(current=>event.target.checked?(type==='prepayment_contract'?[row]:[...current,row]):current.filter(item=>item.id!==row.id))}/></td><td className={cell}>{row.label}<div className="text-xs text-ink-3">{row.reference}</div></td><td className={cell}>{row.customer}</td><td className={cell}>{row.currency}</td><td className={cell}>{row.amount}</td></tr>)}</tbody></table></div></div></Modal>;
}
