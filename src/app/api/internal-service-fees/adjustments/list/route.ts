import { NextRequest, NextResponse } from "next/server";
import { listInternalServiceAdjustments } from "@/lib/internal-service-fee-service";

export async function GET(request: NextRequest) {
  try { return NextResponse.json(await listInternalServiceAdjustments(request.nextUrl.searchParams)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "调整单加载失败" }, { status: 500 }); }
}
