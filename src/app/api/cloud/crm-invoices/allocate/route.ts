import { NextRequest, NextResponse } from "next/server";
import { getOperationActor } from "@/lib/operation-actor";
import { allocateInvoiceToRows } from "@/lib/crm-invoice-sync-service";

/**
 * 把一张（合并）发票按账期/明细分摊：不传 allocations 时按各行客户应收比例自动算，
 * 传了就按人工调整后的含税金额分摊（合计必须等于发票金额）。
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { crmInvoiceId?: unknown; allocations?: Array<{ rowId?: unknown; amountTaxIncluded?: unknown }> };
    // 注意：传了但为空 ≠ 没传。空数组代表"一行都没选"，必须报错，
    // 否则会被服务端当成"按该客户全部对账行分摊"。
    const allocations = Array.isArray(body.allocations)
      ? body.allocations.map((item) => ({ rowId: String(item.rowId ?? ""), amountTaxIncluded: Number(item.amountTaxIncluded ?? 0) })).filter((item) => item.rowId)
      : undefined;
    if (allocations && !allocations.length) {
      return NextResponse.json({ error: "请至少选择一个要分摊的账期/明细行" }, { status: 400 });
    }
    const result = await allocateInvoiceToRows({
      crmInvoiceId: body.crmInvoiceId,
      allocations,
      actor: await getOperationActor(request),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票分摊失败" }, { status: 400 });
  }
}
