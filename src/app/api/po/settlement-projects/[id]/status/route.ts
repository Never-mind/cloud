import { NextRequest, NextResponse } from "next/server";
import { getOperationActor } from "@/lib/operation-actor";
import { changeSettlementStatus, normalizeSettlementStatus } from "@/lib/settlement-project-service";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json();
    const projectId = decodeURIComponent((await context.params).id);
    const nextStatus = normalizeSettlementStatus(body.status);
    const actor = await getOperationActor(request);
    const result = await changeSettlementStatus(projectId, nextStatus, actor);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "status_change", entityType: "settlement-projects", entityId: projectId, requestId: getOperationRequestId(request), detail: { result: "success", status: nextStatus } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "项目状态更新失败" }, { status: 400 });
  }
}
