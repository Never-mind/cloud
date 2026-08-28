import { NextRequest, NextResponse } from "next/server";
import { matchCustomerPoItems } from "@/lib/po-product-service";

export async function POST(_request: NextRequest, context: { params: Promise<{ poId: string }> }) {
  const { poId } = await context.params;
  if (!poId) return NextResponse.json({ error: "缺少客户PO ID" }, { status: 400 });

  try {
    return NextResponse.json(await matchCustomerPoItems(decodeURIComponent(poId)));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "产品匹配失败" },
      { status: 400 },
    );
  }
}
