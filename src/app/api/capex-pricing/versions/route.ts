import { NextRequest, NextResponse } from "next/server";
import { createCapexPricingVersion, listCapexPricingVersions } from "@/lib/capex-pricing-service";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listCapexPricingVersions(request.nextUrl.searchParams));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "价格版本加载失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = await createCapexPricingVersion({
      versionNo: String(body.versionNo ?? ""),
      countryCode: String(body.countryCode ?? ""),
      effectiveDate: String(body.effectiveDate ?? ""),
      sourceFileName: String(body.sourceFileName ?? ""),
      notes: String(body.notes ?? ""),
      items: Array.isArray(body.items) ? body.items : Array.isArray(body.lines) ? body.lines : [],
    });
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "新建价格版本失败" }, { status: 400 });
  }
}
