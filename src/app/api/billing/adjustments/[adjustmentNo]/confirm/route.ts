import { NextRequest, NextResponse } from "next/server";
import { confirmBillingAdjustment } from "@/lib/billing-service";

export async function POST(_request: NextRequest, context: { params: Promise<{ adjustmentNo: string }> }) {
  try {
    const { adjustmentNo } = await context.params;
    const result = await confirmBillingAdjustment(decodeURIComponent(adjustmentNo));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "确认失败" }, { status: 400 });
  }
}
