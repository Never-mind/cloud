import { NextRequest, NextResponse } from "next/server";
import { cloudMasterData } from "@/lib/cloud-service";

export async function GET(request: NextRequest) {
  try { return NextResponse.json(await cloudMasterData(request.nextUrl.searchParams.get("keyword") ?? "")); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "公共基础资料加载失败" }, { status: 500 }); }
}
