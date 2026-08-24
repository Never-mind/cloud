import { NextRequest, NextResponse } from "next/server";
import { getBalanceSettlementSummary } from "@/lib/balance-settlement-service";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ rows: await getBalanceSettlementSummary({ countryCode: request.nextUrl.searchParams.get("countryCode") ?? "" }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "\u7ed3\u5dee\u6c47\u603b\u52a0\u8f7d\u5931\u8d25" }, { status: 500 });
  }
}
