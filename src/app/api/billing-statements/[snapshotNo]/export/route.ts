import { NextRequest, NextResponse } from "next/server";
import { exportBillingStatementSnapshot } from "@/lib/billing-statement-service";

export async function GET(_request: NextRequest, context: { params: Promise<{ snapshotNo: string }> }) {
  try {
    const { snapshotNo } = await context.params;
    const { buffer, filename } = await exportBillingStatementSnapshot(decodeURIComponent(snapshotNo));
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "导出失败" }, { status: 400 });
  }
}
