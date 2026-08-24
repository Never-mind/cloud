import { NextRequest, NextResponse } from "next/server";
import { confirmBillingStatementSnapshot } from "@/lib/billing-statement-service";

export async function POST(_request: NextRequest, context: { params: Promise<{ snapshotNo: string }> }) {
  try {
    const { snapshotNo } = await context.params;
    return NextResponse.json(await confirmBillingStatementSnapshot(decodeURIComponent(snapshotNo)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "确认失败" }, { status: 400 });
  }
}
