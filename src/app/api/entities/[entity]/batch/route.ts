import { NextRequest, NextResponse } from "next/server";
import { deleteBillingLedger } from "@/lib/billing-service";
import { deleteRequestItem } from "@/lib/order-delete-service";
import { getEntityConfig } from "@/lib/modules";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";
import { getPermissionDomainKey } from "@/lib/permission-definitions";

/**
 * 实体批量操作。
 * - billing-ledgers：批量删除退回。删除台账会级联清掉对应 60 个月月账单、
 *   管理费台账与分摊，实例回到「待生成月账单」。
 * - request-items：批量删除需求明细，已生成采购订单/预付款的明细会被服务层拦下。
 *
 * 逐条处理，单条失败不影响其余，返回逐条结果由前端汇总提示。
 */
export async function POST(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params;
  const config = getEntityConfig(entity);
  if (!config) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  const BATCH_DELETE_ENTITIES = new Set(["billing-ledgers", "request-items"]);
  if (!BATCH_DELETE_ENTITIES.has(entity)) {
    return NextResponse.json({ error: "该模块暂不支持批量操作" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as { ids?: unknown };
    const ids = Array.from(
      new Set((Array.isArray(body.ids) ? body.ids : []).map((value) => String(value ?? "").trim()).filter((value) => value.length > 0)),
    );
    if (!ids.length) {
      return NextResponse.json(
        { error: entity === "request-items" ? "请先选择要删除的需求明细" : "请先选择要退回的月账单合同" },
        { status: 400 },
      );
    }

    const actor = await getOperationActor(request);
    const requestId = getOperationRequestId(request);
    const domainKey = getPermissionDomainKey(entity);
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        if (entity === "request-items") await deleteRequestItem(id);
        else await deleteBillingLedger(id);
        await recordOperationLog({
          actor,
          domainKey,
          moduleKey: entity,
          action: "delete",
          entityType: config.key,
          entityId: id,
          requestId,
          detail: { result: "success", batch: true },
        });
        succeeded.push(id);
      } catch (error) {
        failed.push({ id, error: error instanceof Error ? error.message : "删除失败" });
      }
    }

    return NextResponse.json({ succeeded, failed });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "批量操作失败" }, { status: 400 });
  }
}
