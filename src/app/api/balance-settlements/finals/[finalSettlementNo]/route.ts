import { NextResponse } from "next/server";
import { getFinalBalanceSettlement } from "@/lib/balance-final-settlement-service";

export async function GET(_: Request, { params }: { params: Promise<{ finalSettlementNo: string }> }) {
  const { finalSettlementNo } = await params;
  try {
    const data = await getFinalBalanceSettlement(decodeURIComponent(finalSettlementNo));
    if (!data) return NextResponse.json({ error: "\u7ed3\u5dee\u7ed3\u7b97\u5355\u4e0d\u5b58\u5728" }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "\u7ed3\u5dee\u7ed3\u7b97\u5355\u52a0\u8f7d\u5931\u8d25" }, { status: 500 });
  }
}
