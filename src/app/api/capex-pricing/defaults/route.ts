import { NextRequest, NextResponse } from "next/server";
import { getCapexPricingDefaults } from "@/lib/capex-pricing-service";

export async function GET(request: NextRequest) {
  try {
    const countryCode = request.nextUrl.searchParams.get("countryCode") ?? "";
    const b6Type = request.nextUrl.searchParams.get("b6Type") ?? "B62-A7";
    return NextResponse.json(await getCapexPricingDefaults(countryCode, b6Type));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "默认参数加载失败" }, { status: 400 });
  }
}
