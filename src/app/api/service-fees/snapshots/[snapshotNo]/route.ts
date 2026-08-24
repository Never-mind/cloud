import { NextRequest, NextResponse } from "next/server";
import { deleteServiceFeeStatementDraft, updateServiceFeeInvoiceStatus } from "@/lib/service-fee-service";

export async function PATCH(request: NextRequest, context: { params: Promise<{ snapshotNo: string }> }) {
  try {
    const { snapshotNo } = await context.params;
    const body = await request.json();
    return NextResponse.json(
      await updateServiceFeeInvoiceStatus(decodeURIComponent(snapshotNo), String(body.invoiceStatus ?? "")),
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "开票状态更新失败" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ snapshotNo: string }> }) {
  try {
    const { snapshotNo } = await context.params;
    return NextResponse.json(await deleteServiceFeeStatementDraft(decodeURIComponent(snapshotNo)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "服务费对账单删除失败" }, { status: 400 });
  }
}
