import { NextRequest, NextResponse } from "next/server";
import { getOrderDetail, type OrderDetailType } from "@/lib/order-detail-service";

const ORDER_DETAIL_TYPES = new Set<OrderDetailType>(["requests", "purchase-orders"]);

export async function GET(_request: NextRequest, context: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await context.params;
  if (!ORDER_DETAIL_TYPES.has(type as OrderDetailType)) {
    return NextResponse.json({ error: "Unknown order detail type" }, { status: 404 });
  }

  const data = await getOrderDetail(type as OrderDetailType, decodeURIComponent(id));
  if (!data.master) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
