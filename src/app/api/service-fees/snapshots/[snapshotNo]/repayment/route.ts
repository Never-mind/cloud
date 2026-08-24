import { NextRequest, NextResponse } from "next/server";
import { updateServiceFeeRepayment } from "@/lib/service-fee-service";

export async function PATCH(request: NextRequest, context: { params: Promise<{ snapshotNo: string }> }) {
  try {
    const { snapshotNo } = await context.params;
    return NextResponse.json(await updateServiceFeeRepayment(decodeURIComponent(snapshotNo), await request.json()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "回款信息更新失败" }, { status: 400 });
  }
}
