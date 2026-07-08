import { NextRequest, NextResponse } from "next/server";
import { getDashboardOverview } from "@/lib/dashboard-service";

export async function GET(request: NextRequest) {
  const data = await getDashboardOverview(request.nextUrl.searchParams);
  return NextResponse.json(data);
}
