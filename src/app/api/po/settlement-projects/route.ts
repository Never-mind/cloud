import { NextRequest, NextResponse } from "next/server";
import { listSettlementProjects } from "@/lib/settlement-project-service";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listSettlementProjects(request.nextUrl.searchParams));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "项目结算加载失败" }, { status: 500 });
  }
}
