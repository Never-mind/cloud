import { NextRequest, NextResponse } from "next/server";
import { exportSettlementProjects } from "@/lib/settlement-project-service";

export async function GET(request: NextRequest) {
  try {
    const buffer = await exportSettlementProjects(request.nextUrl.searchParams);
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=settlement-projects.xlsx",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "项目结算导出失败" }, { status: 400 });
  }
}
