import { NextRequest, NextResponse } from "next/server";
import { deleteSettlementChangeItem, updateSettlementChangeItem } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

/** 编辑客户变更行（报价带来的行不能在这里改）。 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const { id, itemId } = await context.params;
    const projectId = decodeURIComponent(id);
    const decodedItemId = decodeURIComponent(itemId);
    const actor = await getOperationActor(request);
    const result = await updateSettlementChangeItem(projectId, decodedItemId, await request.json(), actor);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "update", entityType: "settlement-items", entityId: decodedItemId, requestId: getOperationRequestId(request), detail: { result: "success", projectId, operation: "customer_change_update" } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "变更明细更新失败" }, { status: 400 });
  }
}

/** 删除客户变更行（只有未采购的变更行能删）。 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const { id, itemId } = await context.params;
    const projectId = decodeURIComponent(id);
    const decodedItemId = decodeURIComponent(itemId);
    const actor = await getOperationActor(request);
    const result = await deleteSettlementChangeItem(projectId, decodedItemId, actor);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "delete", entityType: "settlement-items", entityId: decodedItemId, requestId: getOperationRequestId(request), detail: { result: "success", projectId, operation: "customer_change_delete" } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "变更明细删除失败" }, { status: 400 });
  }
}
