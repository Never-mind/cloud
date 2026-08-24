import { NextRequest, NextResponse } from "next/server";
import { listInternalServiceSnapshots } from "@/lib/internal-service-fee-service";

export async function GET(request: NextRequest) {
  try { return NextResponse.json(await listInternalServiceSnapshots(request.nextUrl.searchParams)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "归档快照加载失败" }, { status: 500 }); }
}
