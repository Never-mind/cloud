import { NextRequest, NextResponse } from "next/server";
import { listOrderRows } from "@/lib/order-list-service";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listOrderRows(request.nextUrl.searchParams));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "订单列表加载失败" }, { status: 500 });
  }
}
