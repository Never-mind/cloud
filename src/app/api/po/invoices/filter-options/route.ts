import { NextRequest, NextResponse } from "next/server";
import { listPoInvoiceSummaryFilterOptions } from "@/lib/po-invoice-summary-service";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listPoInvoiceSummaryFilterOptions(request.nextUrl.searchParams));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票筛选候选值加载失败" }, { status: 400 });
  }
}
