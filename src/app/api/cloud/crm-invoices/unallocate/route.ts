import { NextRequest, NextResponse } from "next/server";
import { clearInvoiceAllocation } from "@/lib/crm-invoice-sync-service";

/** 取消分摊：清掉本票写过的开票字段与分摊记录，回到未开票（人工自己填的不动）。 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { crmInvoiceId?: unknown };
    return NextResponse.json(await clearInvoiceAllocation({ crmInvoiceId: body.crmInvoiceId }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "取消分摊失败" }, { status: 400 });
  }
}
