import { NextResponse } from "next/server";
import { createManualSettlement } from "@/lib/balance-settlement-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = await createManualSettlement({
      title: String(body.title ?? ""),
      countryCode: String(body.countryCode ?? ""),
      currency: String(body.currency ?? "USD"),
      sourceFileName: String(body.sourceFileName ?? ""),
      notes: String(body.notes ?? ""),
      periodStart: String(body.periodStart ?? ""),
      periodEnd: String(body.periodEnd ?? ""),
      items: Array.isArray(body.items) ? body.items : [],
    });
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "\u521b\u5efa\u624b\u5de5\u7ed3\u5dee\u8349\u7a3f\u5931\u8d25" }, { status: 400 });
  }
}
