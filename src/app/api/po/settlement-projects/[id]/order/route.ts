import { NextRequest, NextResponse } from "next/server";
import { getOperationActor } from "@/lib/operation-actor";
import { orderSettlementItems } from "@/lib/settlement-project-service";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items : [];
    const projectId = decodeURIComponent((await context.params).id);
    const actor = await getOperationActor(request);
    const result = await orderSettlementItems(projectId, items, actor);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "update", entityType: "settlement-items", entityId: projectId, requestId: getOperationRequestId(request), detail: { result: "success", operation: "order", itemCount: items.length } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "采购明细保存失败" }, { status: 400 });
  }
}
