import { NextRequest, NextResponse } from "next/server";
import { calculateServiceFees } from "@/lib/service-fee-service";

export async function GET(request: NextRequest) {
  const data = await calculateServiceFees(request.nextUrl.searchParams);
  return NextResponse.json(data);
}
