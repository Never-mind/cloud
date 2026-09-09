import { NextRequest, NextResponse } from "next/server";
import { confirmPurchaseOrder } from "@/lib/procurement-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ poNo: string }> },
) {
  const { poNo } = await context.params;

  try {
    const actor = await getOperationActor(_request);
    const decodedPoNo = decodeURIComponent(poNo);
    const shipment = await confirmPurchaseOrder(decodedPoNo, actor);
    await recordOperationLog({ actor, domainKey: "power", moduleKey: "purchase-orders", action: "confirm", entityType: "purchase-orders", entityId: decodedPoNo, requestId: getOperationRequestId(_request), detail: { result: "success" } });
    return NextResponse.json(shipment, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "确认采购单失败" },
      { status: 400 },
    );
  }
}
