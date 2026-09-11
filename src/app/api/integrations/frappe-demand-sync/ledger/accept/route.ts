import { NextRequest, NextResponse } from "next/server";
import { acceptFrappeDemandChanges } from "@/lib/frappe-demand-sync-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const sourceOrderId = String(body?.sourceOrderId ?? "").trim();
    const result = await acceptFrappeDemandChanges(sourceOrderId);
    await recordOperationLog({
      actor: await getOperationActor(request),
      domainKey: "power",
      moduleKey: "demand-sync-mappings",
      action: "update",
      entityType: "demand-sync-ledger",
      entityId: sourceOrderId,
      requestId: getOperationRequestId(request),
      detail: { result: "accept_remote_changes", accepted: result.accepted },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "接受远端变更失败" }, { status: 400 });
  }
}
