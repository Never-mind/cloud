import { NextRequest, NextResponse } from "next/server";
import { listSettlementPricingVersions } from "@/lib/balance-settlement-service";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ rows: await listSettlementPricingVersions(request.nextUrl.searchParams.get("countryCode") ?? "") });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "\u951a\u5b9a\u4ef7\u683c\u7248\u672c\u52a0\u8f7d\u5931\u8d25" }, { status: 500 });
  }
}
