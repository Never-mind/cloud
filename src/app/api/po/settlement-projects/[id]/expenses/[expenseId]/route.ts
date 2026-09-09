import { NextRequest, NextResponse } from "next/server";
import { deleteSettlementExpense, updateSettlementExpense } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string; expenseId: string }> }) {
  try {
    const { id, expenseId } = await context.params;
    const projectId = decodeURIComponent(id);
    const decodedExpenseId = decodeURIComponent(expenseId);
    const actor = await getOperationActor(request);
    const result = await updateSettlementExpense(projectId, decodedExpenseId, await request.json(), actor);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "update", entityType: "settlement-expenses", entityId: decodedExpenseId, requestId: getOperationRequestId(request), detail: { result: "success", projectId } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "成本费用更新失败" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; expenseId: string }> }) {
  try {
    const { id, expenseId } = await context.params;
    const projectId = decodeURIComponent(id);
    const decodedExpenseId = decodeURIComponent(expenseId);
    const actor = await getOperationActor(request);
    const result = await deleteSettlementExpense(projectId, decodedExpenseId, actor);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "delete", entityType: "settlement-expenses", entityId: decodedExpenseId, requestId: getOperationRequestId(request), detail: { result: "success", projectId } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "成本费用删除失败" }, { status: 400 });
  }
}
