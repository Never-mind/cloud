import { NextRequest, NextResponse } from "next/server";
import { listRequestProductLines } from "@/lib/product-lines-service";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listRequestProductLines(request.nextUrl.searchParams));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "需求明细加载失败" }, { status: 500 });
  }
}
