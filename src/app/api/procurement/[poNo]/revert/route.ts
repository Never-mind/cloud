import { NextRequest, NextResponse } from "next/server";
import { revertPurchaseOrderToDraft } from "@/lib/procurement-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

/**
 * 采购订单退回草稿。
 * 已生成月账单或预付款的采购订单会被服务层拦下，不允许退回。
 */
export async function POST(request: NextRequest, context: { params: Promise<{ poNo: string }> }) {
  const { poNo } = await context.params;
  try {
    const actor = await getOperationActor(request);
    const decodedPoNo = decodeURIComponent(poNo);
    const result = await revertPurchaseOrderToDraft(decodedPoNo, actor);
    await recordOperationLog({
      actor,
      domainKey: "power",
      moduleKey: "purchase-orders",
      action: "update",
      entityType: "purchase-orders",
      entityId: decodedPoNo,
      requestId: getOperationRequestId(request),
      detail: { result: "success", revertToDraft: true },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "退回草稿失败" },
      { status: 400 },
    );
  }
}
