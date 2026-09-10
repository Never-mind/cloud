import { NextRequest, NextResponse } from "next/server";
import { refreshFrappeDemandMappings } from "@/lib/frappe-demand-sync-service";
import { getOperationActorForLog, getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function POST(request: NextRequest) {
  try {
    const actor = await getOperationActorForLog(request);
    const result = await refreshFrappeDemandMappings(actor);
    await recordOperationLog({
      actor,
      domainKey: "power",
      moduleKey: "demand-sync-mappings",
      action: "sync",
      entityType: "frappe-demand-mappings",
      requestId: getOperationRequestId(request),
      detail: { result: "refreshed", ...result },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "远端数据刷新失败" }, { status: 400 });
  }
}
