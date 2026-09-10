import { NextResponse } from "next/server";
import { listFrappeDemandSyncRuns } from "@/lib/frappe-demand-sync-service";

export async function GET() {
  try {
    return NextResponse.json(await listFrappeDemandSyncRuns());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "同步结果加载失败" }, { status: 500 });
  }
}
