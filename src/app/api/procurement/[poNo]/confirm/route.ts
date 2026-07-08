import { NextResponse } from "next/server";
import { confirmPurchaseOrder } from "@/lib/procurement-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ poNo: string }> },
) {
  const { poNo } = await context.params;

  try {
    const shipment = await confirmPurchaseOrder(decodeURIComponent(poNo));
    return NextResponse.json(shipment, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "确认采购单失败" },
      { status: 400 },
    );
  }
}
