import { NextRequest, NextResponse } from "next/server";
import { listMonthlyBillingWriteOffs } from "@/lib/billing-service";

export async function GET(request: NextRequest) {
  const data = await listMonthlyBillingWriteOffs(request.nextUrl.searchParams);
  return NextResponse.json(data);
}
