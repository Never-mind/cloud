import { NextRequest, NextResponse } from "next/server";
import { createPrepaymentDraft } from "@/lib/prepayment-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const contract = await createPrepaymentDraft({
      contractNo: String(body.contractNo ?? ""),
      effectiveDate: String(body.effectiveDate ?? new Date().toISOString().slice(0, 10)),
      purchaseOrderItemIds: Array.isArray(body.purchaseOrderItemIds)
        ? body.purchaseOrderItemIds.map(String)
        : [],
      currency: String(body.currency ?? "USD"),
    });

    return NextResponse.json(contract, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建失败" }, { status: 400 });
  }
}
