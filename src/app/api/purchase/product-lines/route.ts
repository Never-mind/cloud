import { NextRequest, NextResponse } from "next/server";
import { listPurchaseProductLines } from "@/lib/product-lines-service";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listPurchaseProductLines(request.nextUrl.searchParams));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "采购明细加载失败" }, { status: 500 });
  }
}
