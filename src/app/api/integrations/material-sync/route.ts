import { NextRequest, NextResponse } from "next/server";
import { getLatestMaterialSyncRun, runMaterialSync, type MaterialSyncTrigger } from "@/lib/material-sync-service";
import { getOperationActorForLog, getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function GET() {
  try {
    return NextResponse.json({ run: await getLatestMaterialSyncRun() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取 Material 同步状态失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const triggerType = String(body.triggerType ?? "manual") as MaterialSyncTrigger;
    if (!["manual", "scheduled", "script"].includes(triggerType)) {
      return NextResponse.json({ error: "无效的同步触发类型" }, { status: 400 });
    }
    const result = await runMaterialSync({ triggerType });
    await recordOperationLog({
      actor: await getOperationActorForLog(request),
      domainKey: "power",
      moduleKey: "instance-models",
      action: "sync",
      entityType: "instance-models",
      requestId: getOperationRequestId(request),
      detail: { result: "success", triggerType, createdCount: result.created },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Material 同步失败";
    const status = message.includes("已有 Material 同步任务") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
