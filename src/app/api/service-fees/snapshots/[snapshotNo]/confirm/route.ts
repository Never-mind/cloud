import { NextRequest, NextResponse } from "next/server";
import { confirmServiceFeeStatement } from "@/lib/service-fee-service";

export async function POST(_request: NextRequest, context: { params: Promise<{ snapshotNo: string }> }) {
  try {
    const { snapshotNo } = await context.params;
    return NextResponse.json(await confirmServiceFeeStatement(decodeURIComponent(snapshotNo)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "服务费对账单确认失败" }, { status: 400 });
  }
}
