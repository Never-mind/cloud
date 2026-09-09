import { NextRequest, NextResponse } from "next/server";
import { deleteSettlementProject, exportSettlementProject, getSettlementProjectDetail } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await getSettlementProjectDetail(decodeURIComponent((await context.params).id)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "项目结算加载失败" }, { status: 404 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const projectId = decodeURIComponent((await context.params).id);
    const actor = await getOperationActor(request);
    await deleteSettlementProject(projectId, actor);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "delete", entityType: "settlement-projects", entityId: projectId, requestId: getOperationRequestId(request), detail: { result: "success" } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "项目结算删除失败" }, { status: 400 });
  }
}
