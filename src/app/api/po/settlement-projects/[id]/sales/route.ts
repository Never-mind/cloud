import { NextRequest, NextResponse } from "next/server";
import { addSettlementSale } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await addSettlementSale(decodeURIComponent((await context.params).id), await request.json(), await getOperationActor(request)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "销售收入新增失败" }, { status: 400 });
  }
}
