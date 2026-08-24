import { NextResponse } from "next/server";
import { getBalanceSettlement } from "@/lib/balance-settlement-service";

export async function GET(_request: Request, context: { params: Promise<{ settlementNo: string }> }) {
  try {
    const { settlementNo } = await context.params;
    const data = await getBalanceSettlement(decodeURIComponent(settlementNo));
    if (!data) return NextResponse.json({ error: "\u7ed3\u5dee\u5355\u4e0d\u5b58\u5728" }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "\u7ed3\u5dee\u5355\u660e\u7ec6\u52a0\u8f7d\u5931\u8d25" }, { status: 500 });
  }
}
