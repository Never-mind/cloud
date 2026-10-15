import { NextRequest, NextResponse } from "next/server";
import { alignBatchToRequests, findBatchInconsistencies } from "@/lib/service-fee-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

/** 批次一致性检查：核销表存的批次与需求单当前批次不一致时列出来。 */
export async function GET() {
  try {
    return NextResponse.json(await findBatchInconsistencies());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "批次一致性检查失败" }, { status: 400 });
  }
}

/** 一键同步：把下游台账/核销的批次按需求单当前批次对齐。 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getOperationActor(request);
    const result = await alignBatchToRequests();
    await recordOperationLog({ actor, domainKey: "power", moduleKey: "service-fees", action: "update", entityType: "batch-consistency", entityId: "align", requestId: getOperationRequestId(request), detail: { result: "success", ...result } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "批次同步失败" }, { status: 400 });
  }
}
