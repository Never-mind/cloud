import { NextRequest, NextResponse } from "next/server";
import { addSettlementInvoice } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const projectId = decodeURIComponent((await context.params).id);
    const actor = await getOperationActor(request);
    const body = await request.json();
    const result = await addSettlementInvoice(projectId, body, actor);
    if (body.recognitionFacts) {
      const { attachment: _attachment, recognitionFacts, ...confirmed } = body;
      await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "confirm_recognition", entityType: "settlement-invoices", entityId: projectId, detail: { recognized: recognitionFacts, confirmed } });
    }
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "create", entityType: "settlement-invoices", entityId: projectId, requestId: getOperationRequestId(request), detail: { result: "success" } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票新增失败" }, { status: 400 });
  }
}
