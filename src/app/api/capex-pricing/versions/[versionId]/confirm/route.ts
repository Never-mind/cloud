import { NextResponse } from "next/server";
import { confirmCapexPricingVersion } from "@/lib/capex-pricing-service";

export async function POST(_request: Request, context: { params: Promise<{ versionId: string }> }) {
  try {
    const { versionId } = await context.params;
    return NextResponse.json(await confirmCapexPricingVersion(decodeURIComponent(versionId)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "确认价格版本失败" }, { status: 400 });
  }
}
