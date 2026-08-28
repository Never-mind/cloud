import { NextRequest, NextResponse } from "next/server";
import { deleteSettlementInvoice, updateSettlementInvoice } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string; invoiceId: string }> }) {
  try {
    const { id, invoiceId } = await context.params;
    return NextResponse.json(await updateSettlementInvoice(decodeURIComponent(id), decodeURIComponent(invoiceId), await request.json(), await getOperationActor(request)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票更新失败" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; invoiceId: string }> }) {
  try {
    const { id, invoiceId } = await context.params;
    return NextResponse.json(await deleteSettlementInvoice(decodeURIComponent(id), decodeURIComponent(invoiceId), await getOperationActor(request)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票删除失败" }, { status: 400 });
  }
}
