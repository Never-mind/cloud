import { NextRequest, NextResponse } from "next/server";
import { addSettlementAttachment } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; invoiceId: string }> }) {
  try {
    const { id, invoiceId } = await context.params;
    const projectId = decodeURIComponent(id);
    const decodedInvoiceId = decodeURIComponent(invoiceId);
    const actor = await getOperationActor(request);
    const result = await addSettlementAttachment(projectId, await request.json(), actor, decodedInvoiceId);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "upload", entityType: "settlement-invoice-attachments", entityId: decodedInvoiceId, requestId: getOperationRequestId(request), detail: { result: "success", projectId } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票附件上传失败" }, { status: 400 });
  }
}
