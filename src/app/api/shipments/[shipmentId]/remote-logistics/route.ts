import { NextRequest, NextResponse } from "next/server";
import { refreshShipmentRemoteLogistics } from "@/lib/procurement-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function POST(request: NextRequest, context: { params: Promise<{ shipmentId: string }> }) {
  const { shipmentId } = await context.params;
  const decodedShipmentId = decodeURIComponent(shipmentId);
  try {
    const actor = await getOperationActor(request);
    const shipment = await refreshShipmentRemoteLogistics(decodedShipmentId);
    await recordOperationLog({
      actor,
      domainKey: "power",
      moduleKey: "shipments",
      action: "update",
      entityType: "shipment-remote-logistics",
      entityId: decodedShipmentId,
      requestId: getOperationRequestId(request),
      detail: { result: "remote logistics snapshot refreshed" },
    });
    return NextResponse.json(shipment);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "远端物流信息重新拉取失败" }, { status: 400 });
  }
}
