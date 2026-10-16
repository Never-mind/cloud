import { NextRequest, NextResponse } from "next/server";
import { isCostPaymentBranch, loadCostPaymentPreview } from "@/lib/cost-payment-approval-service";

/** 发起弹层的预填数据：金额、供应商默认银行账户、批次号、日期、附件提示。 */
export async function GET(request: NextRequest, context: { params: Promise<{ branch: string }> }) {
  const { branch } = await context.params;
  if (!isCostPaymentBranch(branch)) {
    return NextResponse.json({ error: "未知的付款申请分支" }, { status: 400 });
  }
  const ids = (request.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  try {
    return NextResponse.json(await loadCostPaymentPreview(branch, ids));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "付款申请预填数据加载失败" },
      { status: 400 },
    );
  }
}
