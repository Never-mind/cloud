import { NextRequest, NextResponse } from "next/server";
import { addSettlementAttachment } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; invoiceId: string }> }) {
  try {
    const { id, invoiceId } = await context.params;
    return NextResponse.json(await addSettlementAttachment(decodeURIComponent(id), await request.json(), await getOperationActor(request), decodeURIComponent(invoiceId)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票附件上传失败" }, { status: 400 });
  }
}
