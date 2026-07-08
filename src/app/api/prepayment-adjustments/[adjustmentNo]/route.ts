import { NextRequest, NextResponse } from "next/server";
import {
  deletePrepaymentWriteOffAdjustment,
  getPrepaymentWriteOffAdjustment,
  savePrepaymentWriteOffAdjustment,
} from "@/lib/prepayment-adjustment-service";

export async function GET(_request: NextRequest, context: { params: Promise<{ adjustmentNo: string }> }) {
  const { adjustmentNo } = await context.params;
  const data = await getPrepaymentWriteOffAdjustment(decodeURIComponent(adjustmentNo));
  if (!data.adjustment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ adjustmentNo: string }> }) {
  try {
    const { adjustmentNo } = await context.params;
    const body = await request.json();
    const data = await savePrepaymentWriteOffAdjustment({
      adjustmentNo: decodeURIComponent(adjustmentNo),
      reason: String(body.reason ?? ""),
      monthlyWriteOffIds: Array.isArray(body.monthlyWriteOffIds) ? body.monthlyWriteOffIds.map(String) : [],
      adjustedAmounts: typeof body.adjustedAmounts === "object" && body.adjustedAmounts ? body.adjustedAmounts : {},
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ adjustmentNo: string }> }) {
  try {
    const { adjustmentNo } = await context.params;
    await deletePrepaymentWriteOffAdjustment(decodeURIComponent(adjustmentNo));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除失败" }, { status: 400 });
  }
}
