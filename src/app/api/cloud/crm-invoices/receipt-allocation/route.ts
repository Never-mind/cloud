import { NextRequest, NextResponse } from "next/server";
import { getOperationActor } from "@/lib/operation-actor";
import { allocateReceiptToRows, clearReceiptAllocation, getReceiptAllocationPlan } from "@/lib/crm-invoice-sync-service";

/**
 * 回款分摊：
 * - GET  ?view=plan&crmReceiptId=  取分摊方案（候选行、关联发票覆盖的行、当前分摊、系统建议）
 * - POST { action: "allocate", crmReceiptId, allocations? } 保存分摊
 * - POST { action: "clear", crmReceiptId } 取消分摊
 */
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await getReceiptAllocationPlan(request.nextUrl.searchParams.get("crmReceiptId")));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "回款分摊方案加载失败" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { action?: string; crmReceiptId?: unknown; allocations?: Array<{ rowId?: unknown; amount?: unknown }> };
    if (body.action === "clear") return NextResponse.json(await clearReceiptAllocation({ crmReceiptId: body.crmReceiptId }));
    const allocations = Array.isArray(body.allocations)
      ? body.allocations.map((item) => ({ rowId: String(item.rowId ?? ""), amount: Number(item.amount ?? 0) })).filter((item) => item.rowId)
      : undefined;
    if (allocations && !allocations.length) {
      return NextResponse.json({ error: "请至少选择一个要分摊的账期/明细行" }, { status: 400 });
    }
    return NextResponse.json(await allocateReceiptToRows({
      crmReceiptId: body.crmReceiptId,
      allocations,
      actor: await getOperationActor(request),
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "回款分摊失败" }, { status: 400 });
  }
}
