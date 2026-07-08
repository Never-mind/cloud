import { NextRequest, NextResponse } from "next/server";
import { listMonthlyPrepaymentWriteOffs } from "@/lib/prepayment-service";

export async function GET(request: NextRequest) {
  const data = await listMonthlyPrepaymentWriteOffs(request.nextUrl.searchParams);
  return NextResponse.json(data);
}
