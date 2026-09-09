import { NextRequest, NextResponse } from "next/server";
import { deleteSettlementInvoice, updateSettlementInvoice } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string; invoiceId: string }> }) {
  try {
    const { id, invoiceId } = await context.params;
    const projectId = decodeURIComponent(id);
    const decodedInvoiceId = decodeURIComponent(invoiceId);
    const actor = await getOperationActor(request);
    const result = await updateSettlementInvoice(projectId, decodedInvoiceId, await request.json(), actor);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "update", entityType: "settlement-invoices", entityId: decodedInvoiceId, requestId: getOperationRequestId(request), detail: { result: "success", projectId } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票更新失败" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; invoiceId: string }> }) {
  try {
    const { id, invoiceId } = await context.params;
    const projectId = decodeURIComponent(id);
    const decodedInvoiceId = decodeURIComponent(invoiceId);
    const actor = await getOperationActor(request);
    const result = await deleteSettlementInvoice(projectId, decodedInvoiceId, actor);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "delete", entityType: "settlement-invoices", entityId: decodedInvoiceId, requestId: getOperationRequestId(request), detail: { result: "success", projectId } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票删除失败" }, { status: 400 });
  }
}
