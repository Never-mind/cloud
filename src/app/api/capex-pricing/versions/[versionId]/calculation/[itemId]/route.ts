import { NextResponse } from "next/server";
import { getCapexPricingCalculation } from "@/lib/capex-pricing-service";

export async function GET(_request: Request, context: { params: Promise<{ versionId: string; itemId: string }> }) {
  const { versionId, itemId } = await context.params;
  const data = await getCapexPricingCalculation(decodeURIComponent(versionId), decodeURIComponent(itemId));
  if (!data) return NextResponse.json({ error: "价格明细不存在" }, { status: 404 });
  return NextResponse.json(data);
}
