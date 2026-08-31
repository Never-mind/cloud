import { NextRequest, NextResponse } from "next/server";
import { exportPoInvoiceSummary } from "@/lib/po-invoice-summary-service";

export async function GET(request: NextRequest) {
  try {
    const buffer = await exportPoInvoiceSummary(request.nextUrl.searchParams);
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=po-invoice-summary.xlsx",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票汇总导出失败" }, { status: 400 });
  }
}
