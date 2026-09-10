import { NextRequest, NextResponse } from "next/server";
import { syncAllCloudSupplierPayments, syncCloudSupplierPaymentPeriods } from "@/lib/cloud-service";

/**
 * 重算供应商付款的应付汇总。
 * 传 period 只重算该账期，不传则重算全部账期（用于历史回填或映射调整后的修复）。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const period = String(body?.period ?? "").trim();
    return NextResponse.json(period ? await syncCloudSupplierPaymentPeriods([period]) : await syncAllCloudSupplierPayments());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "供应商应付汇总重算失败" }, { status: 400 });
  }
}
