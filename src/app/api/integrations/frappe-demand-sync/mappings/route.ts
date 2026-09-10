import { NextRequest, NextResponse } from "next/server";
import { listFrappeDemandMappings } from "@/lib/frappe-demand-sync-service";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listFrappeDemandMappings(request.nextUrl.searchParams));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "映射加载失败" }, { status: 500 });
  }
}
