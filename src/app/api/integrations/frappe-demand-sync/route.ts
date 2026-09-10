import { NextRequest, NextResponse } from "next/server";
import { runFrappeDemandSync, type FrappeDemandSyncTrigger } from "@/lib/frappe-demand-sync-service";
import { getOperationActorForLog, getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const triggerType = String(body.triggerType ?? "manual") as FrappeDemandSyncTrigger;
    if (!["manual", "scheduled", "script"].includes(triggerType)) {
      return NextResponse.json({ error: "无效的同步触发类型" }, { status: 400 });
    }
    const actor = await getOperationActorForLog(request);
    const result = await runFrappeDemandSync({ triggerType, dryRun: body.dryRun === true, actor });
    await recordOperationLog({
      actor,
      domainKey: "power",
      moduleKey: "demand-sync-mappings",
      action: "sync",
      entityType: "frappe-demand-sync",
      entityId: result.runId,
      requestId: getOperationRequestId(request),
      detail: { dryRun: result.dryRun, createdRequests: result.createdRequests, createdItems: result.createdItems, skippedExisting: result.skippedExisting, blockedItems: result.blockedItems, changedItems: result.changedItems },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "需求同步失败";
    return NextResponse.json({ error: message }, { status: message.includes("正在执行") ? 409 : 400 });
  }
}
