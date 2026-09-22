import { NextRequest, NextResponse } from "next/server";
import { appendPrepaymentWriteOffMonth } from "@/lib/prepayment-adjustment-service";
import { listAppendableWriteOffMonths } from "@/lib/prepayment-adjustment-service";
import { getOperationActor } from "@/lib/operation-actor";
import { getOperationRequestId, recordOperationLog } from "@/lib/operation-log";

/** 按合同号列出可追加尾期的明细（财务先输合同号，再选明细追加）。 */
export async function GET(request: NextRequest) {
  try {
    const contractNo = request.nextUrl.searchParams.get("contractNo") ?? "";
    return NextResponse.json({ items: await listAppendableWriteOffMonths(contractNo) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "可追加明细加载失败" }, { status: 400 });
  }
}

/**
 * 追加尾期：某条合同明细按默认期数核销不完时，顺延一期承接剩余金额。
 * 默认金额 = 合同明细总额 − 已生成各期实际金额之和，允许前端传具体金额覆盖。
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { contractLineId?: string; month?: string; amount?: number };
    const result = await appendPrepaymentWriteOffMonth({
      contractLineId: String(body.contractLineId ?? ""),
      month: body.month,
      amount: body.amount,
    });
    await recordOperationLog({
      actor: await getOperationActor(request),
      domainKey: "power",
      moduleKey: "prepayment-writeoff-adjustments",
      action: "create",
      entityType: "prepayment-writeoff-month",
      entityId: result.id,
      requestId: getOperationRequestId(request),
      detail: { contractLineId: result.contractLineId, month: result.writeOffMonth, amount: result.amount, monthIndex: result.monthIndex },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "追加尾期失败" }, { status: 400 });
  }
}
