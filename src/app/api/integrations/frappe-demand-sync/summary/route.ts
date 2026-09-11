import { NextResponse } from "next/server";
import { getFrappeDemandSyncUnhandledSummary } from "@/lib/frappe-demand-sync-service";

export async function GET() {
  try {
    return NextResponse.json(await getFrappeDemandSyncUnhandledSummary());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "未处理数量加载失败" }, { status: 500 });
  }
}
