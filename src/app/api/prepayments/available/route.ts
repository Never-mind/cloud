import { NextResponse } from "next/server";
import { listAvailablePrepaymentLines } from "@/lib/prepayment-service";

export async function GET() {
  const rows = await listAvailablePrepaymentLines();
  return NextResponse.json({ rows, total: rows.length });
}
