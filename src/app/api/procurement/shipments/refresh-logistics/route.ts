import { NextRequest, NextResponse } from "next/server";
import { synchronizeRemoteLogistics } from "@/lib/procurement-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

/** 批量刷新远端物流：待补全与历史导入的物流行统一重拉远端快照与 Release 时间节点。 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getOperationActor(request);
    const result = await synchronizeRemoteLogistics();
    await recordOperationLog({
      actor,
      domainKey: "power",
      moduleKey: "shipments",
      action: "sync",
      entityType: "shipments",
      entityId: "remote-refresh",
      requestId: getOperationRequestId(request),
      detail: { scanned: result.scanned, updated: result.updated, skipped: result.skipped },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "批量刷新远端物流失败" },
      { status: 400 },
    );
  }
}
