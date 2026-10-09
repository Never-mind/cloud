import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";
import { createPurchaseOrdersFromItems } from "@/lib/pending-purchase-service";

/**
 * 按勾选的待采购明细生成采购订单（或追加到已有草稿采购订单）。
 * 一条明细只能属于一张采购订单，重复勾选会返回中文提示。
 */
export async function POST(request: NextRequest) {
  if (!getAuthenticatedUserEmail(request)) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const text = (value: unknown) => String(value ?? "").trim();
    const requestItemIds = Array.isArray(body.requestItemIds) ? body.requestItemIds.map(text).filter(Boolean) : [];
    const actor = await getOperationActor(request);

    const result = await createPurchaseOrdersFromItems({
      requestItemIds,
      poNo: text(body.poNo) || undefined,
      targetPoNo: text(body.targetPoNo) || undefined,
      currency: text(body.currency) || undefined,
      usdRate: text(body.usdRate) || null,
      releasedAt: text(body.releasedAt) || null,
      actor,
    });

    await recordOperationLog({
      actor,
      domainKey: "power",
      moduleKey: "purchase-orders",
      action: "create",
      entityType: "purchase-orders",
      entityId: result.poNo,
      requestId: getOperationRequestId(request),
      detail: { result: "success", itemCount: result.itemCount, appended: result.appended, requestItemIds },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "生成采购订单失败" }, { status: 400 });
  }
}
