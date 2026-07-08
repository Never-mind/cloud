import { NextRequest, NextResponse } from "next/server";
import { confirmServiceFeeSnapshot } from "@/lib/service-fee-service";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const data = await confirmServiceFeeSnapshot({
    snapshotNo: body.snapshotNo,
    filters: body.filters ?? {},
  });
  return NextResponse.json(data, { status: 201 });
}
