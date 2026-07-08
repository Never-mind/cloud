import { NextRequest, NextResponse } from "next/server";
import { confirmPrepaymentWriteOffAdjustment } from "@/lib/prepayment-adjustment-service";

export async function POST(_request: NextRequest, context: { params: Promise<{ adjustmentNo: string }> }) {
  try {
    const { adjustmentNo } = await context.params;
    const data = await confirmPrepaymentWriteOffAdjustment(decodeURIComponent(adjustmentNo));
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "确认失败" }, { status: 400 });
  }
}
