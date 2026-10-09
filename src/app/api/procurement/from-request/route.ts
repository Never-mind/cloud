import { NextRequest, NextResponse } from "next/server";
import { markRequestAsPendingPurchase } from "@/lib/pending-purchase-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

/**
 * 需求单确认：只把需求单置为「待下单」，明细进入待采购明细，**不再自动生成采购订单**。
 * 采购订单由采购员在「采购订单 → 待采购明细」标签里勾选明细生成（支持一个需求单拆成多张）。
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const requestNo = String(body.requestNo ?? "").trim();

  if (!requestNo) {
    return NextResponse.json({ error: "缺少需求单号" }, { status: 400 });
  }

  try {
    const actor = await getOperationActor(request);
    await markRequestAsPendingPurchase(requestNo, actor);
    await recordOperationLog({
      actor,
      domainKey: "power",
      moduleKey: "requests",
      action: "confirm",
      entityType: "requests",
      entityId: requestNo,
      requestId: getOperationRequestId(request),
      detail: { result: "success", note: "确认需求单，明细进入待采购明细" },
    });
    return NextResponse.json({ ok: true, requestNo, status: "待下单" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "确认需求单失败" },
      { status: 400 },
    );
  }
}
