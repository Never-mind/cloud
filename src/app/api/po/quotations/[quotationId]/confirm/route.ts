import { NextRequest, NextResponse } from "next/server";
import { confirmQuotation } from "@/lib/quotation-workflow";
import { getOperationActor } from "@/lib/operation-actor";

export async function POST(request: NextRequest, context: { params: Promise<{ quotationId: string }> }) {
  const { quotationId } = await context.params;
  try {
    return NextResponse.json(await confirmQuotation(decodeURIComponent(quotationId), await getOperationActor(request)));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "确认报价单失败" },
      { status: 400 },
    );
  }
}
