import { NextRequest, NextResponse } from "next/server";
import { addSettlementSale } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const projectId = decodeURIComponent((await context.params).id);
    const actor = await getOperationActor(request);
    const result = await addSettlementSale(projectId, await request.json(), actor);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "create", entityType: "settlement-sales", entityId: projectId, requestId: getOperationRequestId(request), detail: { result: "success" } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "销售收入新增失败" }, { status: 400 });
  }
}
