import { NextRequest, NextResponse } from "next/server";
import { listFrappeDemandSyncLedgerItems } from "@/lib/frappe-demand-sync-service";

export async function GET(request: NextRequest) {
  const sourceOrderId = request.nextUrl.searchParams.get("sourceOrderId") ?? "";
  try {
    return NextResponse.json(await listFrappeDemandSyncLedgerItems(sourceOrderId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "台账明细加载失败" }, { status: 500 });
  }
}
