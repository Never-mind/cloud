import { NextRequest, NextResponse } from "next/server";
import { exportUnpurchasedSettlementItems } from "@/lib/settlement-project-service";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const projectId = decodeURIComponent((await context.params).id);
    const buffer = await exportUnpurchasedSettlementItems(projectId);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=settlement-unpurchased-${projectId}.xlsx`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "未采购商品导出失败" }, { status: 400 });
  }
}
