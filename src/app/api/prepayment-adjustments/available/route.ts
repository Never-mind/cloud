import { NextRequest, NextResponse } from "next/server";
import { listAvailablePrepaymentWriteOffs } from "@/lib/prepayment-adjustment-service";

export async function GET(request: NextRequest) {
  const data = await listAvailablePrepaymentWriteOffs(request.nextUrl.searchParams);
  return NextResponse.json(data);
}
