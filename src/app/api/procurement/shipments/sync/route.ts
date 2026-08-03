import { NextResponse } from "next/server";
import { synchronizeConfirmedPurchaseOrderShipments } from "@/lib/procurement-service";

export async function POST() {
  try {
    const result = await synchronizeConfirmedPurchaseOrderShipments();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "同步物流数据失败" },
      { status: 400 },
    );
  }
}
