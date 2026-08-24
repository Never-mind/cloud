import { NextResponse } from "next/server";
import { deleteInternalServiceAdjustment } from "@/lib/internal-service-fee-service";

export async function DELETE(_request: Request, context: { params: Promise<{ adjustmentNo: string }> }) {
  try {
    const { adjustmentNo } = await context.params;
    return NextResponse.json(await deleteInternalServiceAdjustment(decodeURIComponent(adjustmentNo)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "撤销内部服务费调整失败" }, { status: 400 });
  }
}
