import { NextResponse } from "next/server";
import { listAvailableBillingLines } from "@/lib/billing-service";

export async function GET() {
  const rows = await listAvailableBillingLines();
  return NextResponse.json({ rows, total: rows.length });
}
