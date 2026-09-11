import { NextRequest, NextResponse } from "next/server";
import { rebuildFrappeDemandOrders } from "@/lib/frappe-demand-sync-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const sourceOrderIds = Array.isArray(body?.sourceOrderIds) ? body.sourceOrderIds.map((value: unknown) => String(value ?? "")) : [];
    const actor = await getOperationActor(request);
    const result = await rebuildFrappeDemandOrders(sourceOrderIds, actor);
    await recordOperationLog({
      actor,
      domainKey: "power",
      moduleKey: "demand-sync-mappings",
      action: "sync",
      entityType: "demand-sync-ledger",
      entityId: result.requested.join(","),
      requestId: getOperationRequestId(request),
      detail: { result: "rebuild", requested: result.requested.length, created: result.summary.createdRequests, blocked: result.summary.blockedItems },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "重新拉取失败";
    const status = message.includes("已有需求同步任务") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
