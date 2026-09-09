import { NextRequest, NextResponse } from "next/server";
import { deleteSettlementAttachment } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; attachmentId: string }> }) {
  try {
    const { id, attachmentId } = await context.params;
    const projectId = decodeURIComponent(id);
    const decodedAttachmentId = decodeURIComponent(attachmentId);
    const actor = await getOperationActor(request);
    const result = await deleteSettlementAttachment(projectId, decodedAttachmentId, actor);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "delete", entityType: "settlement-attachments", entityId: decodedAttachmentId, requestId: getOperationRequestId(request), detail: { result: "success", projectId } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "附件删除失败" }, { status: 400 });
  }
}
