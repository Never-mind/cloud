import { NextRequest, NextResponse } from "next/server";
import { listAvailableBillingLines } from "@/lib/billing-service";

export async function GET(request: NextRequest) {
  const data = await listAvailableBillingLines({
    page: Number(request.nextUrl.searchParams.get("page") ?? 1),
    pageSize: Number(request.nextUrl.searchParams.get("pageSize") ?? 20),
    keyword: request.nextUrl.searchParams.get("keyword") ?? "",
  });
  return NextResponse.json(data);
}
