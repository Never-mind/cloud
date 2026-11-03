import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {getAuthenticatedUserEmail} from '@/lib/auth';
import {getOperationActor} from '@/lib/operation-actor';
import {getPermissionStateForEmail} from '@/lib/permission-service';
import {hasPermission} from '@/lib/permission-definitions';
import {recordOperationLog} from '@/lib/operation-log';
import {normalizeImportRaw,importSourceType,type BatchSourceType} from '@/lib/invoice-batch-import';
import {createImportBatch,getImportBatch,listImportBatches,updateImportRow,executeImportRow,findImportSources,type BatchAccess} from '@/lib/invoice-batch-import-service';
import {parseInvoiceImportWorkbook,invoiceImportTemplate,invoiceImportReport} from '@/lib/invoice-batch-import-excel';
import {readInvoiceFile} from '@/lib/invoice-service';

export const runtime='nodejs';
export const maxDuration=180;
const sourceModules={service_fee:'service-fee-snapshots',cloud_row:'huawei-cloud',prepayment_contract:'prepayment-contracts'} as const;
async function access(request:NextRequest):Promise<BatchAccess>{
 const email=getAuthenticatedUserEmail(request);if(!email)throw Object.assign(new Error('未登录'),{status:401});
 const state=await getPermissionStateForEmail(email);
 if(!hasPermission(state,'invoices','create')||!hasPermission(state,'invoices','view'))throw Object.assign(new Error('没有发票管理的查看及开票权限'),{status:403});
 return{email,canUse:(type:BatchSourceType)=>hasPermission(state,sourceModules[type],'view')&&hasPermission(state,sourceModules[type],'update')};
}
function fail(error:unknown){return NextResponse.json({error:error instanceof Error?error.message:'批量开票失败'},{status:Number((error as {status?:number})?.status)||400});}
function excel(bytes:Buffer,name:string){return new NextResponse(new Uint8Array(bytes),{headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':`attachment; filename="${name}.xlsx"`,'cache-control':'no-store'}});}
export async function GET(request:NextRequest){
 try{
  const auth=await access(request),p=request.nextUrl.searchParams,action=p.get('action');
  if(action==='template')return excel(await invoiceImportTemplate(),'invoice-import-template');
  if(action==='sources'){
   const type=importSourceType(p.get('module')||'');
   if(!auth.canUse(type))throw Object.assign(new Error('没有该业务模块的关联权限'),{status:403});
   const rows=await findImportSources(type,p.get('keyword')||'',p.get('from')||'',p.get('to')||'');
   return NextResponse.json({rows:rows.slice(0,100),hasMore:rows.length>100});
  }
  const id=p.get('id');if(!id)return NextResponse.json({batches:await listImportBatches(auth)});
  const batch=await getImportBatch(id,auth);
  if(action==='report')return excel(await invoiceImportReport(batch),'invoice-import-result');
  if(action==='download'){
   const {zipSync}=await import('fflate'),files:Record<string,Uint8Array>={};
   const ids=[...new Set(batch.rows.map(row=>row.invoiceId).filter((id):id is string=>Boolean(id)))];
   if(!ids.length)throw new Error('本批次暂无已生成发票');
   let size=0;
   for(const invoiceId of ids){
    const file=await readInvoiceFile(invoiceId);if(!file)throw new Error('部分发票文件不存在，请先核对');
    size+=file.bytes.length;if(size>100*1024*1024)throw new Error('文件合计超过100MB，请从发票列表分别下载');
    const safeName=file.fileName.replace(/[\\/\x00-\x1f:*?"<>|]/g,'_');
    files[`${invoiceId.slice(0,8)}-${safeName}`]=new Uint8Array(file.bytes);
   }
   return new NextResponse(new Uint8Array(zipSync(files)),{headers:{'content-type':'application/zip','content-disposition':'attachment; filename="invoice-batch.zip"','cache-control':'no-store'}});
  }
  return NextResponse.json(batch);
 }catch(error){return fail(error);}
}
export async function POST(request:NextRequest){
 try{
  const auth=await access(request);
  if(request.headers.get('content-type')?.includes('multipart/form-data')){
   const form=await request.formData(),file=form.get('file');
   if(!(file instanceof File)||! /\.xlsx?$/i.test(file.name))throw new Error('请上传Excel文件（xlsx或xls）');
   if(file.size>5*1024*1024)throw new Error('导入文件不能超过5MB');
   const bytes=Buffer.from(await file.arrayBuffer());
   return NextResponse.json(await createImportBatch(parseInvoiceImportWorkbook(bytes),file.name,createHash('sha256').update(bytes).digest('hex'),auth));
  }
  const body=await request.json();
  if(body.action==='edit')return NextResponse.json(await updateImportRow(String(body.batchId),String(body.rowId),normalizeImportRaw(body.raw||{}),Number(body.version),auth));
  if(body.action==='execute'){
   const actor=await getOperationActor(request);
   const result=await executeImportRow(String(body.batchId),String(body.rowId),Number(body.version),auth,{userId:actor?.userId,name:actor?.displayName});
   if(result.status==='issued')await recordOperationLog({actor,moduleKey:'invoices',action:'batch_import_issue',entityType:'invoice',entityId:result.invoiceId,detail:{batchId:body.batchId,rowId:body.rowId}}).catch(()=>console.error('Batch invoice audit log failed',result.invoiceId));
   return NextResponse.json(result);
  }
  throw new Error('不支持的导入操作');
 }catch(error){return fail(error);}
}
