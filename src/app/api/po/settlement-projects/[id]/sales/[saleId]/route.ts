import { NextRequest, NextResponse } from "next/server";
import { deleteSettlementSale, updateSettlementSale } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string; saleId: string }> }) {
  try {
    const { id, saleId } = await context.params;
    const projectId = decodeURIComponent(id);
    const decodedSaleId = decodeURIComponent(saleId);
    const actor = await getOperationActor(request);
    const result = await updateSettlementSale(projectId, decodedSaleId, await request.json(), actor);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "update", entityType: "settlement-sales", entityId: decodedSaleId, requestId: getOperationRequestId(request), detail: { result: "success", projectId } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "销售收入更新失败" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; saleId: string }> }) {
  try {
    const { id, saleId } = await context.params;
    const projectId = decodeURIComponent(id);
    const decodedSaleId = decodeURIComponent(saleId);
    const actor = await getOperationActor(request);
    const result = await deleteSettlementSale(projectId, decodedSaleId, actor);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "delete", entityType: "settlement-sales", entityId: decodedSaleId, requestId: getOperationRequestId(request), detail: { result: "success", projectId } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "销售收入删除失败" }, { status: 400 });
  }
}
