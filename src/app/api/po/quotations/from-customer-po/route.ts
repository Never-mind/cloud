import { NextRequest, NextResponse } from "next/server";
import { createQuotationFromCustomerPo } from "@/lib/quotation-workflow";
import { getOperationActor } from "@/lib/operation-actor";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const poId = String(body.poId ?? body.sourcePoId ?? "").trim();
  if (!poId) return NextResponse.json({ error: "缺少客户PO ID" }, { status: 400 });

  try {
    return NextResponse.json(await createQuotationFromCustomerPo(poId, await getOperationActor(request)), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成报价单失败" },
      { status: 400 },
    );
  }
}
