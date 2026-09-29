import { NextRequest, NextResponse } from "next/server";
import { listNotificationRecords } from "@/lib/notification-service";

/** 发送记录（规则管理页用）。 */
export async function GET(request: NextRequest) {
  try {
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
    return NextResponse.json({ records: await listNotificationRecords(limit) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "加载发送记录失败" }, { status: 500 });
  }
}
