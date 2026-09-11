import { NextRequest, NextResponse } from "next/server";
import { deletePrepaymentDraft, rollbackPrepaymentContract } from "@/lib/prepayment-service";

/**
 * 预付款合同批量操作。
 * action:
 *   rollback     — 已确认合同批量退回草稿（同时清掉已生成的 24 个月核销明细）
 *   delete-draft — 草稿批量删除（实例释放回待生成预付款）
 *
 * 逐条处理，单条失败不影响其余，返回逐条结果由前端汇总提示。
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { action?: unknown; contractNos?: unknown };
    const action = String(body.action ?? "");
    const contractNos = Array.from(
      new Set((Array.isArray(body.contractNos) ? body.contractNos : []).map((value) => String(value ?? "").trim()).filter((value) => value.length > 0)),
    );
    if (!contractNos.length) return NextResponse.json({ error: "请先选择预付款合同" }, { status: 400 });
    if (action !== "rollback" && action !== "delete-draft") {
      return NextResponse.json({ error: "不支持的批量操作" }, { status: 400 });
    }

    const succeeded: string[] = [];
    const failed: Array<{ contractNo: string; error: string }> = [];
    for (const contractNo of contractNos) {
      try {
        if (action === "rollback") await rollbackPrepaymentContract(contractNo);
        else await deletePrepaymentDraft(contractNo);
        succeeded.push(contractNo);
      } catch (error) {
        failed.push({ contractNo, error: error instanceof Error ? error.message : "操作失败" });
      }
    }

    return NextResponse.json({ succeeded, failed });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "批量操作失败" }, { status: 400 });
  }
}
