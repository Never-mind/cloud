import { NextRequest, NextResponse } from "next/server";
import { getInternalServiceInitializationSummary, listAvailableInternalServiceFilterOptions, listAvailableInternalServiceLedgers } from "@/lib/internal-service-fee-service";

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.has("field")) return NextResponse.json(await listAvailableInternalServiceFilterOptions(request.nextUrl.searchParams));
    const [data,initialization]=await Promise.all([listAvailableInternalServiceLedgers(request.nextUrl.searchParams),getInternalServiceInitializationSummary()]);
    return NextResponse.json({...data,initialization});
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "待初始化清单加载失败" }, { status: 500 }); }
}
