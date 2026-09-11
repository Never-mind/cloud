import { NextRequest, NextResponse } from "next/server";
import { listFrappeDemandSyncLedger } from "@/lib/frappe-demand-sync-service";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listFrappeDemandSyncLedger(request.nextUrl.searchParams));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "同步台账加载失败" }, { status: 500 });
  }
}
