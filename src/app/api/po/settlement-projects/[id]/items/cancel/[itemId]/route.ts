import { NextRequest, NextResponse } from "next/server";
import { cancelSettlementItem } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

/** 标记客户取消：不再计入结算收入/预计成本，已发生的采购成本保留。 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const { id, itemId } = await context.params;
    const projectId = decodeURIComponent(id);
    const decodedItemId = decodeURIComponent(itemId);
    const actor = await getOperationActor(request);
    const body = await request.json().catch(() => ({}));
    const result = await cancelSettlementItem(projectId, decodedItemId, body as Record<string, unknown>, actor);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "update", entityType: "settlement-items", entityId: decodedItemId, requestId: getOperationRequestId(request), detail: { result: "success", projectId, operation: "customer_cancel" } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "标记客户取消失败" }, { status: 400 });
  }
}
