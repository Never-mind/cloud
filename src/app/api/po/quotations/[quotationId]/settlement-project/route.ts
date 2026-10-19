import { NextRequest, NextResponse } from "next/server";
import { queryRows } from "@/lib/db";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";
import { ensureSettlementProjectForQuotation } from "@/lib/settlement-project-service";

/** 查这张报价单有没有生成过项目结算。 */
export async function GET(_request: NextRequest, context: { params: Promise<{ quotationId: string }> }) {
  const { quotationId } = await context.params;
  try {
    const rows = await queryRows<{ id: string; projectNo: string; status: string }>(
      `SELECT id, projectNo, status FROM merge_po_settlement_projects
        WHERE quotationId = :quotationId OR quotationNo = :quotationId LIMIT 1`,
      { quotationId },
    );
    return NextResponse.json({ project: rows[0] ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "查询项目结算失败" },
      { status: 400 },
    );
  }
}

/**
 * 生成项目结算（幂等）：同一张报价单只会生成一次。
 *
 * 改版后「确认报价单」不再自动建项目，必须由业务点这个接口，
 * 这样「已确认但客户还没要」的单子能停在待立项状态，首页也能按状态统计。
 */
export async function POST(request: NextRequest, context: { params: Promise<{ quotationId: string }> }) {
  const { quotationId } = await context.params;
  const actor = await getOperationActor(request);
  try {
    const existing = await queryRows<{ id: string; projectNo: string; status: string }>(
      `SELECT id, projectNo, status FROM merge_po_settlement_projects
        WHERE quotationId = :quotationId OR quotationNo = :quotationId LIMIT 1`,
      { quotationId },
    );
    if (existing[0]) {
      return NextResponse.json({ project: existing[0], created: false });
    }

    await ensureSettlementProjectForQuotation(quotationId, actor);
    const created = await queryRows<{ id: string; projectNo: string; status: string }>(
      `SELECT id, projectNo, status FROM merge_po_settlement_projects WHERE quotationId = :quotationId OR quotationNo = :quotationId LIMIT 1`,
      { quotationId },
    );
    if (!created[0]) throw new Error("项目结算生成失败，请刷新后重试");

    await recordOperationLog({
      actor,
      domainKey: "po",
      moduleKey: "settlement-projects",
      action: "create",
      entityType: "settlement-project",
      entityId: created[0].projectNo,
      requestId: getOperationRequestId(request),
      detail: { result: "success", quotationId },
    });
    return NextResponse.json({ project: created[0], created: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成项目结算失败" },
      { status: 400 },
    );
  }
}
