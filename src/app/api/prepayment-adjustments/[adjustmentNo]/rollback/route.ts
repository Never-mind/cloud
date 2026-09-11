import { NextRequest, NextResponse } from "next/server";
import { rollbackPrepaymentWriteOffAdjustment } from "@/lib/prepayment-adjustment-service";

export async function POST(_request: NextRequest, context: { params: Promise<{ adjustmentNo: string }> }) {
  try {
    const { adjustmentNo } = await context.params;
    const data = await rollbackPrepaymentWriteOffAdjustment(decodeURIComponent(adjustmentNo));
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "退回失败" }, { status: 400 });
  }
}
