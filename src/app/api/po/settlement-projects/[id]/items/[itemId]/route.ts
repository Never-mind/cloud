import { NextRequest, NextResponse } from "next/server";
import { getOperationActor } from "@/lib/operation-actor";
import { returnSettlementItem, updateSettlementItem } from "@/lib/settlement-project-service";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const { id, itemId } = await context.params;
    const projectId = decodeURIComponent(id);
    const decodedItemId = decodeURIComponent(itemId);
    const actor = await getOperationActor(request);
    const result = await updateSettlementItem(projectId, decodedItemId, await request.json(), actor);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "update", entityType: "settlement-items", entityId: decodedItemId, requestId: getOperationRequestId(request), detail: { result: "success", projectId } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "采购明细更新失败" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const { id, itemId } = await context.params;
    const projectId = decodeURIComponent(id);
    const decodedItemId = decodeURIComponent(itemId);
    const actor = await getOperationActor(request);
    const result = await returnSettlementItem(projectId, decodedItemId, actor);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "update", entityType: "settlement-items", entityId: decodedItemId, requestId: getOperationRequestId(request), detail: { result: "success", projectId, operation: "return_to_unpurchased" } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "采购明细退回失败" }, { status: 400 });
  }
}
