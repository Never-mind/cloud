import { NextRequest, NextResponse } from "next/server";
import { deleteSettlementProject, exportSettlementProject, getSettlementProjectDetail } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await getSettlementProjectDetail(decodeURIComponent((await context.params).id)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "项目结算加载失败" }, { status: 404 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await deleteSettlementProject(decodeURIComponent((await context.params).id), await getOperationActor(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "项目结算删除失败" }, { status: 400 });
  }
}
