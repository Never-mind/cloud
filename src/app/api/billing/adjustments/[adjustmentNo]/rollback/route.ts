import { NextRequest, NextResponse } from "next/server";
import { rollbackBillingAdjustment } from "@/lib/billing-service";

export async function POST(_request: NextRequest, context: { params: Promise<{ adjustmentNo: string }> }) {
  try {
    const { adjustmentNo } = await context.params;
    const result = await rollbackBillingAdjustment(decodeURIComponent(adjustmentNo));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "退回失败" }, { status: 400 });
  }
}
