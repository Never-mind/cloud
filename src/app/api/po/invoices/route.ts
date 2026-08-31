import { NextRequest, NextResponse } from "next/server";
import { listPoInvoiceSummary } from "@/lib/po-invoice-summary-service";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listPoInvoiceSummary(request.nextUrl.searchParams));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票汇总加载失败" }, { status: 500 });
  }
}
