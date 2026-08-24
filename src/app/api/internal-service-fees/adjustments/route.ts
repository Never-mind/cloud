import { NextRequest, NextResponse } from "next/server";
import { saveInternalServiceAdjustment } from "@/lib/internal-service-fee-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return NextResponse.json(await saveInternalServiceAdjustment({
      ledgerId: String(body.ledgerId ?? ""),
      startMonth: String(body.startMonth ?? ""),
      endMonth: String(body.endMonth ?? ""),
      monthlyAmount: Number(body.monthlyAmount),
      reason: String(body.reason ?? ""),
    }), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存内部服务费调整失败" }, { status: 400 });
  }
}
