import { NextRequest, NextResponse } from "next/server";
import { synchronizePendingRemoteLogistics } from "@/lib/procurement-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function POST(request: NextRequest) {
  try {
    const actor = await getOperationActor(request);
    const result = await synchronizePendingRemoteLogistics();
    await recordOperationLog({
      actor,
      domainKey: "power",
      moduleKey: "shipments",
      action: "sync",
      entityType: "shipments",
      entityId: "pending",
      requestId: getOperationRequestId(request),
      detail: { scanned: result.scanned, updated: result.updated, skipped: result.skipped },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "补齐待补全物流失败" },
      { status: 400 },
    );
  }
}
