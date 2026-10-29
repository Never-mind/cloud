import { NextRequest,NextResponse } from "next/server";
import {getAuthenticatedUserEmail} from "@/lib/auth";
import {getPermissionStateForEmail} from "@/lib/permission-service";
import {hasPermission} from "@/lib/permission-definitions";
import {getOperationActor} from "@/lib/operation-actor";
import {recordOperationLog} from "@/lib/operation-log";
import {listAllocationCandidates} from "@/lib/invoice-allocation-service";
import {readInvoiceAllocationEdit,replaceInvoiceAllocations} from "@/lib/invoice-allocation-edit-service";
import type {AllocationSourceType,InvoiceAllocationPlan} from "@/lib/invoice-allocation";
async function access(request:NextRequest) {
  const email=getAuthenticatedUserEmail(request);
  if(!email) throw new Error("未登录");
  if(!hasPermission(await getPermissionStateForEmail(email),"invoices","create")) throw new Error("没有开票权限");
}
export async function GET(request:NextRequest) {
  try {
    await access(request); const p=request.nextUrl.searchParams;
    if(p.get("view")==="existing") {
      let id=p.get("invoiceId")||"";
      if(!id&&p.get("sourceId")) {
        const {queryRowsRaw}=await import("@/lib/db");
        const [invoice]=await queryRowsRaw("SELECT i.id FROM merge_common_invoices i LEFT JOIN merge_common_invoice_allocations a ON a.invoiceId=i.id WHERE i.status='issued' AND i.sourceType=:type AND (i.sourceId=:sourceId OR a.sourceId=:sourceId) ORDER BY i.createdAt DESC LIMIT 1",{type:p.get("sourceType"),sourceId:p.get("sourceId")});
        id=String(invoice?.id||"");
      }
      if(!id) throw new Error("该账单还没有可调整的已登记发票");
      return NextResponse.json(await readInvoiceAllocationEdit(id));
    }
    const sourceType=p.get("sourceType") as AllocationSourceType;
    if(!["cloud_row","service_fee"].includes(sourceType)) throw new Error("不支持的来源类型");
    return NextResponse.json(await listAllocationCandidates({sourceType,sourceId:p.get("sourceId")||"",currency:p.get("currency")||"",from:p.get("from")||"",to:p.get("to")||"",invoiceId:p.get("invoiceId")||""}));
  } catch(error) {return NextResponse.json({error:error instanceof Error?error.message:"加载失败"},{status:400});}
}
export async function POST(request:NextRequest) {
  try {
    await access(request); const body=await request.json() as {invoiceId:string;plan:InvoiceAllocationPlan;revision:string};
    const actor=await getOperationActor(request);
    const result=await replaceInvoiceAllocations(body.invoiceId,body.plan,body.revision,{userId:actor?.userId,name:actor?.displayName});
    let warning="";
    try {await recordOperationLog({actor,moduleKey:"invoices",action:"update",entityType:"invoice",entityId:body.invoiceId,detail:{operation:"replace_allocations",before:result.before,after:result.plan}});}
    catch {warning="分摊已保存，操作日志写入失败，请勿重复提交";}
    return NextResponse.json({invoice:result,warning});
  } catch(error) {return NextResponse.json({error:error instanceof Error?error.message:"保存失败"},{status:400});}
}
