import { NextRequest, NextResponse } from "next/server";
import { getInternalServiceInitializationSummary, listInternalServiceFeeFilterOptions, listInternalServiceFees, syncInternalServiceLedgers } from "@/lib/internal-service-fee-service";

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("field")) {
      return NextResponse.json(await listInternalServiceFeeFilterOptions(request.nextUrl.searchParams));
    }
    const [data,initialization]=await Promise.all([listInternalServiceFees(request.nextUrl.searchParams),getInternalServiceInitializationSummary()]);
    return NextResponse.json({...data,initialization});
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "管理费加载失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await syncInternalServiceLedgers(Array.isArray(body.ledgerIds) ? body.ledgerIds.map(String) : undefined));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "管理费生成失败" }, { status: 400 });
  }
}
