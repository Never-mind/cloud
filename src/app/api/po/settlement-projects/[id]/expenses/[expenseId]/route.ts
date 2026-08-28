import { NextRequest, NextResponse } from "next/server";
import { deleteSettlementExpense, updateSettlementExpense } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string; expenseId: string }> }) {
  try {
    const { id, expenseId } = await context.params;
    return NextResponse.json(await updateSettlementExpense(decodeURIComponent(id), decodeURIComponent(expenseId), await request.json(), await getOperationActor(request)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "成本费用更新失败" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; expenseId: string }> }) {
  try {
    const { id, expenseId } = await context.params;
    return NextResponse.json(await deleteSettlementExpense(decodeURIComponent(id), decodeURIComponent(expenseId), await getOperationActor(request)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "成本费用删除失败" }, { status: 400 });
  }
}
