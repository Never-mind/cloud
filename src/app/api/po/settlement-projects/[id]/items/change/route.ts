import { NextRequest, NextResponse } from "next/server";
import { addSettlementChangeItem } from "@/lib/settlement-project-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

/** 客户变更：在项目结算里追加一行（报价单锁定后，客户加设备的入口）。 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const projectId = decodeURIComponent((await context.params).id);
    const actor = await getOperationActor(request);
    const result = await addSettlementChangeItem(projectId, await request.json(), actor);
    await recordOperationLog({ actor, domainKey: "po", moduleKey: "settlement-projects", action: "create", entityType: "settlement-items", entityId: projectId, requestId: getOperationRequestId(request), detail: { result: "success", operation: "customer_change_add" } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "新增明细行失败" }, { status: 400 });
  }
}
