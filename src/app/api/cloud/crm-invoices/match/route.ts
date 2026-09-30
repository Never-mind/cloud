import { NextRequest, NextResponse } from "next/server";
import { getOperationActor } from "@/lib/operation-actor";
import { matchCrmInvoiceToRow } from "@/lib/crm-invoice-sync-service";

/**
 * 手工把一张 CRM 发票匹配到某条对账明细（「编辑客户开票」里的发票搜索用）。
 * body：{ crmInvoiceId, rowId, applyFields? }，applyFields=false 时只建立匹配关系与附件挂载。
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await matchCrmInvoiceToRow({
      crmInvoiceId: body.crmInvoiceId,
      rowId: body.rowId,
      applyFields: body.applyFields !== false,
      actor: await getOperationActor(request),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票匹配失败" }, { status: 400 });
  }
}
