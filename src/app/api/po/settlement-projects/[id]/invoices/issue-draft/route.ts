import { NextRequest, NextResponse } from "next/server";
import { prepareSettlementIssueInvoice } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

/**
 * 开票准备步骤：项目下没有可开票的收入发票行时，按项目预计收入补一条未开票收入行，
 * 前端拿到 invoiceId 后调统一的开票弹层（本地开票 / 飞书审批开票）。
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const projectId = decodeURIComponent((await context.params).id);
    const actor = await getOperationActor(request);
    const result = await prepareSettlementIssueInvoice(projectId, actor);
    if (result.created) {
      await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "create", entityType: "settlement-invoices", entityId: projectId, requestId: getOperationRequestId(request), detail: { result: "success", reason: "issue-draft" } });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "开票准备失败" }, { status: 400 });
  }
}
