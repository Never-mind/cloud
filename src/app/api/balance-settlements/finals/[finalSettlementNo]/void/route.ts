import { NextResponse } from "next/server";
import { voidFinalBalanceSettlement } from "@/lib/balance-final-settlement-service";

export async function POST(_: Request, { params }: { params: Promise<{ finalSettlementNo: string }> }) {
  const { finalSettlementNo } = await params;
  try {
    return NextResponse.json(await voidFinalBalanceSettlement(decodeURIComponent(finalSettlementNo)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "\u4f5c\u5e9f\u7ed3\u5dee\u7ed3\u7b97\u5355\u5931\u8d25" }, { status: 400 });
  }
}
