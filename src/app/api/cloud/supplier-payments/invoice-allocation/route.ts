import { NextRequest, NextResponse } from "next/server";
import { getOperationActor } from "@/lib/operation-actor";
import { loadSupplierInvoiceAllocation, saveSupplierInvoiceAllocation } from "@/lib/cloud-payment-allocation-service";
import { recordOperationLog } from "@/lib/operation-log";

export async function GET(request: NextRequest) {
  if (!await getOperationActor(request)) return NextResponse.json({ error:"未登录" },{ status:401 });
  try {
    return NextResponse.json(await loadSupplierInvoiceAllocation((request.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean)));
  } catch (error) { return NextResponse.json({ error:error instanceof Error ? error.message : "加载失败" },{ status:400 }); }
}

export async function POST(request: NextRequest) {
  const actor = await getOperationActor(request);
  if (!actor) return NextResponse.json({ error:"未登录" },{ status:401 });
  try {
    const body = await request.json();
    const result = await saveSupplierInvoiceAllocation(body,actor);
    await recordOperationLog({ actor,domainKey:"cloud",moduleKey:"huawei-cloud-supplier-payments",action:"update",entityType:"supplier-invoice-allocation",entityId:result.invoiceNo,detail:{ ...result,ownerIds:body.ownerIds } });
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error:error instanceof Error ? error.message : "发票分摊保存失败" },{ status:400 }); }
}
