import { NextRequest, NextResponse } from "next/server";
import { createPurchaseOrderFromRequest } from "@/lib/procurement-service";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const requestNo = String(body.requestNo ?? "").trim();
  const poNo = String(body.poNo ?? "").trim();

  if (!requestNo) {
    return NextResponse.json({ error: "缺少需求单号" }, { status: 400 });
  }

  try {
    const order = await createPurchaseOrderFromRequest(requestNo, poNo || undefined);
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成采购单失败" },
      { status: 400 },
    );
  }
}
