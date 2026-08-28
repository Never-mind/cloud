import { NextRequest, NextResponse } from "next/server";
import { listCloudRows } from "@/lib/cloud-service";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listCloudRows(request.nextUrl.searchParams));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "华为云对账加载失败" }, { status: 500 });
  }
}
