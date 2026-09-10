import { NextRequest, NextResponse } from "next/server";
import { updateFrappeDemandMapping } from "@/lib/frappe-demand-sync-service";
import { getOperationActorForLog, getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const actor = await getOperationActorForLog(request);
    const row = await updateFrappeDemandMapping(decodeURIComponent(id), await request.json(), actor);
    await recordOperationLog({
      actor,
      domainKey: "power",
      moduleKey: "demand-sync-mappings",
      action: "update",
      entityType: "frappe-demand-mapping",
      entityId: decodeURIComponent(id),
      requestId: getOperationRequestId(request),
      detail: { status: row?.status, sourceType: row?.sourceType, sourceId: row?.sourceId },
    });
    return NextResponse.json(row);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "映射保存失败" }, { status: 400 });
  }
}
