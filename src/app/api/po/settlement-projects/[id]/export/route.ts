import { NextRequest, NextResponse } from "next/server";
import { exportSettlementProject } from "@/lib/settlement-project-service";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const buffer = await exportSettlementProject(decodeURIComponent((await context.params).id));
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=settlement-project.xlsx",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "项目结算导出失败" }, { status: 400 });
  }
}
