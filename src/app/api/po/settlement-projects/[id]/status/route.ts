import { NextRequest, NextResponse } from "next/server";
import { getOperationActor } from "@/lib/operation-actor";
import { changeSettlementStatus, normalizeSettlementStatus } from "@/lib/settlement-project-service";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json();
    return NextResponse.json(await changeSettlementStatus(decodeURIComponent((await context.params).id), normalizeSettlementStatus(body.status), await getOperationActor(request)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "项目状态更新失败" }, { status: 400 });
  }
}
