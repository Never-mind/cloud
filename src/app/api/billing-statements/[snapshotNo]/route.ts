import { NextRequest, NextResponse } from "next/server";
import { deleteBillingStatementDraft, getBillingStatementSnapshot } from "@/lib/billing-statement-service";

export async function GET(_request: NextRequest, context: { params: Promise<{ snapshotNo: string }> }) {
  const { snapshotNo } = await context.params;
  const data = await getBillingStatementSnapshot(decodeURIComponent(snapshotNo));
  if (!data.snapshot) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ snapshotNo: string }> }) {
  try {
    const { snapshotNo } = await context.params;
    return NextResponse.json(await deleteBillingStatementDraft(decodeURIComponent(snapshotNo)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除失败" }, { status: 400 });
  }
}
