import { NextRequest, NextResponse } from "next/server";
import { rollbackPrepaymentContract } from "@/lib/prepayment-service";

export async function POST(_request: NextRequest, context: { params: Promise<{ contractNo: string }> }) {
  try {
    const { contractNo } = await context.params;
    const data = await rollbackPrepaymentContract(decodeURIComponent(contractNo));
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "回退失败" }, { status: 400 });
  }
}
