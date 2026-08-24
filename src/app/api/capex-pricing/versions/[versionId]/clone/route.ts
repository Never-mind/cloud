import { NextRequest, NextResponse } from "next/server";
import { cloneCapexPricingVersion } from "@/lib/capex-pricing-service";

export async function POST(request: NextRequest, context: { params: Promise<{ versionId: string }> }) {
  try {
    const { versionId } = await context.params;
    const body = await request.json();
    return NextResponse.json(await cloneCapexPricingVersion(
      decodeURIComponent(versionId),
      String(body.versionNo ?? ""),
      String(body.effectiveDate ?? ""),
    ), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "复制价格版本失败" }, { status: 400 });
  }
}
