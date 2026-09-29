import { NextRequest, NextResponse } from "next/server";
import { runNotificationScan } from "@/lib/notification-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

/**
 * 立即检查并发送。
 * ?dryRun=1 只预览"会提醒哪些单据"，不写记录也不发飞书。
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getOperationActor(request);
    if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
    const result = await runNotificationScan({ dryRun });
    if (!dryRun) {
      await recordOperationLog({
        actor, domainKey: "common", moduleKey: "notification-rules", action: "sync",
        entityType: "notification-rules", entityId: "run", requestId: getOperationRequestId(request),
        detail: { result: "success", created: result.created, sent: result.sent, failed: result.failed },
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "通知发送失败" }, { status: 400 });
  }
}
