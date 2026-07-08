import { NextRequest, NextResponse } from "next/server";
import { confirmBillingLedgers } from "@/lib/billing-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await confirmBillingLedgers({
      lines: Array.isArray(body.lines) ? body.lines : [],
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "生成失败" }, { status: 400 });
  }
}
