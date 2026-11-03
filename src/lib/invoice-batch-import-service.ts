import { createHash,randomUUID } from "node:crypto";
import { getDb,queryRowsRaw,executeRaw,withTransaction,executeInTransaction,type Row } from "./db";
import { saveInvoice,previewGeneratedInvoice,resolveInvoiceParties,type InvoiceDraftInput,type InvoiceActor } from "./invoice-service";
import { loadAllocationSources,prepareInvoiceAllocationPlan } from "./invoice-allocation-service";
import { statementInvoiceEntries } from "./statement-invoice-ledger";
import { getFinanceContract,getPrepaymentFinance,prepaymentInvoicePrefill } from "./prepayment-finance-service";
import { resolveInvoicePaymentDates } from "./invoice-payment-terms";
import { moneyCents,servicePeriodLabel,allocationInvoiceLines } from "./invoice-allocation";
import { BATCH_SOURCE_LABELS,IMPORT_LIMIT,applyImportDefaults,importUploadDate,normalizeImportRaw,importSourceType,importList,importAmounts,importRates,importAllocationPlan,type BatchSourceType,type InvoiceImportRaw,type BatchPreview,type InvoiceImportBatch,type InvoiceImportRow } from "./invoice-batch-import";
import {identifyImportRows} from './invoice-batch-import-identity';

const text=(value:unknown)=>String(value??"").trim();
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const inputHash=(raw:InvoiceImportRaw)=>hash(JSON.stringify(normalizeImportRaw(raw)));
export type BatchAccess={email:string;canUse:(type:BatchSourceType)=>boolean};
export type ImportCandidate={id:string;reference:string;label:string;period:string;currency:string;amount:string;customer:string};

export async function findImportSources(type:BatchSourceType,keyword="",from="",to=""):Promise<ImportCandidate[]> {
 if(!BATCH_SOURCE_LABELS[type]) throw new Error("业务模块无效");
 const values={keyword:`%${keyword.trim()}%`,from,to};
 let rows:Row[];
 if(type==='cloud_row') rows=await queryRowsRaw(`SELECT id,period,account,customer,customerReceivableTotalAmount AS amount,'USD' AS currency FROM merge_cloud_rows WHERE (:from='' OR period>=:from) AND (:to='' OR period<=:to) AND (account LIKE :keyword OR customer LIKE :keyword OR id LIKE :keyword) ORDER BY period DESC,account LIMIT 101`,values);
 else if(type==='service_fee') rows=await queryRowsRaw(`SELECT snapshotNo AS id,DATE_FORMAT(writeOffMonth,'%Y%m') AS period,countryCode AS account,countryCode AS customer,serviceFeeTotal AS amount,COALESCE(NULLIF(serviceFeeCurrency,''),'USD') AS currency FROM merge_power_servicefeesnapshots WHERE (:from='' OR DATE_FORMAT(writeOffMonth,'%Y%m')>=:from) AND (:to='' OR DATE_FORMAT(writeOffMonth,'%Y%m')<=:to) AND (snapshotNo LIKE :keyword OR countryCode LIKE :keyword) ORDER BY writeOffMonth DESC,snapshotNo LIMIT 101`,values);
 else rows=await queryRowsRaw(`SELECT financeId AS id,contractNo AS account,'' AS period,'' AS customer,totalAmount AS amount,currency FROM merge_power_prepaymentcontracts WHERE status='已确认' AND (contractNo LIKE :keyword) ORDER BY createdAt DESC LIMIT 101`,values);
 return rows.map(row=>({id:text(row.id),reference:type==='prepayment_contract'?text(row.account):type==='service_fee'?text(row.id):`${row.period}@${row.account}`,label:type==='prepayment_contract'?text(row.account):`${row.period} · ${row.account}`,period:text(row.period),currency:text(row.currency),amount:text(row.amount),customer:text(row.customer)}));
}
async function resolveReferences(type:BatchSourceType,references:string) {
 const refs=importList(references);
 if(!refs.length||refs.length>200) throw new Error("请选择1至200条关联单据，多个编号用分号分隔");
 if(type==='prepayment_contract'&&refs.length!==1) throw new Error("每张预付款发票只关联一份合同，同合同可分多行开票");
 const ids:string[]=[];
 for(const ref of refs) {
  let rows:Row[];
  if(type==='prepayment_contract') rows=await queryRowsRaw("SELECT financeId AS id FROM merge_power_prepaymentcontracts WHERE contractNo=:ref OR financeId=:ref",{ref});
  else if(type==='service_fee') rows=await queryRowsRaw("SELECT snapshotNo AS id FROM merge_power_servicefeesnapshots WHERE snapshotNo=:ref",{ref});
  else {
   const match=ref.match(/^(\d{6})@(.+)$/);
   rows=await queryRowsRaw(`SELECT id FROM merge_cloud_rows WHERE ${match?'period=:period AND account=:account':'id=:ref'}`,match?{period:match[1],account:match[2]}:{ref});
  }
  if(rows.length!==1) throw new Error(`${ref}：${rows.length?'匹配多条，请通过选择单据指定唯一记录':'未找到对应单据'}`);
  if(!text(rows[0].id)) throw new Error(`${ref}：缺少业务标识，请先升级合同结构`);
  ids.push(text(rows[0].id));
 }
 if(new Set(ids).size!==ids.length) throw new Error("同一张发票的关联单据不能重复");
 return ids;
}
async function resolveParty(kind:'customer'|'unit',value:string,fallback:string) {
 const ref=value||fallback;
 if(!ref) throw new Error(`请指定${kind==='customer'?'开票客户':'开票单位'}`);
 const sql=kind==='customer'
  ?"SELECT customerId AS id FROM merge_common_customers WHERE customerId=:ref OR customerCode=:ref OR name=:ref OR nameCn=:ref OR nameEn=:ref OR shortName=:ref"
  :"SELECT undertakingUnitId AS id FROM merge_common_undertaking_units WHERE undertakingUnitId=:ref OR undertakingUnitCode=:ref OR entityCode=:ref OR name=:ref OR nameCn=:ref OR nameEn=:ref OR shortName=:ref OR entityName=:ref";
 const rows=await queryRowsRaw(sql,{ref});
 if(rows.length!==1) throw new Error(`${kind==='customer'?'开票客户':'开票单位'}“${ref}”${rows.length?'存在重名，请选择唯一单位':'未在业务伙伴库中找到'}`);
 return text(rows[0].id);
}
async function existingImport(raw:InvoiceImportRaw) {
 const rows=await queryRowsRaw(`SELECT i.id,i.invoiceNo,i.status,r.inputHash,b.createdBy FROM merge_common_invoices i
  LEFT JOIN merge_common_invoice_import_rows r ON r.batchId=i.importBatchId AND r.rowKey=i.importRowKey
  LEFT JOIN merge_common_invoice_import_batches b ON b.id=i.importBatchId
  WHERE i.importRowKey=:key AND i.importBatchId IS NOT NULL LIMIT 2`,{key:raw.rowKey});
 if(rows.length>1) throw new Error("该导入编号存在多条历史记录，请管理员核对");
 return rows[0];
}
async function reusedInvoice(raw:InvoiceImportRaw,access:BatchAccess) {
 const existing=await existingImport(raw);
 if(!existing) return null;
 if(existing.createdBy!==access.email) throw new Error("该导入编号已被其他用户使用，请核对导入编号");
 if(existing.inputHash!==inputHash(raw)) throw new Error("导入编号已开票且内容不同，不能覆盖；确需新增发票请使用新编号");
 if(existing.status!=='issued') throw new Error("该导入编号的发票已作废；重新开票请使用新导入编号");
 return existing;
}
export async function prepareImportRow(raw:InvoiceImportRaw,access:BatchAccess):Promise<{preview:BatchPreview;input?:InvoiceDraftInput}> {
 const preview:BatchPreview={sources:[],warnings:[],errors:[]};
 try {
  if(Object.values(raw).some(value=>value.length>10000))throw new Error('单元格内容过长，请缩短后重新导入');
  if(!/^[\p{L}\p{N}_.-]{1,128}$/u.test(raw.rowKey)) throw new Error("导入编号必填，限128位文字、数字、横杠、下划线或点");
  const type=importSourceType(raw.module);preview.sourceType=type;
  if(!access.canUse(type)) throw new Error(`没有${BATCH_SOURCE_LABELS[type]}的开票关联权限`);
  const existing=await reusedInvoice(raw,access);
  if(existing){preview.existingInvoiceId=text(existing.id);preview.existingInvoiceNo=text(existing.invoiceNo);preview.warnings.push('此导入编号已开票，将跳过，不重复生成');return{preview};}
  const currency=raw.currency.toUpperCase();
  if(!/^[A-Z]{3}$/.test(currency)) throw new Error("请填写三位开票币种，如USD、CNY");
  if(!raw.description||raw.description.length>500) throw new Error("票面描述必填，最多500字");
  if(raw.lineMode&&!['一行汇总','按账期分行'].includes(raw.lineMode)) throw new Error("票面展示只能填写一行汇总或按账期分行");
  if(raw.invoiceNo.length>128||raw.remark.length>2000) throw new Error("发票号或备注过长");
  const totals=importAmounts(raw),ids=await resolveReferences(type,raw.references);
  let input:InvoiceDraftInput={source:'generated',template:'normal',sourceType:type,sourceId:ids[0],currency,...totals,invoiceNo:raw.invoiceNo||null,invoiceDate:raw.invoiceDate,comment:raw.remark,remark:raw.remark};
  let fallbackCustomer='',fallbackUnit='';
  if(type==='prepayment_contract') {
   const prefill=await prepaymentInvoicePrefill(ids[0]),contract=await getFinanceContract(ids[0]);
   const rates=importRates(raw.businessRates,[prefill.contractCurrency],currency);
   if(importList(raw.allocations).length) throw new Error("预付款单票只对应一份合同，无需填写分摊金额");
   fallbackCustomer=prefill.customerId;fallbackUnit=prefill.undertakingUnitId;
   const finance=await getPrepaymentFinance(text(contract.contractNo));
   const sourceAmount=Number(totals.amountIncludingTax)*Number(rates[0]);
   if(Math.round(sourceAmount*100)>Math.round(Number(finance.summary.remainingInvoice)*100)) throw new Error("本次金额超过合同剩余可开额度（包含审批占用）");
   input={...input,businessExchangeRate:rates[0],sourceNo:text(contract.contractNo),period:raw.invoiceDate.replace(/-/g,'').slice(0,6),lines:[{description:raw.description,amount:totals.amountIncludingTax}]};
   preview.sources=[{id:ids[0],label:text(contract.contractNo),period:'',currency:prefill.contractCurrency,referenceAmount:String(finance.summary.remainingInvoice),allocated:sourceAmount.toFixed(2),difference:(sourceAmount-Number(finance.summary.remainingInvoice)).toFixed(2)}];
  } else {
   const loaded=await loadAllocationSources(type,ids);
   // Preserve the spreadsheet order for explicit per-source amounts and rates.
   const sources=ids.map(id=>loaded.find(row=>row.sourceId===id)!);
   if(sources.some(row=>!row)) throw new Error("关联账单已不存在，请刷新");
   const rates=importRates(raw.businessRates,sources.map(row=>row.sourceCurrency),currency);
   const plan=importAllocationPlan(raw,sources,rates);
   input.allocationPlan=await prepareInvoiceAllocationPlan(plan,totals);
   input.lines=allocationInvoiceLines(input.allocationPlan);
   input.period=sources.map(row=>row.period).sort()[0];
   input.sourceNo=servicePeriodLabel(sources.map(row=>row.period));
   fallbackCustomer=sources[0].customerId;
   const units=[...new Set(sources.map(row=>row.undertakingUnitId).filter(Boolean))];
   fallbackUnit=units.length===1?units[0]:'';
   const entries=await statementInvoiceEntries(type,ids);
   const legacy=await queryRowsRaw(type==='cloud_row'
    ?'SELECT id AS sourceId,invoiceNo FROM merge_cloud_rows WHERE id IN (:ids)'
    :'SELECT snapshotNo AS sourceId,invoiceNo FROM merge_power_servicefeesnapshots WHERE snapshotNo IN (:ids)',{ids});
   if(legacy.some(row=>text(row.invoiceNo)&&!entries.some(entry=>entry.sourceId===row.sourceId)))throw new Error('关联账单已有手工发票信息，请先登记原票后追加，避免覆盖原金额');
   if(entries.some(entry=>text(entry.currency).toUpperCase()!==currency)) throw new Error("关联账期已有其他币种发票，同一账期的发票币种必须一致");
   preview.sources=plan.allocations.map(row=>{
    const previously=entries.filter(entry=>entry.sourceId===row.sourceId).reduce((sum,entry)=>sum+Number(entry.amountIncludingTax),0);
    const remaining=Number(row.sourceTotal)*Number(row.exchangeRate)-previously;
    return {id:row.sourceId,label:row.sourceNo,period:row.period,currency,referenceAmount:remaining.toFixed(2),allocated:row.amountIncludingTax,difference:(Number(row.amountIncludingTax)-remaining).toFixed(2)};
   });
   if(entries.length) preview.warnings.push('部分关联账期已有发票，本次将追加并累计，不覆盖原发票');
  }
  input.customerId=await resolveParty('customer',raw.customer,fallbackCustomer);
  input.undertakingUnitId=await resolveParty('unit',raw.unit,fallbackUnit);
  const parties=await resolveInvoiceParties(input);
  const dates=resolveInvoicePaymentDates({invoiceDate:raw.invoiceDate,dueDate:raw.dueDate,paymentTermDays:raw.paymentTermDays},parties.paymentTermDays);
  Object.assign(input,dates);
  if(raw.usdRate&&(!Number.isFinite(Number(raw.usdRate))||Number(raw.usdRate)<=0)) throw new Error("美元汇率必须大于零（1 USD对应开票币金额）");
  input.exchangeRate=currency==='USD'?'1':raw.usdRate||undefined;
  if(currency!=='USD'&&!raw.usdRate) preview.warnings.push('未填写美元汇率；如需折算美元报表，请补充1 USD对应的开票币金额');
  if(raw.invoiceNo&&(await queryRowsRaw('SELECT id FROM merge_common_invoices WHERE undertakingUnitId=:unit AND invoiceNo=:number LIMIT 1',{unit:input.undertakingUnitId,number:raw.invoiceNo})).length) throw new Error("该开票单位下发票号已存在");
  const validation=await previewGeneratedInvoice(input);
  preview.reviewHash=hash(JSON.stringify({input,parties}));
  Object.assign(preview,{customerName:validation.customerName,unitName:validation.sellerName,dueDate:validation.dueDate,currency,net:totals.amountExcludingTax,tax:totals.taxAmount,gross:totals.amountIncludingTax});
  if(preview.sources.some(row=>moneyCents(String(Math.abs(Number(row.difference)).toFixed(2)))>0)) preview.warnings.push('开票金额与来源未开余额不同，将以本行金额开票；请核对分摊及差额');
  return{preview,input};
 }catch(error){preview.errors.push(error instanceof Error?error.message:'校验失败');return{preview};}
}

async function ownBatch(id:string,access:BatchAccess) {
 const [batch]=await queryRowsRaw('SELECT * FROM merge_common_invoice_import_batches WHERE id=:id AND createdBy=:email',{id,email:access.email});
 if(!batch) throw new Error('导入批次不存在或无权访问');return batch;
}
export async function listImportBatches(access:BatchAccess) {
 return queryRowsRaw(`SELECT b.id,b.fileName,b.createdAt,COUNT(r.id) AS totalRows,SUM(r.status IN ('issued','skipped')) AS successRows
  FROM merge_common_invoice_import_batches b LEFT JOIN merge_common_invoice_import_rows r ON r.batchId=b.id
  WHERE b.createdBy=:email GROUP BY b.id ORDER BY b.createdAt DESC LIMIT 20`,{email:access.email});
}
export async function getImportBatch(id:string,access:BatchAccess):Promise<InvoiceImportBatch> {
 const batch=await ownBatch(id,access);
 const rows=await queryRowsRaw(`SELECT r.*,i.invoiceNo FROM merge_common_invoice_import_rows r LEFT JOIN merge_common_invoices i ON i.id=r.invoiceId WHERE r.batchId=:id ORDER BY r.rowNo`,{id});
 return {id,fileName:text(batch.fileName),createdAt:text(batch.createdAt),rows:rows.map(row=>({id:text(row.id),rowNo:Number(row.rowNo),raw:JSON.parse(text(row.rawJson)),preview:JSON.parse(text(row.previewJson)),status:text(row.status),invoiceId:text(row.invoiceId),invoiceNo:text(row.invoiceNo),message:text(row.message),version:Number(row.version)}))};
}
export async function createImportBatch(rawRows:Array<{rowNo:number;raw:InvoiceImportRaw}>,fileName:string,fileHash:string,access:BatchAccess) {
 if(!rawRows.length||rawRows.length>IMPORT_LIMIT) throw new Error(`每批需1至${IMPORT_LIMIT}行发票`);
 const uploadDate=importUploadDate(),identified=identifyImportRows(rawRows);
 // An unchanged worksheet restores the reviewed batch, even after the file is renamed or re-saved.
 return batchLock('upload:'+access.email+':'+identified.fileHash,async()=>{
 if(identified.allAutomatic){
  const [prior]=await queryRowsRaw('SELECT id FROM merge_common_invoice_import_batches WHERE createdBy=:email AND fileHash=:hash ORDER BY createdAt DESC LIMIT 1',{email:access.email,hash:identified.fileHash});
  if(prior)return{...await getImportBatch(text(prior.id),access),restored:true};
 }
 const autoKeys=identified.rows.filter(row=>row.automatic).map(row=>row.raw.rowKey);
 const priorRows=autoKeys.length?await queryRowsRaw(`SELECT r.rowKey,r.rawJson FROM merge_common_invoice_import_rows r JOIN merge_common_invoice_import_batches b ON b.id=r.batchId WHERE b.createdBy=:email AND r.rowKey IN (:keys) ORDER BY (r.invoiceId IS NOT NULL) DESC,r.updatedAt DESC`,{email:access.email,keys:autoKeys}):[];
 const previousRaw=new Map<string,InvoiceImportRaw>();
 for(const row of priorRows)if(!previousRaw.has(text(row.rowKey)))previousRaw.set(text(row.rowKey),normalizeImportRaw(JSON.parse(text(row.rawJson))));
 rawRows=identified.rows.map(row=>({rowNo:row.rowNo,raw:row.automatic&&previousRaw.has(row.raw.rowKey)?previousRaw.get(row.raw.rowKey)!:applyImportDefaults(row.raw,uploadDate)}));
 if(identified.allAutomatic)fileHash=identified.fileHash;
 const id=randomUUID(),prepared:Array<{id:string;rowNo:number;raw:InvoiceImportRaw;preview:BatchPreview}>=[];
 const duplicateKeys=new Set(rawRows.filter((row,index)=>rawRows.findIndex(other=>other.raw.rowKey===row.raw.rowKey)!==index).map(row=>row.raw.rowKey));
 for(let index=0;index<rawRows.length;index+=4) {
  const group=await Promise.all(rawRows.slice(index,index+4).map(async row=>{
   const result=await prepareImportRow(row.raw,access);
   result.preview.uploadDate=uploadDate;
   if(duplicateKeys.has(row.raw.rowKey)) result.preview.errors.push('本表导入编号重复，请每张发票使用独立编号');
   return{id:randomUUID(),...row,preview:result.preview};
  }));prepared.push(...group);
 }
 await withTransaction(async connection=>{
  await executeInTransaction(connection,`INSERT INTO merge_common_invoice_import_batches (id,fileName,fileHash,createdBy) VALUES (:id,:fileName,:fileHash,:email)`,{id,fileName:fileName.slice(0,255),fileHash,email:access.email});
  for(const row of prepared) await executeInTransaction(connection,`INSERT INTO merge_common_invoice_import_rows (id,batchId,rowNo,rowKey,inputHash,rawJson,previewJson,status) VALUES (:id,:batchId,:rowNo,:key,:hash,:raw,:preview,:status)`,{id:row.id,batchId:id,rowNo:row.rowNo,key:row.raw.rowKey.slice(0,128),hash:inputHash(row.raw),raw:JSON.stringify(row.raw),preview:JSON.stringify(row.preview),status:row.preview.errors.length?'error':'ready'});
 });return getImportBatch(id,access);
 });
}
async function batchLock<T>(key:string,work:()=>Promise<T>):Promise<T> {
 const connection=await getDb().getConnection(),name=`invoice-import:${hash(key).slice(0,48)}`;
 let acquired=false;
 try{
  const [rows]=await connection.query<any[]>('SELECT GET_LOCK(?,0) AS locked',[name]);
  if(Number(rows[0]?.locked)!==1) throw new Error('该导入正在处理中，请稍后刷新重试');
  acquired=true;return await work();
 }finally{try{if(acquired)await connection.query('SELECT RELEASE_LOCK(?)',[name]);}finally{connection.release();}}
}
export async function updateImportRow(batchId:string,rowId:string,raw:InvoiceImportRaw,version:number,access:BatchAccess) {
 const batch=await ownBatch(batchId,access);
 return batchLock('batch:'+batchId,async()=>{
  const [row]=await queryRowsRaw('SELECT * FROM merge_common_invoice_import_rows WHERE id=:rowId AND batchId=:batchId',{rowId,batchId});
  if(!row||Number(row.version)!==version) throw new Error('记录已变化，请刷新后编辑');
  if(row.invoiceId) throw new Error('已开票行不能再修改，请在发票管理核对');
  // Automatic identity and the original upload date remain fixed while correcting a row.
  const automatic=text(row.rowKey).startsWith('AUTO-');
  const uploadDate=(JSON.parse(text(row.previewJson)) as BatchPreview).uploadDate||importUploadDate(new Date(batch.createdAt as string|Date));
  raw=applyImportDefaults(normalizeImportRaw({...raw,rowKey:automatic?row.rowKey:raw.rowKey}),uploadDate);
  const prepared=await prepareImportRow(raw,access);
  prepared.preview.uploadDate=uploadDate;
  const duplicates=await queryRowsRaw('SELECT id FROM merge_common_invoice_import_rows WHERE batchId=:batchId AND rowKey=:key AND id<>:rowId',{batchId,key:raw.rowKey,rowId});
  if(duplicates.length) prepared.preview.errors.push('本批次导入编号重复');
  await executeRaw(`UPDATE merge_common_invoice_import_rows SET rowKey=:key,inputHash=:hash,rawJson=:raw,previewJson=:preview,status=:status,message=NULL,version=version+1 WHERE id=:rowId`,{rowId,key:raw.rowKey.slice(0,128),hash:inputHash(raw),raw:JSON.stringify(raw),preview:JSON.stringify(prepared.preview),status:prepared.preview.errors.length?'error':'ready'});
  return getImportBatch(batchId,access);
 });
}
export async function executeImportRow(batchId:string,rowId:string,version:number,access:BatchAccess,actor:InvoiceActor) {
 await ownBatch(batchId,access);
 return batchLock('batch:'+batchId,()=>batchLock('issue',async()=>{
  const [row]=await queryRowsRaw('SELECT * FROM merge_common_invoice_import_rows WHERE id=:rowId AND batchId=:batchId',{rowId,batchId});
  if(!row) throw new Error('导入行不存在');
  const raw=normalizeImportRaw(JSON.parse(text(row.rawJson)));
  if(!access.canUse(importSourceType(raw.module))) throw new Error('没有该业务模块的开票关联权限');
  if(row.invoiceId)return{status:text(row.status),invoiceId:text(row.invoiceId),message:'该行已完成'};
  if(Number(row.version)!==version) throw new Error('导入内容已变化，请刷新预览');
  let invoice:Row|null=null;
  try {
   const duplicates=await queryRowsRaw('SELECT id FROM merge_common_invoice_import_rows WHERE batchId=:batchId AND rowKey=:key AND id<>:rowId',{batchId,key:raw.rowKey,rowId});
   if(duplicates.length) throw new Error('本批次导入编号重复，请先修正');
   const reused=await reusedInvoice(raw,access);
   if(reused)invoice=reused;
   else {
    const prepared=await prepareImportRow(raw,access);
    if(prepared.preview.errors.length||!prepared.input)throw new Error(prepared.preview.errors.join('；')||'请刷新预览');
    const reviewed=JSON.parse(text(row.previewJson)) as BatchPreview;
    if(reviewed.reviewHash!==prepared.preview.reviewHash)throw new Error('来源金额、业务伙伴或默认日期已变化，请编辑此行并重新校验后再开票');
    // The server re-resolves every business reference; the client cannot submit invoice amounts independently of its reviewed row.
    invoice=await saveInvoice({...prepared.input,importBatchId:batchId,importRowKey:raw.rowKey},actor);
   }
   if(!invoice?.id) throw new Error('开票未返回有效记录，请刷新核对');
   const status=reused?'skipped':'issued',message=reused?'已存在，跳过重复开票':'开票成功';
   await executeRaw('UPDATE merge_common_invoice_import_rows SET invoiceId=:invoiceId,status=:status,message=:message,version=version+1 WHERE id=:rowId',{rowId,invoiceId:invoice.id,status,message});
   return{status,invoiceId:text(invoice.id),invoiceNo:text(invoice.invoiceNo),message};
  }catch(error){
   const message=error instanceof Error?error.message:'开票失败';
   // Even if result recording fails, the invoice's import key survives atomically and the next attempt recovers it.
   await executeRaw("UPDATE merge_common_invoice_import_rows SET status='error',message=:message WHERE id=:rowId",{rowId,message}).catch(()=>{});
   return{status:'error',message,invoiceId:invoice?text(invoice.id):undefined};
  }
 }));
}
