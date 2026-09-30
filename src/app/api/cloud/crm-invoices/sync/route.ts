import { NextRequest, NextResponse } from "next/server";
import { getOperationActor } from "@/lib/operation-actor";
import { syncCrmInvoices, type CrmSyncTrigger } from "@/lib/crm-invoice-sync-service";

/** 手动触发 CRM 发票 / 回款同步；months 不传时按配置同步最近几个月。 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const months = Array.isArray(body.months) ? body.months.map((value) => String(value)) : [];
    const triggerType = (["manual", "scheduled", "script"] as const).includes(body.triggerType as CrmSyncTrigger)
      ? (body.triggerType as CrmSyncTrigger)
      : "manual";
    const summary = await syncCrmInvoices({
      months,
      triggerType,
      dryRun: Boolean(body.dryRun),
      includeReceipts: body.includeReceipts !== false,
      downloadAttachments: body.downloadAttachments !== false,
      actor: await getOperationActor(request),
    });
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CRM 同步失败" }, { status: 400 });
  }
}
