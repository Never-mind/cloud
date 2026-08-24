import { NextResponse } from "next/server";
import { confirmBalanceSettlement } from "@/lib/balance-settlement-service";

export async function POST(_request: Request, context: { params: Promise<{ settlementNo: string }> }) {
  try {
    const { settlementNo } = await context.params;
    return NextResponse.json(await confirmBalanceSettlement(decodeURIComponent(settlementNo)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "\u786e\u8ba4\u7ed3\u5dee\u5355\u5931\u8d25" }, { status: 400 });
  }
}
