import { NextRequest, NextResponse } from "next/server";
import { listAvailableInternalServiceLedgers } from "@/lib/internal-service-fee-service";

export async function GET(request: NextRequest) {
  try { return NextResponse.json(await listAvailableInternalServiceLedgers(request.nextUrl.searchParams)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "待初始化清单加载失败" }, { status: 500 }); }
}
