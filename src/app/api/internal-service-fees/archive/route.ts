import { NextRequest, NextResponse } from "next/server";
import { archiveInternalServiceFees } from "@/lib/internal-service-fee-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return NextResponse.json(await archiveInternalServiceFees({
      countryCode: String(body.countryCode ?? ""),
      archiveMonth: String(body.archiveMonth ?? ""),
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "内部服务费归档失败" }, { status: 400 });
  }
}
