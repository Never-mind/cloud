import { NextRequest, NextResponse } from "next/server";
import { deleteSettlementAttachment } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; attachmentId: string }> }) {
  try {
    const { id, attachmentId } = await context.params;
    return NextResponse.json(await deleteSettlementAttachment(decodeURIComponent(id), decodeURIComponent(attachmentId), await getOperationActor(request)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "附件删除失败" }, { status: 400 });
  }
}
