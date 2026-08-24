import { NextResponse } from "next/server";
import { listCapexPricingB6Types } from "@/lib/capex-pricing-service";

export async function GET() {
  try {
    return NextResponse.json({ rows: await listCapexPricingB6Types() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "加载B6类型规则失败" },
      { status: 500 },
    );
  }
}
