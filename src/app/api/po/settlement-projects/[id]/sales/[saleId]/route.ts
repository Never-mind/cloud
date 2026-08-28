import { NextRequest, NextResponse } from "next/server";
import { deleteSettlementSale, updateSettlementSale } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string; saleId: string }> }) {
  try {
    const { id, saleId } = await context.params;
    return NextResponse.json(await updateSettlementSale(decodeURIComponent(id), decodeURIComponent(saleId), await request.json(), await getOperationActor(request)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "销售收入更新失败" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; saleId: string }> }) {
  try {
    const { id, saleId } = await context.params;
    return NextResponse.json(await deleteSettlementSale(decodeURIComponent(id), decodeURIComponent(saleId), await getOperationActor(request)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "销售收入删除失败" }, { status: 400 });
  }
}
