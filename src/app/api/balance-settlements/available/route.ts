import { NextRequest, NextResponse } from "next/server";
import { listInstanceSettlementCandidates } from "@/lib/balance-settlement-service";

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listInstanceSettlementCandidates({
      countryCode: request.nextUrl.searchParams.get("countryCode") ?? "",
      pricingVersionId: request.nextUrl.searchParams.get("pricingVersionId") ?? "",
      keyword: request.nextUrl.searchParams.get("keyword") ?? "",
      page: numberParam(request.nextUrl.searchParams.get("page"), 1),
      pageSize: numberParam(request.nextUrl.searchParams.get("pageSize"), 20),
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "\u5f85\u751f\u6210\u5b9e\u4f8b\u7ed3\u5dee\u52a0\u8f7d\u5931\u8d25" }, { status: 500 });
  }
}
