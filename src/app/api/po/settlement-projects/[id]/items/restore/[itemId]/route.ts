import { NextRequest, NextResponse } from "next/server";
import { restoreSettlementItem } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

/** 撤销客户取消，这一行重新计入结算。 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const { id, itemId } = await context.params;
    const projectId = decodeURIComponent(id);
    const decodedItemId = decodeURIComponent(itemId);
    const actor = await getOperationActor(request);
    const result = await restoreSettlementItem(projectId, decodedItemId, actor);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "update", entityType: "settlement-items", entityId: decodedItemId, requestId: getOperationRequestId(request), detail: { result: "success", projectId, operation: "customer_cancel_restore" } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "撤销取消失败" }, { status: 400 });
  }
}
