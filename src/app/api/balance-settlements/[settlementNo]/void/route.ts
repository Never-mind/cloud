import { NextResponse } from "next/server";
import { voidBalanceSettlement } from "@/lib/balance-settlement-service";

export async function POST(_request: Request, context: { params: Promise<{ settlementNo: string }> }) {
  try {
    const { settlementNo } = await context.params;
    return NextResponse.json(await voidBalanceSettlement(decodeURIComponent(settlementNo)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "\u4f5c\u5e9f\u7ed3\u5dee\u5355\u5931\u8d25" }, { status: 400 });
  }
}
