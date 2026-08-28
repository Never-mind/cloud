import { NextRequest, NextResponse } from "next/server";
import { getOperationActor } from "@/lib/operation-actor";
import { returnSettlementItem, updateSettlementItem } from "@/lib/settlement-project-service";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const { id, itemId } = await context.params;
    return NextResponse.json(await updateSettlementItem(decodeURIComponent(id), decodeURIComponent(itemId), await request.json(), await getOperationActor(request)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "采购明细更新失败" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const { id, itemId } = await context.params;
    return NextResponse.json(await returnSettlementItem(decodeURIComponent(id), decodeURIComponent(itemId), await getOperationActor(request)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "采购明细退回失败" }, { status: 400 });
  }
}
