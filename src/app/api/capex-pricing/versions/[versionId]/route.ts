import { NextRequest, NextResponse } from "next/server";
import { getCapexPricingVersion, saveCapexPricingVersion } from "@/lib/capex-pricing-service";

export async function GET(request: NextRequest, context: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await context.params;
  const data = await getCapexPricingVersion(decodeURIComponent(versionId), request.nextUrl.searchParams);
  if (!data) return NextResponse.json({ error: "价格版本不存在" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ versionId: string }> }) {
  try {
    const { versionId } = await context.params;
    const body = await request.json();
    const data = await saveCapexPricingVersion(decodeURIComponent(versionId), {
      versionNo: String(body.versionNo ?? ""),
      countryCode: String(body.countryCode ?? ""),
      effectiveDate: String(body.effectiveDate ?? ""),
      sourceFileName: String(body.sourceFileName ?? ""),
      notes: String(body.notes ?? ""),
      items: Array.isArray(body.items) ? body.items : Array.isArray(body.lines) ? body.lines : [],
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存价格版本失败" }, { status: 400 });
  }
}
