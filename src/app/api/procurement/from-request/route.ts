import { NextRequest, NextResponse } from "next/server";
import { createPurchaseOrderFromRequest } from "@/lib/procurement-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const requestNo = String(body.requestNo ?? "").trim();
  const poNo = String(body.poNo ?? "").trim();

  if (!requestNo) {
    return NextResponse.json({ error: "缺少需求单号" }, { status: 400 });
  }

  try {
    const actor = await getOperationActor(request);
    const order = await createPurchaseOrderFromRequest(requestNo, poNo || undefined, actor);
    await recordOperationLog({
      actor,
      domainKey: "power",
      moduleKey: "purchase-orders",
      action: "create",
      entityType: "purchase-orders",
      entityId: String(order?.poNo ?? order?.purchaseOrderId ?? "") || null,
      requestId: getOperationRequestId(request),
      detail: { result: "success", sourceRequestNo: requestNo },
    });
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成采购单失败" },
      { status: 400 },
    );
  }
}
