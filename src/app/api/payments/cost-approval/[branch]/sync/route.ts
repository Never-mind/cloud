import { NextRequest, NextResponse } from "next/server";
import { isCostPaymentBranch, syncCostPaymentApprovals } from "@/lib/cost-payment-approval-service";

/**
 * 刷新审批状态（列表页打开时调一次）。
 *
 * 用 GET 是为了按来源模块的**查看**权限鉴权：这个动作只是把飞书审批的最新状态拉回来、
 * 通过后回写「已付款」，不产生新的业务数据；换成 POST 会要求"新增"权限，把只看报表的人挡在外面。
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ branch: string }> }) {
  const { branch } = await context.params;
  if (!isCostPaymentBranch(branch)) {
    return NextResponse.json({ error: "未知的付款申请分支" }, { status: 400 });
  }
  try {
    return NextResponse.json(await syncCostPaymentApprovals());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "同步审批状态失败" },
      { status: 400 },
    );
  }
}
