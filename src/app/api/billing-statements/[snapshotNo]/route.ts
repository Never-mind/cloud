import { NextRequest, NextResponse } from "next/server";
import { getBillingStatementSnapshot } from "@/lib/billing-statement-service";

export async function GET(_request: NextRequest, context: { params: Promise<{ snapshotNo: string }> }) {
  const { snapshotNo } = await context.params;
  const data = await getBillingStatementSnapshot(decodeURIComponent(snapshotNo));
  if (!data.snapshot) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
