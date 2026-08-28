import { NextRequest, NextResponse } from "next/server";
import { getOperationActor } from "@/lib/operation-actor";
import { orderSettlementItems } from "@/lib/settlement-project-service";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items : [];
    return NextResponse.json(await orderSettlementItems(decodeURIComponent((await context.params).id), items, await getOperationActor(request)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "采购明细保存失败" }, { status: 400 });
  }
}
